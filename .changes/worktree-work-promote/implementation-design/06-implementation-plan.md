---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation]
description: "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests."
---
# Implementation Plan

## Implementation Order

| Step | Subsystem | Module | Source anchors | Behavior | Validation | Rollback |
|---|---|---|---|---|---|---|
| 1 | Change policy | Artifact/schema policy | `lib/change/js-policy.js:ARTIFACTS`, `lib/change/policy.py:ARTIFACTS`, `schemas/change-workspace.schema.json` | Add registered `execution-map` artifact, front matter policy, structured allowlist, strict-layout/inventory visibility, status-report presence, and top-level file budget adjustment if needed. | `node bin/harness-change-doc.js --repo-root . policy --json`; strict-layout validator tests for `execution-map.md`; inventory/status tests. | Revert policy/schema/status entries. |
| 2 | Root resolution | JS change tooling | `lib/change/doc-tool.js:runChangeDoc`, `lib/change/validator.js:runChangeValidate`, new `lib/change/root-resolution.js` | Add shared root context resolution with `--state-root`, `--code-root`, `--repo-root` compatibility, env fallback, cwd-under-change detection, duplicate non-explicit candidate blocking, and linked-worktree unresolved handling. | Unit tests for explicit, conflicting, env, cwd-under-change, duplicate local linked candidate, and linked unresolved cases. | Revert helper and call-site integration. |
| 3 | Execution map commands | JS doc tool | `lib/change/doc-tool.js:runChangeDoc`, Markdown helpers | Add read-only `resolve`, read-only `execution-map --json`, absent-map JSON output, and write command `assign-slice` with status-driven branch/worktree/evidence requirements, normalized local worktree persistence, and idempotent rendering. | Command tests for absent-map JSON, creating `planned`, claiming with normalized worktree path, updating rows, illegal transitions, and idempotency. | Revert command dispatch and helper functions. |
| 4 | Worktree validation | JS validator | `lib/change/validator.js:runChangeValidate`, `buildStatusReport`, new map parser | Add `--worktrees` checks for map shape, slice existence, evidence-reference grammar, topology, duplicate active worktrees, duplicate local `.changes`, dependency cycles, path normalization, missing/unreadable/non-git severity, and stacked dependency-status rules. | Validator tests covering each error/warning class, evidence-reference cases, and status-report summaries. | Revert flag and validation path. |
| 5 | Python parity | Python change tooling | `lib/change/harness_change_doc.py:build_parser`, `lib/change/harness_change_validate.py:main`, `lib/change/policy.py` | Mirror V1 public policy, root flags, repo-local schema precedence, execution-map commands, status output, and worktree validation. | Existing Python tests plus parity cases matching JS fixtures. | Revert Python changes together with JS behavior if V1 scope is reopened. |
| 6 | Workflow assets | Commands, hooks, skills | `commands/harness/workflow.md`, `commands/harness/handoff.md`, `hooks/intents/session-bootstrap.md`, `hooks/intents/active-change-guard.md`, `skills/change/change-workspace-operator/SKILL.md`, `skills/change/change-planner/SKILL.md`, `skills/operations/handoff-checkpoint/SKILL.md` | Teach agents to resolve state/code roots, use execution-map for multi-worktree assignments, and preserve canonical state. | `tests/test-skills.js`, `tests/test-subagents-hooks.js`, projection verify. | Revert text changes and projection refresh. |
| 7 | Projection and final verification | Projector/test suite | `tests/test-projection.js`, `harness.manifest.json` if new templates/assets are added | Refresh projected runtime assets if source assets change. | `npm test`; `node bin/harness.js manifest --json`; `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`; `git diff --check`. | Revert source/projection changes together. |

## Design-to-Code Traceability

| Requirement / source fact / design item | Subsystem | Module | Source anchor | Verification plan / evidence | Step |
|---|---|---|---|---|---|
| Distinguish code root from state root. | Root resolution | JS and Python change tools | `requirements.md` Accepted Requirements | Root resolver tests and command conflict tests. | 2, 5 |
| Block linked-worktree duplicate root selection before writes. | Root resolution | JS and Python change tools | `reviews/subagent-design-r01.md` WWP-SUB-R01-F01 | Resolver fixtures with duplicate `.changes/<change>` under current linked worktree and canonical root. | 2, 5 |
| Keep validator root flags consistent. | CLI compatibility | JS and Python validators | `reviews/subagent-design-r01.md` WWP-SUB-R01-F02 | Tests for `--state-root`, legacy `--repo-root`, conflicting roots, and explicit `--code-root`. | 2, 4, 5 |
| Avoid accidental worktree-local `.changes`. | Worktree validation | Validator | `reviews/draft-r01.md` WWP-R01-F02 | Duplicate local state validator test. | 4 |
| Explicit slice-to-worktree assignment. | Execution map | Doc tool, policy, schema | `proposal.md` What Changes | `assign-slice` command tests and policy output. | 1, 3 |
| Read-only absent-map behavior. | Execution map | Doc tool | `implementation-design/03-class-design.md` Execution-map artifact contract | `execution-map --json` test returns `exists: false` with no file creation. | 3 |
| Register execution map as a first-class artifact. | Change policy | Policy, schema, status, inventory | `reviews/subagent-design-r01.md` WWP-SUB-R01-F04 | Policy, strict-layout, inventory, index, status, and top-level budget tests. | 1 |
| Normalize and validate local worktree paths. | Worktree validation | Doc tool and validator | `reviews/subagent-design-r01.md` WWP-SUB-R01-F05 | Tests for relative base, absolute persistence, realpath/symlink dedupe, missing, unreadable, non-git paths by status, and stale cross-checkout advisory behavior. | 3, 4 |
| Align `planned` with `assign-slice`. | Execution map | Doc tool and validator | `reviews/subagent-design-r01.md` WWP-SUB-R01-F06 | `planned` row command test without branch/worktree and non-planned failure tests. | 3, 4 |
| Map owns scheduling; task slices own evidence. | Execution map | Map parser/validator | `design.md` Proposed V1 Contract | Validator tests for missing evidence pointer and no task-body mutation. | 3, 4 |
| Status transitions require canonical evidence. | Execution map | Validator | `reviews/draft-r01.md` WWP-R01-F03 | Validator cases for blank, escaping, missing file, valid file, valid heading, and missing heading `Last Evidence` on `blocked`, `ready`, `merged`, and `superseded`. | 4 |
| Parallel and stacked topology are distinct. | Execution map | Validator and skills | `reviews/draft-r01.md` WWP-R01-F04; `reviews/subagent-design-r01.md` WWP-SUB-R01-F07 | Validator topology, dependency-cycle, `ready`, and `merged` dependency-status tests; skill text assertions. | 4, 6 |
| V1 only supports `shared-state`. | Workflow contract | Commands, skills, docs | `requirements.md` Non-Goals For V1 | Tests assert no branch-local-state command mode is documented as supported. | 3, 6 |
| Existing `--repo-root` remains compatible. | CLI compatibility | Doc and validator tools | `lib/change/doc-tool.js:runChangeDoc` current behavior | Existing tests continue passing; new alias tests. | 2, 5 |

## Coding Guardrails

- Before coding, state the files touched, the design item served, excluded
  modules, and validation target.
- When implementation deviates from this design, record the reason and whether
  topology, class design, or tasks must change.
- Do not treat design-stage validation plans as executed implementation proof.
  Mark planned checks separately from already-run evidence.
- Do not implement git worktree creation, checkout, rebase, reset, or push in
  this change.
- Do not add project-specific build/test commands to core workflow assets.
- Do not allow `assign-slice` to silently create a task slice; task creation
  stays under `add-task-slice`.
- Do not allow `--all-active` output to select the active execution map.
- Do not split Python parity into a later unplanned follow-up; if V1 public
  behavior changes, parity tests belong in the same implementation stack.
- Treat implementation slices as a dependency stack. Policy/schema precede root
  resolution, root resolution precedes JS commands and validator behavior, and
  Python/prompt/projection work follows the public behavior it mirrors.
- Reuse existing primitives before adding helpers: `parseArgs`, `markdown.js`
  front-matter/table helpers, JS/Python policy registries, schema layout rules,
  validator status/inventory paths, and projection tests.
- Keep `Worktree` as a local execution coordinate in the map. Do not infer
  branch truth, merge readiness, or cross-machine validity from a persisted
  absolute path.
- Keep `Last Evidence` change-relative. Do not store external URLs, commit
  hashes, or free-text evidence directly in the execution map.
