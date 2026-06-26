---
name: change-planner
description: Use when turning settled requirements, proposals, designs, specs, or implementation-design artifacts into concrete .changes tasks, task slices, validation steps, and reviewable implementation plans.
---

# Change Planner

Convert a settled design into executable, reviewable task slices inside the
active `.changes` workspace. Use this skill after the direction is chosen and
before coding starts or resumes.

Use `change-workspace-operator` for regulated file creation, lookup, reading,
and validation. This skill decides what the tasks should be; it does not replace
`harness-change-doc` or `harness-change-validate`.

## Boundaries

Use this skill for:

- deriving `tasks.md` or `tasks/*.md` slices from `requirements.md`,
  `proposal.md`, `design.md`, `specs/`, or `implementation-design/`;
- refining a broad plan into implementation slices with validation gates;
- replanning after design review or code review changes the task order;
- checking whether a plan is ready for implementation delegation.

Do not use it as the primary tool for:

- creating or locating change documents; use `change-workspace-operator`;
- unresolved discovery or design choice work; use research, design refinement,
  design review, or user clarification first;
- implementation after tasks are frozen; follow the workflow coordinator and
  the relevant implementation skill or subagent;
- generic task lists outside a repository-owned change workspace.

## Required Inputs

Start with a compact context packet:

- active change id or path;
- current change phase and freeze state;
- source artifacts to derive from, with any known gaps;
- evidence produced by `architecture-scout`, `diagnose`, `prototype-spike`, or
  `verification-first`, when those skills were needed;
- selected design direction or explicit no-design reason;
- expected validation target and any constraints on build, test, rollout, or
  compatibility;
- user-imposed boundaries, non-goals, and sequencing constraints.

If any item is missing, read the workspace through `change-workspace-operator`
commands before planning. If the selected behavior or contract is still
ambiguous, return `NEEDS_USER_DECISION` instead of inventing tasks.

## Planning Flow

1. Locate and read the active change through `harness-change-doc` or the
   repository's documented equivalent. Prefer `list`, `locate`, and `read`
   over guessing paths by hand.
2. Read the controlling artifacts in this order when present:
   `requirements.md`, `proposal.md`, `terminology.md`, `design.md`, `specs/`,
   `implementation-design/`, existing `tasks/`, `reviews/`, and recent
   `timeline/` entries.
   Treat architecture scout notes, diagnosis records, spike results, and
   validation plans as source evidence, not as tasks by themselves.
3. Classify the planning mode:
   - `design-to-tasks`: selected design exists and needs task slices;
   - `plan-only`: localized change with no design artifact, but still needs a
     reviewable plan;
   - `slice-refine`: existing tasks are too broad, stale, or untestable;
   - `review-replan`: review findings changed ordering, scope, or validation.
4. Extract behavior slices. A slice should map one coherent behavior, contract,
   migration, test, documentation, or rollout concern to concrete files and a
   validation path.
5. Order slices by dependency, risk, and reviewability. Prefer small,
   independently reviewable slices over file-based batching.
6. For each slice, record source-design traceability, implementation steps,
   validation, rollback/revert notes, and open decisions.
7. Write or update task artifacts only through the change workspace's regulated
   creation path. For this harness, use `harness-change-doc add-task-slice`
   before hand-editing task content.
8. Run `harness-change-validate --change <id>` or the repository equivalent.
   Treat warnings as decisions to resolve or explicitly accept before freeze.

## Slice Rules

- Slice by behavior and verification boundary, not by directory ownership alone.
- Keep prerequisites explicit. Do not hide schema, migration, config, or
  compatibility work inside an implementation slice.
- Keep pure tests, generated artifacts, documentation, and rollout notes
  separate when they require different reviewers or validation commands.
- Every implementation slice needs a validation target. If direct validation is
  unavailable, write the gap and the substitute evidence.
- Preserve traceability: every task should point back to the design artifact,
  requirement, spec scenario, review finding, or user decision that created it.
- Preserve evidence lineage: when a task depends on architecture scouting,
  diagnosis, a prototype spike, or validation-first analysis, name that record
  in the slice.
- Mark dependencies and blocked decisions instead of silently reordering around
  them.

## Task Template

Use this structure for each task slice unless the repository has a stricter
template:

```markdown
## <slice-id>: <short behavior-oriented title>

- Source design: <artifact/section or explicit no-design reason>
- Goal: <observable behavior or artifact outcome>
- Non-goals: <excluded behavior, cleanup, or future work>
- Files/modules: <likely touchpoints and why>
- Steps:
  1. <small implementation or document step>
  2. <next step>
- Validation: <commands, tests, review checks, or documented gap>
- Review packet: <what evidence the reviewer needs>
- Rollback: <revert path, feature flag, migration rollback, or N/A reason>
- Open decisions: <none, or owner/user decision required>
```

For directory-based task workspaces, keep `tasks/README.md` as the index and
store each slice in `tasks/<slice-id>.md` using the same fields.

## Readiness Gate

End with exactly one gate decision:

- `READY`: tasks are traceable, ordered, scoped, and have validation targets.
- `READY_WITH_NOTES`: implementable, with documented non-blocking gaps or known
  validation limits.
- `NOT_READY`: tasks are missing core behavior, traceability, validation, or
  dependency ordering.
- `NEEDS_USER_DECISION`: implementation depends on a user/owner choice that the
  artifacts do not answer.

Include a short reason and the next action. Do not mark `READY` when the task
list merely repeats the design headings without implementation steps.

## Example Task Slice

```markdown
## slice-auth-timeout: enforce request timeout in protected operation

- Source design: design.md "Timeout contract"; specs/auth-timeout.md scenario 2
- Goal: protected operation fails with timeout error after the configured limit
- Non-goals: changing authentication policy or retry backoff
- Files/modules: request handler for timeout check; config reader for limit
- Steps:
  1. Read configured timeout at operation start.
  2. Thread deadline through the protected call path.
  3. Return the documented timeout error when deadline expires.
- Validation: unit test for expired deadline; integration smoke for successful path
- Review packet: config default, error mapping, timeout test output
- Rollback: revert handler/config changes; no persisted migration
- Open decisions: none
```

Gate decision: `READY_WITH_NOTES` if the integration smoke depends on an
external service and the substitute evidence is documented.
