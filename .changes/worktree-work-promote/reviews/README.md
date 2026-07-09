---
artifact: reviews-index
status: draft
tags: [review]
description: "Reviews index."
---
# Reviews

## Responsibility

This directory indexes reviews child documents.

## Current Authoritative Review

- `slice-007-r01.md`: current final readiness review. It gates projection and
  repository verification `READY` for handoff.
- `slice-006-r01.md`: current implementation review for slice 006. It gates
  workflow asset updates `READY` and allows slice 007 to begin.
- `slice-005-r01.md`: current implementation review for slice 005. It gates
  Python change-tool parity `READY` and allows slice 006 to begin.
- `slice-004-r01.md`: current implementation review for slice 004. It gates
  JS worktree-aware validation `READY` and allows slice 005 to begin.
- `slice-003-r01.md`: current implementation review for slice 003. It gates
  JS execution-map commands `READY` and allows slice 004 to begin.
- `slice-002-r01.md`: current implementation review for slice 002. It gates
  JS root-resolution context `READY` and allows slice 003 to begin.
- `slice-001-r01.md`: current implementation review for slice 001. It gates
  policy/schema execution-map registration `READY` and allows slice 002 to
  begin.
- `implementation-design-r03.md`: current authoritative review. It closes the multi-lens detailed-design notes and gates the design `READY` for task slicing.
- `implementation-design-r02.md`: prior review that closed the delegated blockers and gated the design `READY` for task slicing.
- `subagent-design-r01.md`: prior delegated `NOT_READY` review.
- `implementation-design-r01.md`: prior local readiness review for the converged implementation-design pack.
- `draft-r01.md`: superseded draft review that identified the original blockers.

## Child Index

| path | artifact | status | order | description |
|---|---|---|---|---|
| `draft-r01.md` | review-round | reviewed | r01 | Workflow review of the multi-worktree execution draft. |
| `implementation-design-r01.md` | review-round | reviewed | r01 | Readiness review of the converged implementation-design pack. |
| `subagent-design-r01.md` | review-round | reviewed | r01 | Subagent review synthesis for the shared-state worktree design. |
| `implementation-design-r02.md` | review-round | reviewed | r02 | Readiness review after delegated-review blocker resolution. |
| `implementation-design-r03.md` | review-round | reviewed | r03 | Multi-lens design convergence after detailed-design review. |
| `slice-001-r01.md` | review-round | reviewed | r01 | Implementation review for slice 001 execution-map policy/schema registration. |
| `slice-002-r01.md` | review-round | reviewed | r01 | Implementation review for slice 002 root-resolution context. |
| `slice-003-r01.md` | review-round | reviewed | r01 | Implementation review for slice 003 JS execution-map commands. |
| `slice-004-r01.md` | review-round | reviewed | r01 | Implementation review for slice 004 JS worktree validation. |
| `slice-005-r01.md` | review-round | reviewed | r01 | Implementation review for slice 005 Python parity. |
| `slice-006-r01.md` | review-round | reviewed | r01 | Implementation review for slice 006 workflow assets. |
| `slice-007-r01.md` | review-round | reviewed | r01 | Final readiness review for slice 007 projection and verification. |
