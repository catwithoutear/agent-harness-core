---
name: workflow-control
description: Use when agent work needs an evidence-gated workflow, continuous convergence, active change coordination, implementation slicing, council escalation, or handoff discipline.
---

# Workflow Control

Use the repository's current files and commands as authority. The loop exists to
prevent agents from planning from stale memory, implementing more than the
agreed slice, or closing work without reviewable evidence.

## Risk Tiers

- Low: docs, formatting, tiny metadata updates. Use a lightweight context packet
  and direct verification.
- Medium: normal feature, workflow, or tooling changes. Use a written plan,
  bounded implementation slice, review packet, and command evidence.
- High: cross-client harness behavior, migrations, security, destructive
  operations, ambiguous ownership, or conflicting reviews. Use independent
  review and council handling when evidence conflicts.

Low risk is not no process. It still needs current-state observation and an
honest final verification statement.

## Loop

1. Observe the current state before planning.
2. Build a compact context packet from verified sources.
3. Choose the lightest path that fits the work.
4. When the solution is not settled, draft and challenge a proposal, then write
   and review the solution design.
5. After the solution-design review is ready, apply the
   implementation-design trigger rule.
6. When the trigger applies, create and review the implementation-design pack
   before task slicing.
7. Create bounded task slices with validation and rollback, then review the
   task set before implementation.
8. Implement only the current slice.
9. Run a behavior-preserving simplify pass for non-trivial code edits.
10. Review the slice against the packet and plan.
11. Verify with commands or source evidence.
12. Persist the result in the owning artifact or handoff.

If a review or implementation discovery changes an accepted solution decision,
return to solution design and reassess dependent implementation design and task
slices. Do not repair a changed design inside a downstream artifact.

## Continuous Convergence

Activate continuous convergence only when the current instruction or still-active
user context combines both signals:

1. a workflow-use signal: an explicit request to use or follow a `workflow` or
   equivalent workflow reference; and
2. an overall-completion signal: an explicit intent to converge, continue until
   complete, pass all acceptance criteria, close the remaining gaps, or otherwise
   keep going until the whole objective is done.

Interpret the combination semantically. Do not require a fixed phrase, word
order, language, or exact spelling. A workflow request without overall-completion
intent uses the ordinary workflow. Completion intent without a workflow-use
signal does not activate this specific convergence contract.

| Instruction | Result |
|---|---|
| `按照 workflow 收敛` | Activate continuous convergence. |
| `使用 workflow 持续推进直到完成` | Activate continuous convergence. |
| `走 workflow，把剩余问题全部闭环` | Activate continuous convergence. |
| `follow the workflow until the overall goal is complete` | Activate continuous convergence. |
| `use the workflow and continue until all acceptance criteria pass` | Activate continuous convergence. |
| `use the workflow to inspect the current state` | Ordinary workflow; no overall-completion signal. |
| `continue until complete` | Do not activate this contract; no workflow-use signal. |

When both signals exist, treat the instruction as a terminal condition, not as a
request for one workflow pass. Record the overall objective and its acceptance
criteria in the context packet, then continue without asking the user to send
another "continue" message.

After each implementation, review, correction, or verification iteration:

1. Evaluate the overall objective against the user request, accepted decisions,
   and applicable acceptance criteria. Do not substitute a phase, slice, review,
   or command gate for objective completion.
2. If the objective is incomplete, select the smallest safe in-scope next action
   and re-enter the appropriate workflow phase.
3. Treat findings, failed checks, incomplete work, missing evidence, and ordinary
   technical uncertainty as inputs to the next iteration. Diagnose, correct,
   review, and rerun the smallest credible verification instead of stopping at
   `NOT_READY` or returning a progress-only handoff.
4. If downstream evidence changes an accepted decision, return to its owning
   design artifact before continuing dependent work.
5. Repeat until the overall objective satisfies every applicable acceptance
   criterion or an owner-controlled decision cannot be resolved from current
   authority and evidence.

`READY` advances only the current phase. `READY_WITH_NOTES` completes the
overall objective only when every residual note is explicitly allowed by the
acceptance criteria; otherwise carry the notes into the next iteration.

A handoff or context-compaction checkpoint preserves the objective, evidence,
remaining gaps, and exact next action. It is not completion and must not be used
to make the user request continuation again. Pause convergence only with
`NEEDS_USER_DECISION`: name the owner-controlled decision, show why current
requirements and evidence cannot resolve it, and ask the smallest necessary
question. Existing safety, authority, and external-action boundaries still
apply; when crossing one requires owner authorization, represent that boundary
as the required decision rather than silently broadening scope.

## Workflow Paths

- Fast path: low-risk wording, formatting, or similarly local work that does not
  change behavior, interfaces, lifecycle, dependencies, migration, or failure
  contracts. Observe, make the narrow edit, and verify it. A proposal, design,
  pack, and task set are unnecessary.
- Compact path: bounded implementation with a settled solution and no
  implementation-design trigger. Record the goal, affected source, why design
  and the pack are unnecessary, validation, and rollback in a plan or slice.
  Review that lightweight plan when the risk warrants it.
- Design path: use proposal and challenge, reviewed solution design,
  implementation-design assessment, a reviewed pack when required, and a
  reviewed task set before implementation.

Uncertainty about behavior, compatibility, ownership, lifecycle, migration, or
dependency order disqualifies the fast and compact paths.

## Evidence Skills

Use focused evidence skills inside the loop instead of stretching the coordinator
role:

- `architecture-scout`: before planning when entry points, ownership, call flow,
  or local precedent is unclear.
- `diagnose`: before proposing or editing when a bug, failed test, regression,
  symptom, or root cause is unclear.
- `prototype-spike`: while proposal or design is still draft when a bounded
  experiment is needed to answer feasibility or design-risk questions.
- `verification-first`: during planning, implementation, review, and handoff to
  select or report the smallest credible validation loop.

Write non-trivial findings into the owning `.changes` artifact. These skills
produce evidence for `change-planner`, `review-packet-gate`, and handoff; they
do not replace task slicing, review, or implementation.

## Implementation-Design Trigger Rule

Assess whether an `implementation-design/` topology pack is required only after
the solution design is settled and its review is ready. Require the pack before
task slicing when any of these are true:

- the change crosses subsystem boundaries;
- the change touches two or more modules with dependency-order risk;
- the design introduces lifecycle, state transition, concurrency, failure,
  rollback, migration, or idempotency semantics;
- implementation needs explicit dependency bans, file/class ownership, or test
  seam mapping to keep agents from improvising structure.

For localized work that does not meet those triggers, record an explicit
no-design reason in the plan or task slice and continue with the lightweight
path. Do not create a seven-file pack just to fill empty tables.

When a pack is required, directory presence is not readiness. Read the populated
pack and require a ready review before creating task slices. Review the complete
task set before implementation dispatch.

## Fast Path Examples

Low-risk docs wording:

- Observe: read the target doc and current status.
- Packet: one sentence naming file, goal, and validation.
- Plan: edit one paragraph.
- Verify: run formatting or validator if the repo owns one.
- Persist: final answer can be enough when no change workspace is active.

Medium-risk skill update:

- Observe: read the skill, manifest entry, and current tests.
- Packet: name the behavior gap and trigger boundary.
- Plan: one bounded edit plus one regression check.
- Review: compare the example against the failure mode it should prevent.
- Verify: run skill validation and package tests.

## Packets

Context packet:

- goal and non-goals,
- active change or explicit no-change reason,
- relevant source files and current state,
- constraints, risks, and owner questions,
- planned validation.

Review packet:

- scope reviewed,
- intended behavior and design source,
- owning subsystem and module when implementation-design exists,
- diff or artifact paths,
- validation already run,
- findings and residual risks.

Handoff packet:

- current phase,
- changed files,
- exact commands and results,
- unresolved questions,
- next checkpoint.

## Gate Decisions

Use shared gate vocabulary:

- `READY`: proceed.
- `READY_WITH_NOTES`: proceed, but carry named residual notes.
- `NOT_READY`: do not advance; fix missing evidence, design, validation, or
  scope and re-evaluate. During continuous convergence this is not terminal.
- `NEEDS_USER_DECISION`: user ownership is required.
- `NEEDS_COUNCIL`: high-risk independent evidence conflicts need synthesis.

Only the coordinator should emit `NEEDS_COUNCIL`. Specialist agents can say the
evidence conflicts and recommend escalation.

## Review-Run Routing

All structured reviews use the single unversioned `protocol=review-run` route.
Do not select a route from assurance labels, Markdown shape, provider, or a
reviewer assertion, and do not fall back to an older review protocol. Validate
the request, target identity, risk facts, and immutable dispatch contract before
dispatching either agent; malformed input is `NOT_READY`.

Persist the exact rules, scope, dimensions, and relation identities in the
dispatch contract. Give the same contract digest and target to the reviewer and
the verifier. The reviewer owns correctness findings and a relation-level
ledger. The verifier inventory receives no reviewer output, seals discovery and
the shard plan, then compares that sealed universe with the reviewer ledger.
The coordinator alone composes `overall_gate`.

The `requested_assurance` values `quick`, `standard`, and `deep` control the
amount of evidence inside this one protocol. They do not select different
protocols. Any requested or risk-mandated independent coverage must use the
review-run lifecycle and preserve every relation as `covered`, `not-covered`,
or reviewer-authorized `not-applicable` with evidence.

The managed lifecycle is `created -> discovering -> planning -> running ->
aggregating -> completed|cancelled|invalidated`. Initialize the run root with
`init-review-run`; persist canonical request, routing, discovery, shard,
ledger, aggregate, control, and gate-result records below
`review-runs/<run-id>/`. Discovery and shard closure are barriers before
comparison. Failed, cancelled, stale, duplicate, and unassigned work remains
visible, and missing target, source, or implementation evidence is fail-closed.

Always carry the four independent decisions:
`coverage_gate`, `review_gate`, `implementation_verification_gate`, and
coordinator-owned `overall_gate`. Missing required evidence yields
`NOT_READY`; a completed coverage comparison does not override a correctness or
verification blocker.

## Council Handling

Council is not majority vote. Use one synthesizer over multiple independent
positions. Preserve the evidence quality, minority concerns, and the final
decision owner. Do not use council for routine disagreement, style preference,
or missing basic context.

## Common Mistakes

- Starting from a remembered plan without re-reading current files.
- Expanding the slice while implementing.
- Skipping the simplify pass after meaningful code edits.
- Treating warnings as harmless without deciding whether they block freeze.
- Coding from a design that has prose but no topology, file/class mapping,
  lifecycle/failure flow, implementation order, or constraints.

- Ending after code review without running the planned verification.
- Treating a completed phase, a `READY_WITH_NOTES` gate, or a handoff as overall
  completion during explicit continuous convergence.
- Returning `NOT_READY` without taking the next safe correction and verification
  step when no owner decision is required.
- Writing process artifacts that do not identify the current repo state.
