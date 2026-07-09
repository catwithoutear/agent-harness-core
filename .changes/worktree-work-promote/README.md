---
artifact: change-index
status: draft
tags: [workflow, design, worktree-work-promote]
description: "Change workspace for promoting worktree-aware workflow execution."
---

# Worktree Work Promote

## Task Summary

- Task: promote multi-worktree execution from an implicit agent habit into a documented and later tool-validated workflow contract.
- Source: user discussion on linked worktree failure modes, multi-worktree task organization gaps, brainstormed execution-map draft, and workflow review on 2026-07-08.
- Confirmed decisions:
  - A single canonical `.changes/<change>` state root should own durable task state.
  - Linked worktrees are execution roots for code changes, not independent sources of change-workspace truth.
  - The first supported model should be `shared-state`; `branch-local-state` is deferred until it has an explicit design.
  - A future execution map should make slice-to-branch/worktree assignment explicit instead of deriving it from dirty git status.
  - The brainstormed draft was not ready for implementation planning until root resolution, artifact ownership, slice state transitions, and parallel-vs-stacked topology rules were specified.
  - The implementation-design pack narrows V1 to `shared-state`, chooses `execution-map.md` as the scheduling artifact, and defines root resolution, status transitions, topology, command shape, and validator behavior.
  - Delegated subagent review found remaining blockers in duplicate-root precedence, validator CLI root flags, and Python parity.
  - Follow-up design revision closes those blockers by blocking duplicate non-explicit state roots, making validator root flags explicit across JS/Python, and requiring Python parity for V1 public behavior.
  - Follow-up revision also specifies worktree path normalization/severity, `planned` command semantics, first-class execution-map artifact integration, and stacked dependency-status gates.
  - Multi-lens design review follow-up specifies `Last Evidence` grammar, clarifies that `Worktree` is a local execution coordinate, and syncs stale spec/self-check wording.
  - Slice 005 ships Python parity for V1 public change-tool behavior: root
    flags, `resolve`, `execution-map --json`, `assign-slice`, repo-local schema
    precedence, and worktree-aware validation/status output.
  - Slice 006 updates workflow commands, handoff guidance, bootstrap/active
    change hooks, and planning/operator/handoff skills to teach the shipped
    shared-state execution-map contract.
  - Slice 007 verifies the full repository test suite, manifest generation,
    Codex projection state, projected runtime refresh, whitespace checks, and
    strict change-workspace layout. It also closes a projection verifier gap by
    checking recorded source hashes for copied/rendered runtime assets.

## Current Phase

- Phase: all implementation slices are implemented and reviewed; final
  verification is `READY` after projected runtime refresh and source-hash drift
  verification.
- Owner: coordinator.
- Next checkpoint: handoff or commit preparation. The ignored
  `.changes/worktree-work-promote/` workspace must be added with `git add -f`
  if it should be committed.

## Task Tag Registry

| tag | description |
|---|---|
| worktree-work-promote | Work to make linked-worktree execution a first-class harness workflow concept. |
| state-root | Canonical change workspace root and source/worktree root resolution. |
| python | Python change-tool parity for public V1 workflow behavior. |
| verification | Final validation, projection checks, and package readiness evidence. |

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `requirements.md` | draft | Capture accepted requirements, non-goals, and open design choices. |
| `proposal.md` | draft | Explain the selected direction, impact, validation, and rollback. |
| `design.md` | reviewed | Record the draft model and the workflow review gate. |
| `implementation-design/README.md` | reviewed | Implementation-design pack for the V1 shared-state model. |
| `specs/README.md` | draft | Record that detailed behavioral specs are deferred until the design is refined. |
| `tasks.md` | draft | Track the next implementation-design and validation work. |
| `reviews/README.md` | draft | Index review rounds and readiness decisions. |
