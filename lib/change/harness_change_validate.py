#!/usr/bin/env python3
import argparse
import fnmatch
import hashlib
import json
import re
import subprocess
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


def detect_mode(change_dir: Path, migration: dict | None = None) -> str:
    has_plan = (change_dir / "plan.md").exists()
    has_proposal = (change_dir / "proposal.md").exists()
    has_specs = (change_dir / "specs").exists()
    has_task_registry = bool(markdown_table_after_heading(read_text(change_dir / "README.md"), "Task Tag Registry")) if (change_dir / "README.md").exists() else False
    structured_markers = [
        change_dir / "specs" / "README.md",
        change_dir / "implementation-design" / "README.md",
    ]

    if has_task_registry and any(path.exists() for path in structured_markers) and (not migration or migration.get("state") == "committed"):
        return "structured_proposal"
    if has_plan and not has_proposal and not has_specs:
        return "plan_only"
    return "legacy_proposal"


def read_migration_transaction(change_dir: Path, errors: list) -> dict | None:
    transaction_path = migration_transaction_path(change_dir)
    if not transaction_path.exists():
        return None
    try:
        return json.loads(read_text(transaction_path))
    except json.JSONDecodeError:
        errors.append(f"{transaction_path}: migration transaction is unreadable")
        return {"state": "invalid"}


def validate_migration_transaction(change_dir: Path, transaction: dict | None, errors: list) -> None:
    if not transaction:
        return
    change_id = change_dir.name
    state_root = change_dir.parent.parent.resolve()
    transaction_path = migration_transaction_path(change_dir)
    if transaction.get("change_id") != change_id:
        errors.append(f"{transaction_path}: transaction change_id does not match workspace")
    if transaction.get("state_root") != str(state_root):
        errors.append(f"{transaction_path}: transaction state_root does not match resolved state root")
    valid_states = {"prepared", "applying", "committed", "interrupted", "rolled-back"}
    if transaction.get("state") not in valid_states:
        errors.append(f"{transaction_path}: invalid migration transaction state {transaction.get('state', '<missing>')}")
        return
    if transaction["state"] != "committed":
        errors.append(f"{transaction_path}: migration transaction is {transaction['state']}; validation fails closed until a migration commits")
        return
    if not re.match(r"^[a-f0-9]{64}$", transaction.get("plan_sha256", "")):
        errors.append(f"{transaction_path}: committed migration is missing plan_sha256")
    plan = validate_committed_migration_plan(change_dir, transaction, errors)

    destinations = {}
    destination_manifest = transaction.get("destination_manifest")
    if not isinstance(destination_manifest, list) or not destination_manifest:
        errors.append(f"{transaction_path}: committed migration is missing destination_manifest")
    else:
        for destination in destination_manifest:
            if (
                not isinstance(destination, dict)
                or not valid_relative_path(destination.get("path"))
                or not re.match(r"^[a-f0-9]{64}$", destination.get("sha256", ""))
            ):
                errors.append(f"{transaction_path}: invalid committed destination entry")
                continue
            destinations[destination["path"]] = destination["sha256"]

    for required in ("README.md", "specs/README.md", "decisions/README.md", "reviews/README.md", "tasks/README.md"):
        if not (change_dir / required).exists():
            errors.append(f"{change_dir / required}: committed migration structured artifact is missing")

    archive_root = state_root / ".changes" / "archive" / change_id / "legacy"
    for source in plan.get("legacy_sources", []) if plan else []:
        archive_path = archive_root / source["path"]
        if not archive_path.exists() or sha256_file(archive_path) != source["sha256"]:
            errors.append(f"{archive_path}: committed migration archive is missing or digest-mismatched")
            continue
        validate_archived_frozen_review_rounds(archive_path, source, errors)

    provenance_path = transaction.get("provenance_path", "decisions/DR-001-migration-provenance.md")
    provenance_hash = destinations.get(provenance_path)
    provenance = change_dir / provenance_path
    if (
        provenance_path != "decisions/DR-001-migration-provenance.md"
        or not provenance_hash
        or not provenance.exists()
        or sha256_file(provenance) != provenance_hash
    ):
        errors.append(f"{transaction_path}: committed migration provenance is missing or outside the owned decision path")
    elif plan and not provenance_includes_archived_evidence(read_text(provenance), plan["legacy_sources"]):
        errors.append(f"{provenance}: committed migration provenance does not bind archived legacy evidence")


def validate_committed_migration_plan(change_dir: Path, transaction: dict, errors: list) -> dict | None:
    transaction_path = migration_transaction_path(change_dir)
    change_id = change_dir.name
    state_root = change_dir.parent.parent.resolve()
    plan = transaction.get("plan")
    if not isinstance(plan, dict):
        errors.append(f"{transaction_path}: committed migration is missing accepted plan")
        return None
    unsigned_plan = {key: value for key, value in plan.items() if key != "plan_sha256"}
    plan_hash = plan.get("plan_sha256")
    if (
        plan.get("change_id") != change_id
        or plan.get("state_root") != str(state_root)
        or not isinstance(plan_hash, str)
        or not re.match(r"^[a-f0-9]{64}$", plan_hash)
        or sha256_text(canonical_json(unsigned_plan)) != plan_hash
        or transaction.get("plan_sha256") != plan_hash
    ):
        errors.append(f"{transaction_path}: committed migration plan does not bind the selected change and state root")
        return None
    if (
        not all(isinstance(plan.get(key), list) for key in ("source_inventory", "destination_manifest", "legacy_sources"))
        or canonical_json(transaction.get("source_inventory")) != canonical_json(plan["source_inventory"])
        or canonical_json(transaction.get("destination_manifest")) != canonical_json(plan["destination_manifest"])
        or canonical_json(transaction.get("legacy_sources")) != canonical_json(plan["legacy_sources"])
    ):
        errors.append(f"{transaction_path}: committed migration fields do not match the accepted plan")
        return None
    if not validate_migration_plan_paths(plan["source_inventory"], "source inventory", transaction_path, errors):
        return None
    if not validate_migration_plan_paths(plan["destination_manifest"], "destination manifest", transaction_path, errors):
        return None
    expected_legacy = {
        "review-log.md": "reviews",
        "timeline.md": "timeline",
        "tasks.md": "tasks",
    }
    source_hashes = {entry["path"]: entry["sha256"] for entry in plan["source_inventory"]}
    seen_legacy = set()
    for source in plan["legacy_sources"]:
        if (
            not isinstance(source, dict)
            or source.get("path") not in expected_legacy
            or source["path"] in seen_legacy
            or source.get("target_directory") != expected_legacy[source["path"]]
            or source.get("archive_path") != f".changes/archive/{change_id}/legacy/{source['path']}"
            or source_hashes.get(source["path"]) != source.get("sha256")
        ):
            errors.append(f"{transaction_path}: invalid committed archived legacy source entry")
            return None
        if source["path"] == "review-log.md":
            if not validate_frozen_review_rounds(source.get("frozen_review_rounds"), transaction_path, errors):
                return None
        elif "frozen_review_rounds" in source:
            errors.append(f"{transaction_path}: unexpected frozen review round evidence")
            return None
        seen_legacy.add(source["path"])
    return plan


def validate_migration_plan_paths(entries: list, label: str, transaction_path: Path, errors: list) -> bool:
    seen = set()
    for entry in entries:
        if (
            not isinstance(entry, dict)
            or not valid_relative_path(entry.get("path"))
            or not isinstance(entry.get("sha256"), str)
            or not re.match(r"^[a-f0-9]{64}$", entry["sha256"])
            or entry["path"] in seen
        ):
            errors.append(f"{transaction_path}: invalid committed {label} entry")
            return False
        seen.add(entry["path"])
    return True


def validate_frozen_review_rounds(rounds, transaction_path: Path, errors: list) -> bool:
    if not isinstance(rounds, list):
        errors.append(f"{transaction_path}: committed migration is missing frozen review round evidence")
        return False
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
            errors.append(f"{transaction_path}: invalid committed frozen review round evidence")
            return False
        seen.add(round_info["decision_id"])
    return True


def validate_archived_frozen_review_rounds(archive_path: Path, source: dict, errors: list) -> None:
    if source["path"] != "review-log.md":
        return
    try:
        actual = extract_frozen_review_rounds(read_text(archive_path))
    except ValueError as error:
        errors.append(f"{archive_path}: {error}")
        return
    if canonical_json(actual) != canonical_json(source["frozen_review_rounds"]):
        errors.append(f"{archive_path}: frozen review round evidence is missing or digest-mismatched")


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


def provenance_includes_archived_evidence(text: str, legacy_sources: list[dict]) -> bool:
    return all(
        f"| `{source['path']}` | `{source['archive_path']}` | `{source['sha256']}` |" in text
        and all(
            f"| `{source['path']}` | `{round_info['decision_id']}` | `{round_info['sha256']}` |" in text
            for round_info in source.get("frozen_review_rounds", [])
        )
        for source in legacy_sources
    )


def migration_transaction_path(change_dir: Path) -> Path:
    return change_dir.parent / ".control" / "migrations" / change_dir.name / "current.json"


def validate_bootstrap_controls(change_dir: Path, errors: list, warns: list) -> None:
    repo_root = change_dir.parent.parent.resolve()
    registries = read_bootstrap_registries(repo_root)
    active = [registry for registry in registries if not registry["errors"] and registry.get("event") and registry["event"].get("state") != "revoked"]
    if len(active) > 1:
        errors.append(f"{repo_root / '.changes' / '.control'}: state root has multiple active bootstrap authorities")
    for registry in registries:
        current_path = registry["directory"] / "current.json"
        errors.extend(f"{current_path}: bootstrap control {message}" for message in registry["errors"])
        event = registry.get("event")
        if not registry["errors"] and event and event.get("state") in {"scoped", "consumed", "revoked"}:
            try:
                if event["state"] in {"scoped", "consumed"}:
                    validate_bootstrap_scope_evidence(repo_root, registry)
                if event["state"] == "consumed":
                    validate_bootstrap_consumed_evidence(repo_root, registry)
                if event["state"] == "revoked":
                    validate_bootstrap_revocation_evidence(repo_root, registry)
            except ValueError as error:
                errors.append(f"{current_path}: bootstrap evidence {error}")
        if (
            not registry["errors"]
            and event
            and event.get("originating_change_id") == change_dir.name
            and event.get("state") in {"claimed", "scoped"}
        ):
            warns.append(
                f"{current_path}: nonterminal historical bootstrap control debt ({event['state']}); "
                "it does not authorize or block migration apply"
            )


def read_bootstrap_registries(repo_root: Path) -> list[dict]:
    control_root = repo_root / ".changes" / ".control"
    if not control_root.exists():
        return []
    return [
        read_bootstrap_registry(repo_root, child.name)
        for child in sorted(control_root.iterdir())
        if child.is_dir() and valid_bootstrap_registry_id(child.name)
    ]


def read_bootstrap_registry(repo_root: Path, registry_id: str) -> dict:
    directory = repo_root / ".changes" / ".control" / registry_id
    authority_id = bootstrap_authority_id(registry_id)
    result = {"directory": directory, "registry_id": registry_id, "current": None, "event": None, "errors": []}
    current_path = directory / "current.json"
    if not current_path.exists():
        result["errors"].append("current.json is missing")
        return result
    try:
        current = load_json(current_path)
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
        or event.get("state_root_realpath") != str(repo_root)
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
        return result
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
        return result
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
    elif not is_legacy_bootstrap_revocation(registry_id, event):
        result["errors"].append("revoked event is missing revocation evidence")
    return result


def validate_bootstrap_consumed_evidence(repo_root: Path, registry: dict) -> None:
    scope_evidence = validate_bootstrap_scope_evidence(repo_root, registry)
    event = registry["event"]
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


def validate_bootstrap_revocation_evidence(repo_root: Path, registry: dict) -> None:
    event = registry["event"]
    if "revoke_gate_ref" not in event:
        if is_legacy_bootstrap_revocation(registry["registry_id"], event):
            return
        raise ValueError("revoked bootstrap is missing its frozen revoke review")
    review_text = bootstrap_review_text(repo_root, event["originating_change_id"])
    round_value = frozen_review_round(review_text, event["revoke_gate_ref"]["decision_id"], "NOT_READY")
    if event["revoke_gate_ref"]["artifact_sha256"] != round_value["sha256"]:
        raise ValueError("revoked bootstrap does not bind its revoke review")


def validate_bootstrap_scope_evidence(repo_root: Path, registry: dict) -> dict:
    current_event = registry["event"]
    event = current_event if current_event.get("state") == "scoped" else read_bootstrap_event(registry["directory"], 2, "scoped")
    if not event or not valid_sha256(event.get("scope_manifest_sha256")):
        raise ValueError("bootstrap scope evidence is unavailable")
    claim = read_bootstrap_event(registry["directory"], 1, "claimed")
    review_text = bootstrap_review_text(repo_root, event["originating_change_id"])
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
        or claim_spec.get("state_root_realpath") != str(repo_root)
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
        or manifest.get("code_root_realpath") != str(repo_root)
        or manifest.get("originating_change_id") != event.get("originating_change_id")
        or manifest.get("predecessor_snapshot_sha256") != event.get("predecessor_snapshot_sha256")
        or manifest.get("executor_id") != authority_identity["executor_id"]
        or manifest.get("reviewer_id") != authority_identity["reviewer_id"]
        or manifest.get("executor_id") != scope_identity["executor_id"]
        or manifest.get("reviewer_id") != scope_identity["reviewer_id"]
        or not isinstance(source_paths, list)
        or source_paths != sorted(source_paths)
        or len(set(source_paths)) != len(source_paths)
        or not all(valid_relative_path(value) for value in source_paths)
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


def bootstrap_review_text(repo_root: Path, change_id: str) -> str:
    active = repo_root / ".changes" / change_id / "review-log.md"
    archived = repo_root / ".changes" / "archive" / change_id / "legacy" / "review-log.md"
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


def read_bootstrap_event(directory: Path, generation: int, state: str) -> dict | None:
    event_path = directory / "events" / f"{generation:06d}-{state}.json"
    if not event_path.exists():
        return None
    try:
        return load_json(event_path)
    except (OSError, json.JSONDecodeError):
        return None


def valid_bootstrap_registry_id(value) -> bool:
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


def valid_relative_path(value) -> bool:
    return isinstance(value, str) and bool(value) and "\\" not in value and not Path(value).is_absolute() and all(part not in {"", ".", ".."} for part in value.split("/"))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_json(value) -> str:
    return json.dumps(canonical_value(value), ensure_ascii=False, separators=(",", ":"))


def is_canonical_json_text(raw: str, value) -> bool:
    canonical = canonical_json(value)
    return raw == canonical or raw == f"{canonical}\n"


def canonical_value(value):
    if isinstance(value, list):
        return [canonical_value(item) for item in value]
    if isinstance(value, dict):
        return {key: canonical_value(value[key]) for key in sorted(value)}
    return value


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
    migration = read_migration_transaction(change_dir, errors)
    mode = detect_mode(change_dir, migration)
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
    validate_migration_transaction(change_dir, migration, errors)
    validate_bootstrap_controls(change_dir, errors, warns)
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
