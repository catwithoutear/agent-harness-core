---
name: multi-lens-design-review
description: Use when reviewing requirements, proposals, design docs, implementation plans, task sets, or artifact chains through multiple design-risk lenses before readiness or freeze.
---

# Multi-Lens Design Review

Use this as a design-readiness orchestrator. It reviews planning artifacts
through focused lenses, then synthesizes one readiness decision with evidence.
It does not rewrite artifacts unless the user explicitly asks for edits.

## Inputs

Accept any design target:

- requirements, proposal, design, implementation plan, or task document,
- a directory of related planning artifacts,
- issue notes, architecture drafts, specs, or pasted design text,
- a full repository-owned change workspace when the target repo has one.

If the target is ambiguous, inspect the current repository state and ask only
when multiple plausible targets would change the review.

## Protocol

1. Preserve review-only boundaries unless edits are requested.
2. Read upstream artifacts before downstream artifacts when an artifact chain
   exists.
3. Identify frozen decisions, open questions, explicit deferrals, validation
   evidence, and owner assumptions.
4. Select only lenses justified by the artifact shape and risk.
5. Dispatch independent passes only for separable design risks.
6. Synthesize one readiness report with blockers, should-fix notes, accepted
   deferrals, and residual unknowns.
7. Do not declare a design ready while blocking ambiguity, contradiction, or
   missing implementation contract remains.

## Design Lenses

Use these lens families as needed:

- `boundary_contracts`: module ownership, APIs, data contracts, dependency
  direction, compatibility, and non-goals.
- `control_lifecycle`: state transitions, lifecycle ownership, retry,
  idempotency, concurrency, cleanup, and feedback loops.
- `failure_recovery`: failure modes, rollback, partial failure, migration,
  recovery semantics, and fallback behavior.
- `verification_observability`: testability, validation matrix, logs, metrics,
  audit points, troubleshooting, and evidence gaps.
- `implementation_readiness`: file/module anchors, sequencing, handoff clarity,
  task slicing, and missing developer guidance.
- `artifact_chain`: consistency between upstream goals, design decisions,
  implementation tasks, review notes, and timeline/status evidence.

Do not run all lenses by default. Select the smallest set that can falsify the
readiness claim.

## Evidence Rules

- Quote or cite the artifact text that motivates each finding.
- Cross-check upstream decisions before claiming contradiction.
- Mark inferred concerns as `Needs Confirmation` unless source or artifact
  evidence proves the risk.
- Separate "missing from design" from "intentionally deferred."
- When code already exists, cite code only to confirm design feasibility or
  implementation mismatch; the primary review target remains the design.

## Decision

Use the shared readiness vocabulary:

- `READY`: no blocking design issue remains.
- `READY_WITH_NOTES`: implementation may proceed, but named residual risks or
  deferrals must travel forward.
- `NOT_READY`: blocking ambiguity, contradiction, missing contract, or missing
  validation prevents implementation/freeze.
- `NEEDS_USER_DECISION`: product, policy, ownership, or scope intent cannot be
  inferred from artifacts.
- `NEEDS_COUNCIL`: coordinator-only escalation for high-risk independent
  evidence conflict.

## Example Gate

Target: a design proposes a new import retry path and task list.

Selected lenses:

- `boundary_contracts` because the retry policy is shared with the CLI.
- `failure_recovery` because partial import can leave persisted state.
- `verification_observability` because the test plan only covers success.

Decision: `NOT_READY` if the design never states who owns retry exhaustion and
rollback. Decision: `READY_WITH_NOTES` if rollback is explicitly deferred with
owner, risk, and a validation follow-up.

## Common Mistakes

- Freezing a design because it is well written but not implementable.
- Treating missing code anchors as a prose-quality issue rather than a
  readiness issue.
- Running every lens and burying the real blocker.
- Rewriting the design during a review-only pass.
- Losing accepted deferrals during synthesis.
