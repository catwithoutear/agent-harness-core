---
name: harness:workflow
description: Run an evidence-gated harness workflow from current repo state through plan, implementation, review, verification, and handoff.
argument-hint: "<goal or change request>"
---

# Harness Workflow

Use this for non-trivial repository work that needs the core control loop.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `workflow-control` when it is installed.
2. Resolve `state_root`, `code_root`, and `active_change` explicitly before any
   regulated write. Prefer
   `harness-change-doc --state-root <state-root> --code-root <code-root> resolve --change <change> --json`
   when a change id is known; otherwise use cwd under `.changes/<change>/`,
   approved `HARNESS_CHANGE_STATE_ROOT`, or an explicit coordinator decision.
   Do not infer the active change from dirty git status alone.
3. If an `execution-map.md` exists, treat it as the scheduling authority for
   multi-worktree work. Read it with
   `harness-change-doc --state-root <state-root> execution-map <change> --json`
   and update assignments only through
   `harness-change-doc --state-root <state-root> assign-slice <change> ...`.
   `Worktree` is a local execution coordinate, and gated statuses must point
   `Last Evidence` at change-relative durable evidence.
4. Stop before writes when root resolution is ambiguous, especially in linked
   worktrees. Retry only after selecting one canonical `state_root`; `code_root`
   remains the source checkout where implementation commands run.
5. Observe current state before planning: manifest, relevant rules, active
   change index, source files, tests, and recent validation output.
6. Choose risk tier: low, medium, or high.
7. Build a compact context packet with goal, non-goals, evidence, constraints,
   risks, and planned validation.
8. Use focused evidence skills when needed:
   - `architecture-scout` for unfamiliar ownership, entry points, or call flow.
   - `diagnose` for symptoms, failures, regressions, or unclear root cause.
   - `prototype-spike` for proposal/design feasibility risks.
   - `verification-first` for validation choice and evidence reporting.
9. Apply the implementation-design trigger rule before task slicing. Require an
   `implementation-design/` topology pack when work crosses subsystem
   boundaries, touches 2+ modules with dependency risk, adds lifecycle/failure
   semantics, or needs dependency/file/class/test-seam constraints. Otherwise
   record the no-design reason.
10. Plan one bounded implementation slice. State scope, subsystem, module,
   changed surfaces, prerequisites, validation, rollback, and review owner.
11. Implement only the agreed slice when the user asked for implementation.
12. After meaningful code edits, run `simplify` or explicitly explain why it does
   not apply.
13. Review the slice with a review packet and gate decision.
14. Verify with repository-owned commands or source evidence.
15. Persist only high-signal results in the owning artifact. Use `reviews/` and
   `timeline/` sparingly; do not create process logs for routine steps.

## Output

- Active change:
- Risk tier:
- Context packet:
- Plan for this slice:
- Skills/agents used:
- Review gate:
- Verification:
- Persisted artifacts:
- Remaining risks:

Do not close the task without naming exact verification run, not run, blocked,
or intentionally skipped.
