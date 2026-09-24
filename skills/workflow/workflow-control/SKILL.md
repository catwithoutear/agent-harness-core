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
3. When custom code is proposed, apply the Minimal Implementation Gate after
   understanding the behavior and before selecting the implementation approach.
4. Choose the lightest path that fits the work.
5. When the solution is not settled, draft and challenge a proposal, then write
   and review the solution design.
6. After the solution-design review is ready, apply the
   implementation-design trigger rule.
7. When the trigger applies, create and review the implementation-design pack
   before task slicing.
8. Create bounded task slices with validation and rollback, then review the
   task set before implementation.
9. Implement only the current slice.
10. Run a behavior-preserving simplify pass for non-trivial code edits.
11. Review the slice against the packet and plan.
12. Verify with commands or source evidence.
13. Persist the result in the owning artifact or handoff.

If a review or implementation discovery changes an accepted solution decision,
return to solution design and reassess dependent implementation design and task
slices. Do not repair a changed design inside a downstream artifact.

## Continuous Convergence

For execution requests, continue authorized work until the overall objective
satisfies its acceptance criteria. No workflow keyword or fixed phrase is
required. Respect explicit plan-only, review-only, budget, and staged-stop
requests; completion never grants additional action authority or scheduling.

| Instruction | Result |
|---|---|
| `按照 workflow 收敛` | Continue authorized work to the overall objective. |
| `continue until complete` | Continue authorized work to the overall objective. |
| `use the workflow to inspect the current state` | Complete the inspection only; no implementation authority. |
| `plan first and wait for approval` | Deliver the plan and stop before implementation. |

Record the overall objective and its acceptance criteria in the context packet,
then continue without asking the user to send another "continue" message.

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
to make the user request continuation again. When a decision needs user
authority, pause dependent work with
`NEEDS_USER_DECISION`: name the owner-controlled decision, show why current
requirements and evidence cannot resolve it, and ask the smallest necessary
question. Existing safety, authority, and external-action boundaries still
apply; when crossing one requires owner authorization, represent that boundary
as the required decision rather than silently broadening scope. If an external
blocker persists after reasonable safe attempts, report partial status, the
missing capability/input, and the next action; do not loop indefinitely or claim
completion. Continue independent authorized work when possible.

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

Resolve ordinary technical uncertainty through bounded source inspection first.
Escalate from the fast or compact path only when material behavior, compatibility,
ownership, lifecycle, migration, or dependency decisions remain unresolved.

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

Write non-trivial findings into the owning `.changes` artifact only when task
record writes are authorized. For read-only work, return evidence in the
response unless the user requests a file deliverable. These skills produce
evidence for `change-planner`, `review-packet-gate`, and handoff; they
do not replace task slicing, review, or implementation.

## Minimal Implementation Gate

When a design, plan, task slice, or implementation would add custom code, read
[`references/minimal-implementation.md`](references/minimal-implementation.md).
Apply its ordered decision ladder only after the current behavior, callers,
ownership, invariants, and failure boundaries are understood. Prefer the first
safe level that completely satisfies the current requirement.

Carry the compact disposition into the plan or task slice when the choice is
material. Reuse `diagnose` for unproven root cause and `verification-first` for
the narrowest credible runnable check; do not recreate either protocol inside
the gate.

## Harness Behavior Evaluation

When evaluating a minimality instruction or role change itself, read
[`references/minimality-behavior-evaluation.md`](references/minimality-behavior-evaluation.md).
Use its fair isolated A/B contract after the candidate instruction paths are
settled. Keep instrument self-check, repository validation, and a real live agent
A/B result distinct; none substitutes for another.

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
- minimal-implementation disposition when custom code is proposed,
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

Ordinary source review and optional fresh lenses may produce a report without
formal coverage assurance. Do not require review-run to report a source-proven
defect. Formal structured reviews use the single unversioned
`protocol=review-run` route.
Do not select a route from assurance labels, Markdown shape, provider, or a
reviewer assertion, and do not fall back to an older review protocol. Validate
the request, target identity, risk facts, and immutable dispatch contract before
dispatching either agent; malformed input is `NOT_READY`.

Persist the exact rules, scope, dimensions, and relation identities in the
dispatch contract and give it to the reviewer. Verifier Phase A receives only
the machine-built closed-schema neutral packet after provider capability and
runtime-conformance preflight; expected rules, relations, dispatch, reviewer
output and prior conclusions are forbidden. After both lanes seal, Phase B may
compare the sealed universes and reviewer ledger. The coordinator alone
composes `overall_gate`.

The `requested_assurance` values `quick`, `standard`, and `deep` control the
amount of evidence inside this one protocol. They do not select different
protocols. Requested or risk-mandated formal independent coverage assurance uses
the review-run lifecycle. A fresh independent perspective alone is not a request
for formal coverage assurance. Never downgrade an applicable formal gate
without owner authorization or claim equivalent assurance from a plain review.
Reviewer outcomes carry `execution_status` separately from the derived
`conclusion`; immutable `ReviewFinding` records preserve
`blocking_class` and evidence, and no finding is hidden by a later clear retry.

The managed lifecycle is `created -> target-view-sealed -> run-binding-sealed ->
dual-discovery-open -> discovery-barrier-closed -> dispatch-sealed -> reviewing ->
review-facts-closed -> outcomes-selected -> verifier-compared -> gated ->
completed|invalidated`. Initialize the run root with `init-review-run`; persist
canonical subject, authority, dimension, surface, context, obligation, dispatch,
output, finding, invalidation, and gate records below `review-runs/<run-id>/`.
The discovery barrier closes only after both expected and observed lanes seal
and their attestations verify. Failed, cancelled, stale, duplicate, and
unassigned work remains visible, and missing target, source, or implementation
evidence is fail-closed.

The portable facade additionally enforces
`created -> discovering -> discovery-sealed -> planning -> dispatch-ready ->
running -> aggregating -> terminal`. Admit reviewer attempts with explicit
deadlines and bounded retries. Diagnostic checkpoints remain non-gating;
timeout sweeps persist typed failed ledgers. A different run id cannot sanitize
a provider execution identity that already saw expected-lane data.

For formal review-run results, always carry the five evidence gates —
`coverage_gate`, `review_gate`,
`independent_review_gate`, `style_gate`, and `implementation_verification_gate`
— plus the coordinator-owned derived `overall_gate`. Missing required evidence
yields `NOT_READY`; a completed coverage comparison does not override a
correctness or verification blocker, and `overall_gate` is never READY unless
all five evidence gates are READY.

## Council Handling

Council is not majority vote. Use one synthesizer over multiple independent
positions. Preserve the evidence quality, minority concerns, and the final
decision owner. Do not use council for routine disagreement, style preference,
or missing basic context.

## Common Mistakes

- Starting from a remembered plan without re-reading current files.
- Selecting custom code before applying the Minimal Implementation Gate.
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
