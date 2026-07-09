---
name: harness:handoff
description: Produce a compact handoff packet for another agent or future session.
argument-hint: "<change id, branch, or current task>"
---

# Harness Handoff

Use this before context compaction, agent transfer, pausing a branch, or asking a
future session to continue.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `handoff-checkpoint` when it is installed.
2. Resolve and report `state_root`, `code_root`, and `active_change` with the
   same root contract used during execution. If resolution is ambiguous, state
   that before summarizing any `.changes` artifacts.
3. Read the active change README, current task slices, latest authoritative
   review round, high-signal timeline events, `execution-map.md` when present,
   and current git status.
4. For each relevant execution-map row, include slice, topology, status,
   branch, `Worktree`, dependencies, owner, and `Last Evidence`. Treat
   `Worktree` as a local execution coordinate; on another checkout or machine it
   is advisory until reassigned through `assign-slice`.
5. Include exact files changed, commands run, validation results, blockers,
   residual risks, and next checkpoint.
6. Distinguish confirmed current facts from stale memory or unverified
   assumptions.
7. If the handoff changes interpretation, state whether a `timeline/` event or
   `reviews/` record is warranted. Do not create one for routine status.
8. Keep the handoff compact enough for the next agent to act without rereading
   the whole history.

## Output

- Objective:
- Active change and branch:
- Current state:
- Files changed:
- Validation:
- Decisions:
- Open risks:
- Next actions:
- Do not redo:

Do not claim completion unless verification and review evidence are included.
