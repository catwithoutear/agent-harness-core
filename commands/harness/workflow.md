---
name: harness:workflow
description: Run an evidence-gated harness workflow from current repo state through plan, implementation, review, verification, and handoff.
argument-hint: "<goal or change request>"
---

# Harness Workflow

Use this for non-trivial repository work that needs the core control loop.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `workflow-control` when it is installed. Enable continuous
   convergence only when the active request combines both a workflow-use signal
   and an overall-completion signal such as converge, continue until complete,
   close all remaining gaps, or continue until acceptance criteria pass.
   Invoking this workflow command supplies the workflow-use signal. Interpret
   the completion signal semantically rather than requiring a fixed phrase,
   word order, or language. If both signals exist, continue until the overall
   objective passes its acceptance criteria; do not interpret the request as a
   single workflow pass or wait for another "continue" message.
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
18. Route structured reviews through the single `protocol=review-run` contract.
    Assurance labels are not route selectors. Validate target identity, the
    immutable dispatch contract, risk facts, and request identity before
    dispatch. The same rules, scope, dimensions, relation identities, contract
    digest, and target go to reviewer and verifier. The verifier inventory gets
    no reviewer ledger or findings; discovery and shard closure are barriers
    before compare. Target, source, or closure failure is
    `coverage_gate=NOT_READY`.
19. Carry four independent decisions: `coverage_gate`, `review_gate`,
    `implementation_verification_gate`, and coordinator-owned `overall_gate`.
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
    resumes from that action. Pause only with `NEEDS_USER_DECISION` when an
    owner-controlled decision cannot be resolved from accepted requirements and
    current evidence. State the decision and ask the smallest necessary
    question instead of returning a progress-only handoff.

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
the next convergence iteration unless it requires `NEEDS_USER_DECISION`.

## Review-Run Routing

For `protocol=review-run`, initialize the managed run root, persist the dispatch
contract and routing decision, seal verifier discovery before reviewer-ledger
compare, and retain immutable control revisions and attempts. The reviewer and
verifier receive the same contract digest but remain isolated. Never infer N/A
or completeness from a summary; aggregate the relation ledger and persist all
four gates, with missing implementation evidence yielding
`implementation_verification_gate=NOT_READY` and `overall_gate=NOT_READY`.
`quick`, `standard`, and `deep` are assurance levels inside this one protocol;
they do not select a different route or compatibility parser.
