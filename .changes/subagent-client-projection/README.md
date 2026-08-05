---
artifact: change-index
status: reviewed
tags: [workflow, implementation, validation, subagent-client-projection]
description: "Project canonical subagents into four client-native discovery formats with current-renderer verification."
---

# Subagent Client Projection

## Task Tag Registry

| tag | description |
|---|---|
| `subagent-client-projection` | Minimal Codex, Claude, OpenCode, and OMP discovery projection for canonical subagents. |

## Task Summary

- Project all eleven canonical roles into the four supported Agent CLI discovery
  locations with exact runtime names and canonical body fidelity.
- Emit only the client-native metadata needed for discovery and role loading.
- Make projection verification compare installed rendered content with the
  current renderer, rather than accepting a historical target hash alone.

## Confirmed Boundaries

- `agents/roles/*.md` remains the only behavioral body source.
- This change does not define per-role permission, sandbox, tool, or delegation
  policy.
- `code-simplifier` remains one canonical role and one runtime name.
- Manifest owns client support, runtime names, and target paths; the projector
  owns only minimal format conversion.
- Projected runtime files are generated artifacts and are not hand-edited.

## Current Phase

- Phase: implementation, independent review, and verification complete.
- Owner: coordinator.
- Controlling plan: `plan.md`.
- Current authoritative review:
  `reviews/projection-implementation-r01.md` (`READY_WITH_NOTES`).
- Open blockers: none.
- Residual validation note: Claude CLI is not installed in the current
  environment. Unless it becomes available before handoff, Claude discovery is
  supported by format/path contract evidence only.
- Overall gate: `READY_WITH_NOTES`; the only note is the unexecuted Claude
  runtime discovery check.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `plan.md` | reviewed | Bounded implementation, review, validation, and rollback contract. |
| `reviews/` | reviewed | Independent plan and implementation gate evidence. |
