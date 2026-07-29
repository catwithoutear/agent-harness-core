---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Detailed design problem, goals, non-goals, and boundaries."
---
# Problem, Goals, and Boundaries

## Goal

Replace migration authorization and recovery infrastructure with a deterministic
filesystem upgrade that preserves legacy bytes, rejects conflicts, and resumes
by rerunning.

## Non-goals

- Reinterpreting legacy prose.
- Changing state-root or execution-map behavior.
- Refactoring unrelated change-document commands.
- Retaining the unpublished expected-plan digest contract.

## Boundary Conditions

- Archive files are written before matching top-level sources are removed.
- Existing conflicting archive or generated content is never overwritten.
- Node and Python expose the same command behavior.
- Validators judge current structure, not historical migration transactions.
- Migration is a single-writer command; concurrent mutation is outside its
  guarantee.
- Repeat apply after top-level legacy removal is a no-op that preserves later
  workspace edits.

## Source Artifacts

| Source | Anchor | Decision or fact | Used by |
|---|---|---|---|
| `../design.md` | Command Contract | dry-run and direct apply remain | migration commands |
| `../design.md` | Write Order And Recovery | monotonic writes replace rollback | apply helpers |
| owner decision | conversation | remove transaction machinery | entire slice |

## Rejected Alternatives

| Alternative | Why rejected | Tradeoff kept |
|---|---|---|
| Keep digest and transaction state | disproportionate to Git-tracked Markdown files | retain preflight and conflict rejection |
| Parse legacy documents into new child artifacts | can alter historical meaning | archive exact bytes and link them |
