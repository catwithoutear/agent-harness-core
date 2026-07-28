---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Design constraints, anti-pattern checks, and readiness self-review."
---
# Constraints and Self Check

## N/A Usage

Before readiness or freeze, every row below needs either evidence or
`N/A - <reason>`. Do not leave empty result cells in a frozen design.

## Constraints

| Constraint | Applies to | Enforcement or review check |
|---|---|---|
| Preserve fast and compact paths | Guidance and diagnostics | No unconditional design or pack requirement. |
| Solution design owns behavior; pack owns topology | Skills, commands, templates | Pack guidance cannot select a solution. |
| No file-presence readiness | Skills, commands, planner | Guidance requires reading and semantic review. |
| No new mechanics | Entire change | Diff excludes new commands, state, schema, validators, writers, policy, migration, routes, and client support. |
| Canonical ownership | Skills, rules, templates | Projected files change only through projector. |
| Core generality | All source and docs | No project, product, tracker, or language-specific behavior. |
| Paired documentation | README and README_CN | Semantic changes update both. |
| No slices before pack review | Active change | `tasks/README.md` stays empty until pack review is `READY`. |
| Separate implementation baseline | Source implementation | Migration/tooling checkpoint is committed separately or used as a recorded worktree base; rollback uses task-owned commits. |
| Minimal metadata synchronization | Manifest | Only a changed skill description may be synchronized; asset inventory, triggers, routes, and clients remain unchanged. |

## Self Check

| Check | Result | Evidence | Follow-up |
|---|---|---|---|
| Requirement/source fact to implementation-step trace is complete | Pass | `06-implementation-plan.md` maps material items to steps. | Independent review |
| Stable source anchors are present or explicitly not applicable | Pass | `02-code-topology.md` names canonical files and symbols/headings. | Recheck after source movement |
| Verification cells distinguish plan from executed evidence | Pass | Checks are future plans; migration evidence is isolated in its review. | None |
| Document integrity was checked with available mechanical signals | Planned | Strict change validation and `git diff --check` follow pack edits. | Record in pack review |
| No circular dependency | Pass | Canonical guidance -> tests -> projections; no runtime feedback protocol. | Multi-lens review |
| No catch-all class without a bounded responsibility | N/A | No class is introduced; see `03-class-design.md`. | None |
| Subsystem and module boundaries are distinct when needed | Pass | One workflow-coordination subsystem is mapped to distinct source modules. | Independent review |
| Every core class maps to a file and test seam | N/A | No new class or interface. | None |
| Failure path and rollback path are documented | Pass | `04-runtime-flow.md` and `05-error-model.md`. | Failure-recovery lens |
| Implementation steps can be compiled or verified incrementally | Pass | Three ordered steps name focused validation and task-commit rollback. | Task-set review |
