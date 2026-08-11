#!/usr/bin/env python3
import argparse
import fnmatch
import hashlib
import json
import re
import sys
from pathlib import Path

import execution_map
import policy
import root_resolution


FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
PACKAGE_ROOT = Path(__file__).resolve().parents[2]
LEGACY_TOP_LEVEL_CHANGE_FILES = {
    "review-log.md": "reviews/",
    "timeline.md": "timeline/",
}
REVIEW_RELATIVE_PATH_RE = re.compile(r"^(?![A-Za-z]:[\\/])(?![\\/])(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_scalar(value: str):
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        body = value[1:-1].strip()
        if not body:
            return []
        return [item.strip().strip('"').strip("'") for item in body.split(",")]
    return value.strip('"').strip("'")


def parse_front_matter(path: Path):
    if not path.exists() or path.suffix != ".md":
        return None
    match = FRONT_MATTER_RE.match(read_text(path))
    if not match:
        return None
    data = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = parse_scalar(value)
    return data


def split_table_row(line: str):
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip().strip("`") for cell in stripped.split("|")]


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


def markdown_table_after_heading(text: str, heading: str):
    table_lines = markdown_table_lines_after_heading(text, heading)
    return parse_markdown_table(table_lines)


def markdown_table_lines_after_heading(text: str, heading: str):
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
            return table_lines
    return []


def parse_tag_registry(path: Path, heading: str):
    if not path.exists():
        return []
    return [
        row
        for row in markdown_table_after_heading(read_text(path), heading)
        if row.get("tag")
    ]


def list_active_changes(changes_dir: Path, ignored_names):
    if not changes_dir.exists():
        return []
    return sorted(
        child
        for child in changes_dir.iterdir()
        if child.is_dir() and child.name not in ignored_names
    )


def matches_pattern(path_str: str, pattern: str) -> bool:
    if fnmatch.fnmatch(path_str, pattern):
        return True

    if "/**/" in pattern:
        shallow_pattern = pattern.replace("/**/", "/")
        return fnmatch.fnmatch(path_str, shallow_pattern)

    return False


def matches_any(path_str: str, patterns):
    return any(matches_pattern(path_str, pattern) for pattern in patterns)


def append_missing_file(change_dir: Path, rel_path: str, errors: list):
    errors.append(f"{change_dir / rel_path}: missing required file")


def detect_mode(change_dir: Path) -> str:
    has_plan = (change_dir / "plan.md").exists()
    has_proposal = (change_dir / "proposal.md").exists()
    has_specs = (change_dir / "specs").exists()
    has_task_registry = bool(markdown_table_after_heading(read_text(change_dir / "README.md"), "Task Tag Registry")) if (change_dir / "README.md").exists() else False
    structured_markers = [
        change_dir / "specs" / "README.md",
        change_dir / "implementation-design" / "README.md",
    ]

    if has_task_registry and any(path.exists() for path in structured_markers):
        return "structured_proposal"
    if has_plan and not has_proposal and not has_specs:
        return "plan_only"
    return "legacy_proposal"



def validate_headings(path: Path, headings, errors: list):
    text = read_text(path)
    for heading in headings:
        if heading not in text:
            errors.append(f"{path}: missing heading {heading}")


def validate_proposal(change_dir: Path, schema: dict, errors: list):
    proposal = change_dir / "proposal.md"
    if not proposal.exists():
        errors.append(f"{proposal}: missing required file")
        return

    validate_headings(proposal, schema["proposal"]["required_headings"], errors)


def validate_plan(change_dir: Path, schema: dict, errors: list):
    plan = change_dir / "plan.md"
    if not plan.exists():
        errors.append(f"{plan}: missing required file")
        return

    validate_headings(plan, schema.get("plan", {}).get("required_headings", []), errors)


def validate_tasks(change_dir: Path, schema: dict, errors: list):
    tasks = change_dir / "tasks.md"
    tasks_index = change_dir / "tasks" / "README.md"
    if not tasks.exists():
        if tasks_index.exists():
            return
        errors.append(f"{tasks}: missing required file; provide tasks.md or tasks/README.md")
        return

    text = read_text(tasks)
    lines = text.splitlines()

    for heading in schema["tasks"]["required_headings"]:
        if heading not in text:
            errors.append(f"{tasks}: missing heading {heading}")

    checkbox_re = re.compile(schema["tasks"]["checkbox_pattern"])
    saw_checkbox = False
    for line in lines:
        if line.startswith("- ["):
            saw_checkbox = True
            if not checkbox_re.match(line):
                errors.append(f"{tasks}: invalid checkbox line: {line}")

    if schema["tasks"]["require_checkbox_items"] and not saw_checkbox:
        errors.append(f"{tasks}: no checkbox items found")


def validate_delta_spec_file(path: Path, schema: dict, errors: list, require_contract_headings=False):
    lines = read_text(path).splitlines()

    allowed_sections = set(schema["delta_spec"]["allowed_sections"])
    requirement_re = re.compile(schema["delta_spec"]["requirement_heading_pattern"])
    scenario_re = re.compile(schema["delta_spec"]["scenario_heading_pattern"])

    if require_contract_headings:
        validate_headings(path, schema["delta_spec"].get("required_headings", []), errors)

    current_requirement = None
    scenario_count = 0

    for line in lines:
        if line.startswith("## ") and "Requirements" in line:
            if line not in allowed_sections:
                errors.append(f"{path}: invalid section heading {line}")

        if requirement_re.match(line):
            if current_requirement is not None and scenario_count == 0:
                errors.append(f"{path}: requirement without scenario: {current_requirement}")
            current_requirement = line
            scenario_count = 0
            continue

        if scenario_re.match(line):
            scenario_count += 1

    if current_requirement is not None and scenario_count == 0:
        errors.append(f"{path}: requirement without scenario: {current_requirement}")


def validate_specs(change_dir: Path, schema: dict, errors: list, warns: list, mode: str):
    spec_root = change_dir / "specs"
    if not spec_root.exists():
        warns.append(f"{change_dir}: no specs/ directory")
        return

    ignored_files = set(schema["delta_spec"].get("ignored_files", []))
    if not ignored_files:
        ignored_files = {"README.md", "capability-template.md"}

    module_name_warning_re = None
    if schema["delta_spec"].get("module_name_warning_pattern"):
        module_name_warning_re = re.compile(schema["delta_spec"]["module_name_warning_pattern"])

    matched = []
    for path in spec_root.rglob("*.md"):
        if path.name in ignored_files:
            continue
        rel_path = path.relative_to(change_dir).as_posix()
        if matches_any(rel_path, [schema["delta_spec"]["file_glob"]]):
            matched.append(path)

    for path in matched:
        if mode == "structured_proposal" and module_name_warning_re is not None:
            if module_name_warning_re.match(path.name):
                warns.append(f"{path}: spec filename appears module-based")
        validate_delta_spec_file(
            path,
            schema,
            errors,
            require_contract_headings=(mode == "structured_proposal"),
        )


def validate_design(change_dir: Path, schema: dict, warns: list):
    design = change_dir / "design.md"
    if not design.exists() and schema["validation"].get("warn_on_missing_design", False):
        warns.append(f"{design}: optional file missing")
        return

    if design.exists():
        missing = []
        text = read_text(design)
        for heading in schema.get("design", {}).get("required_headings_when_present", []):
            if heading not in text:
                missing.append(heading)
        for heading in missing:
            warns.append(f"{design}: missing heading {heading}")


def split_review_rounds(text: str):
    rounds = []
    current = []
    for line in text.splitlines():
        if line.startswith("## ") and "Round" in line:
            if current:
                rounds.append(current)
            current = [line]
            continue
        if current:
            current.append(line)
    if current:
        rounds.append(current)
    return rounds


def validate_review_log(change_dir: Path, schema: dict, errors: list):
    review_log = change_dir / "review-log.md"
    if not review_log.exists():
        return

    review_schema = schema.get("review_log", {})
    text = read_text(review_log)
    validate_headings(review_log, review_schema.get("required_headings", []), errors)

    if not review_schema.get("frozen_requires_blocking_open_zero", False):
        return

    for review_round in split_review_rounds(text):
        round_text = "\n".join(review_round)
        if "Frozen: yes" in round_text and "Blocking Open: 0" not in round_text:
            title = review_round[0] if review_round else "<unknown round>"
            errors.append(
                f"{review_log}: {title}: Frozen: yes requires Blocking Open: 0"
            )


def is_v2_workspace(change_dir: Path) -> bool:
    if markdown_table_after_heading(read_text(change_dir / "README.md"), "Task Tag Registry") if (change_dir / "README.md").exists() else []:
        return True
    return any((change_dir / directory).exists() for directory in policy.managed_change_directories())


def validate_tags(path: Path, tags, allowed_local_tags, errors: list):
    if not isinstance(tags, list) or not tags:
        errors.append(f"{path}: front matter tags must be a non-empty list")
        return
    for tag in tags:
        if not policy.global_tag_allowed(tag) and tag not in allowed_local_tags:
            errors.append(f"{path}: unknown tag {tag}")


def validate_front_matter(path: Path, expected_artifact: str | None, allowed_local_tags, errors: list):
    metadata = parse_front_matter(path)
    if metadata is None:
        errors.append(f"{path}: missing YAML front matter")
        return {}

    artifact_name = metadata.get("artifact")
    if expected_artifact and artifact_name != expected_artifact:
        errors.append(f"{path}: expected artifact {expected_artifact}, got {artifact_name}")
    elif artifact_name not in policy.ARTIFACTS:
        errors.append(f"{path}: unknown artifact {artifact_name}")

    if artifact_name in policy.ARTIFACTS:
        for field in policy.required_fields(artifact_name):
            if field not in metadata:
                errors.append(f"{path}: front matter missing required field {field}")

    status = metadata.get("status")
    if artifact_name and status and not policy.status_allowed(artifact_name, status):
        errors.append(f"{path}: status {status} is not allowed for artifact {artifact_name}")

    validate_tags(path, metadata.get("tags"), allowed_local_tags, errors)
    return metadata


def expected_change_artifact(rel_path: str):
    for artifact_name, artifact_policy in policy.ARTIFACTS.items():
        naming = artifact_policy.naming
        if not naming or naming.startswith(".memory/"):
            continue
        if naming == rel_path:
            return artifact_name

    if rel_path.startswith("specs/") and rel_path.endswith(".md") and rel_path != "specs/README.md":
        return "delta-spec"
    if (
        rel_path.startswith("implementation-design/")
        and rel_path.endswith(".md")
        and rel_path != "implementation-design/README.md"
        and "/" not in rel_path.removeprefix("implementation-design/")
    ):
        return "implementation-design-detail"
    return None


def validate_v2_regulated_documents(change_dir: Path, allowed_local_tags, errors: list):
    for path in sorted(p for p in change_dir.rglob("*.md") if p.is_file()):
        rel_path = path.relative_to(change_dir).as_posix()
        first_part = first_path_part(rel_path)
        if first_part in policy.managed_change_directories():
            continue
        expected_artifact = expected_change_artifact(rel_path)
        if expected_artifact:
            validate_front_matter(path, expected_artifact, allowed_local_tags, errors)


def validate_task_tag_registry(change_dir: Path, errors: list, warns: list, required: bool):
    registry = parse_tag_registry(change_dir / "README.md", "Task Tag Registry")
    if not registry:
        message = f"{change_dir / 'README.md'}: missing Task Tag Registry"
        if required:
            errors.append(message)
        else:
            warns.append(message)
        return set()

    seen = set()
    for row in registry:
        tag = row.get("tag", "")
        description = row.get("description", "")
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", tag):
            errors.append(f"{change_dir / 'README.md'}: invalid task tag {tag}")
        if policy.global_tag_allowed(tag):
            errors.append(f"{change_dir / 'README.md'}: task tag duplicates global tag {tag}")
        if tag in seen:
            errors.append(f"{change_dir / 'README.md'}: duplicate task tag {tag}")
        if not description:
            errors.append(f"{change_dir / 'README.md'}: task tag {tag} missing description")
        seen.add(tag)
    return seen


def validate_child_index_table(index_path: Path, directory: str, errors: list):
    table_lines = markdown_table_lines_after_heading(read_text(index_path), "Child Index") if index_path.exists() else []
    required = set(policy.directory_index_fields(directory))
    if not table_lines:
        errors.append(f"{index_path}: missing Child Index table")
        return []
    columns = set(split_table_row(table_lines[0]))
    missing_columns = required - columns
    if missing_columns:
        errors.append(
            f"{index_path}: Child Index missing columns {', '.join(sorted(missing_columns))}"
        )
    return parse_markdown_table(table_lines)


def validate_v2_child_directory(change_dir: Path, directory: str, allowed_local_tags, errors: list):
    directory_path = change_dir / directory
    if not directory_path.exists():
        return

    contract = policy.CHANGE_CHILD_DIRECTORIES[directory]
    index_path = directory_path / "README.md"
    if not index_path.exists():
        errors.append(f"{index_path}: missing required file")
        return

    validate_front_matter(index_path, contract["index_artifact"], allowed_local_tags, errors)
    rows = validate_child_index_table(index_path, directory, errors)
    indexed_rows = {row.get("path", "").strip("`"): row for row in rows if row.get("path")}
    indexed = set(indexed_rows)
    child_files = {
        path.name
        for path in directory_path.glob("*.md")
        if path.name != "README.md" and not path.name.endswith("-template.md")
    }

    for row in rows:
        rel_child = row.get("path", "").strip("`")
        if not rel_child:
            errors.append(f"{index_path}: Child Index row missing path")
            continue
        child_path = directory_path / rel_child
        if not child_path.exists():
            errors.append(f"{index_path}: Child Index references missing file {rel_child}")

    for child in sorted(child_files - indexed):
        errors.append(f"{directory_path / child}: missing Child Index entry")

    for child in sorted(child_files):
        child_path = directory_path / child
        if not re.match(contract["filename_regex"], child):
            errors.append(f"{child_path}: filename does not match {contract['pattern']}")
        metadata = validate_front_matter(child_path, contract["child_artifact"], allowed_local_tags, errors)
        if child in indexed_rows:
            validate_child_index_row(index_path, directory, child, indexed_rows[child], metadata, errors)


def expected_child_key(directory: str, filename: str):
    if directory == "decisions":
        match = re.match(r"^DR-(\d{3})-", filename)
        return match.group(1) if match else None
    if directory == "reviews":
        match = re.search(r"-(r\d{2})\.md$", filename)
        return match.group(1) if match else None
    if directory == "tasks":
        match = re.match(r"^slice-(\d{3})-", filename)
        return match.group(1) if match else None
    if directory == "timeline":
        match = re.match(r"^(\d{4}-\d{2}-\d{2}-\d{3})-", filename)
        return match.group(1) if match else None
    return None


def validate_child_index_row(index_path: Path, directory: str, filename: str, row: dict, metadata: dict, errors: list):
    artifact_name = metadata.get("artifact")
    if row.get("artifact") and artifact_name and row.get("artifact") != artifact_name:
        errors.append(f"{index_path}: {filename}: index artifact {row.get('artifact')} does not match child artifact {artifact_name}")

    status = metadata.get("status")
    if row.get("status") and status and row.get("status") != status:
        errors.append(f"{index_path}: {filename}: index status {row.get('status')} does not match child status {status}")

    description = metadata.get("description")
    if row.get("description") and description and row.get("description") != description:
        errors.append(f"{index_path}: {filename}: index description does not match child description")

    key_column = "date_key" if directory == "timeline" else "order"
    expected = expected_child_key(directory, filename)
    if expected and row.get(key_column) and row.get(key_column) != expected:
        errors.append(f"{index_path}: {filename}: index {key_column} {row.get(key_column)} does not match filename key {expected}")


def validate_v2_workspace(change_dir: Path, errors: list, warns: list):
    v2 = is_v2_workspace(change_dir)
    if not v2:
        return
    allowed_local_tags = validate_task_tag_registry(
        change_dir,
        errors,
        warns,
        required=True,
    )
    validate_v2_regulated_documents(change_dir, allowed_local_tags, errors)
    for directory in sorted(policy.managed_change_directories()):
        validate_v2_child_directory(change_dir, directory, allowed_local_tags, errors)


def review_json_load(path: Path):
    def pairs_hook(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate object key {key}")
            result[key] = value
        return result

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle, object_pairs_hook=pairs_hook)


def review_digest(value: dict) -> str:
    payload = dict(value)
    payload["record_digest"] = "sha256:self"
    payload["canonical_digest"] = "sha256:self"
    encoded = json.dumps(review_canonical(payload), ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def review_canonical(value):
    if isinstance(value, list):
        return [review_canonical(item) for item in value]
    if isinstance(value, dict):
        return {
            key: review_canonical(value[key])
            for key in sorted(value, key=lambda item: item.encode("utf-8"))
        }
    return value


def review_portable(value, location="$", seen=None):
    if seen is None:
        seen = set()
    if isinstance(value, str):
        if "\x00" in value:
            raise ValueError(f"{location} contains NUL")
        if value.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value):
            raise ValueError(f"{location} must be portable")
        if (location.endswith(".path") or location.endswith(".root") or location.endswith(".file") or location.endswith("_path")) and not REVIEW_RELATIVE_PATH_RE.fullmatch(value):
            raise ValueError(f"{location} must be a relative portable path")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            review_portable(item, f"{location}[{index}]", seen)
        return
    if not isinstance(value, dict):
        return
    marker = id(value)
    if marker in seen:
        raise ValueError(f"{location} contains a cycle")
    seen.add(marker)
    for key, item in value.items():
        if key in {"absolute_path", "absolute_root", "client_session", "cwd", "local_root", "provider_session", "session_id", "session_path", "run_root"} or key.startswith("absolute_"):
            raise ValueError(f"{location}.{key} is not portable")
        review_portable(item, f"{location}.{key}", seen)
    seen.remove(marker)


def validate_review_run_record(path: Path, run_id: str, errors: list):
    try:
        record = review_json_load(path)
        review_portable(record)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(f"{path}: invalid review-run JSON: {exc}")
        return None
    if not isinstance(record, dict):
        errors.append(f"{path}: review-run record must be an object")
        return None
    if record.get("format") != "review-run" or record.get("format_version") != 1:
        errors.append(f"{path}: unsupported record format")
    if record.get("protocol") != "review-run":
        errors.append(f"{path}: unsupported protocol")
    if record.get("run_id") != run_id:
        errors.append(f"{path}: run_id does not match directory")
    expected_digest = review_digest(record)
    if record.get("record_digest") != expected_digest or record.get("canonical_digest") != expected_digest:
        errors.append(f"{path}: record_digest mismatch")
    return record


def validate_review_run_evidence(change_dir: Path, errors: list):
    root = change_dir / "review-runs"
    if not root.exists():
        return
    run_pattern = re.compile(policy.JSON_EVIDENCE_DIRECTORIES["review-runs"]["run_id_regex"])
    for run_dir in sorted(root.iterdir()):
        if not run_dir.is_dir() or not run_pattern.fullmatch(run_dir.name):
            errors.append(f"{root}: invalid review run directory {run_dir.name}")
            continue
        allowed = {"request.json", "routing-decision.json", "discovery.json", "shard-plan.json", "aggregate-report.json", "gate-result.json", "attempts", "control"}
        for entry in run_dir.iterdir():
            if entry.name not in allowed:
                errors.append(f"{run_dir}: unexpected review-run entry {entry.name}")
        records = {}
        for name in sorted(allowed - {"attempts", "control"}):
            path = run_dir / name
            if path.exists():
                records[name[:-5]] = validate_review_run_record(path, run_dir.name, errors)
        request = records.get("request")
        if request is not None:
            if request.get("record_type") != "request" or request.get("protocol") != "review-run":
                errors.append(f"{run_dir / 'request.json'}: invalid request record")
        discovery = records.get("discovery")
        if discovery is not None and discovery.get("record_type") != "discovery":
            errors.append(f"{run_dir / 'discovery.json'}: invalid discovery record")
        plan = records.get("shard-plan")
        if plan is not None and plan.get("record_type") != "shard-plan":
            errors.append(f"{run_dir / 'shard-plan.json'}: invalid shard-plan record")
        attempts = run_dir / "attempts"
        if attempts.exists():
            for attempt in sorted(attempts.iterdir()):
                if not attempt.is_file() or attempt.suffix != ".json":
                    errors.append(f"{attempts}: invalid attempt entry {attempt.name}")
                    continue
                ledger = validate_review_run_record(attempt, run_dir.name, errors)
                if ledger is not None and ledger.get("record_type") != "review-ledger":
                    errors.append(f"{attempt}: invalid ledger record")
        control = run_dir / "control"
        if control.exists():
            current = control / "current.json"
            if current.exists():
                current_record = validate_review_run_record(current, run_dir.name, errors)
                if current_record is not None and current_record.get("record_type") != "control-revision":
                    errors.append(f"{current}: invalid control record")
            revisions = control / "revisions"
            if revisions.exists():
                for revision in revisions.iterdir():
                    if not revision.is_file() or not re.fullmatch(r"\d{6}\.json", revision.name):
                        errors.append(f"{revisions}: invalid revision entry {revision.name}")
                    else:
                        revision_record = validate_review_run_record(revision, run_dir.name, errors)
                        if revision_record is not None and revision_record.get("record_type") != "control-revision":
                            errors.append(f"{revision}: invalid control revision record")


def validate_change_id(change_dir: Path, schema: dict, errors: list):
    pattern = re.compile(schema["change_id"]["pattern"])
    if not pattern.match(change_dir.name):
        errors.append(f"{change_dir}: invalid change id")


def validate_structured_files(change_dir: Path, schema: dict, errors: list, warns: list):
    structured = schema.get("structured_proposal", {})

    for rel_path in structured.get("required_files", []):
        if not (change_dir / rel_path).exists():
            append_missing_file(change_dir, rel_path, errors)

    for rel_path in structured.get("warning_files", []):
        if not (change_dir / rel_path).exists():
            warns.append(f"{change_dir / rel_path}: optional file missing")

    for directory, required_files in structured.get("required_if_directory_exists", {}).items():
        directory_path = change_dir / directory
        if not directory_path.exists():
            continue
        for rel_path in required_files:
            if not (change_dir / rel_path).exists():
                append_missing_file(change_dir, rel_path, errors)

    has_detailed_design = (change_dir / "implementation-design").exists()
    for rel_dir in structured.get("warning_directories", []):
        if rel_dir.startswith("implementation-design/") and not has_detailed_design:
            continue

        directory_path = change_dir / rel_dir
        if not directory_path.exists():
            warns.append(f"{directory_path}: optional directory missing")
            continue

        concrete_docs = [
            path
            for path in directory_path.glob("*.md")
            if not path.name.endswith("-template.md")
        ]
        if not concrete_docs:
            warns.append(f"{directory_path}: no concrete documents found")


def status_artifact(change_dir: Path, rel_path: str, required: bool):
    path = change_dir / rel_path
    return {
        "path": rel_path,
        "required": required,
        "status": "present" if path.exists() else "missing",
    }


def status_artifacts(change_dir: Path, schema: dict, mode: str):
    required = []
    optional = []
    v2 = is_v2_workspace(change_dir)

    if mode == "plan_only":
        required.extend(["plan.md"])
        optional.extend(["research.md", "tasks.md"])
        if v2:
            optional.extend(["tasks/", "decisions/", "reviews/", "timeline/"])
            for legacy_file in ("review-log.md", "timeline.md"):
                if (change_dir / legacy_file).exists():
                    optional.append(legacy_file)
        else:
            optional.extend(["review-log.md", "timeline.md"])
    else:
        required.append("proposal.md")
        if (change_dir / "tasks" / "README.md").exists():
            required.append("tasks/")
            optional.append("tasks.md")
        else:
            required.append("tasks.md")
        optional.extend(["design.md", "requirements.md"])
        if v2:
            optional.extend(["decisions/", "reviews/", "timeline/"])
            for legacy_file in ("review-log.md", "timeline.md"):
                if (change_dir / legacy_file).exists():
                    optional.append(legacy_file)
        else:
            optional.extend(["review-log.md", "timeline.md"])

    if mode == "structured_proposal":
        structured = schema.get("structured_proposal", {})
        required.extend(structured.get("required_files", []))
        for rel_path in structured.get("warning_files", []):
            if rel_path not in optional and rel_path not in required:
                optional.append(rel_path)

        for directory, required_files in structured.get("required_if_directory_exists", {}).items():
            if (change_dir / directory).exists():
                required.extend(required_files)

    if (change_dir / "specs").exists() and "specs/" not in optional:
        optional.append("specs/")
    if (change_dir / "implementation-design").exists() and "implementation-design/" not in optional:
        optional.append("implementation-design/")
    if (change_dir / "execution-map.md").exists() and "execution-map.md" not in optional:
        optional.append("execution-map.md")

    artifacts = []
    seen = set()
    for rel_path in required:
        if rel_path in seen:
            continue
        seen.add(rel_path)
        artifacts.append(status_artifact(change_dir, rel_path, True))
    for rel_path in optional:
        if rel_path in seen:
            continue
        seen.add(rel_path)
        artifacts.append(status_artifact(change_dir, rel_path, False))
    return artifacts


def first_path_part(rel_path: str) -> str:
    return rel_path.split("/", 1)[0]


def layout_schema(schema: dict):
    return schema.get("layout", {})


def allowed_layout_files(schema: dict, mode: str):
    layout = layout_schema(schema)
    allowed_by_mode = layout.get("allowed_files_by_mode", {})
    return set(allowed_by_mode.get(mode, []))


def allowed_layout_directories(schema: dict, mode: str):
    layout = layout_schema(schema)
    allowed_by_mode = layout.get("allowed_directories_by_mode", {})
    return set(allowed_by_mode.get(mode, []))


def suggested_destination(schema: dict, rel_path: str):
    layout = layout_schema(schema)
    basename = Path(rel_path).name
    for rule in layout.get("suggested_destinations", []):
        pattern = rule.get("pattern", "")
        if not pattern:
            continue
        if matches_pattern(rel_path, pattern) or matches_pattern(basename, pattern):
            return {
                "destination": rule.get("destination", "research.md"),
                "reason": "candidate destination based only on path or filename; read the file before deciding",
                "basis": "path_or_filename_only",
                "matched_pattern": pattern,
                "rule_reason": rule.get("reason", "review and consolidate this file"),
            }
    return {
        "destination": None,
        "reason": "no content-aware destination can be inferred; read the file and choose the owning artifact",
        "basis": "none",
        "matched_pattern": None,
        "rule_reason": "no filename rule matched",
    }


def layout_file_status(change_dir: Path, schema: dict, mode: str, rel_path: str):
    layout = layout_schema(schema)
    if not layout:
        return "expected", "layout schema is not configured"

    if mode == "structured_proposal" and rel_path in LEGACY_TOP_LEVEL_CHANGE_FILES:
        return "expected", "legacy top-level migration input; validator warning owns migration"

    if rel_path in allowed_layout_files(schema, mode):
        return "expected", "allowed file for mode"

    directory = first_path_part(rel_path)
    if directory in policy.JSON_EVIDENCE_DIRECTORIES:
        if fnmatch.fnmatch(rel_path, "review-runs/**/*.json"):
            return "expected", "allowed review-run JSON evidence record"
        return "expected", "allowed review-run JSON evidence directory entry"
    if directory in policy.managed_change_directories():
        if rel_path == f"{directory}/README.md" or fnmatch.fnmatch(rel_path, f"{directory}/*.md"):
            return "expected", "allowed v2 managed directory file"
        return "unexpected", "file is under a v2 managed directory but does not match allowed patterns"

    if directory in allowed_layout_directories(schema, mode):
        if matches_any(rel_path, layout.get("allowed_patterns", [])):
            return "expected", "allowed file under allowed directory"
        return "unexpected", "file is under an allowed directory but does not match allowed patterns"

    if "/" in rel_path:
        return "unexpected", "file is under an unexpected directory for mode"

    return "unexpected", "top-level file is not part of the change artifact contract"


def inventory_change(change_dir: Path, schema: dict, mode: str, include_suggestions: bool = False):
    expected_files = []
    unexpected_files = []

    for path in sorted(p for p in change_dir.rglob("*") if p.is_file()):
        rel_path = path.relative_to(change_dir).as_posix()
        status, reason = layout_file_status(change_dir, schema, mode, rel_path)
        entry = {
            "path": rel_path,
            "status": status,
            "reason": reason,
        }
        if status == "expected":
            expected_files.append(entry)
        else:
            entry["severity"] = "error"
            if include_suggestions:
                entry["suggested_destination"] = suggested_destination(schema, rel_path)
            unexpected_files.append(entry)

    return {
        "expected_files": expected_files,
        "unexpected_files": unexpected_files,
    }


def append_layout_issue(errors: list, warns: list, strict_layout: bool, message: str):
    if strict_layout:
        errors.append(message)
    else:
        warns.append(message)


def validate_layout_limits(change_dir: Path, schema: dict, mode: str, errors: list, warns: list, strict_layout: bool):
    layout = layout_schema(schema)
    if not layout:
        return

    files = sorted(path for path in change_dir.rglob("*") if path.is_file())
    file_count = len(files)
    max_files = layout.get("max_files_by_mode", {}).get(mode)
    if max_files is not None and file_count > max_files:
        append_layout_issue(
            errors,
            warns,
            strict_layout,
            f"{change_dir}: too many change workspace files: {file_count} > {max_files} for {mode}",
        )

    top_level_count = sum(1 for path in files if path.parent == change_dir)
    max_top_level = layout.get("max_top_level_files_by_mode", {}).get(mode)
    if max_top_level is not None and top_level_count > max_top_level:
        append_layout_issue(
            errors,
            warns,
            strict_layout,
            f"{change_dir}: too many top-level change workspace files: {top_level_count} > {max_top_level} for {mode}",
        )

    for rel_dir, max_dir_files in layout.get("max_files_by_directory", {}).items():
        directory = change_dir / rel_dir
        if not directory.exists():
            continue
        dir_file_count = sum(1 for path in directory.rglob("*") if path.is_file())
        if dir_file_count > max_dir_files:
            append_layout_issue(
                errors,
                warns,
                strict_layout,
                f"{directory}: too many files: {dir_file_count} > {max_dir_files}",
            )


def validate_layout(change_dir: Path, schema: dict, mode: str, errors: list, warns: list, strict_layout: bool):
    inventory = inventory_change(change_dir, schema, mode, include_suggestions=True)
    for entry in inventory["unexpected_files"]:
        message = (
            f"{change_dir / entry['path']}: unexpected change workspace file: {entry['reason']}; "
            "read this file before deciding whether to consolidate it into an owning artifact, "
            "move it under an allowed directory, add an explicit schema allowlist, or remove it"
        )
        append_layout_issue(errors, warns, strict_layout, message)

    validate_layout_limits(change_dir, schema, mode, errors, warns, strict_layout)


def validate_change(change_dir: Path, schema: dict, strict_layout: bool = False, worktrees: bool = False):
    errors = []
    warns = []
    mode = detect_mode(change_dir)
    v2 = is_v2_workspace(change_dir)

    validate_change_id(change_dir, schema, errors)

    if mode == "plan_only":
        validate_plan(change_dir, schema, errors)
        if (change_dir / "tasks.md").exists():
            validate_tasks(change_dir, schema, errors)
        if not v2:
            validate_review_log(change_dir, schema, errors)
    else:
        validate_proposal(change_dir, schema, errors)
        validate_tasks(change_dir, schema, errors)
        if mode == "structured_proposal":
            validate_structured_files(change_dir, schema, errors, warns)
        validate_specs(change_dir, schema, errors, warns, mode)
        validate_design(change_dir, schema, warns)
        if not v2:
            validate_review_log(change_dir, schema, errors)

    validate_v2_workspace(change_dir, errors, warns)
    validate_review_run_evidence(change_dir, errors)
    validate_legacy_top_level_artifacts(change_dir, errors, warns, strict_layout)
    validate_layout(change_dir, schema, mode, errors, warns, strict_layout)
    if worktrees:
        worktree_errors, worktree_warnings = execution_map.validate_execution_map_worktrees(change_dir)
        errors.extend(worktree_errors)
        warns.extend(worktree_warnings)

    return mode, errors, warns


def validate_legacy_top_level_artifacts(change_dir: Path, errors: list, warns: list, strict_layout: bool):
    if not is_v2_workspace(change_dir):
        return

    for rel_path, target_dir in LEGACY_TOP_LEVEL_CHANGE_FILES.items():
        legacy_file = change_dir / rel_path
        if not legacy_file.exists():
            continue
        append_layout_issue(
            errors,
            warns,
            strict_layout,
            f"{legacy_file}: legacy top-level artifact; read it as migration input only, "
            f"move current state into {target_dir} with the document tool, and do not treat it as canonical v2 state",
        )


def next_action(errors, warns):
    if errors:
        return "fix_errors"
    if warns:
        return "review_warnings"
    return "ready"


def guidance_for(action: str, strict_layout: bool):
    if action == "fix_errors":
        return "fix errors before freezing, committing, or handing off this change workspace"
    if action == "review_warnings":
        if strict_layout:
            return "strict layout is enabled; resolve warnings that remain after fixing errors"
        return "warnings require review before freeze; inspect unexpected files before choosing consolidation, allowlist, move, or removal; rerun with --strict-layout to enforce failure"
    return "no validator action required"


def memory_guidance_for(action: str, strict_memory: bool):
    if action == "fix_errors":
        return "fix memory errors before promoting, freezing, or handing off durable knowledge"
    if action == "review_warnings":
        if strict_memory:
            return "strict memory is enabled; resolve warnings that remain after fixing errors"
        return "warnings require review before memory promotion; verify source facts and metadata; rerun with --strict-memory to enforce failure"
    return "no memory validator action required"


def build_status_report(
    repo_root: Path,
    targets,
    schema: dict,
    strict_layout: bool = False,
    include_inventory: bool = False,
    include_suggestions: bool = False,
    worktrees: bool = False,
):
    changes = []
    all_errors = []
    all_warns = []

    for target in targets:
        mode, errors, warns = validate_change(target, schema, strict_layout=strict_layout, worktrees=worktrees)
        artifacts = status_artifacts(target, schema, mode)
        missing_required = [
            artifact["path"]
            for artifact in artifacts
            if artifact["required"] and artifact["status"] == "missing"
        ]
        change_report = {
            "change_id": target.name,
            "path": str(target),
            "mode": mode,
            "artifacts": artifacts,
            "missing_required": missing_required,
            "errors": errors,
            "warnings": warns,
            "next_action": next_action(errors, warns),
        }
        if include_inventory:
            change_report.update(
                inventory_change(
                    target,
                    schema,
                    mode,
                    include_suggestions=include_suggestions,
                )
            )
        change_report["execution_map"] = execution_map.execution_map_summary(target, worktrees_checked=worktrees)
        changes.append(change_report)
        all_errors.extend(errors)
        all_warns.extend(warns)

    return {
        "repo_root": str(repo_root),
        "summary": {
            "validated_changes": len(targets),
            "errors": len(all_errors),
            "warnings": len(all_warns),
        },
        "changes": changes,
    }


def print_status_text(report):
    for change in report["changes"]:
        print(
            "STATUS: "
            f"{change['change_id']}: "
            f"mode={change['mode']} "
            f"next_action={change['next_action']} "
            f"errors={len(change['errors'])} "
            f"warnings={len(change['warnings'])}"
        )
        for rel_path in change["missing_required"]:
            print(f"MISSING: {change['change_id']}: {rel_path}")
    print(
        "STATUS: "
        f"validated_changes={report['summary']['validated_changes']} "
        f"errors={report['summary']['errors']} "
        f"warnings={report['summary']['warnings']}"
    )


def print_inventory_text(report):
    for change in report["changes"]:
        print(
            "INVENTORY: "
            f"{change['change_id']}: "
            f"expected={len(change.get('expected_files', []))} "
            f"unexpected={len(change.get('unexpected_files', []))}"
        )
        for entry in change.get("unexpected_files", []):
            print(f"UNEXPECTED: {change['change_id']}: {entry['path']}: {entry['reason']}")
            suggestion = entry.get("suggested_destination")
            if suggestion and suggestion.get("destination"):
                print(
                    "SUGGEST: "
                    f"{change['change_id']}: "
                    f"{entry['path']} -> {suggestion['destination']}: "
                    f"{suggestion['reason']} (basis={suggestion['basis']})"
                )


def validate_memory_tags(index_path: Path, errors: list, warns: list, strict_memory: bool):
    registry = parse_tag_registry(index_path, "Memory Tag Registry")
    if not registry:
        message = f"{index_path}: missing Memory Tag Registry"
        if strict_memory:
            errors.append(message)
        else:
            warns.append(message)
        return set()

    tags = set()
    for row in registry:
        tag = row.get("tag", "")
        description = row.get("description", "")
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", tag):
            errors.append(f"{index_path}: invalid memory tag {tag}")
        if policy.global_tag_allowed(tag):
            errors.append(f"{index_path}: memory tag duplicates global tag {tag}")
        if not description:
            errors.append(f"{index_path}: memory tag {tag} missing description")
        tags.add(tag)
    return tags


MEMORY_INDEX_SECTIONS = {
    "Shared Language": "language.md",
    "Subsystems": "subsystems/",
    "Maps": "maps/",
    "Patterns": "patterns/",
    "Decisions": "decisions/",
}


def memory_index_rows(index_path: Path):
    if not index_path.exists():
        return []
    text = read_text(index_path)
    rows = []
    for section in MEMORY_INDEX_SECTIONS:
        for row in markdown_table_after_heading(text, section):
            if row.get("File"):
                row["Section"] = section
                rows.append(row)
    return rows


def validate_memory_index_coverage(memory_root: Path, index_path: Path, memory_tags, errors: list):
    if not memory_tags:
        return

    rows = memory_index_rows(index_path)
    indexed = {row.get("File", "").strip("`"): row for row in rows if row.get("File")}
    regulated_files = {
        path.relative_to(memory_root).as_posix()
        for path in memory_root.rglob("*.md")
        if path.is_file()
        and path.relative_to(memory_root).as_posix() != "INDEX.md"
        and memory_artifact_for_path(path.relative_to(memory_root).as_posix()) is not None
    }

    for rel_path in sorted(regulated_files - set(indexed)):
        errors.append(f"{index_path}: missing memory index entry for {rel_path}")

    for rel_path in sorted(set(indexed) - regulated_files):
        errors.append(f"{index_path}: memory index references missing file {rel_path}")

    for rel_path in sorted(regulated_files & set(indexed)):
        row = indexed[rel_path]
        entry_path = memory_root / rel_path
        metadata = parse_front_matter(entry_path) or {}
        expected_artifact = memory_artifact_for_path(rel_path)
        if row.get("Artifact") and row.get("Artifact") != (metadata.get("artifact") or expected_artifact):
            errors.append(f"{index_path}: {rel_path}: index Artifact does not match entry")
        if row.get("Status") and metadata.get("status") and row.get("Status") != metadata.get("status"):
            errors.append(f"{index_path}: {rel_path}: index Status does not match entry")
        if row.get("Last Verified") and metadata.get("last_verified") and row.get("Last Verified") != metadata.get("last_verified"):
            errors.append(f"{index_path}: {rel_path}: index Last Verified does not match entry")
        if row.get("Source Revision") and metadata.get("source_revision") and row.get("Source Revision") != metadata.get("source_revision"):
            errors.append(f"{index_path}: {rel_path}: index Source Revision does not match entry")


def memory_artifact_for_path(rel_path: str):
    if rel_path == "language.md":
        return "memory-language"
    if rel_path.startswith("subsystems/"):
        return "memory-subsystem"
    if rel_path.startswith("maps/"):
        return "memory-map"
    if rel_path.startswith("patterns/"):
        return "memory-pattern"
    if rel_path.startswith("decisions/"):
        return "memory-decision"
    return None


def validate_memory_entry(path: Path, rel_path: str, memory_tags, errors: list, warns: list, strict_memory: bool):
    expected_artifact = memory_artifact_for_path(rel_path)
    if expected_artifact is None or rel_path == "INDEX.md":
        return

    metadata = parse_front_matter(path)
    if metadata is None:
        message = f"{path}: missing memory metadata front matter"
        if strict_memory:
            errors.append(message)
        else:
            warns.append(message)
        return

    artifact_name = metadata.get("artifact")
    if artifact_name != expected_artifact:
        errors.append(f"{path}: expected artifact {expected_artifact}, got {artifact_name}")
        return

    for field in policy.required_fields(artifact_name):
        if field not in metadata:
            errors.append(f"{path}: front matter missing required field {field}")

    status = metadata.get("status")
    if status and not policy.status_allowed(artifact_name, status):
        errors.append(f"{path}: status {status} is not allowed for artifact {artifact_name}")

    tags = metadata.get("tags")
    if not isinstance(tags, list) or not tags:
        errors.append(f"{path}: front matter tags must be a non-empty list")
    else:
        for tag in tags:
            if not policy.global_tag_allowed(tag) and tag not in memory_tags:
                errors.append(f"{path}: unknown memory tag {tag}")

    last_verified = metadata.get("last_verified")
    if last_verified and not re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", last_verified):
        errors.append(f"{path}: last_verified must use YYYY-MM-DD")

    source_revision = metadata.get("source_revision")
    if source_revision == "":
        errors.append(f"{path}: source_revision must be non-empty")


def build_memory_report(repo_root: Path, strict_memory: bool = False):
    memory_root = repo_root / ".memory"
    errors = []
    warns = []
    entries = []

    index_path = memory_root / "INDEX.md"
    if not index_path.exists():
        errors.append(f"{index_path}: missing required file")
        return {
            "repo_root": str(repo_root),
            "memory_root": str(memory_root),
            "summary": {"errors": len(errors), "warnings": len(warns)},
            "errors": errors,
            "warnings": warns,
            "entries": entries,
            "next_action": next_action(errors, warns),
        }

    memory_tags = validate_memory_tags(index_path, errors, warns, strict_memory)
    validate_memory_index_coverage(memory_root, index_path, memory_tags, errors)

    for path in sorted(p for p in memory_root.rglob("*.md") if p.is_file()):
        rel_path = path.relative_to(memory_root).as_posix()
        metadata = parse_front_matter(path) or {}
        entries.append(
            {
                "path": rel_path,
                "artifact": metadata.get("artifact"),
                "status": metadata.get("status"),
            }
        )
        validate_memory_entry(path, rel_path, memory_tags, errors, warns, strict_memory)

    return {
        "repo_root": str(repo_root),
        "memory_root": str(memory_root),
        "summary": {"errors": len(errors), "warnings": len(warns)},
        "errors": errors,
        "warnings": warns,
        "entries": entries,
        "next_action": next_action(errors, warns),
    }


def print_memory_text(report, strict_memory: bool = False):
    print(
        "MEMORY: "
        f"errors={report['summary']['errors']} "
        f"warnings={report['summary']['warnings']} "
        f"next_action={report['next_action']}"
    )
    if report["next_action"] != "ready":
        print(f"GUIDE: memory: {memory_guidance_for(report['next_action'], strict_memory)}")
    for msg in report["errors"]:
        print(f"ERROR: {msg}")
    for msg in report["warnings"]:
        print(f"WARN: {msg}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root")
    parser.add_argument("--state-root")
    parser.add_argument("--code-root")
    parser.add_argument("--change")
    parser.add_argument("--all-active", action="store_true")
    parser.add_argument("--memory", action="store_true")
    parser.add_argument("--schema")
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--inventory", action="store_true")
    parser.add_argument("--suggest-cleanup", action="store_true")
    parser.add_argument("--strict-layout", action="store_true")
    parser.add_argument("--strict-memory", action="store_true")
    parser.add_argument("--worktrees", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root_context = root_resolution.resolve_change_context(
        state_root=args.state_root,
        repo_root=args.repo_root,
        code_root=args.code_root,
        change_id=args.change,
    )
    if root_context.get("unresolved_reason"):
        print(root_resolution.error_text(root_context), file=sys.stderr)
        return 2
    repo_root = Path(root_context["state_root"])
    if args.schema:
        requested_schema = Path(args.schema)
        schema_path = requested_schema if requested_schema.is_absolute() else repo_root / requested_schema
    elif (repo_root / ".rules" / "change-doc-schema.json").exists():
        schema_path = repo_root / ".rules" / "change-doc-schema.json"
    else:
        schema_path = PACKAGE_ROOT / "schemas" / "change-workspace.schema.json"
    if not schema_path.exists():
        print(f"ERROR: schema not found: {schema_path}", file=sys.stderr)
        return 2

    schema = load_json(schema_path)
    changes_dir = repo_root / schema["paths"]["changes_dir"]
    ignored_names = set(schema["paths"].get("ignored_change_dirs", ["archive"]))

    if args.memory:
        if args.change or args.all_active:
            print("ERROR: --memory cannot be combined with --change or --all-active", file=sys.stderr)
            return 2
        report = build_memory_report(repo_root, strict_memory=args.strict_memory)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print_memory_text(report, strict_memory=args.strict_memory)
        return 1 if report["summary"]["errors"] else 0

    if args.change and args.all_active:
        print("ERROR: use either --change or --all-active", file=sys.stderr)
        return 2

    if args.change:
        target = changes_dir / args.change
        if not target.exists():
            print(f"ERROR: change not found: {target}", file=sys.stderr)
            return 2
        targets = [target]
    elif args.all_active:
        targets = list_active_changes(changes_dir, ignored_names)
    else:
        print("ERROR: one of --change or --all-active is required", file=sys.stderr)
        return 2

    report_mode = args.status or args.inventory or args.suggest_cleanup
    include_inventory = args.inventory or args.suggest_cleanup or args.strict_layout

    if args.json and not report_mode:
        print("ERROR: --json requires --status, --inventory, or --suggest-cleanup", file=sys.stderr)
        return 2

    if report_mode:
        report = build_status_report(
            repo_root,
            targets,
            schema,
            strict_layout=args.strict_layout,
            include_inventory=include_inventory,
            include_suggestions=args.suggest_cleanup,
            worktrees=args.worktrees,
        )
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        elif args.inventory or args.suggest_cleanup:
            print_inventory_text(report)
        else:
            print_status_text(report)
        return 1 if report["summary"]["errors"] else 0

    all_errors = []
    all_warns = []

    for target in targets:
        mode, errors, warns = validate_change(target, schema, strict_layout=args.strict_layout, worktrees=args.worktrees)
        all_errors.extend(errors)
        all_warns.extend(warns)
        action = next_action(errors, warns)
        print(
            "INFO: "
            f"{target.name}: "
            f"mode={mode} "
            f"errors={len(errors)} "
            f"warnings={len(warns)}"
        )
        print(f"NEXT_ACTION: {target.name}: {action}")
        if action != "ready":
            print(f"GUIDE: {target.name}: {guidance_for(action, args.strict_layout)}")

    for msg in all_errors:
        print(f"ERROR: {msg}")
    for msg in all_warns:
        print(f"WARN: {msg}")

    summary_action = next_action(all_errors, all_warns)
    print(
        "INFO: "
        f"validated_changes={len(targets)} "
        f"errors={len(all_errors)} "
        f"warnings={len(all_warns)}"
    )
    print(f"NEXT_ACTION: summary: {summary_action}")
    if summary_action != "ready":
        print(f"GUIDE: summary: {guidance_for(summary_action, args.strict_layout)}")
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
