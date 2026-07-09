---
name: handoff-checkpoint
description: Use when continuing work later, compacting context, handing work to another agent, or recording current state before stopping.
---

# Handoff Checkpoint

Write a handoff when work must continue in a later session, another agent, or a
context-compacted run. The next agent should be able to resume from current
filesystem state without trusting stale conversation history.

## Include

- objective and current phase,
- repositories, branches, worktrees, resolved `state_root`, and `code_root`,
- active change workspace or explicit no-change/root-unresolved reason,
- execution-map rows when present, including status, topology, branch,
  `Worktree`, dependencies, owner, and `Last Evidence`,
- files changed and files intentionally untouched,
- commands run and exact results,
- validation still missing,
- blockers, risks, and user decisions needed,
- assumptions that came from memory or previous conversation,
- next concrete checkpoint.

## Evidence Rules

- Prefer current `git status`, validator output, test output, and file paths.
- Mark stale or unverified facts clearly.
- Include absolute paths when multiple worktrees or repositories are involved.
- Mark every `Worktree` value from `execution-map.md` as a local execution
  coordinate. If the receiver may be in another checkout or machine, call out
  the stale Worktree path risk and the need to reassign it.
- Keep `Last Evidence` references change-relative and point to the owning task,
  review, decision, or handoff artifact instead of copying logs into the map.
- Preserve failed command output when it explains the next action.
- Do not summarize away unresolved findings from review packets.

## Shape

Use short sections:

- Goal
- Current State
- Changed Files
- Evidence
- Open Risks
- Next Step

Keep the handoff compact. It is a continuation contract, not a full report.

## Good vs Bad

Good: "`npm test` passed at `/repo`, 16 tests; validator failed once on unknown
tag `skills`, then passed after adding it to the change index."

Bad: "Tests are good now." This hides command, location, result count, earlier
failure, and the fix that made the evidence trustworthy.

## Never

- Claim work is complete unless verification was run or explicitly impossible.
- Omit a dirty worktree because the changes are "obvious".
- Treat dirty `.changes/<change>` paths or `--all-active` output as active
  change proof without explicit root resolution.
- Convert uncertain memory into confirmed current state.
- Include secrets, tokens, private credentials, or unnecessary large logs.
