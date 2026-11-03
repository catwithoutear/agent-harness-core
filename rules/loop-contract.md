---
title: Loop Contract
---

# Loop Contract

Use a small evidence loop for non-trivial agent work:

1. Observe the current state.
2. Build a context packet from verified sources.
3. When custom code is proposed, apply `workflow-control:Minimal Implementation
   Gate` after understanding the behavior and before selecting the
   implementation approach.
4. Apply `workflow-control:Required Materials` within the common loop; material
   requirements follow the work, not a selected mode.
5. When solution decisions are unresolved, draft and challenge the proposal,
   record each still-open design choice with the comparison required by
   `Solution Decision Record`, then write and review the solution design.
6. After solution-design review, assess whether `implementation-design` is
   required.
7. When the trigger applies, create and review the implementation-design pack
   before task slicing.
8. Derive bounded tasks with validation and rollback from accepted upstream
   artifacts, and review the task set before implementation.
9. Implement only the current slice.
10. Run a behavior-preserving simplify pass for non-trivial code edits.
11. Review against the packet and plan using `workflow-control:Review Coverage`:
    complete task scope, all current code/design/project dimensions, checked N/A
    and explicit evidence gaps; role allocation cannot reduce coverage.
12. Verify with commands or source evidence.
13. Persist the useful result in the owning artifact or hand off the remaining
    work.

If a downstream discovery changes the accepted solution, return to solution
design and revisit dependent implementation design and tasks. Do not repair a
changed design inside a downstream artifact.

## One Reviewable Outcome Per Change

A change workspace contains one reviewable outcome. Split independent outcomes,
or outcomes with different risk tiers, into separate changes; do not hide a
second outcome behind a later task slice. When a change can only land after
another change, declare a `depends-on` relation in its change index and deliver
the work as a stack.

Independence and risk-tier judgment belongs to task-set review; validator
tooling does not decide it. Allowed relation types and their validation are
owned by `schemas/change-workspace.schema.json`.

## Solution Decision Record

When a meaningful design choice remains open after the proposal is challenged,
record the comparison before the solution-design review:

- at least two options, or one option with a written justification;
- the criteria drawn from the accepted requirements or design constraints;
- the evidence for each option;
- the selected option and, for each rejected option, the criterion and the
  reason it was rejected;
- the assumptions the choice depends on, and the trigger that reopens the
  decision.

Low-risk work with a settled direction may record a one-line justification
instead. `add-decision` writes only the section skeleton; fill every comparison
field above before the solution-design review. Write the record in the change
workspace as `decisions/DR-<nnn>-<kebab-slug>.md`, using the projected
decision-record template
(`.changes/templates/decisions/decision-record.md`; source
`templates/changes/decisions/decision-record.md`). This is a review judgment: no
validator infers that a choice was meaningful.

## Continuous Convergence

For execution requests, continue authorized work until the overall objective
satisfies its acceptance criteria; no workflow keyword or fixed phrase is
required. Explicit plan-only, review-only, budget, and staged-stop requests
remain boundaries. A phase, slice, review, or command is not overall completion.

If the objective is incomplete, take the smallest safe in-scope next action and
repeat correction, review, and verification without asking the user to say
"continue". Findings, failed checks, `NOT_READY`, incomplete work, missing
evidence, and ordinary technical uncertainty feed the next iteration. A handoff
or context-compaction checkpoint must preserve the exact next action and does
not terminate convergence.

Finish only when every applicable acceptance criterion passes. Pause dependent work with
`NEEDS_USER_DECISION` when an owner-controlled decision cannot be resolved from
accepted requirements and current evidence. `READY_WITH_NOTES` is completion
only when the acceptance criteria explicitly allow every residual note.

An external blocker that persists after reasonable safe attempts may require a
partial handoff. Record the missing input/capability and exact next action; do
not retry indefinitely or call the objective complete. This loop grants no new
write, publish, deploy, or background scheduling authority.

The loop is generic. Project overlays add project-specific evidence, rules, and
validation commands through their own front door and memory.
