---
name: harness:plan
description: Turn settled requirements, proposal, design, specs, or implementation notes into bounded change tasks and validation gates.
argument-hint: "<change id, design path, or planning goal>"
---

# Harness Plan

Use this when the design direction is mostly settled and the next need is a
concrete task breakdown, not implementation.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `change-planner` when it is installed.
2. Use `change-workspace-operator` for regulated `.changes` reads, creation, and
   validation commands.
3. Read the active change README first, then requirements, proposal, design,
   the latest relevant solution-design review, specs, implementation-design,
   its latest review, existing tasks, other reviews, and high-signal timeline
   entries when present.
4. If ownership, entry points, failure mode, feasibility, or validation is still
   unclear, call the focused evidence skill before planning:
   `architecture-scout`, `diagnose`, `prototype-spike`, or
   `verification-first`.
5. Classify planning first:
   - compact `plan-only`: the local solution is settled; record the bounded
     goal, affected source, explicit no-design/no-pack reason, validation, and
     rollback. A separate solution-design artifact and review are unnecessary;
   - `design-to-tasks`: refuse slicing while the solution or its review is
     unresolved. Apply the implementation-design trigger only after the
     solution-design review is ready.
   Require a populated and reviewed `implementation-design/` topology pack when
   design-path work crosses subsystem boundaries, touches 2+ modules with
   dependency risk, adds lifecycle/failure semantics, or needs
   dependency/file/class/test-seam constraints.
6. For compact `plan-only`, output the bounded lightweight plan and stop after
   repository validation; review it only when risk warrants review. Do not
   create formal task slices or require a task-set review.
7. For `design-to-tasks`, produce bounded task slices from the accepted solution
   or reviewed pack. Each slice must have scope, subsystem, module, changed
   surfaces, prerequisites, validation, rollback, and review owner.
8. For `design-to-tasks`, review the complete task set for index coverage,
   dependency order, ownership, validation coverage, and unresolved upstream
   decisions before implementation.
9. If a task requires a changed solution decision, return to solution design
   instead of settling it inside the task.
10. Keep unrelated future work out of the executable plan. Record it as a
   deferred note only when it affects current decisions.

## Output

- Planning source:
- Missing evidence:
- Task slices:
- Validation gates:
- Rollback:
- Review packets needed:
- Artifact updates:

Do not implement during this command unless the user explicitly says to proceed
after the plan.
