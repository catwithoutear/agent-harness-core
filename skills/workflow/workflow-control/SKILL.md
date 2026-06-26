---
name: workflow-control
description: Use when agent work needs an evidence-gated workflow, active change coordination, implementation slicing, council escalation, or handoff discipline.
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
3. Apply the implementation-design trigger rule before task slicing.
4. Plan one bounded slice with validation and rollback.
5. Implement only the slice.
6. Run a behavior-preserving simplify pass for non-trivial code edits.
7. Review the slice against the packet and plan.
8. Verify with commands or source evidence.
9. Persist the result in the owning artifact or handoff.

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

Create or require an `implementation-design/` topology pack before task slicing
when any of these are true:

- the change crosses subsystem boundaries;
- the change touches two or more modules with dependency-order risk;
- the design introduces lifecycle, state transition, concurrency, failure,
  rollback, migration, or idempotency semantics;
- implementation needs explicit dependency bans, file/class ownership, or test
  seam mapping to keep agents from improvising structure.

For localized work that does not meet those triggers, record an explicit
no-design reason in the plan or task slice and continue with the lightweight
path. Do not create a seven-file pack just to fill empty tables.

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
- `NOT_READY`: stop and fix missing evidence, design, validation, or scope.
- `NEEDS_USER_DECISION`: user ownership is required.
- `NEEDS_COUNCIL`: high-risk independent evidence conflicts need synthesis.

Only the coordinator should emit `NEEDS_COUNCIL`. Specialist agents can say the
evidence conflicts and recommend escalation.

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
- Writing process artifacts that do not identify the current repo state.
