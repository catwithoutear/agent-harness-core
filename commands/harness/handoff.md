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
2. Read the active change README, current task slices, latest authoritative
   review round, high-signal timeline events, and current git status.
3. Include exact files changed, commands run, validation results, blockers,
   residual risks, and next checkpoint.
4. Distinguish confirmed current facts from stale memory or unverified
   assumptions.
5. If the handoff changes interpretation, state whether a `timeline/` event or
   `reviews/` record is warranted. Do not create one for routine status.
6. Keep the handoff compact enough for the next agent to act without rereading
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
