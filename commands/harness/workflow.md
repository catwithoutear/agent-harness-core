---
name: harness:workflow
description: Run an evidence-gated harness workflow from current repo state through plan, implementation, review, verification, and handoff.
argument-hint: "<goal or change request>"
---

# Harness Workflow

Use this for non-trivial repository work that needs the core control loop.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `workflow-control` when it is installed. For execution requests,
   continue authorized work until the overall objective satisfies its acceptance
   criteria; no workflow keyword or fixed phrase is required. Respect plan-only,
   review-only, budget, and staged-stop requests. Do not wait for another
   "continue" message when a safe in-scope next action remains.
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
9. Choose the lightest valid path:
   - fast: for work that changes no behavior, interface, lifecycle, dependency,
     migration, or failure contract, observe, make the local edit, and verify;
   - compact: record the bounded goal, affected source, no-design/no-pack
     reason, validation, and rollback, then review when risk warrants it;
   - design: challenge the proposal, then write and review the solution design.
10. On the design path, apply the implementation-design trigger only after the
    solution-design review is ready. Require a populated and reviewed
    `implementation-design/` pack when work crosses subsystem boundaries,
    touches 2+ modules with dependency risk, adds lifecycle/failure semantics,
    or needs dependency/file/class/test-seam constraints.
11. Derive bounded task slices from the accepted solution or reviewed pack.
    Review the complete task set before implementation dispatch. File presence
    and structural validation are not semantic readiness evidence.
12. Implement only the agreed slice when the user asked for implementation.
13. If implementation changes an accepted solution decision, return to solution
    design and revisit dependent pack and task evidence.
14. After meaningful code edits, run `simplify` or explicitly explain why it does
    not apply.
15. Review the slice with a review packet and gate decision.
16. Verify with repository-owned commands or source evidence.
17. Persist only high-signal results in the owning artifact. Use `reviews/` and
   `timeline/` sparingly; do not create process logs for routine steps.
18. Ordinary reviews and fresh perspectives may report source-proven findings
    without formal coverage assurance. Route formal structured reviews through
    the single `protocol=review-run` contract.
    Assurance labels are not route selectors. Validate target identity, the
    immutable dispatch contract, risk facts, and request identity before
    dispatch. The reviewer gets the sealed dispatch contract. Verifier Phase A
    gets only the machine-built neutral packet; expected rules, relations,
    dispatch, reviewer ledger, findings and prior conclusions are forbidden
    until both lanes seal. Discovery, planning and dispatch are separate
    machine barriers before compare. Target, source, or closure failure is
    `coverage_gate=NOT_READY`.
19. For formal review-run results, carry five evidence decisions:
    `coverage_gate`, `review_gate`, `independent_review_gate`, `style_gate`, and
    `implementation_verification_gate`, plus coordinator-owned `overall_gate`.
    A deep downgrade requires an owner-recorded reason and residual risk.
20. After every implementation, review, correction, or verification iteration,
    evaluate the overall objective separately from phase and slice gates. If it
    is incomplete, take the smallest safe in-scope next action and re-enter the
    appropriate phase. Findings, failed checks, `NOT_READY`, incomplete work,
    missing evidence, and ordinary technical uncertainty are continuation input,
    not completion. Continue without asking the user to say "continue".
21. Treat `READY` as permission to advance one phase. Treat
    `READY_WITH_NOTES` as overall completion only when every residual note is
    explicitly allowed by the acceptance criteria; otherwise continue with the
    notes as open work.
22. A handoff or context-compaction checkpoint must preserve the objective,
    current evidence, remaining gaps, and exact next action, then continuation
    resumes from that action. Pause dependent work with `NEEDS_USER_DECISION`
    when an owner-controlled decision cannot be resolved from accepted requirements and
    current evidence. State the decision and ask the smallest necessary
    question. An external blocker persisting after reasonable safe attempts may
    require a partial handoff with the missing capability and exact next action;
    continue independent authorized work and never imply completion.

## Output

- Active change:
- Risk tier:
- Context packet:
- Plan for this slice:
- Skills/agents used:
- Review gate:
- Verification:
- Overall objective status:
- Convergence next action:
- Persisted artifacts:
- Remaining risks:

Do not report the task complete without naming the exact verification run, not
run, blocked, or intentionally skipped and showing that every applicable
acceptance criterion passes. A non-complete verification status remains work for
the next convergence iteration unless an explicit stop boundary or an unresolved
external blocker prevents it.

## Review-Run Routing

For `protocol=review-run`, initialize the managed run root, pass provider
preflight, extract the closed Phase-A packet, and enforce
`discover -> begin-planning -> plan -> dispatch` as separate transitions before
reviewer-ledger comparison. Retain immutable control revisions and attempts.
Never infer N/A or completeness from a summary; aggregate the relation ledger
and persist all five evidence gates plus overall, with missing implementation evidence yielding
`implementation_verification_gate=NOT_READY` and `overall_gate=NOT_READY`.
`quick`, `standard`, and `deep` are assurance levels inside this one protocol;
they do not select a different route or compatibility parser.
