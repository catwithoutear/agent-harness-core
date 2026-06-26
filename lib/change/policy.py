#!/usr/bin/env python3
"""Shared policy for agent harness change-workspace tooling."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


POLICY_VERSION = 1

STATUSES = {
    "draft",
    "reviewed",
    "frozen",
    "superseded",
    "verified",
}

GLOBAL_TAGS = {
    "workflow",
    "requirements",
    "research",
    "proposal",
    "design",
    "implementation",
    "review",
    "validation",
    "compatibility",
    "migration",
    "rollback",
    "decision",
    "terminology",
    "memory",
    "codex",
    "hooks",
    "plugin",
}


@dataclass(frozen=True)
class ArtifactPolicy:
    name: str
    required_fields: tuple[str, ...] = ("artifact", "status", "tags")
    optional_fields: tuple[str, ...] = ("description",)
    allowed_statuses: tuple[str, ...] = ("draft", "reviewed", "frozen", "superseded")
    naming: str | None = None
    template: str | None = None


ARTIFACTS = {
    "change-index": ArtifactPolicy("change-index", naming="README.md"),
    "requirements": ArtifactPolicy("requirements", naming="requirements.md"),
    "proposal": ArtifactPolicy("proposal", naming="proposal.md"),
    "research": ArtifactPolicy("research", naming="research.md"),
    "terminology": ArtifactPolicy("terminology", naming="terminology.md"),
    "design": ArtifactPolicy("design", naming="design.md"),
    "plan": ArtifactPolicy("plan", naming="plan.md"),
    "tasks": ArtifactPolicy("tasks", naming="tasks.md"),
    "specs-index": ArtifactPolicy("specs-index", naming="specs/README.md"),
    "decision-record": ArtifactPolicy(
        "decision-record",
        naming="decisions/DR-<nnn>-<kebab-slug>.md",
        template="templates/changes/decisions/decision-record.md",
    ),
    "timeline-event": ArtifactPolicy(
        "timeline-event",
        naming="timeline/<yyyy-mm-dd>-<nnn>-<kebab-slug>.md",
        template="templates/changes/timeline/timeline-event.md",
    ),
    "review-round": ArtifactPolicy(
        "review-round",
        naming="reviews/<target>-r<nn>.md",
        template="templates/changes/reviews/review-round.md",
    ),
    "task-slice": ArtifactPolicy(
        "task-slice",
        naming="tasks/slice-<nnn>-<kebab-slug>.md",
        template="templates/changes/tasks/task-slice.md",
    ),
    "decision-index": ArtifactPolicy("decision-index", naming="decisions/README.md"),
    "timeline-index": ArtifactPolicy("timeline-index", naming="timeline/README.md"),
    "reviews-index": ArtifactPolicy("reviews-index", naming="reviews/README.md"),
    "tasks-index": ArtifactPolicy("tasks-index", naming="tasks/README.md"),
    "implementation-design-index": ArtifactPolicy(
        "implementation-design-index",
        naming="implementation-design/README.md",
    ),
    "implementation-design-detail": ArtifactPolicy(
        "implementation-design-detail",
        naming="implementation-design/<area>.md",
    ),
    "delta-spec": ArtifactPolicy("delta-spec", naming="specs/<capability>.md"),
    "memory-index": ArtifactPolicy(
        "memory-index",
        allowed_statuses=("verified", "superseded"),
        naming=".memory/INDEX.md",
    ),
    "memory-language": ArtifactPolicy(
        "memory-language",
        required_fields=("artifact", "status", "tags", "last_verified", "source_revision"),
        allowed_statuses=("verified", "superseded"),
        naming=".memory/language.md",
    ),
    "memory-subsystem": ArtifactPolicy(
        "memory-subsystem",
        required_fields=("artifact", "status", "tags", "last_verified", "source_revision"),
        allowed_statuses=("verified", "superseded"),
        naming=".memory/subsystems/<slug>.md",
    ),
    "memory-map": ArtifactPolicy(
        "memory-map",
        required_fields=("artifact", "status", "tags", "last_verified", "source_revision"),
        allowed_statuses=("verified", "superseded"),
        naming=".memory/maps/<slug>.md",
    ),
    "memory-pattern": ArtifactPolicy(
        "memory-pattern",
        required_fields=("artifact", "status", "tags", "last_verified", "source_revision"),
        allowed_statuses=("verified", "superseded"),
        naming=".memory/patterns/<slug>.md",
    ),
    "memory-decision": ArtifactPolicy(
        "memory-decision",
        required_fields=("artifact", "status", "tags", "last_verified", "source_revision"),
        allowed_statuses=("verified", "superseded"),
        naming=".memory/decisions/<slug>.md",
    ),
}

CHANGE_CHILD_DIRECTORIES = {
    "decisions": {
        "index_artifact": "decision-index",
        "child_artifact": "decision-record",
        "columns": ("path", "artifact", "status", "order", "description"),
        "pattern": "DR-<nnn>-<kebab-slug>.md",
        "filename_regex": r"^DR-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$",
    },
    "timeline": {
        "index_artifact": "timeline-index",
        "child_artifact": "timeline-event",
        "columns": ("path", "artifact", "status", "date_key", "description"),
        "pattern": "<yyyy-mm-dd>-<nnn>-<kebab-slug>.md",
        "filename_regex": r"^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$",
    },
    "reviews": {
        "index_artifact": "reviews-index",
        "child_artifact": "review-round",
        "columns": ("path", "artifact", "status", "order", "description"),
        "pattern": "<target>-r<nn>.md",
        "filename_regex": r"^[a-z0-9]+(?:-[a-z0-9]+)*-r\d{2}\.md$",
    },
    "tasks": {
        "index_artifact": "tasks-index",
        "child_artifact": "task-slice",
        "columns": ("path", "artifact", "status", "order", "description"),
        "pattern": "slice-<nnn>-<kebab-slug>.md",
        "filename_regex": r"^slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$",
    },
}

TAG_REGISTRIES = {
    "task": {
        "file": "README.md",
        "heading": "Task Tag Registry",
        "columns": ("tag", "description"),
    },
    "memory": {
        "file": ".memory/INDEX.md",
        "heading": "Memory Tag Registry",
        "columns": ("tag", "description"),
    },
}

COMMANDS = {
    "policy": "harness-change-doc policy --json",
    "index": "harness-change-doc index",
    "memory_index": "harness-change-doc memory-index --json",
    "add_review": "harness-change-doc add-review",
    "migrate": "harness-change-doc migrate --dry-run",
    "memory_retrofit": "harness-change-doc memory-retrofit --dry-run",
}


def artifact(name: str) -> ArtifactPolicy | None:
    return ARTIFACTS.get(name)


def status_allowed(artifact_name: str, status: str) -> bool:
    policy = artifact(artifact_name)
    if policy is None:
        return False
    return status in policy.allowed_statuses


def global_tag_allowed(tag: str) -> bool:
    return tag in GLOBAL_TAGS


def required_fields(artifact_name: str) -> tuple[str, ...]:
    policy = artifact(artifact_name)
    return policy.required_fields if policy is not None else ()


def optional_fields(artifact_name: str) -> tuple[str, ...]:
    policy = artifact(artifact_name)
    return policy.optional_fields if policy is not None else ()


def naming_rule(artifact_or_directory: str) -> str | None:
    if artifact_or_directory in CHANGE_CHILD_DIRECTORIES:
        return CHANGE_CHILD_DIRECTORIES[artifact_or_directory]["pattern"]
    policy = artifact(artifact_or_directory)
    return policy.naming if policy is not None else None


def template_path(artifact_name: str) -> str | None:
    policy = artifact(artifact_name)
    return policy.template if policy is not None else None


def directory_index_fields(directory: str) -> tuple[str, ...]:
    entry = CHANGE_CHILD_DIRECTORIES.get(directory)
    return entry["columns"] if entry is not None else ()


def legacy_layout_rules(mode: str) -> dict:
    return {
        "mode": mode,
        "old_files": ["review-log.md", "timeline.md"],
        "old_complex_tasks": ["tasks.md"],
        "severity": "compatibility_warning",
    }


def managed_change_directories() -> set[str]:
    return set(CHANGE_CHILD_DIRECTORIES)


def projection_policy() -> dict:
    return {
        "version": POLICY_VERSION,
        "artifacts": {
            name: {
                "required_fields": list(policy.required_fields),
                "optional_fields": list(policy.optional_fields),
                "allowed_statuses": list(policy.allowed_statuses),
                "naming": policy.naming,
                "template": policy.template,
            }
            for name, policy in sorted(ARTIFACTS.items())
        },
        "statuses": sorted(STATUSES),
        "global_tags": sorted(GLOBAL_TAGS),
        "tag_registries": {
            key: {
                "file": value["file"],
                "heading": value["heading"],
                "columns": list(value["columns"]),
            }
            for key, value in sorted(TAG_REGISTRIES.items())
        },
        "directories": {
            name: {
                "index_artifact": value["index_artifact"],
                "child_artifact": value["child_artifact"],
                "index_columns": list(value["columns"]),
                "pattern": value["pattern"],
                "filename_regex": value["filename_regex"],
            }
            for name, value in sorted(CHANGE_CHILD_DIRECTORIES.items())
        },
        "commands": dict(sorted(COMMANDS.items())),
    }


def repo_relative(path: Path, repo_root: Path) -> str:
    return path.relative_to(repo_root).as_posix()
