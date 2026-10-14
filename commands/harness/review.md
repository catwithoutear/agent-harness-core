---
name: harness:review
description: Review a design, plan, diff, skill, subagent, or change packet with evidence-first gate decisions.
argument-hint: "<target path, diff, change id, or review question>"
---

# Harness Review

Use this when the user asks for a review or readiness judgment.

Input: `$ARGUMENTS`

## Required Behavior

1. Route by target:
   - `multi-lens-review` for ordinary code, commit, diff, merge request, or
     complete task review. It is the one normal code-review procedure and calls
     the applicable project-native baseline.
   - `multi-lens-design-review` for requirements, proposal, design, specs, or
     implementation-design.
   - `grill-diff` for interactive hunk review.
   - `review-packet-gate` for readiness packets, re-review, and formal
     implementation gates.
   - `skill-judge` for skills, `subagent-judge` for subagent prompts, and
     `review-verifier` for independent structured review coverage comparison.
2. Follow the current owners: `workflow-control:Review Coverage` for complete
   scope and gaps, `multi-lens-review` for the normal code procedure and ten
   dimensions, and `review-packet-gate` for packet, findings, re-review, and
   formal gates. A normal reviewer remains intent-aware and read-only. Selecting
   a skill or assigning roles cannot shrink coverage; a focused question cannot
   approve the whole task.
3. Verify claims against current files, diffs, commands, or artifacts.
   For ordinary filesystem code targets and native formal review, execute the source navigation and
   acceptance actions owned by `review-packet-gate:Source Navigation and
   Acceptance` before first dispatch and coverage acceptance. Keep them in the
   existing packet; preserve formal target-view isolation when that applies.
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
   A request such as "delegate a subagent for formal deep review" (including
   "委派 subagent 做正式深度审阅") defaults to `execution_profile=native`.
   Actually invoke the host's subagent API with a fresh context, use the managed
   packets and source-bound output acceptance, and retain complete scope and
   all owner gates. Select `isolated` only for explicitly requested strong
   isolation with an integrated provider; do not ask for conformance/signing
   credentials for native execution or silently downgrade an isolated request.
9. Give the reviewer the sealed dispatch contract. Give verifier Phase A only
   the closed-schema neutral packet emitted by `review-run.mjs phase-a-packet`;
   it must not contain expected rules, relations, dispatch, reviewer ledger,
   findings or prior conclusions. Only after both lanes seal and the discovery
   barrier closes may verifier Phase B receive the expected universe and
   reviewer results. The reviewer returns correctness findings plus a
   relation-level ledger, and the coordinator owns final synthesis.
10. For formal `protocol=review-run`, report `coverage_gate`, `review_gate`,
    `independent_review_gate`, `style_gate`, and
    `implementation_verification_gate` separately, plus the coordinator-owned
    derived `overall_gate`. `quick`, `standard`, and `deep`
    are assurance levels within this one protocol; missing required evidence
    remains fail-closed `NOT_READY`. Ordinary reviews return findings, a qualified
    conclusion, and evidence gaps without claiming formal gate approval.

## Output

- Findings:
- Gate decision (formal review-run) or qualified conclusion (ordinary review):
- Evidence checked:
- Missing evidence:
- Residual risk:
- Suggested artifact update:

If there are no findings, say that clearly and name remaining test or evidence
gaps.

## Review-Run Contract

For `protocol=review-run`, create the managed run root with `init-review-run`
and follow `review-packet-gate:Execution Selection` and `Dispatch And Return`.
Native admission validates the actual selected source snapshot; explicitly
isolated execution requires provider capability/conformance preflight.
Extract rather than hand-write the Phase-A packet. Seal discovery, enter
planning, persist the shard plan, and dispatch through separate machine
transitions. Discover the expected and observed universes
through two independent lanes and close the discovery barrier before
comparison. Resolve coding/behavioral authority and versioned dimensions,
enumerate the changed-surface hunk/line inventory and context fixed point, and
derive immutable relation/integration obligations with canonical `{id,digest}`
identity. Dispatch reviewers by unit/context cluster with exactly-once primary
ownership, conserve raw output into outcome/finding records, and derive
`conclusion` separately from `execution_status`. Persist `gate-result` with the
five evidence gates plus the derived `overall_gate`, and fail closed on any
missing, stale, conflicting, or uncomparable input.

Admit every reviewer attempt with explicit run/attempt deadlines and retry
budget. Persist diagnostic checkpoints as non-gating evidence, sweep expired
attempts into typed failed ledgers, and never reuse a contaminated execution
identity under a different run id. Keep coordinator-only source inspection in
`coordinator_source_assessment`; it cannot populate `review_gate`.
