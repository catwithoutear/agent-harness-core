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
2. Resolve the active change explicitly. Use `.changes/<task>/` cwd,
   explicit env/config when available, or ask/record a no-change reason. Do not
   infer the active change from dirty git status alone.
3. Observe current state before planning: manifest, relevant rules, active
   change index, source files, tests, and recent validation output.
4. Choose risk tier: low, medium, or high.
5. Build a compact context packet with goal, non-goals, evidence, constraints,
   risks, and planned validation.
6. Use focused evidence skills when needed:
   - `architecture-scout` for unfamiliar ownership, entry points, or call flow.
   - `diagnose` for symptoms, failures, regressions, or unclear root cause.
   - `prototype-spike` for proposal/design feasibility risks.
   - `verification-first` for validation choice and evidence reporting.
7. Plan one bounded implementation slice. State rollback and validation.
8. Implement only the agreed slice when the user asked for implementation.
9. After meaningful code edits, run `simplify` or explicitly explain why it does
   not apply.
10. Review the slice with a review packet and gate decision.
11. Verify with repository-owned commands or source evidence.
12. Persist only high-signal results in the owning artifact. Use `reviews/` and
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
