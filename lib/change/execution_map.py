#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path


EXECUTION_MAP_COLUMNS = ["Slice", "Topology", "Status", "Branch", "Worktree", "Base", "Depends On", "Owner", "Last Evidence"]
COLUMN_KEYS = {
    "Slice": "slice",
    "Topology": "topology",
    "Status": "status",
    "Branch": "branch",
    "Worktree": "worktree",
    "Base": "base",
    "Depends On": "depends_on",
    "Owner": "owner",
    "Last Evidence": "last_evidence",
}
ALLOWED_STATUSES = {"planned", "claimed", "active", "blocked", "ready", "merged", "superseded"}
TERMINAL_STATUSES = {"merged", "superseded"}
GATED_STATUSES = {"blocked", "ready", "merged", "superseded"}
ALLOWED_TOPOLOGIES = {"parallel", "stacked", "standalone"}


class ExecutionMapError(Exception):
    pass


def front_matter() -> str:
    return "\n".join(
        [
            "---",
            "artifact: execution-map",
            "status: draft",
            "tags: [execution-map]",
            'description: "Slice-to-worktree execution map."',
            "---",
            "",
        ]
    )


def split_table_row(line: str):
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip().strip("`") for cell in stripped.split("|")]


def read_execution_map(change_dir: Path) -> dict:
    path = change_dir / "execution-map.md"
    if not path.exists():
        return {"file_path": path, "exists": False, "columns": [], "assignments": [], "front_matter_text": None}
    text = path.read_text(encoding="utf-8")
    table_lines = first_table_lines(text)
    return {
        "file_path": path,
        "exists": True,
        "columns": split_table_row(table_lines[0]) if table_lines else [],
        "assignments": parse_assignments(table_lines),
        "front_matter_text": front_matter_prefix(text),
    }


def execution_map_payload(change_dir: Path, root_context: dict) -> dict:
    data = read_execution_map(change_dir)
    return {
        "change_id": change_dir.name,
        "exists": data["exists"],
        "assignments": data["assignments"],
        "root_context": root_context,
    }


def execution_map_summary(change_dir: Path, worktrees_checked=False) -> dict:
    data = read_execution_map(change_dir)
    return {
        "exists": data["exists"],
        "assignment_count": len(data["assignments"]),
        "active_assignment_count": sum(1 for row in data["assignments"] if row.get("status") == "active"),
        "worktrees_checked": worktrees_checked,
    }


def assign_slice(change_dir: Path, args, root_context: dict, cwd: Path | None = None) -> dict:
    current = read_execution_map(change_dir)
    assignment = assignment_from_args(change_dir, args, root_context, cwd or Path.cwd())
    assert_no_duplicate_active_worktree(current["assignments"], assignment)
    assignments = upsert_assignment(current["assignments"], assignment)
    current["file_path"].write_text(render_execution_map(current, assignments), encoding="utf-8")
    return {"path": str(current["file_path"]), "assignment": assignment}


def validate_execution_map_worktrees(change_dir: Path) -> tuple[list[str], list[str]]:
    data = read_execution_map(change_dir)
    errors: list[str] = []
    warnings: list[str] = []
    if not data["exists"]:
        return errors, warnings
    missing_columns = [column for column in EXECUTION_MAP_COLUMNS if column not in data["columns"]]
    if missing_columns:
        errors.append(f"{data['file_path']}: missing required columns: {', '.join(missing_columns)}")
        return errors, warnings
    assignments = data["assignments"]
    by_slice = {row.get("slice", ""): row for row in assignments}
    for assignment in assignments:
        validate_status(data["file_path"], assignment, errors)
        validate_slice_link(change_dir, data["file_path"], assignment, errors)
        validate_evidence_reference(change_dir, data["file_path"], assignment, errors)
        validate_topology(data["file_path"], assignment, assignments, by_slice, errors)
    validate_dependency_cycles(data["file_path"], assignments, errors)
    validate_dependency_status_gates(data["file_path"], assignments, by_slice, errors)
    validate_duplicate_worktrees(data["file_path"], assignments, errors)
    validate_worktree_paths(change_dir, data["file_path"], assignments, errors, warnings)
    return errors, warnings


def assignment_from_args(change_dir: Path, args, root_context: dict, cwd: Path) -> dict:
    slice_path = resolve_slice(change_dir, args.slice)
    status = args.status or "planned"
    topology = args.topology or "standalone"
    branch = args.branch or ""
    worktree = normalize_worktree(args.worktree or "", Path(root_context["code_root"]) if getattr(args, "code_root", None) else cwd)
    base = args.base or ""
    depends_on = args.depends_on or ""
    owner = args.owner or ""
    last_evidence = args.last_evidence or ""

    if status not in ALLOWED_STATUSES:
        raise ExecutionMapError(f"invalid --status: {status}")
    if topology not in ALLOWED_TOPOLOGIES:
        raise ExecutionMapError(f"invalid --topology: {topology}")
    if status != "planned" and (not branch or not worktree):
        raise ExecutionMapError(f"{status} assignment requires --branch and --worktree")
    if status in GATED_STATUSES and not last_evidence:
        raise ExecutionMapError(f"{status} assignment requires --last-evidence")
    if last_evidence:
        validate_evidence_ref(last_evidence)
    if topology == "parallel" and depends_on and depends_on != "none":
        raise ExecutionMapError("parallel assignment cannot include --depends-on except none")
    if topology == "stacked" and not depends_on and not base:
        raise ExecutionMapError("stacked assignment requires --depends-on or --base")
    return {
        "slice": slice_path,
        "topology": topology,
        "status": status,
        "branch": branch,
        "worktree": worktree,
        "base": base,
        "depends_on": depends_on,
        "owner": owner,
        "last_evidence": last_evidence,
    }


def resolve_slice(change_dir: Path, value: str | None) -> str:
    if not value:
        raise ExecutionMapError("assign-slice requires --slice")
    tasks_dir = change_dir / "tasks"
    if re.match(r"^\d{3}$", value or "") and tasks_dir.exists():
        candidates = [path for path in tasks_dir.glob(f"slice-{value}-*.md")]
    else:
        raw = re.sub(r"^\./?", "", value)
        candidates = [change_dir / raw] if raw.startswith("tasks/") else [tasks_dir / Path(raw).name]
    existing = [path for path in candidates if path.exists()]
    if len(existing) != 1:
        raise ExecutionMapError(f"slice not found or ambiguous: {value}")
    return existing[0].relative_to(change_dir).as_posix()


def normalize_worktree(value: str, base: Path) -> str:
    if not value:
        return ""
    path = Path(value)
    if not path.is_absolute():
        path = base / path
    return str(path.resolve())


def validate_evidence_ref(value: str) -> None:
    rel_path, _, fragment = value.partition("#")
    if Path(rel_path).is_absolute() or re.match(r"^[a-z][a-z0-9+.-]*:", value, re.I):
        raise ExecutionMapError(f"invalid --last-evidence: {value}")
    parts = rel_path.split("/")
    if not rel_path.endswith(".md") or ".." in parts or "" in parts:
        raise ExecutionMapError(f"invalid --last-evidence: {value}")
    if fragment and not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", fragment):
        raise ExecutionMapError(f"invalid --last-evidence: {value}")


def assert_no_duplicate_active_worktree(assignments, assignment) -> None:
    if not assignment.get("worktree") or assignment.get("status") in TERMINAL_STATUSES:
        return
    next_path = comparable_path(assignment["worktree"])
    for existing in assignments:
        if existing.get("slice") == assignment.get("slice") or not existing.get("worktree") or existing.get("status") in TERMINAL_STATUSES:
            continue
        if comparable_path(existing["worktree"]) == next_path:
            raise ExecutionMapError(f"duplicate active worktree: {assignment['worktree']}")


def comparable_path(value: str) -> Path:
    try:
        return Path(value).resolve(strict=True)
    except OSError:
        return Path(value).resolve()


def upsert_assignment(assignments, assignment):
    result = list(assignments)
    for index, existing in enumerate(result):
        if existing.get("slice") == assignment.get("slice"):
            result[index] = assignment
            return result
    result.append(assignment)
    return result


def render_execution_map(current: dict, assignments) -> str:
    prefix = current.get("front_matter_text") or front_matter()
    rows = [
        "| " + " | ".join(row.get(COLUMN_KEYS[column], "") for column in EXECUTION_MAP_COLUMNS) + " |"
        for row in assignments
    ]
    return "\n".join(
        [
            prefix.rstrip(),
            "# Execution Map",
            "",
            "| " + " | ".join(EXECUTION_MAP_COLUMNS) + " |",
            "|" + "|".join("---" for _ in EXECUTION_MAP_COLUMNS) + "|",
            *rows,
            "",
        ]
    )


def parse_assignments(table_lines):
    if len(table_lines) < 2:
        return []
    headers = split_table_row(table_lines[0])
    assignments = []
    for line in table_lines[2:]:
        cells = split_table_row(line)
        row = {}
        for index, header in enumerate(headers):
            key = COLUMN_KEYS.get(header)
            if key:
                row[key] = cells[index] if index < len(cells) else ""
        for key in COLUMN_KEYS.values():
            row.setdefault(key, "")
        assignments.append(row)
    return assignments


def validate_slice_link(change_dir: Path, file_path: Path, assignment: dict, errors: list[str]) -> None:
    slice_path = assignment.get("slice", "")
    if not re.match(r"^tasks/slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$", slice_path):
        errors.append(f"{file_path}: {slice_path or '<blank>'}: referenced slice must use tasks/slice-<nnn>-<slug>.md")
        return
    if not (change_dir / slice_path).exists():
        errors.append(f"{file_path}: {slice_path}: referenced slice missing")


def validate_status(file_path: Path, assignment: dict, errors: list[str]) -> None:
    if assignment.get("status") not in ALLOWED_STATUSES:
        errors.append(f"{file_path}: {assignment.get('slice')}: invalid status {assignment.get('status')}")


def validate_evidence_reference(change_dir: Path, file_path: Path, assignment: dict, errors: list[str]) -> None:
    evidence = assignment.get("last_evidence", "")
    if assignment.get("status") in GATED_STATUSES and not evidence:
        errors.append(f"{file_path}: {assignment.get('slice')}: blank Last Evidence for {assignment.get('status')}")
        return
    if not evidence:
        return
    parts = evidence.split("#")
    rel_path = parts[0]
    fragment = parts[1] if len(parts) > 1 else ""
    if len(parts) > 2 or Path(rel_path).is_absolute() or re.match(r"^[a-z][a-z0-9+.-]*:", evidence, re.I) or ".." in rel_path.split("/") or "" in rel_path.split("/"):
        errors.append(f"{file_path}: {assignment.get('slice')}: invalid Last Evidence {evidence}")
        return
    evidence_path = (change_dir / rel_path).resolve()
    change_root = change_dir.resolve()
    if change_root != evidence_path and change_root not in evidence_path.parents:
        errors.append(f"{file_path}: {assignment.get('slice')}: invalid Last Evidence {evidence}")
        return
    if not evidence_path.exists():
        errors.append(f"{file_path}: {assignment.get('slice')}: missing Last Evidence path {evidence}")
        return
    if fragment and evidence_path.suffix != ".md":
        errors.append(f"{file_path}: {assignment.get('slice')}: Last Evidence fragment on non-Markdown file {evidence}")
        return
    if fragment and not markdown_heading_exists(evidence_path, fragment):
        errors.append(f"{file_path}: {assignment.get('slice')}: missing Markdown heading {fragment} in Last Evidence {evidence}")


def validate_topology(file_path: Path, assignment: dict, assignments, by_slice, errors) -> None:
    deps = dependency_list(assignment, assignments)
    topology = assignment.get("topology", "")
    if topology not in ALLOWED_TOPOLOGIES:
        errors.append(f"{file_path}: {assignment.get('slice')}: invalid topology {topology}")
        return
    if topology in {"parallel", "standalone"} and deps:
        errors.append(f"{file_path}: {topology} row {assignment.get('slice')} must not depend on {', '.join(deps)}")
    if topology == "stacked" and not deps and not assignment.get("base"):
        errors.append(f"{file_path}: stacked row {assignment.get('slice')} requires dependency or base")
    for dep in deps:
        if dep not in by_slice:
            errors.append(f"{file_path}: {assignment.get('slice')}: dependency {dep} missing from execution map")


def validate_dependency_cycles(file_path: Path, assignments, errors) -> None:
    by_slice = {row.get("slice", ""): row for row in assignments}
    visiting = set()
    visited = set()
    stack = []

    def visit(slice_name: str):
        if slice_name in visiting:
            cycle = " -> ".join(stack[stack.index(slice_name) :] + [slice_name])
            errors.append(f"{file_path}: dependency cycle: {cycle}")
            return
        if slice_name in visited:
            return
        visiting.add(slice_name)
        stack.append(slice_name)
        for dep in dependency_list(by_slice.get(slice_name), assignments):
            if dep in by_slice:
                visit(dep)
        stack.pop()
        visiting.remove(slice_name)
        visited.add(slice_name)

    for row in assignments:
        visit(row.get("slice", ""))


def validate_dependency_status_gates(file_path: Path, assignments, by_slice, errors) -> None:
    for row in assignments:
        if row.get("topology") != "stacked" or row.get("status") not in {"ready", "merged"}:
            continue
        for dep in dependency_list(row, assignments):
            dependency = by_slice.get(dep)
            if not dependency:
                continue
            if row.get("status") == "ready" and dependency.get("status") not in {"ready", "merged"}:
                errors.append(f"{file_path}: ready stacked row {row.get('slice')} dependency {dep} status {dependency.get('status')}")
            if row.get("status") == "merged" and dependency.get("status") != "merged":
                errors.append(f"{file_path}: merged stacked row {row.get('slice')} dependency {dep} status {dependency.get('status')}")


def validate_duplicate_worktrees(file_path: Path, assignments, errors) -> None:
    seen = {}
    for row in assignments:
        if not row.get("worktree") or row.get("status") in TERMINAL_STATUSES:
            continue
        key = comparable_path(row["worktree"])
        if key in seen:
            errors.append(f"{file_path}: duplicate active worktree {row['worktree']} used by {seen[key]} and {row.get('slice')}")
        else:
            seen[key] = row.get("slice")


def validate_worktree_paths(change_dir: Path, file_path: Path, assignments, errors, warnings) -> None:
    change_id = change_dir.name
    for row in assignments:
        worktree = row.get("worktree")
        if not worktree:
            continue
        path = Path(worktree)
        if not path.exists():
            append_worktree_issue(errors, warnings, row, f"{file_path}: {row.get('slice')} ({row.get('status')}): missing worktree path {worktree}", "liveness")
            continue
        if not os.access(path, os.R_OK | os.X_OK):
            append_worktree_issue(errors, warnings, row, f"{file_path}: {row.get('slice')} ({row.get('status')}): unreadable worktree path {worktree}", "liveness")
            continue
        if row.get("status") not in TERMINAL_STATUSES and not is_git_worktree(path):
            append_worktree_issue(errors, warnings, row, f"{file_path}: {row.get('slice')} ({row.get('status')}): non-git worktree path {worktree}", "liveness")
        duplicate_state = path / ".changes" / change_id
        if duplicate_state.exists() and duplicate_state.resolve() != change_dir.resolve():
            append_worktree_issue(errors, warnings, row, f"{file_path}: {row.get('slice')} ({row.get('status')}): duplicate local change state {duplicate_state}", "duplicate-state")


def append_worktree_issue(errors, warnings, row, message: str, kind: str) -> None:
    severity = worktree_issue_severity(row.get("status"), kind)
    if severity == "ignore":
        return
    if severity == "error":
        errors.append(message)
    else:
        warnings.append(message)


def worktree_issue_severity(status: str, kind: str) -> str:
    if kind == "duplicate-state":
        return "warn" if status in {"planned", "merged", "superseded"} else "error"
    if status in {"merged", "superseded"}:
        return "ignore"
    return "error" if status in {"active", "ready"} else "warn"


def dependency_list(row, assignments) -> list[str]:
    if not row or not row.get("depends_on"):
        return []
    return [
        normalize_dependency(item.strip(), assignments)
        for item in row["depends_on"].split(",")
        if item.strip() and item.strip() != "none"
    ]


def normalize_dependency(value: str, assignments) -> str:
    if value.startswith("tasks/"):
        return value
    if value.startswith("slice-"):
        return f"tasks/{value}"
    if re.match(r"^\d{3}$", value):
        return next((row["slice"] for row in assignments if row.get("slice", "").startswith(f"tasks/slice-{value}-")), value)
    return value


def markdown_heading_exists(path: Path, fragment: str) -> bool:
    return any(line.startswith("#") and heading_slug(line) == fragment for line in path.read_text(encoding="utf-8").splitlines())


def heading_slug(line: str) -> str:
    text = re.sub(r"^#+\s*", "", line).strip().lower()
    text = re.sub(r"[`*_~\[\]\(\)]", "", text)
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", text))


def is_git_worktree(path: Path) -> bool:
    result = subprocess.run(["git", "-C", str(path), "rev-parse", "--is-inside-work-tree"], text=True, capture_output=True, check=False)
    return result.returncode == 0 and result.stdout.strip() == "true"


def first_table_lines(text: str) -> list[str]:
    lines = text.splitlines()
    start = next((index for index, line in enumerate(lines) if line.strip().startswith("|")), -1)
    if start == -1:
        return []
    result = []
    for line in lines[start:]:
        if not line.strip().startswith("|"):
            break
        result.append(line.strip())
    return result


def front_matter_prefix(text: str) -> str | None:
    match = re.match(r"\A---\n[\s\S]*?\n---\n+", text)
    return match.group(0) if match else None
