#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def resolve_change_context(
    *,
    state_root: str | None = None,
    repo_root: str | None = None,
    code_root: str | None = None,
    change_id: str | None = None,
    cwd: str | Path | None = None,
    env: dict | None = None,
) -> dict:
    cwd_path = Path(cwd or os.getcwd()).resolve()
    env_map = env if env is not None else os.environ
    cwd_change = find_cwd_change(cwd_path)
    resolved_change = change_id or (cwd_change or {}).get("change_id")
    explicit_state = resolve_explicit_root(state_root, cwd_path, "state-root")
    legacy_repo = resolve_explicit_root(repo_root, cwd_path, "repo-root")
    resolved_code_root = resolve_code_root(code_root, cwd_path)

    aliased_root = next(
        (root for root in (explicit_state, legacy_repo) if root and root["requested"] != root["resolved"]),
        None,
    )
    if aliased_root:
        return unresolved_context(
            code_root=resolved_code_root,
            change_id=resolved_change,
            source="unresolved",
            unresolved_reason="aliased-state-root",
            candidates=[candidate(aliased_root["resolved"], resolved_change, aliased_root["source"], aliased_root["requested"])],
        )

    if explicit_state and legacy_repo and explicit_state["resolved"] != legacy_repo["resolved"]:
        return unresolved_context(
            code_root=resolved_code_root,
            change_id=resolved_change,
            source="conflict",
            unresolved_reason="conflicting-explicit-roots",
            candidates=[
                candidate(explicit_state["resolved"], resolved_change, "state-root", explicit_state["requested"]),
                candidate(legacy_repo["resolved"], resolved_change, "repo-root", legacy_repo["requested"]),
            ],
        )

    if explicit_state or legacy_repo:
        root = explicit_state or legacy_repo
        if is_linked_worktree(root["resolved"], git_worktrees(root["resolved"])):
            return unresolved_context(
                code_root=resolved_code_root,
                change_id=resolved_change,
                source="unresolved",
                unresolved_reason="linked-worktree-state-root",
                is_linked_worktree=True,
                candidates=[candidate(root["resolved"], resolved_change, root["source"], root["requested"])],
            )
        return resolved_context(
            state_root=root["resolved"],
            code_root=resolved_code_root,
            change_id=resolved_change,
            source=root["source"],
            candidates=[candidate(root["resolved"], resolved_change, root["source"], root["requested"])],
        )

    env_root = resolve_explicit_root(env_map.get("HARNESS_CHANGE_STATE_ROOT"), cwd_path, "environment")
    if env_root:
        if env_root["requested"] != env_root["resolved"]:
            return unresolved_context(
                code_root=resolved_code_root,
                change_id=resolved_change,
                source="unresolved",
                unresolved_reason="aliased-state-root",
                candidates=[candidate(env_root["resolved"], resolved_change, "environment", env_root["requested"])],
            )
        if is_linked_worktree(env_root["resolved"], git_worktrees(env_root["resolved"])):
            return unresolved_context(
                code_root=resolved_code_root,
                change_id=resolved_change,
                source="unresolved",
                unresolved_reason="linked-worktree-state-root",
                is_linked_worktree=True,
                candidates=[candidate(env_root["resolved"], resolved_change, "environment", env_root["requested"])],
            )
        return resolved_context(
            state_root=env_root["resolved"],
            code_root=resolved_code_root,
            change_id=resolved_change,
            source="environment",
            candidates=[candidate(env_root["resolved"], resolved_change, "environment", env_root["requested"])],
        )

    worktrees = git_worktrees(resolved_code_root)
    linked = is_linked_worktree(resolved_code_root, worktrees)
    candidates: list[dict] = []
    known_worktree_candidates = []

    if resolved_change and cwd_change and cwd_change["change_id"] == resolved_change:
        add_candidate(candidates, Path(cwd_change["state_root"]), resolved_change, "cwd-change", True)
    if resolved_change:
        add_candidate(candidates, resolved_code_root, resolved_change, "code-root", True)
    for worktree in worktrees:
        known_worktree_candidates.append(candidate(worktree, resolved_change, "git-worktree"))
        if resolved_change and (worktree / ".changes" / resolved_change).exists():
            add_candidate(
                candidates,
                worktree,
                resolved_change,
                "code-root" if worktree == resolved_code_root else "git-worktree",
                True,
            )

    if len(candidates) > 1:
        return unresolved_context(
            code_root=resolved_code_root,
            change_id=resolved_change,
            source="unresolved",
            unresolved_reason="ambiguous-state-root",
            is_linked_worktree=linked,
            candidates=candidates,
        )

    if len(candidates) == 1:
        only = candidates[0]
        only_root = Path(only["state_root"]).resolve()
        if only_root != resolved_code_root and only["source"] == "git-worktree":
            return unresolved_context(
                code_root=resolved_code_root,
                change_id=resolved_change,
                source="unresolved",
                unresolved_reason="other-worktree-state-root",
                is_linked_worktree=linked,
                candidates=candidates,
            )
        return resolved_context(
            state_root=only_root,
            code_root=resolved_code_root,
            change_id=resolved_change,
            source=only["source"],
            is_linked_worktree=linked,
            candidates=candidates,
        )

    if linked:
        return unresolved_context(
            code_root=resolved_code_root,
            change_id=resolved_change,
            source="unresolved",
            unresolved_reason="linked-worktree-unresolved",
            is_linked_worktree=linked,
            candidates=known_worktree_candidates,
        )

    return resolved_context(
        state_root=resolved_code_root,
        code_root=resolved_code_root,
        change_id=resolved_change,
        source="cwd-change" if cwd_change else "cwd",
        is_linked_worktree=linked,
        candidates=candidates,
    )


def error_text(context: dict) -> str:
    change = f" for change {context['change_id']}" if context.get("change_id") else ""
    reason = context.get("unresolved_reason")
    if reason == "conflicting-explicit-roots":
        state = next((item["state_root"] for item in context["candidates"] if item["source"] == "state-root"), "<missing>")
        repo = next((item["state_root"] for item in context["candidates"] if item["source"] == "repo-root"), "<missing>")
        return f"ERROR: conflicting state roots{change}: --state-root {state} differs from --repo-root {repo}\nGUIDE: retry with one canonical state root."
    if reason == "aliased-state-root":
        item = context["candidates"][0] if context.get("candidates") else {}
        return f"ERROR: state root alias{change}: {item.get('requested_root', '<missing>')} resolves to {item.get('state_root', '<missing>')}\nGUIDE: retry with the canonical state-root path."
    if reason == "linked-worktree-state-root":
        item = context["candidates"][0] if context.get("candidates") else {}
        return f"ERROR: state root{change} is a linked worktree: {item.get('state_root', '<missing>')}\nGUIDE: retry with the canonical shared state-root, not a linked worktree."
    if reason == "ambiguous-state-root":
        return "\n".join([f"ERROR: ambiguous state root{change}", *candidate_lines(context), "GUIDE: inspect candidates and retry with --state-root <canonical-state-root>."])
    if reason == "other-worktree-state-root":
        return "\n".join([f"ERROR: state root unresolved{change}; matching change workspace is in another worktree", *candidate_lines(context), "GUIDE: retry with explicit --state-root after confirming the canonical workspace."])
    return "\n".join([f"ERROR: state root unresolved{change}", *candidate_lines(context), "GUIDE: retry with --state-root <canonical-state-root>."])


def resolved_context(*, state_root: Path, code_root: Path, change_id: str | None, source: str, is_linked_worktree: bool = False, candidates=None) -> dict:
    return {
        "state_root": str(Path(state_root).resolve()),
        "code_root": str(Path(code_root).resolve()),
        "change_id": change_id,
        "source": source,
        "is_linked_worktree": is_linked_worktree,
        "candidates": candidates or [],
        "unresolved_reason": None,
    }


def unresolved_context(*, code_root: Path, change_id: str | None, source: str, unresolved_reason: str, is_linked_worktree: bool = False, candidates=None) -> dict:
    return {
        "state_root": None,
        "code_root": str(Path(code_root).resolve()),
        "change_id": change_id,
        "source": source,
        "is_linked_worktree": is_linked_worktree,
        "candidates": candidates or [],
        "unresolved_reason": unresolved_reason,
    }


def candidate(state_root: Path, change_id: str | None, source: str, requested_root: Path | None = None) -> dict:
    state_root = Path(state_root).resolve()
    change_dir = state_root / ".changes" / change_id if change_id else None
    result = {
        "state_root": str(state_root),
        "change_dir": str(change_dir) if change_dir else None,
        "source": source,
        "exists": change_dir.exists() if change_dir else state_root.exists(),
    }
    if requested_root is not None:
        result["requested_root"] = str(requested_root)
    return result


def add_candidate(candidates: list[dict], state_root: Path, change_id: str, source: str, require_exists: bool) -> None:
    entry = candidate(state_root, change_id, source)
    if require_exists and not entry["exists"]:
        return
    if any(Path(existing["state_root"]).resolve() == Path(entry["state_root"]).resolve() for existing in candidates):
        return
    candidates.append(entry)


def candidate_lines(context: dict) -> list[str]:
    return [
        f"CANDIDATE: {item['state_root']} source={item['source']} exists={'yes' if item['exists'] else 'no'}"
        for item in context.get("candidates", [])
    ]


def resolve_root(value: str | None, cwd: Path) -> Path | None:
    root = resolve_explicit_root(value, cwd, "explicit")
    return root["resolved"] if root else None


def resolve_explicit_root(value: str | None, cwd: Path, source: str) -> dict | None:
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = cwd / path
    requested = Path(os.path.abspath(path))
    return {"requested": requested, "resolved": realpath_or_resolve(requested), "source": source}


def resolve_code_root(value: str | None, cwd: Path) -> Path:
    explicit = resolve_root(value, cwd)
    if explicit:
        return explicit
    return git_root(cwd) or cwd


def git_root(cwd: Path) -> Path | None:
    result = subprocess.run(["git", "-C", str(cwd), "rev-parse", "--show-toplevel"], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return None
    return Path(result.stdout.strip()).resolve()


def git_worktrees(code_root: Path) -> list[Path]:
    result = subprocess.run(["git", "-C", str(code_root), "worktree", "list", "--porcelain"], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        return []
    return [
        Path(line.removeprefix("worktree ").strip()).resolve()
        for line in result.stdout.splitlines()
        if line.startswith("worktree ")
    ]


def is_linked_worktree(code_root: Path, worktrees: list[Path]) -> bool:
    if len(worktrees) <= 1:
        return False
    current = realpath_or_resolve(code_root)
    return any(realpath_or_resolve(worktree) == current for worktree in worktrees[1:])


def find_cwd_change(cwd: Path) -> dict | None:
    parts = cwd.resolve().parts
    for index in range(len(parts) - 2, -1, -1):
        if parts[index] != ".changes" or not parts[index + 1]:
            continue
        state_root = Path(*parts[:index]).resolve() if index > 0 else Path("/").resolve()
        return {
            "state_root": str(state_root),
            "change_id": parts[index + 1],
            "change_dir": str(state_root / ".changes" / parts[index + 1]),
        }
    return None


def realpath_or_resolve(path: Path) -> Path:
    try:
        return path.resolve(strict=True)
    except OSError:
        return path.resolve()
