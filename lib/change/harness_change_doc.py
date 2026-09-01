#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import date
from pathlib import Path

import execution_map
import policy
import root_resolution


FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def parse_scalar(value: str):
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        body = value[1:-1].strip()
        if not body:
            return []
        return [item.strip().strip('"').strip("'") for item in body.split(",")]
    return value.strip('"').strip("'")


def parse_front_matter(path: Path) -> dict:
    if not path.exists() or path.suffix != ".md":
        return {}
    match = FRONT_MATTER_RE.match(read_text(path))
    if not match:
        return {}
    data = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = parse_scalar(value)
    return data


def markdown_table_after_heading(text: str, heading: str):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.strip() == f"## {heading}":
            table_lines = []
            for candidate in lines[index + 1 :]:
                if candidate.startswith("## "):
                    break
                if candidate.strip().startswith("|"):
                    table_lines.append(candidate.strip())
                elif table_lines and candidate.strip():
                    break
            return parse_markdown_table(table_lines)
    return []


def parse_markdown_table(lines):
    if len(lines) < 2:
        return []
    headers = split_table_row(lines[0])
    rows = []
    for line in lines[2:]:
        cells = split_table_row(line)
        if len(cells) < len(headers):
            cells.extend([""] * (len(headers) - len(cells)))
        rows.append(dict(zip(headers, cells)))
    return rows


def split_table_row(line: str):
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip().strip("`") for cell in stripped.split("|")]


def parse_tag_registry(index_path: Path, heading: str):
    if not index_path.exists():
        return []
    rows = markdown_table_after_heading(read_text(index_path), heading)
    return [
        {
            "tag": row.get("tag", ""),
            "description": row.get("description", ""),
        }
        for row in rows
        if row.get("tag")
    ]


def change_dir(repo_root: Path, change_id: str) -> Path:
    return repo_root / ".changes" / change_id


def front_matter(artifact: str, status: str, tags, description: str) -> str:
    tag_list = ", ".join(tags)
    return "\n".join(
        [
            "---",
            f"artifact: {artifact}",
            f"status: {status}",
            f"tags: [{tag_list}]",
            f'description: "{description}"',
            "---",
            "",
        ]
    )


def ensure_child_index(directory_path: Path, directory: str) -> None:
    contract = policy.CHANGE_CHILD_DIRECTORIES[directory]
    index_path = directory_path / "README.md"
    if index_path.exists():
        return
    title = directory.replace("-", " ").title()
    columns = contract["columns"]
    write_text(
        index_path,
        front_matter(contract["index_artifact"], "draft", default_tags_for_artifact(contract["index_artifact"]), f"{title} index.")
        + "\n".join(
            [
                f"# {title}",
                "",
                "## Responsibility",
                "",
                f"This directory indexes {directory} child documents.",
                "",
                "## Child Index",
                "",
                "| " + " | ".join(columns) + " |",
                "|" + "|".join("---" for _ in columns) + "|",
            ]
        )
        + "\n",
    )


def default_tags_for_artifact(artifact: str):
    if artifact in {"reviews-index", "review-round"}:
        return ["review"]
    if artifact in {"decision-index", "decision-record"}:
        return ["decision"]
    if artifact in {"tasks-index", "task-slice"}:
        return ["implementation"]
    return ["workflow"]


def append_child_index(index_path: Path, directory: str, rel_path: str, artifact: str, status: str, order_key: str, description: str) -> None:
    text = read_text(index_path)
    columns = policy.directory_index_fields(directory)
    values = {
        "path": f"`{rel_path}`",
        "artifact": artifact,
        "subtype": artifact,
        "status": status,
        "order": order_key,
        "date_key": order_key,
        "description": description,
    }
    row = "| " + " | ".join(values.get(column, "") for column in columns) + " |"
    updated = insert_markdown_table_row_after_heading(text, "Child Index", columns, row)
    if updated != text:
        write_text(index_path, updated)


def insert_markdown_table_row_after_heading(text: str, heading: str, expected_columns, row: str) -> str:
    lines = text.split("\n")
    heading_text = f"## {heading}"
    heading_indexes = [index for index, line in enumerate(lines) if line.strip() == heading_text]

    def invalid(reason: str):
        raise ValueError(f"document requires one valid unique {heading} table: {reason}")

    if len(heading_indexes) != 1:
        invalid(f"found {len(heading_indexes)} exact headings")

    header_index = heading_indexes[0] + 1
    while header_index < len(lines) and not lines[header_index].strip():
        header_index += 1
    if header_index >= len(lines) or not lines[header_index].strip().startswith("|"):
        invalid("table header is missing")
    actual_columns = split_table_row(lines[header_index])
    if list(actual_columns) != list(expected_columns):
        invalid(f"expected columns {', '.join(expected_columns)}")

    divider_index = header_index + 1
    if divider_index >= len(lines) or not lines[divider_index].strip().startswith("|"):
        invalid("table divider is missing")
    divider_cells = split_table_row(lines[divider_index])
    if len(divider_cells) != len(expected_columns) or any(not re.fullmatch(r":?-{3,}:?", cell) for cell in divider_cells):
        invalid("table divider is malformed")

    table_end = divider_index + 1
    while table_end < len(lines) and lines[table_end].strip().startswith("|"):
        table_end += 1
    if any(candidate.strip() == row.strip() for candidate in lines[divider_index + 1 : table_end]):
        return text
    lines.insert(table_end, row)
    return "\n".join(lines)


def next_number(directory_path: Path, pattern: str) -> int:
    max_seen = 0
    for path in directory_path.glob("*.md"):
        match = re.search(pattern, path.name)
        if match:
            max_seen = max(max_seen, int(match.group(1)))
    return max_seen + 1


def kebab_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "item"


def root_context_from_args(args, task: str | None = None) -> dict:
    return root_resolution.resolve_change_context(
        state_root=getattr(args, "state_root", None),
        repo_root=getattr(args, "repo_root", None),
        code_root=getattr(args, "code_root", None),
        change_id=task or getattr(args, "task", None) or getattr(args, "change", None),
    )


def resolve_root_or_error(args, task: str | None = None):
    context = root_context_from_args(args, task)
    if context.get("unresolved_reason"):
        print(root_resolution.error_text(context), file=sys.stderr)
        return None, context
    return Path(context["state_root"]), context


def ensure_change_exists(root: Path, task: str):
    target = change_dir(root, task)
    if not target.exists():
        print(f"ERROR: change not found: {target}", file=sys.stderr)
        return None
    return target


def command_policy(args) -> int:
    payload = policy.projection_policy()
    payload["commands"]["migrate"] = "harness-change-doc migrate <change> --dry-run | --apply"
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


CHANGE_WORKSPACE_TEMPLATES = [
    ("README.md", "change-index", ["workflow"], "Change workspace index."),
    ("requirements.md", "requirements", ["requirements"], "Settled requirements and constraints."),
    ("research.md", "research", ["research"], "Source-backed change research."),
    ("proposal.md", "proposal", ["proposal"], "Change proposal."),
    ("design.md", "design", ["design"], "Change design."),
    ("plan.md", "plan", ["workflow"], "Change implementation plan."),
    ("tasks.md", "tasks", ["implementation"], "Change task checklist."),
    ("specs/README.md", "specs-index", ["workflow"], "Change specification index."),
]


def command_init(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.task):
        print(f"ERROR: invalid change id: {args.task}", file=sys.stderr)
        return 2
    target = change_dir(root, args.task)
    if target.exists():
        print(f"ERROR: change already exists: {target}", file=sys.stderr)
        return 1

    changes_root = root / ".changes"
    changes_root.mkdir(parents=True, exist_ok=True)
    if changes_root.is_symlink() or not changes_root.is_dir():
        print(f"ERROR: managed changes root must be a real directory: {changes_root}", file=sys.stderr)
        return 1

    temporary = Path(tempfile.mkdtemp(prefix=f".init-{args.task}-", dir=changes_root))
    try:
        workspace_description = args.description or "Change workspace index."
        for rel_path, artifact, tags, default_description in CHANGE_WORKSPACE_TEMPLATES:
            description = workspace_description if rel_path == "README.md" else default_description
            body = strip_front_matter(read_text(PACKAGE_ROOT / "templates" / "changes" / rel_path))
            if rel_path == "README.md":
                body = body.replace("- Task:", f"- Task: `{args.task}`")
            write_text(temporary / rel_path, front_matter(artifact, "draft", tags, description) + body)
        for directory in policy.CHANGE_CHILD_DIRECTORIES:
            ensure_child_index(temporary / directory, directory)
        temporary.rename(target)
    except Exception as exc:
        shutil.rmtree(temporary, ignore_errors=True)
        print(f"ERROR: failed to initialize change workspace: {exc}", file=sys.stderr)
        return 1

    result = {
        "change_id": args.task,
        "change_root": target.relative_to(root).as_posix(),
        "initialized": True,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(target)
    return 0


def command_index(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = change_dir(root, args.task)
    if not target.exists():
        print(f"ERROR: change not found: {target}", file=sys.stderr)
        return 2

    print(json.dumps(build_index(root, args.task), ensure_ascii=False, indent=2))
    return 0


def build_index(root: Path, task: str):
    target = change_dir(root, task)
    task_tags = parse_tag_registry(target / "README.md", "Task Tag Registry")
    artifacts = []
    for path in sorted(p for p in target.rglob("*.md") if p.is_file()):
        rel_path = path.relative_to(target).as_posix()
        meta = parse_front_matter(path)
        artifact_name = meta.get("artifact") or infer_change_artifact(rel_path)
        artifacts.append(
            {
                "path": rel_path,
                "artifact": artifact_name,
                "status": meta.get("status"),
                "tags": meta.get("tags", []),
                "description": meta.get("description", ""),
                "indexed": is_indexed_child(target, rel_path),
            }
        )
    return {
        "change_id": task,
        "task_tags": task_tags,
        "artifacts": artifacts,
        "diagnostics": [],
    }


def infer_change_artifact(rel_path: str):
    for name, artifact_policy in policy.ARTIFACTS.items():
        if artifact_policy.naming == rel_path:
            return name
    if rel_path.startswith("specs/") and rel_path.endswith(".md") and rel_path != "specs/README.md":
        return "delta-spec"
    if rel_path.startswith("implementation-design/") and rel_path.endswith(".md") and rel_path != "implementation-design/README.md":
        return "implementation-design-detail"
    return None


def is_indexed_child(target: Path, rel_path: str) -> bool:
    parts = rel_path.split("/", 1)
    if len(parts) == 1:
        return True
    directory, child = parts
    if directory not in policy.CHANGE_CHILD_DIRECTORIES or child == "README.md":
        return True
    index_path = target / directory / "README.md"
    if not index_path.exists():
        return False
    rows = markdown_table_after_heading(read_text(index_path), "Child Index")
    return any(row.get("path", "").strip("`") == child for row in rows)


def command_add_review(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2

    reviews_dir = target / "reviews"
    ensure_child_index(reviews_dir, "reviews")
    round_id = f"r{args.round:02d}"
    filename = f"{args.target}-{round_id}.md"
    path = reviews_dir / filename
    if path.exists() and not args.force:
        print(f"ERROR: review already exists: {path}", file=sys.stderr)
        return 1

    tags = split_csv(args.tags) if args.tags else ["review"]
    description = args.description or f"{args.target} review round {args.round}"
    try:
        append_child_index(reviews_dir / "README.md", "reviews", filename, "review-round", args.status, round_id, description)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    body = front_matter("review-round", args.status, tags, description) + "\n".join(
        [
            f"# {args.target} Review Round {args.round}",
            "",
            "## Decision",
            "",
            "`DRAFT`",
            "",
            "## Findings",
            "",
            "| ID | Severity | Resolution |",
            "|---|---|---|",
        ]
    ) + "\n"
    write_text(path, body)
    print(path)
    return 0


def command_init_review_run(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    run_id = args.run_id
    contract = policy.JSON_EVIDENCE_DIRECTORIES["review-runs"]
    if not run_id or not re.fullmatch(contract["run_id_regex"], run_id):
        print("ERROR: init-review-run requires a portable --run-id identifier", file=sys.stderr)
        return 2
    run_root = target / "review-runs" / run_id
    if run_root.exists():
        print(f"ERROR: review run already exists: {run_root}", file=sys.stderr)
        return 2
    (run_root / "control" / "revisions").mkdir(parents=True)
    (run_root / "attempts").mkdir(parents=True)
    result = {
        "change_id": args.task,
        "run_id": run_id,
        "run_root": run_root.relative_to(target).as_posix(),
        "schema": contract["record_schema"],
        "initialized": True,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(run_root)
    return 0


def command_add_terminology(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    path = target / "terminology.md"
    if path.exists() and not args.force:
        print(f"ERROR: terminology already exists: {path}", file=sys.stderr)
        return 1
    description = args.description or "Task-local terminology."
    body = front_matter("terminology", args.status, split_csv(args.tags), description) + "\n".join(
        [
            "# Terminology",
            "",
            "## Terms",
            "",
            "| Term | Meaning | Scope |",
            "|---|---|---|",
        ]
    ) + "\n"
    write_text(path, body)
    print(path)
    return 0


IMPLEMENTATION_DESIGN_DOCS = [
    {
        "file": "01-problem.md",
        "description": "Detailed design problem, goals, non-goals, and boundaries.",
    },
    {
        "file": "02-code-topology.md",
        "description": "Subsystem and module topology, dependency direction, and forbidden dependencies.",
    },
    {
        "file": "03-class-design.md",
        "description": "Class/interface design, responsibility table, ownership, lifecycle, and test seams.",
    },
    {
        "file": "04-runtime-flow.md",
        "description": "Object lifecycle, normal flow, failure flow, rollback flow, and state transitions.",
    },
    {
        "file": "05-error-model.md",
        "description": "Error contract, retry, rollback, idempotency, and observability model.",
    },
    {
        "file": "06-implementation-plan.md",
        "description": "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests.",
    },
    {
        "file": "07-constraints.md",
        "description": "Design constraints, anti-pattern checks, and readiness self-review.",
    },
]


def command_add_implementation_design(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    if not is_structured_change_workspace(target):
        print(
            f"ERROR: add-implementation-design requires a structured change workspace with README.md and specs/README.md: {target}",
            file=sys.stderr,
        )
        print("GUIDE: create or migrate the structured workspace before adding implementation-design.", file=sys.stderr)
        return 1

    directory = target / "implementation-design"
    tags = split_csv(args.tags) if args.tags else ["design", "implementation"]
    description = args.description or "Detailed implementation design pack."
    created: list[Path] = []
    skipped: list[Path] = []

    index_body = front_matter("implementation-design-index", args.status, tags, description)
    index_body += implementation_design_template_body("README.md")
    write_design_file(directory / "README.md", index_body, args.force, created, skipped)

    for doc in IMPLEMENTATION_DESIGN_DOCS:
        body = front_matter("implementation-design-detail", args.status, tags, doc["description"])
        body += implementation_design_template_body(doc["file"])
        write_design_file(directory / doc["file"], body, args.force, created, skipped)

    for path in created:
        print(path)
    for path in skipped:
        print(f"SKIP existing: {path}")
    return 0


def is_structured_change_workspace(target: Path) -> bool:
    return (target / "README.md").exists() and (target / "specs" / "README.md").exists()


def implementation_design_template_body(file_name: str) -> str:
    template_path = PACKAGE_ROOT / "templates" / "changes" / "implementation-design" / file_name
    return strip_front_matter(read_text(template_path))


def strip_front_matter(text: str) -> str:
    return re.sub(r"^---\n[\s\S]*?\n---\n+", "", text)


def write_design_file(path: Path, body: str, force: bool, created: list[Path], skipped: list[Path]) -> None:
    if path.exists() and not force:
        skipped.append(path)
        return
    write_text(path, body)
    created.append(path)


def command_add_decision(args) -> int:
    return add_child_document(
        args,
        directory="decisions",
        artifact="decision-record",
        filename_builder=lambda directory_path: f"DR-{next_number(directory_path, r'DR-(\d+)'):03d}-{kebab_slug(args.slug)}.md",
        order_builder=lambda path: path.stem.split("-", 2)[1],
        title=f"DR: {args.slug}",
        sections=["## Context", "## Decision", "## Alternatives Considered", "## Consequences"],
    )


def command_add_timeline(args) -> int:
    event_date = args.date_key or date.today().isoformat()
    return add_child_document(
        args,
        directory="timeline",
        artifact="timeline-event",
        filename_builder=lambda directory_path: f"{event_date}-{next_number(directory_path, r'^[0-9]{4}-[0-9]{2}-[0-9]{2}-(\d+)'):03d}-{kebab_slug(args.slug)}.md",
        order_builder=lambda path: "-".join(path.name.split("-", 4)[:4]),
        title=args.slug,
        sections=["## Event", "## Decision", "## Evidence", "## Residual Risk"],
    )


def command_add_task_slice(args) -> int:
    return add_child_document(
        args,
        directory="tasks",
        artifact="task-slice",
        filename_builder=lambda directory_path: f"slice-{next_number(directory_path, r'slice-(\d+)'):03d}-{kebab_slug(args.slug)}.md",
        order_builder=lambda path: path.stem.split("-", 2)[1],
        title=f"Slice: {args.slug}",
        sections=[
            "## Objective",
            "## Scope\n\n- Source design:\n- Goal:\n- Non-goals:\n- Scope:\n- Subsystem:\n- Module:\n- Changed surfaces:\n- Prerequisites:",
            "## Steps\n\n- [ ] ",
            "## Validation\n\n- [ ] ",
            "## Review\n\n- Review packet:\n- Review owner:",
            "## Rollback\n\n- ",
            "## Open Decisions\n\n- None",
        ],
    )


def add_child_document(args, directory: str, artifact: str, filename_builder, order_builder, title: str, sections):
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    directory_path = target / directory
    ensure_child_index(directory_path, directory)
    filename = filename_builder(directory_path)
    path = directory_path / filename
    if path.exists() and not args.force:
        print(f"ERROR: document already exists: {path}", file=sys.stderr)
        return 1

    tags = split_csv(args.tags) if args.tags else default_tags_for_artifact(artifact)
    description = args.description or title
    try:
        append_child_index(directory_path / "README.md", directory, filename, artifact, args.status, order_builder(path), description)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    body = front_matter(artifact, args.status, tags, description)
    body += f"# {title}\n\n" + "\n\n".join(sections) + "\n"
    write_text(path, body)
    print(path)
    return 0


def command_list(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    index = build_index(root, args.task)
    if args.json:
        print(json.dumps(index, ensure_ascii=False, indent=2))
    else:
        for artifact in index["artifacts"]:
            print(f"{artifact['path']}\t{artifact.get('artifact') or '-'}\t{artifact.get('status') or '-'}")
    return 0


def command_locate(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    matches = []
    for artifact in build_index(root, args.task)["artifacts"]:
        if args.artifact and artifact.get("artifact") != args.artifact:
            continue
        if args.status and artifact.get("status") != args.status:
            continue
        if args.tag and args.tag not in artifact.get("tags", []):
            continue
        matches.append(artifact)
    if args.json:
        print(json.dumps({"change_id": args.task, "matches": matches}, ensure_ascii=False, indent=2))
    else:
        for artifact in matches:
            print(target / artifact["path"])
    return 0


def command_read(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    matches = []
    for artifact in build_index(root, args.task)["artifacts"]:
        if args.artifact and artifact.get("artifact") != args.artifact:
            continue
        if args.status and artifact.get("status") != args.status:
            continue
        if args.tag and args.tag not in artifact.get("tags", []):
            continue
        matches.append(artifact)
    if args.paths_only:
        for artifact in matches:
            print(target / artifact["path"])
        return 0
    for artifact in matches:
        path = target / artifact["path"]
        print(f"===== {path} =====")
        print(read_text(path))
    return 0


def split_csv(value: str):
    return [item.strip() for item in value.split(",") if item.strip()]


def command_migrate(args) -> int:
    root, _context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = change_dir(root, args.task)
    if not target.exists():
        print(f"ERROR: change not found: {target}", file=sys.stderr)
        return 2

    if args.dry_run == args.apply:
        print("ERROR: migrate requires exactly one of --dry-run or --apply", file=sys.stderr)
        return 2
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", args.task):
        print(f"ERROR: invalid change id: {args.task}", file=sys.stderr)
        return 2
    try:
        plan = build_migration_plan(root, args.task)
        print_json(plan if args.dry_run else apply_migration(root, args.task, plan))
        return 0
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1




LEGACY_MIGRATION_PATHS = [
    ("review-log.md", "reviews"),
    ("timeline.md", "timeline"),
    ("tasks.md", "tasks"),
]


def build_migration_plan(repo_root: Path, task: str) -> dict:
    target = change_dir(repo_root, task)
    assert_migration_path(repo_root, target)
    assert_migration_path(repo_root, target / "proposal.md")
    if not (target / "proposal.md").exists():
        raise ValueError("migration requires a legacy proposal workspace with proposal.md")
    legacy_sources = migration_legacy_sources(repo_root, target, task)
    if not legacy_sources:
        raise ValueError("migration requires a legacy review-log.md, timeline.md, tasks.md, or archived equivalent")
    already_migrated = all(source["source_state"] == "absent" for source in legacy_sources)
    outputs = {} if already_migrated else build_migration_outputs(repo_root, target, task, legacy_sources)
    return {
        "mode": "dry-run",
        "change_id": task,
        "legacy_sources": legacy_sources,
        "generated_paths": sorted(outputs),
        "already_migrated": already_migrated,
    }


def migration_legacy_sources(repo_root: Path, target: Path, task: str) -> list[dict]:
    sources = []
    for rel_path, target_directory in LEGACY_MIGRATION_PATHS:
        source_path = target / rel_path
        archive_path = repo_root / ".changes" / "archive" / task / "legacy" / rel_path
        assert_migration_path(repo_root, source_path)
        assert_migration_path(repo_root, archive_path)
        source_state = migration_file_state(source_path)
        archive_state = migration_file_state(archive_path)
        if source_state == "absent" and archive_state == "absent":
            continue
        if source_state == "present" and archive_state == "present" and source_path.read_bytes() != archive_path.read_bytes():
            raise ValueError(f"legacy source conflicts with archive: {rel_path}")
        sources.append(
            {
                "path": rel_path,
                "archive_path": f".changes/archive/{task}/legacy/{rel_path}",
                "target_directory": target_directory,
                "source_state": source_state,
                "archive_state": archive_state,
            }
        )
    return sources


def assert_migration_path(repo_root: Path, candidate: Path) -> None:
    root = repo_root.absolute()
    path = candidate.absolute()
    try:
        relative = path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"migration path escapes state root: {candidate}") from error
    current = root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise ValueError(f"migration path must not traverse a symlink: {current}")
        if not current.exists():
            return


def migration_file_state(path: Path) -> str:
    if path.is_symlink():
        raise ValueError(f"migration path must be a regular file: {path}")
    if not path.exists():
        return "absent"
    if not path.is_file():
        raise ValueError(f"migration path must be a regular file: {path}")
    return "present"


def build_migration_outputs(repo_root: Path, target: Path, task: str, legacy_sources: list[dict]) -> dict[str, tuple[bytes, str]]:
    outputs: dict[str, tuple[bytes, str]] = {}

    def read_existing(rel_path: str) -> str:
        path = target / rel_path
        if migration_file_state(path) == "absent":
            return ""
        try:
            return path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as error:
            raise ValueError(f"migration Markdown must be valid UTF-8: {path}") from error

    def write_output(rel_path: str, text: str, mode: str) -> None:
        outputs[rel_path] = (text.encode("utf-8"), mode)

    readme = ensure_task_tag_registry(
        ensure_front_matter(
            read_existing("README.md") or "# Change\n",
            "change-index",
            ["workflow", "migration"],
            "Structured change workspace migrated from legacy artifacts.",
        )
    )
    write_output("README.md", ensure_migration_status(readme, task), "transform")

    for rel_path, artifact_name, tags in [
        ("proposal.md", "proposal", ["proposal", "migration"]),
        ("requirements.md", "requirements", ["requirements", "migration"]),
        ("research.md", "research", ["research", "migration"]),
        ("terminology.md", "terminology", ["terminology", "migration"]),
        ("design.md", "design", ["design", "migration"]),
        ("plan.md", "plan", ["workflow", "migration"]),
        ("execution-map.md", "execution-map", ["execution-map", "migration"]),
    ]:
        existing = read_existing(rel_path)
        if existing:
            write_output(rel_path, ensure_front_matter(existing, artifact_name, tags, f"Migrated {artifact_name} artifact."), "transform")

    specs_root = target / "specs"
    assert_migration_directory(specs_root)
    write_output(
        "specs/README.md",
        ensure_front_matter(
            read_existing("specs/README.md") or "# Specs\n",
            "specs-index",
            ["workflow", "migration"],
            "Structured specification index.",
        ),
        "transform",
    )
    if specs_root.exists():
        for spec_path in sorted(path for path in specs_root.rglob("*.md") if path.is_file()):
            rel_path = spec_path.relative_to(target).as_posix()
            if rel_path != "specs/README.md":
                write_output(rel_path, ensure_structured_spec(read_existing(rel_path), rel_path), "transform")

    for directory in ("decisions", "reviews", "tasks"):
        assert_migration_directory(target / directory)
    write_output(
        "decisions/README.md",
        migration_child_index(
            "decisions",
            [["DR-001-migration-provenance.md", "decision-record", "frozen", "001", "Archived legacy artifact provenance."]],
        ),
        "create",
    )
    write_output("decisions/DR-001-migration-provenance.md", migration_provenance(task, legacy_sources), "create")
    write_output("reviews/README.md", migration_child_index("reviews", []), "create")
    write_output("tasks/README.md", migration_child_index("tasks", []), "create")
    return outputs


def assert_migration_directory(directory: Path) -> None:
    if directory.is_symlink():
        raise ValueError(f"migration path must be a directory: {directory}")
    if not directory.exists():
        return
    if not directory.is_dir():
        raise ValueError(f"migration path must be a directory: {directory}")
    for child in directory.iterdir():
        if child.is_symlink():
            raise ValueError(f"migration path must not be a symlink: {child}")
        if child.is_dir():
            assert_migration_directory(child)


def apply_migration(repo_root: Path, task: str, plan: dict) -> dict:
    if plan["already_migrated"]:
        return {**plan, "mode": "applied"}
    target = change_dir(repo_root, task)
    outputs = build_migration_outputs(repo_root, target, task, plan["legacy_sources"])
    for rel_path, (bytes_value, mode) in outputs.items():
        destination = target / rel_path
        state = migration_file_state(destination)
        if mode == "create" and state == "present" and destination.read_bytes() != bytes_value:
            raise ValueError(f"migration generated file conflicts with existing content: {rel_path}")

    for source in plan["legacy_sources"]:
        source_path = target / source["path"]
        archive_path = repo_root / source["archive_path"]
        bytes_value = source_path.read_bytes() if source["source_state"] == "present" else archive_path.read_bytes()
        install_missing_or_equal(archive_path, bytes_value)
    for rel_path, (bytes_value, mode) in outputs.items():
        destination = target / rel_path
        if mode == "transform":
            write_atomic(destination, bytes_value)
        else:
            install_missing_or_equal(destination, bytes_value)
    for source in plan["legacy_sources"]:
        if source["source_state"] == "absent":
            continue
        source_path = target / source["path"]
        archive_path = repo_root / source["archive_path"]
        if source_path.read_bytes() != archive_path.read_bytes():
            raise ValueError(f"legacy source changed before removal: {source['path']}")
        source_path.unlink()
    return {**plan, "mode": "applied"}


def install_missing_or_equal(path: Path, bytes_value: bytes) -> None:
    state = migration_file_state(path)
    if state == "absent":
        write_atomic(path, bytes_value)
        return
    if path.read_bytes() != bytes_value:
        raise ValueError(f"migration destination conflicts with existing content: {path}")


def ensure_front_matter(text: str, artifact_name: str, tags, description: str) -> str:
    if FRONT_MATTER_RE.match(text):
        return text
    return front_matter(artifact_name, "draft", tags, description) + text


def ensure_task_tag_registry(text: str) -> str:
    if re.search(r"^## Task Tag Registry\s*$", text, re.MULTILINE):
        return text if text.endswith("\n") else text + "\n"
    suffix = "" if text.endswith("\n") else "\n"
    return text + suffix + "\n## Task Tag Registry\n\n| tag | description |\n|---|---|\n| `migration-history` | Archived legacy artifact provenance. |\n"


def ensure_migration_status(text: str, task: str) -> str:
    status = (
        "<!-- harness-migration-status:start -->\n"
        "## Migration Status\n\n"
        "- Workspace mode: `structured`, established by direct legacy file migration.\n"
        "- Provenance: `decisions/DR-001-migration-provenance.md`.\n"
        f"- Historical legacy evidence: `.changes/archive/{task}/legacy/`.\n"
        "<!-- harness-migration-status:end -->\n"
    )
    marker = re.compile(r"<!-- harness-migration-status:start -->[\s\S]*?<!-- harness-migration-status:end -->\n?")
    if marker.search(text):
        return marker.sub(status, text)
    return (text if text.endswith("\n") else text + "\n") + "\n" + status


def ensure_structured_spec(text: str, rel_path: str) -> str:
    with_metadata = ensure_front_matter(text, "delta-spec", ["workflow", "migration"], f"Migrated legacy specification {rel_path}.")
    match = FRONT_MATTER_RE.match(with_metadata)
    metadata = match.group(0) if match else ""
    body = with_metadata[len(metadata) :]
    prefix = []
    if "## Purpose" not in body:
        prefix.append("## Purpose\n\nMigrated legacy specification; refine its contract before implementation.\n")
    if "## Traceability" not in body:
        prefix.append(f"## Traceability\n\n- Migration source: {rel_path}\n")
    return metadata + (("\n".join(prefix) + "\n") if prefix else "") + body


def migration_child_index(directory: str, rows: list[list[str]]) -> str:
    contract = policy.CHANGE_CHILD_DIRECTORIES[directory]
    title = directory.replace("-", " ").title()
    header = "| " + " | ".join(contract["columns"]) + " |"
    divider = "|" + "|".join("---" for _ in contract["columns"]) + "|"
    entries = ["| " + " | ".join(row) + " |" for row in rows]
    return (
        front_matter(contract["index_artifact"], "draft", default_tags_for_artifact(contract["index_artifact"]), f"{title} index.")
        + f"# {title}\n\n## Responsibility\n\nThis directory indexes {directory} child documents.\n\n## Child Index\n\n{header}\n{divider}\n"
        + "\n".join(entries)
        + ("\n" if entries else "")
    )


def migration_provenance(task: str, legacy_sources: list[dict]) -> str:
    rows = "\n".join(f"| `{item['path']}` | `{item['archive_path']}` |" for item in legacy_sources)
    return (
        front_matter("decision-record", "frozen", ["decision", "migration"], "Archived legacy artifact provenance.")
        + f"# Migration Provenance\n\n## Context\n\nThe legacy workspace was converted by archiving its top-level history and creating the structured workspace layout.\n\n## Decision\n\n- Change ID: `{task}`\n- Archive root: `.changes/archive/{task}/legacy/`\n- Current structured indexes do not reinterpret archived review decisions.\n\n## Archived Legacy Evidence\n\n| Source | Archive Path |\n|---|---|\n{rows}\n\n## Consequences\n\n- Historical references resolve to the same-change archive path.\n- New review work must use the structured review directory and its index.\n"
    )


def write_atomic(path: Path, value: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    if isinstance(value, bytes):
        temporary.write_bytes(value)
    else:
        temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def print_json(value) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def command_memory_index(args) -> int:
    root, _context = resolve_root_or_error(args)
    if root is None:
        return 2
    memory_root = root / ".memory"
    tags = parse_tag_registry(memory_root / "INDEX.md", "Memory Tag Registry")
    entries = []
    if memory_root.exists():
        for path in sorted(p for p in memory_root.rglob("*.md") if p.is_file()):
            rel_path = path.relative_to(memory_root).as_posix()
            meta = parse_front_matter(path)
            entries.append(
                {
                    "path": rel_path,
                    "artifact": meta.get("artifact"),
                    "status": meta.get("status"),
                    "tags": meta.get("tags", []),
                    "last_verified": meta.get("last_verified"),
                    "source_revision": meta.get("source_revision"),
                    "description": meta.get("description", ""),
                }
            )
    print(
        json.dumps(
            {
                "memory_root": str(memory_root),
                "memory_tags": tags,
                "entries": entries,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def command_memory_retrofit(args) -> int:
    root, _context = resolve_root_or_error(args)
    if root is None:
        return 2
    memory_root = root / ".memory"
    candidates = []
    if memory_root.exists():
        for path in sorted(p for p in memory_root.rglob("*.md") if p.is_file()):
            rel_path = path.relative_to(memory_root).as_posix()
            meta = parse_front_matter(path)
            if rel_path == "INDEX.md":
                continue
            missing = [
                field
                for field in ("artifact", "status", "tags", "last_verified", "source_revision")
                if field not in meta
            ]
            if missing:
                candidates.append({"path": rel_path, "missing_fields": missing})
    print(
        json.dumps(
            {
                "mode": "dry-run" if args.dry_run else "plan-only",
                "date": date.today().isoformat(),
                "candidates": candidates,
                "writes": [],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def command_resolve(args) -> int:
    context = root_context_from_args(args, getattr(args, "change", None))
    if args.json:
        if context.get("unresolved_reason") == "conflicting-explicit-roots":
            print(root_resolution.error_text(context), file=sys.stderr)
            return 2
        print(json.dumps(context, ensure_ascii=False, indent=2))
        return 0
    if context.get("unresolved_reason"):
        print(root_resolution.error_text(context), file=sys.stderr)
        return 2
    print(f"STATE_ROOT: {context['state_root']}")
    print(f"CODE_ROOT: {context['code_root']}")
    return 0


def command_execution_map(args) -> int:
    root, context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    if not args.json:
        print("ERROR: execution-map requires --json", file=sys.stderr)
        return 2
    print(json.dumps(execution_map.execution_map_payload(target, context), ensure_ascii=False, indent=2))
    return 0


def command_assign_slice(args) -> int:
    root, context = resolve_root_or_error(args, args.task)
    if root is None:
        return 2
    target = ensure_change_exists(root, args.task)
    if target is None:
        return 2
    try:
        result = execution_map.assign_slice(target, args, context, Path.cwd())
    except execution_map.ExecutionMapError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(result["path"])
    return 0


def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root")
    parser.add_argument("--state-root")
    parser.add_argument("--code-root")
    subparsers = parser.add_subparsers(dest="command", required=True)

    policy_parser = subparsers.add_parser("policy")
    policy_parser.add_argument("--json", action="store_true", required=True)
    policy_parser.set_defaults(func=command_policy)

    resolve_parser = subparsers.add_parser("resolve")
    resolve_parser.add_argument("--change")
    resolve_parser.add_argument("--json", action="store_true")
    resolve_parser.set_defaults(func=command_resolve)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("task")
    init_parser.add_argument("--description")
    init_parser.add_argument("--json", action="store_true")
    init_parser.set_defaults(func=command_init)

    index_parser = subparsers.add_parser("index")
    index_parser.add_argument("task")
    index_parser.add_argument("--json", action="store_true", required=True)
    index_parser.set_defaults(func=command_index)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("task")
    list_parser.add_argument("--json", action="store_true")
    list_parser.set_defaults(func=command_list)

    locate_parser = subparsers.add_parser("locate")
    locate_parser.add_argument("task")
    locate_parser.add_argument("--artifact")
    locate_parser.add_argument("--status")
    locate_parser.add_argument("--tag")
    locate_parser.add_argument("--json", action="store_true")
    locate_parser.set_defaults(func=command_locate)

    read_parser = subparsers.add_parser("read")
    read_parser.add_argument("task")
    read_parser.add_argument("--artifact")
    read_parser.add_argument("--status")
    read_parser.add_argument("--tag")
    read_parser.add_argument("--paths-only", action="store_true")
    read_parser.set_defaults(func=command_read)

    execution_map_parser = subparsers.add_parser("execution-map")
    execution_map_parser.add_argument("task")
    execution_map_parser.add_argument("--json", action="store_true", required=True)
    execution_map_parser.set_defaults(func=command_execution_map)

    assign_slice_parser = subparsers.add_parser("assign-slice")
    assign_slice_parser.add_argument("task")
    assign_slice_parser.add_argument("--slice", required=True)
    assign_slice_parser.add_argument("--status", default="planned")
    assign_slice_parser.add_argument("--topology", default="standalone")
    assign_slice_parser.add_argument("--branch")
    assign_slice_parser.add_argument("--worktree")
    assign_slice_parser.add_argument("--base")
    assign_slice_parser.add_argument("--depends-on")
    assign_slice_parser.add_argument("--owner")
    assign_slice_parser.add_argument("--last-evidence")
    assign_slice_parser.add_argument("--json", action="store_true")
    assign_slice_parser.set_defaults(func=command_assign_slice)

    terminology_parser = subparsers.add_parser("add-terminology")
    terminology_parser.add_argument("task")
    terminology_parser.add_argument("--status", default="draft")
    terminology_parser.add_argument("--tags", default="terminology")
    terminology_parser.add_argument("--description")
    terminology_parser.add_argument("--force", action="store_true")
    terminology_parser.set_defaults(func=command_add_terminology)

    implementation_design_parser = subparsers.add_parser("add-implementation-design")
    implementation_design_parser.add_argument("task")
    implementation_design_parser.add_argument("--status", default="draft")
    implementation_design_parser.add_argument("--tags", default="design,implementation")
    implementation_design_parser.add_argument("--description")
    implementation_design_parser.add_argument("--force", action="store_true")
    implementation_design_parser.set_defaults(func=command_add_implementation_design)

    decision_parser = subparsers.add_parser("add-decision")
    decision_parser.add_argument("task")
    decision_parser.add_argument("--slug", required=True)
    decision_parser.add_argument("--status", default="draft")
    decision_parser.add_argument("--tags", default="decision")
    decision_parser.add_argument("--description")
    decision_parser.add_argument("--force", action="store_true")
    decision_parser.set_defaults(func=command_add_decision)

    timeline_parser = subparsers.add_parser("add-timeline")
    timeline_parser.add_argument("task")
    timeline_parser.add_argument("--slug", required=True)
    timeline_parser.add_argument("--date-key")
    timeline_parser.add_argument("--status", default="draft")
    timeline_parser.add_argument("--tags", default="workflow")
    timeline_parser.add_argument("--description")
    timeline_parser.add_argument("--force", action="store_true")
    timeline_parser.set_defaults(func=command_add_timeline)

    review_parser = subparsers.add_parser("add-review")
    review_parser.add_argument("task")
    review_parser.add_argument("--target", required=True)
    review_parser.add_argument("--round", type=int, required=True)
    review_parser.add_argument("--status", default="draft")
    review_parser.add_argument("--tags", default="review")
    review_parser.add_argument("--description")
    review_parser.add_argument("--force", action="store_true")
    review_parser.set_defaults(func=command_add_review)

    init_review_run_parser = subparsers.add_parser("init-review-run")
    init_review_run_parser.add_argument("task")
    init_review_run_parser.add_argument("--run-id", required=True)
    init_review_run_parser.add_argument("--json", action="store_true", required=True)
    init_review_run_parser.set_defaults(func=command_init_review_run)

    task_slice_parser = subparsers.add_parser("add-task-slice")
    task_slice_parser.add_argument("task")
    task_slice_parser.add_argument("--slug", required=True)
    task_slice_parser.add_argument("--status", default="draft")
    task_slice_parser.add_argument("--tags", default="implementation")
    task_slice_parser.add_argument("--description")
    task_slice_parser.add_argument("--force", action="store_true")
    task_slice_parser.set_defaults(func=command_add_task_slice)

    migrate_parser = subparsers.add_parser("migrate")
    migrate_parser.add_argument("task")
    migrate_parser.add_argument("--dry-run", action="store_true")
    migrate_parser.add_argument("--apply", action="store_true")
    migrate_parser.set_defaults(func=command_migrate)

    memory_index_parser = subparsers.add_parser("memory-index")
    memory_index_parser.add_argument("--json", action="store_true", required=True)
    memory_index_parser.set_defaults(func=command_memory_index)

    memory_retrofit_parser = subparsers.add_parser("memory-retrofit")
    memory_retrofit_parser.add_argument("--dry-run", action="store_true", required=True)
    memory_retrofit_parser.set_defaults(func=command_memory_retrofit)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    global_context = root_context_from_args(args)
    if global_context.get("unresolved_reason") == "conflicting-explicit-roots":
        print(root_resolution.error_text(global_context), file=sys.stderr)
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
