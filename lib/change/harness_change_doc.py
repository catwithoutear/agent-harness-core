#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
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
    if row in text:
        return
    if "## Child Index" not in text:
        text = (
            text.rstrip()
            + "\n\n## Child Index\n\n| "
            + " | ".join(columns)
            + " |\n|"
            + "|".join("---" for _ in columns)
            + "|\n"
        )
    text = text.rstrip() + "\n" + row + "\n"
    write_text(index_path, text)


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
    payload["commands"]["migrate"] = "harness-change-doc migrate <change> --dry-run | --apply --expected-plan-sha256 <sha256>"
    print(json.dumps(payload, ensure_ascii=False, indent=2))
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
    append_child_index(reviews_dir / "README.md", "reviews", filename, "review-round", args.status, round_id, description)
    print(path)
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
    body = front_matter(artifact, args.status, tags, description)
    body += f"# {title}\n\n" + "\n\n".join(sections) + "\n"
    write_text(path, body)
    append_child_index(directory_path / "README.md", directory, filename, artifact, args.status, order_builder(path), description)
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
        existing_transaction = read_migration_transaction(migration_transaction_dir(root, args.task))
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if args.apply and existing_transaction and existing_transaction.get("state") == "committed":
        expected = args.expected_plan_sha256
        committed_plan = existing_transaction.get("plan")
        if not expected or not re.match(r"^[a-f0-9]{64}$", expected):
            print("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>", file=sys.stderr)
            return 2
        if not isinstance(committed_plan, dict) or committed_plan.get("plan_sha256") != expected:
            print("ERROR: committed migration does not match the accepted plan digest; no files were written", file=sys.stderr)
            return 1
        try:
            print_json(apply_migration_plan(root, args.task, committed_plan))
            return 0
        except (OSError, ValueError) as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 1
    if args.apply and existing_transaction and existing_transaction.get("state") in {"prepared", "applying", "interrupted"} and isinstance(existing_transaction.get("plan"), dict):
        expected = args.expected_plan_sha256
        if not expected or not re.match(r"^[a-f0-9]{64}$", expected):
            print("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>", file=sys.stderr)
            return 2
        if existing_transaction["plan"].get("plan_sha256") != expected:
            try:
                abandon_interrupted_migration(root, args.task, existing_transaction)
            except (OSError, ValueError) as error:
                print(f"ERROR: interrupted migration does not match the accepted plan digest and cannot be safely rolled back: {error}", file=sys.stderr)
                return 1
            print("ERROR: interrupted migration did not match the accepted plan digest; the prior partial workspace was rolled back, rerun --dry-run before applying", file=sys.stderr)
            return 1
        try:
            print_json(apply_migration_plan(root, args.task, existing_transaction["plan"]))
            return 0
        except (OSError, ValueError) as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 1
    if args.apply and existing_transaction and existing_transaction.get("state") in {"prepared", "applying", "interrupted"}:
        print("ERROR: interrupted migration lacks a recoverable accepted plan; validation remains fail-closed", file=sys.stderr)
        return 1

    try:
        plan = build_migration_plan(root, args.task)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if args.dry_run:
        print_json(plan)
        return 0

    expected = args.expected_plan_sha256
    if not expected or not re.match(r"^[a-f0-9]{64}$", expected):
        print("ERROR: migrate --apply requires --expected-plan-sha256 <sha256>", file=sys.stderr)
        return 2
    if expected != plan["plan_sha256"]:
        print("ERROR: migration plan digest does not match the current dry-run plan; no files were written", file=sys.stderr)
        return 1

    try:
        print_json(apply_migration_plan(root, args.task, plan))
        return 0
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1



def validate_bootstrap_consumed_evidence(repo_root: Path, registry: dict) -> None:
    scope_evidence = validate_bootstrap_scope_evidence(repo_root, registry)
    event = registry["event"]
    if not valid_sha256(event.get("close_evidence_sha256")):
        raise ValueError("consumed bootstrap is missing close evidence digest")
    review_text = bootstrap_review_text(repo_root, event["originating_change_id"])
    snapshot = bootstrap_source_snapshot(repo_root, scope_evidence["manifest"]["base_commit"], scope_evidence["manifest"]["source_paths"])
    evidence = validate_bootstrap_close_evidence(
        review_text,
        event["close_gate_ref"]["decision_id"],
        scope_evidence["manifest"],
        snapshot["sha256"],
        event["validation_evidence_sha256"],
        scope_evidence["authority_event_sha256"],
        event["executor_id"],
        event["reviewer_id"],
    )
    if (
        event["close_gate_ref"]["artifact_sha256"] != evidence["review_round_sha256"]
        or event.get("authority_event_sha256") != scope_evidence["authority_event_sha256"]
        or event["implementation_snapshot_sha256"] != snapshot["sha256"]
        or evidence["sha256"] != event["close_evidence_sha256"]
    ):
        raise ValueError("consumed bootstrap does not bind its close review, source snapshot, and evidence")


def validate_bootstrap_scope_evidence(repo_root: Path, registry: dict) -> dict:
    current_event = registry["event"]
    event = current_event if current_event.get("state") == "scoped" else read_bootstrap_event(registry["directory"], 2, "scoped")
    if not event or not valid_sha256(event.get("scope_manifest_sha256")):
        raise ValueError("bootstrap scope evidence is unavailable")
    review_text = bootstrap_review_text(repo_root, event["originating_change_id"])
    claim = read_bootstrap_event(registry["directory"], 1, "claimed")
    authority_round = frozen_ready_review_round(review_text, claim.get("authority_ref", {}).get("decision_id") if claim else None)
    claim_spec = json_block_after_heading(authority_round["text"], "BootstrapClaimSpec")
    authority_identity = review_round_identity(authority_round)
    if (
        not claim
        or claim["authority_ref"].get("artifact_sha256") != authority_round["sha256"]
        or claim_spec.get("expected_authority_decision_id") != claim["authority_ref"].get("decision_id")
        or sha256_text(canonical_json(claim_spec)) != claim.get("claim_spec_digest")
        or claim_spec.get("bootstrap_id") != claim.get("bootstrap_id")
        or claim_spec.get("originating_change_id") != event.get("originating_change_id")
        or claim_spec.get("state_root_realpath") != str(repo_root.resolve())
    ):
        raise ValueError("claimed bootstrap does not bind its frozen BootstrapClaimSpec")
    scope_round = frozen_ready_review_round(review_text, event.get("scope_gate_ref", {}).get("decision_id"))
    manifest = json_block_after_heading(scope_round["text"], "Bootstrap Scope Manifest")
    predecessor = json_block_after_heading(scope_round["text"], "Predecessor Source Snapshot")
    scope_identity = review_round_identity(scope_round)
    source_paths = manifest.get("source_paths")
    if (
        event["scope_gate_ref"].get("artifact_sha256") != scope_round["sha256"]
        or sha256_text(canonical_json(manifest)) != event.get("scope_manifest_sha256")
        or sha256_text(canonical_json(predecessor)) != event.get("predecessor_snapshot_sha256")
        or manifest.get("authority_record_sha256") != event.get("authority_event_sha256")
        or manifest.get("base_commit") != event.get("base_commit")
        or manifest.get("code_root_realpath") != str(repo_root.resolve())
        or manifest.get("originating_change_id") != event.get("originating_change_id")
        or manifest.get("predecessor_snapshot_sha256") != event.get("predecessor_snapshot_sha256")
        or manifest.get("executor_id") != authority_identity["executor_id"]
        or manifest.get("reviewer_id") != authority_identity["reviewer_id"]
        or manifest.get("executor_id") != scope_identity["executor_id"]
        or manifest.get("reviewer_id") != scope_identity["reviewer_id"]
        or not isinstance(source_paths, list)
        or source_paths != sorted(source_paths)
        or len(set(source_paths)) != len(source_paths)
        or not all(safe_migration_path(value) for value in source_paths)
    ):
        raise ValueError("scoped bootstrap does not bind its frozen manifest and predecessor snapshot")
    if git_stdout(repo_root, ["rev-parse", "HEAD"]) != event.get("base_commit"):
        raise ValueError("scoped bootstrap base commit does not match the active code root")
    return {"authority_event_sha256": event["authority_event_sha256"], "manifest": manifest, "predecessor": predecessor}


def validate_bootstrap_close_evidence(
    review_text: str,
    decision_id: str,
    manifest: dict,
    snapshot_sha: str,
    validation_sha: str,
    authority_event_sha: str,
    executor_id: str,
    reviewer_id: str,
) -> dict:
    round_value = frozen_ready_review_round(review_text, decision_id)
    evidence = json_block_after_heading(round_value["text"], "Bootstrap Close Evidence")
    identity = review_round_identity(round_value)
    if (
        evidence.get("authority_record_sha256") != authority_event_sha
        or evidence.get("base_commit") != manifest.get("base_commit")
        or evidence.get("executor_id") != executor_id
        or evidence.get("reviewer_id") != reviewer_id
        or identity["executor_id"] != executor_id
        or identity["reviewer_id"] != reviewer_id
        or executor_id != manifest.get("executor_id")
        or reviewer_id != manifest.get("reviewer_id")
        or evidence.get("scope_manifest_sha256") != sha256_text(canonical_json(manifest))
        or evidence.get("implementation_snapshot_sha256") != snapshot_sha
        or not isinstance(evidence.get("validation_evidence"), dict)
        or sha256_text(canonical_json(evidence["validation_evidence"])) != validation_sha
    ):
        raise ValueError("frozen Bootstrap Close Evidence does not bind scope, snapshot, and validation evidence")
    return {"evidence": evidence, "review_round_sha256": round_value["sha256"], "sha256": sha256_text(canonical_json(evidence))}


def bootstrap_review_text(repo_root: Path, task: str) -> str:
    active = change_dir(repo_root, task) / "review-log.md"
    archived = repo_root / ".changes" / "archive" / task / "legacy" / "review-log.md"
    if active.exists():
        return read_text(active)
    if archived.exists():
        return read_text(archived)
    raise ValueError("bootstrap review evidence is missing from the active or archived workspace")


def frozen_ready_review_round(text: str, decision_id: str | None) -> dict:
    return frozen_review_round(text, decision_id, "READY")


def frozen_review_round(text: str, decision_id: str | None, decision: str) -> dict:
    if not valid_review_decision_id(decision_id):
        raise ValueError("bootstrap review decision ID is invalid")
    normalized = normalize_lf(text)
    headers = list(re.finditer(r"^## Review Round .+$", normalized, re.MULTILINE))
    expected_heading = f"## Review Round {decision_id}"
    selected = [header for header in headers if header.group(0) == expected_heading]
    if len(selected) != 1:
        raise ValueError(f"frozen {decision} review round must have one exact heading: {decision_id}")
    header = selected[0]
    next_header = next((candidate for candidate in headers if candidate.start() > header.start()), None)
    round_text = canonical_frozen_review_round_text(
        normalized[header.start() : next_header.start() if next_header else len(normalized)]
    )
    if (
        count_exact_line(round_text, f"Decision ID: {decision_id}") != 1
        or count_exact_line(round_text, f"Decision: {decision}") != 1
        or count_exact_line(round_text, "Frozen: yes") != 1
    ):
        raise ValueError(f"frozen {decision} review round has malformed decision fields: {decision_id}")
    if not has_reviewed_input_digest_table(round_text):
        raise ValueError(f"frozen {decision} review round is missing a reviewed-input digest table: {decision_id}")
    for heading in ("### Findings", "### Blocking", "### Re-review Result", "### Freeze Decision"):
        if count_exact_line(round_text, heading) != 1:
            raise ValueError(f"frozen {decision} review round is missing required disposition heading: {heading}")
    if not re.search(r"^(?:- )?Blocking Open:\s*[0-9]+\s*$", round_text, re.MULTILINE):
        raise ValueError(f"frozen {decision} review round is missing Blocking Open: {decision_id}")
    return {"sha256": sha256_text(round_text), "text": round_text}


def canonical_frozen_review_round_text(round_text: str) -> str:
    return re.sub(r"(?:\n[ \t]*)+$", "", round_text) + "\n"


def review_round_identity(round_value: dict) -> dict:
    executor_id = exact_round_field(round_value["text"], "Executor ID")
    reviewer_id = exact_round_field(round_value["text"], "Reviewer ID")
    if not valid_identifier(executor_id) or not valid_identifier(reviewer_id) or executor_id == reviewer_id:
        raise ValueError("frozen review round has missing or non-distinct executor/reviewer identity")
    return {"executor_id": executor_id, "reviewer_id": reviewer_id}


def exact_round_field(text: str, name: str) -> str | None:
    matches = re.findall(rf"^{re.escape(name)}:\s*(\S+)\s*$", text, re.MULTILINE)
    return matches[0] if len(matches) == 1 else None


def count_exact_line(text: str, line: str) -> int:
    return len(re.findall(rf"^{re.escape(line)}$", text, re.MULTILINE))


def has_reviewed_input_digest_table(text: str) -> bool:
    match = re.search(r"^Reviewed Inputs:\s*$", text, re.MULTILINE)
    if not match:
        return False
    remainder = text[match.start() :].splitlines()[1:]
    end = next((index for index, line in enumerate(remainder) if re.match(r"^(?:### |## )", line)), len(remainder))
    rows = [line for line in remainder[:end] if line.startswith("|")]
    if len(rows) < 3:
        return False
    header = markdown_table_cells(rows[0])
    divider = markdown_table_cells(rows[1])
    return (
        header == ["Path", "SHA-256", "Purpose"]
        and isinstance(divider, list)
        and len(divider) == 3
        and all(re.fullmatch(r":?-{3,}:?", cell) for cell in divider)
        and all(
            (cells := markdown_table_cells(row)) is not None
            and len(cells) == 3
            and valid_reviewed_input_path(cells[0])
            and valid_reviewed_input_digest(cells[1])
            and bool(cells[2])
            for row in rows[2:]
        )
    )


def markdown_table_cells(row: str) -> list[str] | None:
    trimmed = row.strip()
    if not trimmed.startswith("|") or not trimmed.endswith("|"):
        return None
    return [cell.strip() for cell in trimmed[1:-1].split("|")]


def markdown_code_value(value: str) -> str:
    match = re.fullmatch(r"`([^`]+)`", value.strip())
    return match.group(1) if match else value.strip()


def valid_reviewed_input_path(value: str) -> bool:
    input_path = markdown_code_value(value)
    return (
        bool(input_path)
        and "\\" not in input_path
        and not input_path.startswith("/")
        and all(part and part not in {".", ".."} for part in input_path.split("/"))
    )


def valid_reviewed_input_digest(value: str) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{64}", markdown_code_value(value)))


def normalize_lf(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def json_block_after_heading(text: str, heading: str):
    match = re.search(rf"^### {re.escape(heading)}\s*\n\s*```json\n([\s\S]*?)\n```", text, re.MULTILINE)
    if not match:
        raise ValueError(f"canonical JSON block is missing: {heading}")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise ValueError(f"canonical JSON block is unreadable: {heading}") from error
    if match.group(1) != canonical_json(value):
        raise ValueError(f"canonical JSON block is not canonical: {heading}")
    return value


def bootstrap_source_snapshot(repo_root: Path, base_commit: str, allowed_paths: list[str]) -> dict:
    changed = set(filter(None, git_stdout(repo_root, ["diff", "--name-only", "--no-renames", base_commit]).splitlines()))
    changed.update(
        path for path in git_stdout(repo_root, ["ls-files", "--others", "--exclude-standard"]).splitlines()
        if path and not is_generated_runtime_path(path)
    )
    allowed = set(allowed_paths)
    entries = []
    for rel_path in sorted(changed):
        if rel_path not in allowed:
            raise ValueError(f"source-owned diff is outside the scoped manifest: {rel_path}")
        absolute = repo_root / rel_path
        if not absolute.exists():
            entries.append({"mode": None, "path": rel_path, "presence": "absent", "sha256": None})
        else:
            entries.append({"mode": git_file_mode(repo_root, rel_path), "path": rel_path, "presence": "present", "sha256": sha256_file(absolute)})
    return {"entries": entries, "sha256": sha256_text(canonical_json(entries))}


def is_generated_runtime_path(rel_path: str) -> bool:
    return rel_path == ".changes" or bool(re.match(r"^(?:\.changes|\.agents|\.codex|\.harness|node_modules)/", rel_path))


def git_file_mode(repo_root: Path, rel_path: str) -> str:
    indexed = git_stdout(repo_root, ["ls-files", "-s", "--", rel_path])
    mode = indexed.split(maxsplit=1)[0] if indexed else ""
    if re.fullmatch(r"100[0-7]{3}", mode):
        return mode
    return "100755" if (repo_root / rel_path).stat().st_mode & 0o111 else "100644"


def git_stdout(repo_root: Path, git_args: list[str]) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), *git_args],
        capture_output=True,
        encoding="utf-8",
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"git {' '.join(git_args)} failed: {(result.stderr or result.stdout).strip()}")
    return result.stdout.strip()


def read_bootstrap_registries(repo_root: Path) -> list[dict]:
    control_root = repo_root / ".changes" / ".control"
    if not control_root.exists():
        return []
    return [
        read_bootstrap_registry(repo_root, child.name)
        for child in sorted(control_root.iterdir())
        if child.is_dir() and valid_bootstrap_id(child.name)
    ]


def read_bootstrap_registry(repo_root: Path, bootstrap_id: str) -> dict:
    directory = repo_root / ".changes" / ".control" / bootstrap_id
    authority_id = bootstrap_authority_id(bootstrap_id)
    current_path = directory / "current.json"
    result = {"bootstrap_id": authority_id, "registry_id": bootstrap_id, "directory": directory, "current": None, "event": None, "errors": []}
    if not current_path.exists():
        result["errors"].append("current.json is missing")
        return result
    try:
        current = json.loads(read_text(current_path))
    except (OSError, json.JSONDecodeError):
        result["errors"].append("current.json is unreadable")
        return result
    result["current"] = current
    if (
        not isinstance(current, dict)
        or not valid_bootstrap_event_path(current.get("event"))
        or not valid_sha256(current.get("event_sha256"))
        or not isinstance(current.get("generation"), int)
        or not valid_bootstrap_state(current.get("state"))
    ):
        result["errors"].append("current.json is malformed")
        return result
    event_path = directory / current["event"]
    if not event_path.exists() or not matches_bootstrap_event_digest(event_path, current["event_sha256"]):
        result["errors"].append("current event is missing or digest-mismatched")
        return result
    try:
        raw = read_text(event_path)
        event = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        result["errors"].append("current event is unreadable")
        return result
    result["event"] = event
    if not is_canonical_json_text(raw, event):
        result["errors"].append("current event is not canonical JSON")
    if (
        not isinstance(event, dict)
        or event.get("bootstrap_id") != authority_id
        or event.get("generation") != current["generation"]
        or event.get("state") != current["state"]
        or event.get("state_root_realpath") != str(repo_root.resolve())
        or not valid_change_id(event.get("originating_change_id"))
    ):
        result["errors"].append("current event does not bind bootstrap identity, generation, state root, and originating change")
        return result
    if event["state"] == "claimed":
        if (
            event["generation"] != 1
            or not valid_sha256(event.get("claim_spec_digest"))
            or not valid_identifier(event.get("owner"))
            or not valid_gate_ref(event.get("authority_ref"), event["originating_change_id"])
        ):
            result["errors"].append("claimed event is malformed")
    else:
        claim = read_bootstrap_event(directory, 1, "claimed")
        if (
            not claim
            or claim.get("bootstrap_id") != authority_id
            or claim.get("originating_change_id") != event["originating_change_id"]
            or claim.get("state_root_realpath") != event["state_root_realpath"]
        ):
            result["errors"].append("bootstrap lifecycle is missing a matching claimed event")
        if event["state"] == "scoped":
            claim_path = directory / "events" / "000001-claimed.json"
            if (
                event["generation"] != 2
                or not valid_sha256(event.get("authority_event_sha256"))
                or not valid_sha256(event.get("scope_manifest_sha256"))
                or not valid_sha256(event.get("predecessor_snapshot_sha256") or event.get("source_inventory_sha256"))
                or not valid_git_object_id(event.get("base_commit"))
                or not isinstance(event.get("rollback_boundary"), str)
                or not valid_gate_ref(event.get("scope_gate_ref"), event["originating_change_id"])
                or not claim
                or not matches_bootstrap_event_digest(claim_path, event.get("authority_event_sha256"))
            ):
                result["errors"].append("scoped event is malformed or not bound to its claim")
        else:
            scoped = read_bootstrap_event(directory, 2, "scoped")
            scoped_path = directory / "events" / "000002-scoped.json"
            prior_scope_hash = event.get("scope_event_sha256") or event.get("prior_event_sha256")
            if not scoped or event["generation"] != 3 or not matches_bootstrap_event_digest(scoped_path, prior_scope_hash):
                result["errors"].append("terminal event is not bound to the scoped event")
            if event["state"] == "consumed":
                if (
                    not valid_gate_ref(event.get("close_gate_ref"), event["originating_change_id"])
                    or not valid_sha256(event.get("authority_event_sha256"))
                    or not valid_sha256(event.get("implementation_snapshot_sha256"))
                    or not valid_sha256(event.get("validation_evidence_sha256"))
                    or not valid_sha256(event.get("close_evidence_sha256"))
                    or not valid_identifier(event.get("executor_id"))
                    or not valid_identifier(event.get("reviewer_id"))
                    or event.get("executor_id") == event.get("reviewer_id")
                ):
                    result["errors"].append("consumed event is malformed")
            elif not isinstance(event.get("reason"), str) or not event["reason"]:
                result["errors"].append("revoked event is missing its terminal reason")
            elif "revoke_gate_ref" in event:
                if not valid_gate_ref(event.get("revoke_gate_ref"), event["originating_change_id"], "NOT_READY"):
                    result["errors"].append("revoked event has malformed revocation evidence")
            elif not is_legacy_bootstrap_revocation(bootstrap_id, event):
                result["errors"].append("revoked event is missing revocation evidence")
    return result


def read_bootstrap_event(directory: Path, generation: int, state: str) -> dict | None:
    event_path = directory / "events" / f"{generation:06d}-{state}.json"
    if not event_path.exists():
        return None
    try:
        return json.loads(read_text(event_path))
    except (OSError, json.JSONDecodeError):
        return None



def valid_bootstrap_id(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"migration-bootstrap-v[0-9]+", value))


def bootstrap_authority_id(registry_id: str) -> str:
    return re.sub(r"^migration-bootstrap-", "migration-apply-bootstrap-", registry_id)


def is_legacy_bootstrap_revocation(registry_id: str, event: dict) -> bool:
    return (
        registry_id == "migration-bootstrap-v1"
        and event.get("state") == "revoked"
        and "scope_event_sha256" not in event
        and valid_sha256(event.get("prior_event_sha256"))
        and isinstance(event.get("replacement_bootstrap_id"), str)
        and bool(re.fullmatch(r"migration-apply-bootstrap-v[0-9]+", event["replacement_bootstrap_id"]))
    )


def bootstrap_registry_id(value: str | None) -> str | None:
    if valid_bootstrap_id(value):
        return value
    if isinstance(value, str) and re.fullmatch(r"migration-apply-bootstrap-v[0-9]+", value):
        return re.sub(r"^migration-apply-bootstrap-", "migration-bootstrap-", value)
    return None


def valid_bootstrap_event_path(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"events/\d{6}-(?:claimed|scoped|consumed|revoked)\.json", value))


def valid_bootstrap_state(value) -> bool:
    return value in {"claimed", "scoped", "consumed", "revoked"}


def valid_change_id(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value))


def valid_identifier(value) -> bool:
    return valid_change_id(value)


def valid_review_decision_id(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*-r[0-9]{2}", value))


def valid_sha256(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[a-f0-9]{64}", value))


def valid_git_object_id(value) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"(?:[a-f0-9]{40}|[a-f0-9]{64})", value))


def valid_gate_ref(value, change_id: str, decision: str = "READY") -> bool:
    return (
        isinstance(value, dict)
        and value.get("change_id") == change_id
        and value.get("artifact_path") == "review-log.md"
        and value.get("decision") == decision
        and valid_identifier(value.get("decision_id"))
        and valid_sha256(value.get("artifact_sha256"))
    )


def has_frozen_ready_review_round(text: str, decision_id: str) -> bool:
    headers = list(re.finditer(r"^## Review Round\b[^\n]*$", text, re.MULTILINE))
    for index, header in enumerate(headers):
        round_text = text[header.start() : headers[index + 1].start() if index + 1 < len(headers) else len(text)]
        if (
            re.search(rf"^Decision ID:\s*{re.escape(decision_id)}\s*$", round_text, re.MULTILINE)
            and re.search(r"^Decision:\s*READY\s*$", round_text, re.MULTILINE)
            and re.search(r"^Frozen:\s*yes\s*$", round_text, re.MULTILINE)
        ):
            return True
    return False


def build_migration_plan(repo_root: Path, task: str) -> dict:
    target = change_dir(repo_root, task)
    legacy_sources = migration_legacy_sources(target, task)
    if not legacy_sources:
        raise ValueError("migration requires at least one top-level legacy review-log.md, timeline.md, or tasks.md")
    if not (target / "proposal.md").exists():
        raise ValueError("migration currently requires a legacy proposal workspace with proposal.md")

    outputs = build_migration_outputs(target, task, legacy_sources)
    base = {
        "version": 1,
        "mode": "dry-run",
        "change_id": task,
        "state_root": str(repo_root.resolve()),
        "source_inventory": migration_source_inventory(target),
        "legacy_sources": legacy_sources,
        "destination_manifest": destination_manifest(outputs),
        "proposals": [
            {
                "source": item["path"],
                "archive_path": item["archive_path"],
                "target_directory": item["target_directory"],
                "exact_bytes_preserved": True,
                "apply_supported": True,
            }
            for item in legacy_sources
        ],
        "diagnostics": [
            "apply creates only the structured skeleton and immutable migration provenance; it does not invent review rounds, task slices, or implementation-design content"
        ],
    }
    return {**base, "plan_sha256": sha256_text(canonical_json(base))}


def migration_legacy_sources(target: Path, task: str) -> list[dict]:
    sources = []
    for rel_path, target_directory in [
        ("review-log.md", "reviews"),
        ("timeline.md", "timeline"),
        ("tasks.md", "tasks"),
    ]:
        source_path = target / rel_path
        if not source_path.exists():
            continue
        bytes_value = source_path.read_bytes()
        source = {
            "path": rel_path,
            "sha256": sha256_bytes(bytes_value),
            "archive_path": f".changes/archive/{task}/legacy/{rel_path}",
            "target_directory": target_directory,
        }
        if rel_path == "review-log.md":
            source["frozen_review_rounds"] = extract_frozen_review_rounds(bytes_value.decode("utf-8"))
        sources.append(source)
    return sources


def migration_source_inventory(target: Path) -> list[dict]:
    return [
        {
            "path": path.relative_to(target).as_posix(),
            "sha256": sha256_bytes(path.read_bytes()),
        }
        for path in sorted(candidate for candidate in target.rglob("*") if candidate.is_file())
    ]


def build_migration_outputs(target: Path, task: str, legacy_sources: list[dict]) -> dict[str, bytes]:
    outputs: dict[str, bytes] = {}

    def read_existing(rel_path: str) -> str:
        source_path = target / rel_path
        return read_text(source_path) if source_path.exists() else ""

    def write_output(rel_path: str, text: str) -> None:
        outputs[rel_path] = text.encode("utf-8")

    readme = ensure_task_tag_registry(
        ensure_front_matter(
            read_existing("README.md") or "# Change\n",
            "change-index",
            ["workflow", "migration"],
            "Structured change workspace migrated from legacy artifacts.",
        )
    )
    write_output("README.md", ensure_migration_status(readme, task))

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
            write_output(rel_path, ensure_front_matter(existing, artifact_name, tags, f"Migrated {artifact_name} artifact."))

    write_output(
        "specs/README.md",
        ensure_front_matter(
            read_existing("specs/README.md") or "# Specs\n",
            "specs-index",
            ["workflow", "migration"],
            "Structured specification index.",
        ),
    )
    specs_root = target / "specs"
    if specs_root.exists():
        for spec_path in sorted(candidate for candidate in specs_root.rglob("*.md") if candidate.is_file()):
            rel_path = spec_path.relative_to(target).as_posix()
            if rel_path == "specs/README.md":
                continue
            write_output(rel_path, ensure_structured_spec(read_existing(rel_path), rel_path))

    provenance_path = "decisions/DR-001-migration-provenance.md"
    write_output(
        "decisions/README.md",
        migration_child_index(
            "decisions",
            [["DR-001-migration-provenance.md", "decision-record", "frozen", "001", "Archived legacy artifact provenance."]],
        ),
    )
    write_output(provenance_path, migration_provenance(task, legacy_sources))
    write_output("reviews/README.md", migration_child_index("reviews", []))
    write_output("tasks/README.md", migration_child_index("tasks", []))
    return outputs


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
        "- Workspace mode: `structured`, established by the controlled migration transaction.\n"
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
    rows = "\n".join(
        f"| `{item['path']}` | `{item['archive_path']}` | `{item['sha256']}` |" for item in legacy_sources
    )
    frozen_rows = "\n".join(
        f"| `{item['path']}` | `{round['decision_id']}` | `{round['sha256']}` |"
        for item in legacy_sources
        for round in item.get("frozen_review_rounds", [])
    )
    return (
        front_matter("decision-record", "frozen", ["decision", "migration"], "Archived legacy artifact provenance.")
        + f"# Migration Provenance\n\n## Context\n\nThe legacy workspace was converted through the controlled migration command. Historical review, timeline, and task material remains authoritative only through the exact archived bytes below.\n\n## Decision\n\n- Change ID: `{task}`\n- Archive root: `.changes/archive/{task}/legacy/`\n- Current structured indexes do not reinterpret archived review decisions.\n\n## Archived Legacy Evidence\n\n| Source | Archive Path | SHA-256 |\n|---|---|---|\n{rows}\n\n## Archived Frozen Review Rounds\n\n| Source | Decision ID | SHA-256 |\n|---|---|---|\n{frozen_rows}\n\n## Alternatives Considered\n\n- Reconstructing legacy review rounds as new structured review documents was rejected because it could change historical meaning.\n\n## Consequences\n\n- Historical references resolve to the same-change archive path and recorded digest.\n- New review work must use the structured review directory and its index.\n"
    )


def extract_frozen_review_rounds(text: str) -> list[dict]:
    normalized = normalize_lf(text)
    headers = list(re.finditer(r"^## Review Round\b[^\n]*$", normalized, re.MULTILINE))
    seen = set()
    rounds = []
    for index, header in enumerate(headers):
        round_text = canonical_frozen_review_round_text(
            normalized[header.start() : headers[index + 1].start() if index + 1 < len(headers) else len(normalized)]
        )
        if not re.search(r"^Frozen:\s*yes\s*$", round_text, re.MULTILINE):
            continue
        decision_match = re.search(r"^Decision ID:\s*(\S[^\n]*?)\s*$", round_text, re.MULTILINE)
        decision = decision_match.group(1).strip() if decision_match else None
        if not decision or decision in seen:
            raise ValueError(f"frozen review round requires a unique Decision ID: {header.group(0)}")
        seen.add(decision)
        rounds.append({"decision_id": decision, "sha256": sha256_text(round_text)})
    return rounds


def destination_manifest(outputs: dict[str, bytes]) -> list[dict]:
    return [
        {"path": rel_path, "sha256": sha256_bytes(bytes_value)}
        for rel_path, bytes_value in sorted(outputs.items())
    ]


def apply_migration_plan(repo_root: Path, task: str, plan: dict) -> dict:
    assert_migration_plan(repo_root, task, plan)
    transaction_dir = migration_transaction_dir(repo_root, task)
    current = read_migration_transaction(transaction_dir)
    if current and current.get("state") == "committed":
        if current.get("plan_sha256") != plan["plan_sha256"]:
            raise ValueError("committed migration has a different plan digest; rerun --dry-run only after resolving the archived transaction")
        verify_committed_migration(repo_root, task, current)
        return {**plan, "mode": "applied", "transaction_state": "committed", "idempotent": True}
    if current and current.get("state") not in {"prepared", "applying", "interrupted", "rolled-back"}:
        raise ValueError(f"migration transaction has invalid state: {current.get('state')}")
    lock_path = acquire_migration_lock(transaction_dir)
    transaction = current
    try:
        if current and current.get("state") != "rolled-back" and current.get("plan_sha256") and current["plan_sha256"] != plan["plan_sha256"]:
            transaction = rollback_interrupted_migration(repo_root, task, current)
            raise ValueError("interrupted migration plan digest differs from the accepted plan; the prior partial workspace was rolled back, rerun --dry-run before applying")
        target = change_dir(repo_root, task)
        outputs = build_migration_outputs(target, task, plan["legacy_sources"])
        if canonical_json(destination_manifest(outputs)) != canonical_json(plan["destination_manifest"]):
            raise ValueError("migration destination manifest changed after dry-run; no files were written")
        if (
            canonical_json(migration_source_inventory(target)) != canonical_json(plan["source_inventory"])
            and not migration_resume_allowed(repo_root, task, target, plan)
        ):
            if current and current.get("state") in {"prepared", "applying", "interrupted"}:
                transaction = rollback_interrupted_migration(repo_root, task, current)
                raise ValueError("migration source inventory changed after dry-run; the prior partial workspace was rolled back, rerun --dry-run before applying")
            raise ValueError("migration source inventory changed after dry-run; no files were written")
        staged_root = transaction_dir / "staging" / plan["plan_sha256"]
        resuming = bool(current and current.get("state") in {"prepared", "applying", "interrupted"})
        if not resuming:
            shutil.rmtree(staged_root, ignore_errors=True)
        stage_migration(staged_root, outputs, target, repo_root, task, plan["legacy_sources"], plan["source_inventory"], not resuming)

        transaction = {
            "version": 1,
            "change_id": task,
            "state_root": plan["state_root"],
            "state": "prepared",
            "plan_sha256": plan["plan_sha256"],
            "source_inventory": plan["source_inventory"],
            "legacy_sources": plan["legacy_sources"],
            "destination_manifest": plan["destination_manifest"],
            "provenance_path": "decisions/DR-001-migration-provenance.md",
            "plan": plan,
        }
        write_migration_transaction(transaction_dir, transaction)
        transaction = {**transaction, "state": "applying"}
        write_migration_transaction(transaction_dir, transaction)

        install_migration(staged_root, target, repo_root, task, plan, outputs)
        transaction = {**transaction, "state": "committed"}
        write_migration_transaction(transaction_dir, transaction)
        shutil.rmtree(staged_root, ignore_errors=True)
        return {**plan, "mode": "applied", "transaction_state": "committed", "idempotent": False}
    except (OSError, ValueError) as error:
        if transaction and transaction.get("state") != "rolled-back":
            write_migration_transaction(transaction_dir, {**transaction, "state": "interrupted", "error": str(error)})
        raise
    finally:
        release_migration_lock(lock_path)


def assert_migration_plan(repo_root: Path, task: str, plan: dict) -> None:
    if not isinstance(plan, dict) or plan.get("change_id") != task or plan.get("state_root") != str(repo_root.resolve()):
        raise ValueError("migration plan does not bind the selected change and canonical state root")
    unsigned_plan = {key: value for key, value in plan.items() if key != "plan_sha256"}
    plan_hash = plan.get("plan_sha256")
    if not isinstance(plan_hash, str) or not re.match(r"^[a-f0-9]{64}$", plan_hash) or sha256_text(canonical_json(unsigned_plan)) != plan_hash:
        raise ValueError("migration plan digest is malformed or does not bind its contents")
    if not all(isinstance(plan.get(key), list) for key in ("source_inventory", "destination_manifest", "legacy_sources")):
        raise ValueError("migration plan is missing required inventory, destination, or legacy source entries")
    assert_unique_plan_paths(plan["source_inventory"], "source inventory")
    assert_unique_plan_paths(plan["destination_manifest"], "destination manifest")
    expected_legacy = {
        "review-log.md": "reviews",
        "timeline.md": "timeline",
        "tasks.md": "tasks",
    }
    for source in plan["legacy_sources"]:
        if (
            not isinstance(source, dict)
            or source.get("path") not in expected_legacy
            or source.get("target_directory") != expected_legacy[source["path"]]
            or source.get("archive_path") != f".changes/archive/{task}/legacy/{source['path']}"
            or not isinstance(source.get("sha256"), str)
            or not re.match(r"^[a-f0-9]{64}$", source["sha256"])
        ):
            raise ValueError("migration plan has an invalid legacy source entry")
        if source["path"] == "review-log.md":
            assert_frozen_review_rounds(source.get("frozen_review_rounds"))
        elif "frozen_review_rounds" in source:
            raise ValueError("migration plan has unexpected frozen review round evidence")


def assert_frozen_review_rounds(rounds) -> None:
    if not isinstance(rounds, list):
        raise ValueError("migration plan is missing frozen review round evidence")
    seen = set()
    for round_info in rounds:
        if (
            not isinstance(round_info, dict)
            or not isinstance(round_info.get("decision_id"), str)
            or not round_info["decision_id"]
            or not isinstance(round_info.get("sha256"), str)
            or not re.match(r"^[a-f0-9]{64}$", round_info["sha256"])
            or round_info["decision_id"] in seen
        ):
            raise ValueError("migration plan has invalid frozen review round evidence")
        seen.add(round_info["decision_id"])


def assert_unique_plan_paths(entries: list, label: str) -> None:
    paths = set()
    for entry in entries:
        if (
            not isinstance(entry, dict)
            or not safe_migration_path(entry.get("path"))
            or not isinstance(entry.get("sha256"), str)
            or not re.match(r"^[a-f0-9]{64}$", entry["sha256"])
            or entry["path"] in paths
        ):
            raise ValueError(f"migration plan has an invalid {label} entry")
        paths.add(entry["path"])


def safe_migration_path(value) -> bool:
    return isinstance(value, str) and bool(value) and "\\" not in value and not Path(value).is_absolute() and all(part not in {"", ".", ".."} for part in value.split("/"))


def migration_transaction_dir(repo_root: Path, task: str) -> Path:
    return repo_root / ".changes" / ".control" / "migrations" / task


def read_migration_transaction(transaction_dir: Path) -> dict | None:
    current_path = transaction_dir / "current.json"
    if not current_path.exists():
        return None
    try:
        return json.loads(read_text(current_path))
    except json.JSONDecodeError as error:
        raise ValueError(f"migration transaction is unreadable: {current_path}") from error


def write_migration_transaction(transaction_dir: Path, transaction: dict) -> None:
    write_atomic(transaction_dir / "current.json", json.dumps(canonical_value(transaction), ensure_ascii=False, indent=2) + "\n", durable=True)


def acquire_migration_lock(transaction_dir: Path) -> dict:
    transaction_dir.mkdir(parents=True, exist_ok=True)
    lock_path = transaction_dir / "migration.lock"
    recovery_path = transaction_dir / "migration.lock.recovery"
    for _attempt in range(4):
        recovery = read_migration_lock(recovery_path)
        if recovery:
            status = "unrecovered after its owner exited" if stale_migration_lock(recovery) else "already in progress"
            raise ValueError(f"migration stale-lock recovery is {status}: {recovery_path}")
        token = secrets.token_hex(16)
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(descriptor, migration_lock_text(os.getpid(), token).encode("utf-8"))
            os.fsync(descriptor)
            lock = {"descriptor": descriptor, "path": lock_path, "pid": os.getpid(), "token": token}
            if not recovery_path.exists():
                return lock
            release_migration_lock(lock)
            continue
        except FileExistsError:
            observed = read_migration_lock(lock_path)
            if not observed or not stale_migration_lock(observed):
                raise ValueError(f"migration transaction is already locked: {lock_path}")
            if not reclaim_stale_migration_lock(lock_path, recovery_path, observed):
                continue
    raise ValueError(f"migration transaction lock changed during stale-lock recovery: {lock_path}")


def migration_lock_text(pid: int, token: str) -> str:
    return f"{pid} {token}\n"


def read_migration_lock(lock_path: Path) -> dict | None:
    try:
        raw = read_text(lock_path)
    except OSError:
        return None
    match = re.fullmatch(r"(\d+) ([a-f0-9]{32})\n", raw)
    if not match:
        return None
    return {"pid": int(match.group(1)), "raw": raw, "token": match.group(2)}


def stale_migration_lock(lock: dict | None) -> bool:
    if not lock or not isinstance(lock.get("pid"), int) or lock["pid"] <= 0:
        return False
    try:
        os.kill(lock["pid"], 0)
        return False
    except ProcessLookupError:
        return True
    except PermissionError:
        return False


def reclaim_stale_migration_lock(lock_path: Path, recovery_path: Path, observed: dict) -> bool:
    recovery_token = secrets.token_hex(16)
    try:
        descriptor = os.open(recovery_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.write(descriptor, migration_lock_text(os.getpid(), recovery_token).encode("utf-8"))
        os.fsync(descriptor)
    except FileExistsError:
        return False
    try:
        # A guard keeps claimants out while the stale lock is being removed.
        current = read_migration_lock(lock_path)
        if not same_migration_lock(current, observed) or not stale_migration_lock(current):
            return False
        lock_path.unlink()
        return True
    finally:
        os.close(descriptor)
        if same_migration_lock(read_migration_lock(recovery_path), {"pid": os.getpid(), "token": recovery_token}):
            recovery_path.unlink()


def same_migration_lock(left: dict | None, right: dict | None) -> bool:
    return bool(left and right and left.get("pid") == right.get("pid") and left.get("token") == right.get("token"))


def release_migration_lock(lock: dict | None) -> None:
    if not lock:
        return
    os.close(lock["descriptor"])
    if same_migration_lock(read_migration_lock(lock["path"]), lock):
        lock["path"].unlink()


def migration_resume_allowed(repo_root: Path, task: str, target: Path, plan: dict) -> bool:
    source_hashes = {entry["path"]: entry["sha256"] for entry in plan["source_inventory"]}
    destination_hashes = {entry["path"]: entry["sha256"] for entry in plan["destination_manifest"]}
    legacy_paths = {entry["path"] for entry in plan["legacy_sources"]}
    legacy_paths = {entry["path"] for entry in plan["legacy_sources"]}
    for rel_path, source_hash in source_hashes.items():
        source_path = target / rel_path
        if source_path.exists():
            actual = sha256_bytes(source_path.read_bytes())
            if actual == source_hash or actual == destination_hashes.get(rel_path):
                continue
            return False
        if rel_path not in legacy_paths:
            return False
        source = next(item for item in plan["legacy_sources"] if item["path"] == rel_path)
        archive_path = repo_root / source["archive_path"]
        if not archive_path.exists() or sha256_bytes(archive_path.read_bytes()) != source["sha256"]:
            return False
    for rel_path, destination_hash in destination_hashes.items():
        destination_path = target / rel_path
        if not destination_path.exists():
            continue
        actual = sha256_bytes(destination_path.read_bytes())
        if actual != destination_hash and actual != source_hashes.get(rel_path):
            return False
    return True


def stage_migration(
    staged_root: Path,
    outputs: dict[str, bytes],
    target: Path,
    repo_root: Path,
    task: str,
    legacy_sources: list[dict],
    source_inventory: list[dict],
    snapshot_sources: bool,
) -> None:
    if snapshot_sources:
        for source in source_inventory:
            source_path = target / source["path"]
            if not source_path.exists():
                raise ValueError(f"migration source is missing before staging: {source['path']}")
            bytes_value = source_path.read_bytes()
            if sha256_bytes(bytes_value) != source["sha256"]:
                raise ValueError(f"migration source changed before staging: {source['path']}")
            write_atomic(staged_root / "source" / source["path"], bytes_value)
    for rel_path, bytes_value in outputs.items():
        write_atomic(staged_root / "workspace" / rel_path, bytes_value)
    for source in legacy_sources:
        source_path = target / source["path"]
        archive_path = repo_root / ".changes" / "archive" / task / "legacy" / source["path"]
        if source_path.exists():
            bytes_value = source_path.read_bytes()
        elif archive_path.exists():
            bytes_value = archive_path.read_bytes()
        else:
            bytes_value = None
        if bytes_value is None or sha256_bytes(bytes_value) != source["sha256"]:
            raise ValueError(f"legacy source is missing or changed before staging: {source['path']}")
        write_atomic(staged_root / "archive" / source["path"], bytes_value)


def install_migration(staged_root: Path, target: Path, repo_root: Path, task: str, plan: dict, outputs: dict[str, bytes]) -> None:
    source_hashes = {entry["path"]: entry["sha256"] for entry in plan["source_inventory"]}
    for rel_path in outputs:
        install_expected_file(target / rel_path, (staged_root / "workspace" / rel_path).read_bytes(), source_hashes.get(rel_path))
    for source in plan["legacy_sources"]:
        install_expected_file(
            repo_root / source["archive_path"],
            (staged_root / "archive" / source["path"]).read_bytes(),
            None,
        )
    for source in plan["legacy_sources"]:
        source_path = target / source["path"]
        if not source_path.exists():
            continue
        if sha256_bytes(source_path.read_bytes()) != source["sha256"]:
            raise ValueError(f"legacy source changed before removal: {source['path']}")
        source_path.unlink()


def rollback_interrupted_migration(repo_root: Path, task: str, transaction: dict) -> dict:
    plan = transaction.get("plan") if isinstance(transaction, dict) else None
    assert_migration_plan(repo_root, task, plan)
    target = change_dir(repo_root, task)
    staged_root = migration_transaction_dir(repo_root, task) / "staging" / plan["plan_sha256"]
    source_hashes = {entry["path"]: entry["sha256"] for entry in plan["source_inventory"]}
    destination_hashes = {entry["path"]: entry["sha256"] for entry in plan["destination_manifest"]}
    legacy_paths = {entry["path"] for entry in plan["legacy_sources"]}
    snapshots = {}

    for source in plan["source_inventory"]:
        snapshot_path = staged_root / "source" / source["path"]
        if not snapshot_path.exists():
            raise ValueError(f"cannot safely roll back interrupted migration: source snapshot is missing for {source['path']}")
        bytes_value = snapshot_path.read_bytes()
        if sha256_bytes(bytes_value) != source["sha256"]:
            raise ValueError(f"cannot safely roll back interrupted migration: source snapshot digest mismatches for {source['path']}")
        snapshots[source["path"]] = bytes_value

    for rel_path, source_hash in source_hashes.items():
        current_path = target / rel_path
        if not current_path.exists():
            if rel_path not in legacy_paths:
                raise ValueError(f"cannot safely roll back interrupted migration: source file is missing {rel_path}")
            continue
        current_hash = sha256_bytes(current_path.read_bytes())
        if current_hash != source_hash and current_hash != destination_hashes.get(rel_path):
            raise ValueError(f"cannot safely roll back interrupted migration: changed file {rel_path}")
    for rel_path, destination_hash in destination_hashes.items():
        if rel_path in source_hashes:
            continue
        current_path = target / rel_path
        if current_path.exists() and sha256_bytes(current_path.read_bytes()) != destination_hash:
            raise ValueError(f"cannot safely roll back interrupted migration: changed generated file {rel_path}")

    for rel_path, bytes_value in snapshots.items():
        write_atomic(target / rel_path, bytes_value)
    for rel_path in destination_hashes:
        if rel_path not in source_hashes:
            (target / rel_path).unlink(missing_ok=True)
    rolled_back = {
        **transaction,
        "state": "rolled-back",
        "rollback_reason": "accepted migration plan or source inventory no longer matched the interrupted transaction",
    }
    write_migration_transaction(migration_transaction_dir(repo_root, task), rolled_back)
    return rolled_back


def abandon_interrupted_migration(repo_root: Path, task: str, transaction: dict) -> dict:
    lock_path = acquire_migration_lock(migration_transaction_dir(repo_root, task))
    try:
        return rollback_interrupted_migration(repo_root, task, transaction)
    finally:
        release_migration_lock(lock_path)


def install_expected_file(path: Path, bytes_value: bytes, source_hash: str | None) -> None:
    if not path.exists():
        write_atomic(path, bytes_value)
        return
    current = path.read_bytes()
    if sha256_bytes(current) == sha256_bytes(bytes_value):
        return
    if source_hash and sha256_bytes(current) == source_hash:
        write_atomic(path, bytes_value)
        return
    raise ValueError(f"refusing to overwrite changed migration destination: {path}")


def verify_committed_migration(repo_root: Path, task: str, transaction: dict) -> None:
    committed_plan = transaction.get("plan")
    if (
        transaction.get("change_id") != task
        or transaction.get("state") != "committed"
        or transaction.get("state_root") != str(repo_root.resolve())
        or not isinstance(committed_plan, dict)
        or transaction.get("plan_sha256") != committed_plan.get("plan_sha256")
    ):
        raise ValueError("committed migration transaction does not match the selected change")
    assert_migration_plan(repo_root, task, committed_plan)
    if (
        canonical_json(transaction.get("source_inventory")) != canonical_json(committed_plan.get("source_inventory"))
        or canonical_json(transaction.get("destination_manifest")) != canonical_json(committed_plan.get("destination_manifest"))
        or canonical_json(transaction.get("legacy_sources")) != canonical_json(committed_plan.get("legacy_sources"))
        or transaction.get("provenance_path") != "decisions/DR-001-migration-provenance.md"
    ):
        raise ValueError("committed migration fields do not match the accepted plan")
    destination_manifest = committed_plan["destination_manifest"]
    destinations = {}
    for destination in destination_manifest:
        if (
            not isinstance(destination, dict)
            or not safe_migration_path(destination.get("path"))
            or not isinstance(destination.get("sha256"), str)
            or not re.match(r"^[a-f0-9]{64}$", destination["sha256"])
        ):
            raise ValueError("committed migration destination manifest is invalid")
        destinations[destination["path"]] = destination["sha256"]
    for required in ("README.md", "specs/README.md", "decisions/README.md", "reviews/README.md", "tasks/README.md"):
        if not (change_dir(repo_root, task) / required).exists():
            raise ValueError(f"committed migration structured artifact is missing: {required}")
    provenance_path = transaction["provenance_path"]
    provenance_hash = destinations.get(provenance_path)
    provenance = change_dir(repo_root, task) / provenance_path
    if not provenance_hash or not provenance.exists() or sha256_bytes(provenance.read_bytes()) != provenance_hash:
        raise ValueError("committed migration provenance is missing or changed")
    for source in committed_plan["legacy_sources"]:
        archive_path = repo_root / source["archive_path"]
        if not archive_path.exists() or sha256_bytes(archive_path.read_bytes()) != source["sha256"]:
            raise ValueError(f"committed migration archive is missing or changed: {source['archive_path']}")
        verify_archived_frozen_review_rounds(source, archive_path.read_text(encoding="utf-8"))


def verify_archived_frozen_review_rounds(source: dict, text: str) -> None:
    if source.get("path") != "review-log.md":
        return
    if canonical_json(extract_frozen_review_rounds(text)) != canonical_json(source.get("frozen_review_rounds")):
        raise ValueError("committed migration frozen review round evidence is missing or changed")


def write_atomic(path: Path, value: str | bytes, durable: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp-{os.getpid()}")
    mode = "wb" if isinstance(value, bytes) else "w"
    kwargs = {} if isinstance(value, bytes) else {"encoding": "utf-8"}
    with temporary.open(mode, **kwargs) as handle:
        handle.write(value)
        handle.flush()
        if durable:
            os.fsync(handle.fileno())
    temporary.replace(path)


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def sha256_canonical_json_file(path: Path) -> str:
    raw = read_text(path)
    value = json.loads(raw)
    if not is_canonical_json_text(raw, value):
        raise ValueError(f"bootstrap control event is not canonical JSON: {path}")
    return sha256_text(canonical_json(value))


def matches_bootstrap_event_digest(path: Path, expected) -> bool:
    if not valid_sha256(expected):
        return False
    try:
        return expected in {sha256_file(path), sha256_canonical_json_file(path)}
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_json(value) -> str:
    return json.dumps(canonical_value(value), ensure_ascii=False, separators=(",", ":"))


def is_canonical_json_text(raw: str, value) -> bool:
    canonical = canonical_json(value)
    return raw == canonical or raw == f"{canonical}\n"


def canonical_value(value):
    if isinstance(value, dict):
        return {key: canonical_value(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical_value(item) for item in value]
    return value


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
    migrate_parser.add_argument("--expected-plan-sha256")
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
