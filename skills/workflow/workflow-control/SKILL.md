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

Follow the canonical loop and its return-to-design rule in
`rules/loop-contract.md` (projected as `.rules/loop-contract.md`). This skill
supplies the risk tiers, required materials, review coverage, gate vocabulary,
and packets used at each step.

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

## Required Materials

Use one workflow loop; material requirements follow the work, not a selected
mode. These conditions never reduce review scope or dimension coverage:

- For low-risk wording, formatting, or similarly local work that does not
  change behavior, interfaces, lifecycle, dependencies, migration, or failure
  contracts, a context packet and direct edit/verification suffice. A separate
  proposal, design, pack, and task set are unnecessary.
- For bounded implementation with a settled solution and no
  implementation-design trigger, record goal, affected source, explicit
  no-design/no-pack reason, validation, and rollback in a plan or slice.
  Review that lightweight plan when the risk warrants it.
- When material behavior, compatibility, ownership, lifecycle, migration, or
  dependency decisions remain unresolved after bounded source inspection,
  challenge a proposal and review solution design. Record each still-open design
  choice with the comparison in
  `rules/loop-contract.md:Solution Decision Record` before that review. Apply
  the pack trigger after solution-design review, then review the required pack
  and complete task set before implementation.

## Requirement Intake And Change Relations

Requirement intake precedes solution design. Fill the active change's
`requirements.md` with the original request and why it is being acted on now,
the problem and current workaround, at least one success signal observable
outside the change, non-goals, and open questions. Mark inferred content as
inferred and carry it to `## Open Questions`; do not present a guess as a stated
requirement. Low-risk work may use a compact form: why, one success signal, and
the validation that shows it, omitting empty sections instead of inventing
content. Intake completeness is a review judgment, not a validator field check.

Declare change coupling in the index `## Change Relations` table before task-set
review closes. `depends-on` is required for stacked delivery and implies
ordering; `supersedes` and `blocks` must name the change they constrain. Write
rows with `harness-change-doc relation`; allowed types and validation are
defined in `schemas/change-workspace.schema.json`. A standalone change leaves
the table empty. When coupling raises a split-or-relate question, apply
`rules/loop-contract.md:One Reviewable Outcome Per Change` instead of restating
the boundary here.

## Review Coverage

Every general/final review covers the complete current task scope and checks
all authoritative dimension families. For code, `multi-lens-review` is the one
normal code-review procedure and `multi-lens-review:Lens Selection` owns the
code families; invoke the applicable project-native baseline.
`multi-lens-design-review:Design Lenses` owns planning/design. Read those
current owners rather than maintaining a second checklist here.

Resolve staged/unstaged changes, in-scope new files, committed task changes,
and necessary callers, contracts, consumers, generated surfaces and tests.
An empty latest diff is not an empty task. Exclude unrelated work with reasons;
this does not authorize whole-repository cleanup or additional edits.

For each family, inspect applicability and investigate to the depth needed to
support its disposition. N/A requires a source-backed reason after inspection;
unavailable source, uncertain applicability or evidence remains a named gap.
Record the dimension mapping and material evidence in the existing Review
Packet. Group identical dispositions when they share scope and evidence; do
not create an exhaustive unit-by-dimension report merely for row count.

The coordinator allocates bounded role packets and accounts for the whole
scope and all dimensions; each specialist covers its assignment. A focused
question or local pass does not establish whole-task readiness. Risk adds
investigation or required independence; size, material choice, permissions and
assurance labels cannot subtract dimensions.

For ordinary filesystem-backed review, native formal review or simplification, execute
`review-packet-gate:Source Navigation and Acceptance` before the first dispatch
and when consuming material source evidence. Carry the fixed-root invocation
in the existing packet; source identity errors require a named gap or return,
and matching receipts do not establish semantic coverage. Owner gates remain
authoritative; provider isolation applies to explicitly isolated execution.

Before accepting a delegated or inline reuse/necessity result, inspect the
`Capability Comparison Evidence` defined in
`references/minimal-implementation.md`. Reconcile it with the scoped key blocks,
including retained blocks with multiple operations or intermediate state.
Follow each material keep reason to the inspected interface and proposed final
call form, including the applicable selection guidance and the full result
combination; check that the cited semantics support the claimed difference and
preserve the named invariants. Verify that the comparison targets the retained
operations under the same behavior constraints. A reason to retain validation
or local state does not justify surrounding operations, and rejection of an
unsafe alternative does not establish that the block is irreducible. Treat
these mismatched comparisons as unsubstantiated coverage, even when an
inventory, source anchors and a keep decision are present.
Reopen unsupported comparisons with a targeted
source check or bounded follow-up, rather than adding reviewers or rerunning
unrelated tests. Do not infer a missed inspection merely from a missing record;
record that coverage is not yet substantiated and obtain the missing evidence.

Reconcile explicit unresolved coverage from a verifier or another pass before
closing that dimension. A later invocation, complete file inventory or no
findings does not resolve the named gap; require the missing comparison or
retain the gap. After fixes change an operation or its result combination,
obtain a comparison of that changed block on the current source; earlier review
of a different operation cannot close it. Use the existing Review Packet and
coverage evidence, without introducing a second status store.

Locate the report's final keep claim and test its actual strongest factual keep
premise on that same block, without turning a readability preference into an
impossibility claim. A boundary in another example cannot substantiate this
block's comparison. Accept a supported bounded
claim within its declared scope; do not demand proof of irreducibility for
operations the report explicitly leaves unclaimed. A return should identify
the unsupported premise or named missing evidence, not merely ask for more
documentation or substitute a weaker rejected candidate.

A bounded return names the block, the unsupported claim, and the invariant or
comparison object that was not held fixed; it need not prescribe a replacement.
Keep the original report. The assigned reviewer rechecks the interface and
returns a corrected comparison or an explicit uncovered block. Accept only the
scope this return substantiates; silence, a repeated keep label, and unrelated
passing checks do not close the return. In formal runs, use the ledger and
immutable-record procedure in `review-packet-gate:Relation Ledger` before
aggregation. The coordinator does not rewrite reviewer-owned outcomes.

Distinguish dispatch/return from supported coverage: assigning a dimension
proves allocation; a clean report proves only that no finding was reported;
static checks prove their exercised properties. None replaces the comparison.
Reject blanket "covered", "no simplification needed", or a passing command as
completion evidence for that dimension. Keep useful correctness findings while
qualifying incomplete ordinary coverage; apply the formal evidence-gap rules
when a required gate is involved.

For formal review-run, map these source owners into the existing versioned
DimensionRef/relations and dispatch contract. Do not use absent dimensions or
false activation as N/A evidence. The runtime verifies declared identities and
closure, not an intrinsic semantic checklist; missing semantic mapping remains
a coverage gap. Preserve existing machine fields, gates and evidence authority.

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
no-design reason in the plan or task slice and continue with the recorded local plan. Do not create a seven-file pack just to fill empty tables.

When a pack is required, directory presence is not readiness. Read the populated
pack and require a ready review before creating task slices. Review the complete
task set before implementation dispatch.

## Example Materials

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

Load `review-packet-gate/references/review-run-routing.md` only when a formal
`protocol=review-run` review is selected; ordinary review does not load it.

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
