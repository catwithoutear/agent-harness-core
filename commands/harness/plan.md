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
3. Read the active change README first, then requirements, proposal, specs,
   design, implementation-design, existing tasks, reviews, and high-signal
   timeline entries when present.
4. If ownership, entry points, failure mode, feasibility, or validation is still
   unclear, call the focused evidence skill before planning:
   `architecture-scout`, `diagnose`, `prototype-spike`, or
   `verification-first`.
5. Apply the implementation-design trigger rule before task slicing. Require an
   `implementation-design/` topology pack when work crosses subsystem
   boundaries, touches 2+ modules with dependency risk, adds lifecycle/failure
   semantics, or needs dependency/file/class/test-seam constraints. Otherwise
   record the no-design reason.
6. Produce bounded task slices. Each slice must have scope, subsystem, module,
   changed surfaces, prerequisites, validation, rollback, and review owner.
7. Keep unrelated future work out of the executable plan. Record it as a
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
