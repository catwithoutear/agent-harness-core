---
artifact: task-slice
status: draft
tags: [implementation]
description: "canonical-stage-order"
---
# Slice: canonical-stage-order

## Objective

Make every canonical workflow entry point teach the same responsibility and
order for proposal, solution design, conditional implementation design, task
slicing, and implementation.

## Scope

- Source design: `design.md`; `implementation-design/02-code-topology.md`;
  `implementation-design/06-implementation-plan.md`; review
  `reviews/implementation-design-r03.md`.
- Goal: an agent entering through the workflow, planning, design-refinement, or
  operator route reads the same simple phase order and lightweight exceptions.
- Non-goals: README/template wording, projection-specific tests, new commands,
  writers, validators, schema, policy, migration, routes, clients, or phase
  state.
- Scope: canonical skills, adjacent skill routing, workflow/plan commands, loop
  rule, matching skill description metadata, and focused contract tests.
- Subsystem: workflow coordination.
- Module: workflow and planning source contracts.
- Changed surfaces:
  `skills/workflow/workflow-control/SKILL.md`,
  `skills/change/change-planner/SKILL.md`,
  `skills/knowledge/design-doc-refiner/SKILL.md`,
  `skills/knowledge/design-doc-refiner/references/output-contract.md`,
  `skills/knowledge/technical-doc-refinement/SKILL.md`,
  `skills/change/change-workspace-operator/SKILL.md`,
  `commands/harness/workflow.md`, `commands/harness/plan.md`,
  `rules/loop-contract.md`, the `design-doc-refiner` description in
  `harness.manifest.json`, and `tests/test-skills.js`.
- Prerequisites: `solution-design-r03` and `implementation-design-r03` are
  `READY`; preserve the migration/tooling diff in a separate reviewed commit or
  create a dedicated worktree from an equivalent recorded base commit before
  source edits.
- Implementation base commit:
  `0ad9836c57bbe772f44b4fbbbcb33d551a09b4d8` (`Complete controlled change
  workspace migration`). This commit contains the reviewed migration/tooling
  diff and its `.changes` evidence chain; workflow-stage source implementation
  starts after this commit.

## Steps

- [x] Record the implementation base commit and confirm the task-owned diff
  excludes change-tool, schema, policy, migration, routing, and client-support
  surfaces.
- [ ] Update canonical workflow and planning guidance with fast, compact, and
  design paths and explicit return-to-design behavior.
- [ ] Make `design-doc-refiner` stop at solution design, ambiguities, and
  validation intent; route formal task slicing to `change-planner`.
- [ ] Synchronize only the changed `design-doc-refiner` manifest description.
- [ ] Add focused assertions for phase order, lightweight paths, specialist
  ownership, output-contract content, and metadata equality.

## Validation

- [ ] `npm test -- --skills`: passes.
- [ ] `node bin/harness.js manifest --json`: passes.
- [ ] `git diff --check`: passes.
- [ ] Exact task diff contains no new command, route, client capability, writer,
  validator, schema, policy, migration, or phase-state change.

## Review

- Review packet: base commit, task-owned commit/diff, changed canonical
  contracts, focused test output, manifest output, and excluded-surface check.
- Review owner: independent reviewer for workflow responsibility, Core
  generality, and scope.

## Rollback

- Revert the task-owned commit and regenerate projections; do not restore whole
  files across the migration baseline. If downstream slices are already
  stacked, revert in order 003, 002, then 001.

## Open Decisions

- None
