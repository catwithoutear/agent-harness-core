---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests."
---
# Implementation Plan

## Implementation Baseline

The migration/tooling diff already present in the working tree is a separate
completed checkpoint. Before workflow-stage source implementation:

1. preserve that diff in its own reviewed commit, or create a dedicated
   implementation worktree from an equivalent recorded commit;
2. record the implementation base commit in the first task slice;
3. keep each workflow-stage slice in its own task-owned commit;
4. review excluded surfaces relative to that base, not against the repository's
   pre-existing dirty state;
5. roll back by reverting the task-owned commit, never by restoring whole files
   that contain another checkpoint's changes.

## Implementation Order

| Step | Subsystem | Module | Source anchors | Behavior | Validation | Rollback |
|---|---|---|---|---|---|---|
| 1 | Workflow coordination | Canonical skills, refiner output contract, adjacent routing, commands, loop rule, and metadata | `skills/workflow/workflow-control/SKILL.md`; `skills/change/change-planner/SKILL.md`; `skills/knowledge/design-doc-refiner/SKILL.md`; `skills/knowledge/design-doc-refiner/references/output-contract.md`; `skills/knowledge/technical-doc-refinement/SKILL.md`; `skills/change/change-workspace-operator/SKILL.md`; `commands/harness/{workflow,plan}.md`; `rules/loop-contract.md`; matching manifest description and trigger ownership | State phase order, lightweight exceptions, trigger timing, return-to-design behavior, task-set review, and specialist ownership consistently. Solution refinement outputs design, ambiguities, and validation intent; `change-planner` owns formal task slicing. | Focused `tests/test-skills.js`; reference-contract assertions; cross-asset review; manifest description equality and negative trigger ownership. | Revert the task-owned commit. |
| 2 | Workflow coordination | Pack template and paired user guidance | `templates/changes/implementation-design/README.md`; `README.md`; `README_CN.md` | Explain that the pack maps a settled solution and that small work keeps lightweight paths. | Focused template/doc assertions and paired semantic review. | Revert the task-owned commit. |
| 3 | Package projection | Existing manifest routes and client projections | `harness.manifest.json`; `tests/test-projection.js` | Verify changed skills, commands, rules, and templates reach their existing clients; do not change manifest entries. | Projection tests, self-host projection verify, full suite, change validation, `git diff --check`. | Regenerate projections from reverted sources. |

## Design-to-Code Traceability

| Requirement / source fact / design item | Subsystem | Module | Source anchor | Verification plan / evidence | Step |
|---|---|---|---|---|---|
| Proposal and solution design precede topology assessment | Workflow coordination | Skills, commands, rule | `design.md:Purpose`, `Paths Through The Workflow` | Contract assertions across canonical assets | 1 |
| Fast and compact paths remain | Workflow coordination | Skills and README pair | `design.md:Fast Path`, `Compact Path` | Positive lightweight-path tests | 1, 2 |
| Reading and review, not presence, determine readiness | Workflow coordination | Skills, commands, template | `design.md:Review And Transition Rules` | Wording assertions and review scenarios | 1, 2 |
| Existing writers and validators remain unchanged | Workflow coordination | Scope boundary | `DR-002-stage-gate-simplification.md` | Exact diff review excludes tooling/schema surfaces | 1, 2, 3 |
| Required pack review precedes slices | Workflow coordination | Planner and pack template | `design.md:Implementation-Design Trigger`, `Task-Slicing Gate` | Planner and template assertions | 1, 2 |
| Core and projections agree | Package projection | Existing projector routes | Repository operating model | Full suite and client projection tests | 3 |

## Validation Matrix

| Surface | Scenario | Expected result |
|---|---|---|
| Workflow classification | Low-risk wording or formatting | Fast path observes, edits, and verifies without proposal/design/pack/tasks. |
| Workflow classification | Localized implementation with a settled solution | Compact path records goal, no-design/no-pack reason, validation, and rollback in a plan or slice; review is risk-based. |
| Workflow classification | Unresolved behavior or cross-module topology | Design path requires proposal, reviewed solution design, trigger assessment, and a reviewed pack when triggered. |
| Trigger examples | Single local module without lifecycle/dependency risk | Pack not needed; reason is recorded. |
| Trigger examples | Cross-subsystem, lifecycle, migration, or dependency-order risk | Pack required before slicing. |
| Readiness | Pack directory exists but is empty or unreviewed | Guidance stops task slicing. |
| Task-set review | Missing ownership, cyclic dependencies, or incomplete validation | Guidance stops implementation dispatch. |
| Compatibility | Existing legacy or structured artifacts | Remain valid; no new schema or validator requirement. |
| Skill contract | Canonical skills, refiner output contract, and adjacent routing | `tests/test-skills.js` asserts responsibilities, order, fast/compact paths, task-slicing ownership, reference content, and manifest description equality. |
| Project projection | Skills, rules, and templates for `codex`, `claude`, `opencode`, `omp` | Existing supported project targets receive the canonical text. |
| Project commands | `claude`, `omp` | Workflow and plan command content projects successfully. |
| Unsupported project commands | `codex`, `opencode` | Existing unsupported records and warnings remain expected. |
| Codex global commands | Deprecated global prompt route | Existing deprecated warning remains; projected prompt carries the updated order. |
| Self-host verification | Codex project source projection | Skills, rules, templates, subagents, and hooks verify; commands remain outside this project scope. |

## Coding Guardrails

- Before coding, state the files touched, the design item served, excluded
  modules, and validation target.
- When implementation deviates from this design, record the reason and whether
  topology, class design, or tasks must change.
- Do not treat design-stage validation plans as executed implementation proof.
  Mark planned checks separately from already-run evidence.
- Keep each task slice aligned to one numbered step; do not mix migration
  cleanup or review-verifier V2 work into these files.
- Do not modify document writers, validators, schema, policy, migration, asset
  projection routes, client support, or manifest entries other than the
  `design-doc-refiner` description and trigger phrases needed to match its
  canonical responsibility. Do not change that asset's source, runtime name,
  clients, or projection behavior.
- Any mutable phase state, new command, digest protocol, or semantic
  auto-approval requires returning to solution design and owner confirmation.
