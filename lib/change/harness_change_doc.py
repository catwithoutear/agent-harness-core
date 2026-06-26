#!/usr/bin/env python3
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import policy


FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


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


def ensure_change_exists(root: Path, task: str):
    target = change_dir(root, task)
    if not target.exists():
        print(f"ERROR: change not found: {target}", file=sys.stderr)
        return None
    return target


def command_policy(args) -> int:
    print(json.dumps(policy.projection_policy(), ensure_ascii=False, indent=2))
    return 0


def command_index(args) -> int:
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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
        sections=["## Objective", "## Scope", "## Steps", "- [ ] ", "## Validation", "- [ ] "],
    )


def add_child_document(args, directory: str, artifact: str, filename_builder, order_builder, title: str, sections):
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
    target = change_dir(root, args.task)
    if not target.exists():
        print(f"ERROR: change not found: {target}", file=sys.stderr)
        return 2

    sources = []
    proposals = []
    for rel_path, target_dir in [
        ("review-log.md", "reviews"),
        ("timeline.md", "timeline"),
        ("tasks.md", "tasks"),
    ]:
        path = target / rel_path
        if path.exists():
            sources.append(rel_path)
            proposals.append(
                {
                    "source": rel_path,
                    "target_directory": target_dir,
                    "requires_agent_read": True,
                    "apply_supported": False,
                }
            )

    plan = {
        "change_id": args.task,
        "mode": "dry-run" if args.dry_run else "plan-only",
        "sources": sources,
        "proposals": proposals,
        "diagnostics": [
            "automatic splitting is intentionally conservative; read source artifacts before applying migration"
        ],
    }
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    return 0


def command_memory_index(args) -> int:
    root = Path(args.repo_root).resolve()
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
    root = Path(args.repo_root).resolve()
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


def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    subparsers = parser.add_subparsers(dest="command", required=True)

    policy_parser = subparsers.add_parser("policy")
    policy_parser.add_argument("--json", action="store_true", required=True)
    policy_parser.set_defaults(func=command_policy)

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

    terminology_parser = subparsers.add_parser("add-terminology")
    terminology_parser.add_argument("task")
    terminology_parser.add_argument("--status", default="draft")
    terminology_parser.add_argument("--tags", default="terminology")
    terminology_parser.add_argument("--description")
    terminology_parser.add_argument("--force", action="store_true")
    terminology_parser.set_defaults(func=command_add_terminology)

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
    migrate_parser.add_argument("--dry-run", action="store_true", required=True)
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
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
