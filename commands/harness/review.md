---
name: harness:review
description: Review a design, plan, diff, skill, subagent, or change packet with evidence-first gate decisions.
argument-hint: "<target path, diff, change id, or review question>"
---

# Harness Review

Use this when the user asks for a review or readiness judgment.

Input: `$ARGUMENTS`

## Required Behavior

1. Choose the narrowest review skill:
   - `review-packet-gate` for readiness packets and implementation gates.
   - `multi-lens-design-review` for requirements, proposal, design, specs, or
     implementation-design.
   - `multi-lens-review` for explicit multi-lens or fresh outside review.
   - `skill-judge` for skills.
   - `subagent-judge` for subagent prompts.
   - `review-verifier` for independent structured review coverage comparison.
2. Read the target and its intent sources before judging.
3. Verify claims against current files, diffs, commands, or artifacts.
4. Lead with findings ordered by severity. Avoid summary-first review output.
5. Separate blockers, should-fix items, notes, and residual risk.
6. If evidence conflicts at high risk, recommend council handling through
   `workflow-control`; do not convert council into majority voting.
7. Record review results in `reviews/` only for formal gates, council,
   re-review, or freeze decisions.
8. Route every structured review through the single `protocol=review-run`
   contract. Assurance labels are not route selectors. Validate the target,
   immutable dispatch contract, risk facts, and request identity before
   dispatching either reviewer or verifier; malformed input is `NOT_READY`.
9. Give reviewer and verifier the same rules, scope, dimensions, relation
   identities, contract digest, and target. The verifier inventory receives no
   reviewer ledger or findings; it seals discovery and shard closure before
   comparison. The reviewer returns correctness findings plus a relation-level
   ledger, and the coordinator owns final synthesis.
10. Report `coverage_gate`, `review_gate`, `independent_review_gate`,
    `style_gate`, and `implementation_verification_gate` separately, plus the
    coordinator-owned derived `overall_gate`. `quick`, `standard`, and `deep`
    are assurance levels within this one protocol; missing required evidence
    remains fail-closed `NOT_READY`.

## Output

- Findings:
- Gate decision:
- Evidence checked:
- Missing evidence:
- Residual risk:
- Suggested artifact update:

If there are no findings, say that clearly and name remaining test or evidence
gaps.

## Review-Run Contract

For `protocol=review-run`, create the managed run root with `init-review-run`
and seal the neutral run binding. Discover the expected and observed universes
through two mutually-isolated lanes and close the discovery barrier before
comparison. Resolve coding/behavioral authority and versioned dimensions,
enumerate the changed-surface hunk/line inventory and context fixed point, and
derive immutable relation/integration obligations with canonical `{id,digest}`
identity. Dispatch reviewers by unit/context cluster with exactly-once primary
ownership, conserve raw output into outcome/finding records, and derive
`conclusion` separately from `execution_status`. Persist `gate-result` with the
five evidence gates plus the derived `overall_gate`, and fail closed on any
missing, stale, conflicting, or uncomparable input.
