---
artifact: change-index
status: reviewed
tags: [workflow, proposal, review]
description: "Index for absorbing external workflow, planning, and review lessons into harness core."
---

# External Workflow Plan Review Absorption

## Task Tag Registry

| tag | description |
|---|---|
| `external-workflow` | Project-agnostic workflow, planning, and review lessons from external harness research. |

## Task Summary

- Task: Draft a non-UI absorption plan for workflow, planning, and review improvements.
- Source: GitLens repository skill scan packed with Repomix on 2026-07-09.
- Confirmed decisions:
  - Exclude frontend, UI, accessibility, CSS, live UI exercise, and webview-specific flows.
  - Prefer extending existing core skills and review gates over creating overlapping runtime skills.
  - Keep tracker- or product-specific issue automation out of default core unless it is abstracted.

## Current Phase

- Phase: First-wave implementation converged after review.
- Owner: coordinator.
- Current authoritative review: `reviews/slice-004-r01.md`.
- Frozen first-wave scope: Tracks A-D.
- Deferred scope: Track E evidence discipline and tracker automation.
- Next checkpoint: commit or handoff first-wave Tracks A-D.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `requirements.md` | draft | Scope, acceptance criteria, and non-goals. |
| `research.md` | draft | External source lessons and exclusion decisions. |
| `proposal.md` | draft | Candidate absorption tracks and recommended order. |
| `design.md` | draft | Target core assets and implementation boundaries. |
| `specs/` | draft | Behavioral requirements for accepted workflow enhancements. |
| `tasks.md` | reviewed | Draft-to-review checklist and first-wave implementation convergence. |
| `decisions/` | draft | Frozen scope decision and no-pack decision. |
| `reviews/` | reviewed | Draft readiness review and first-wave implementation review gates. |
| `tasks/` | reviewed | Ordered first-wave implementation slices. |
