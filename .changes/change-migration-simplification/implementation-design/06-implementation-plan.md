---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests."
---
# Implementation Plan

## Implementation Order

| Step | Subsystem | Module | Source anchors | Behavior | Validation | Rollback |
|---|---|---|---|---|---|---|
| 1 | change migration | Node command | `lib/change/doc-tool.js:commandMigrate` and migration helpers | direct monotonic upgrade | focused Node fixtures | Git restore |
| 2 | change migration | Python command | `lib/change/harness_change_doc.py:command_migrate` and migration helpers | mirror Node | parity fixtures | Git restore |
| 3 | validation | Node/Python validators | `validateChange` / `validate_change` | ignore transaction/bootstrap history | legacy and structured fixtures | Git restore |
| 4 | user contract | policy, skill, README pair | migration command text | document direct apply and rerun recovery | skill tests and paired-text assertions | Git restore |
| 5 | repository history | `.changes/.control` | obsolete control records | remove unowned protocol state | change validation | Git restore |
| 6 | completeness | source and docs | scoped protocol term search | prove old machinery is absent | `rg` zero-result check | Git restore |

## Design-to-Code Traceability

| Requirement / source fact / design item | Subsystem | Module | Source anchor | Verification plan / evidence | Step |
|---|---|---|---|---|---|
| preserve legacy bytes | migration | Node/Python commands | archive installation helper | byte equality fixture | 1-2 |
| reject conflict | migration | Node/Python commands | preflight helper | conflicting archive fixture | 1-2 |
| rerun recovery | migration | Node/Python commands | plan/apply helpers | partial-state fixture | 1-2 |
| no historical authorization | validation | Node/Python validators | `validateChange` / `validate_change` | control files do not affect result | 3 |
| public guidance matches CLI | docs | README/skill/policy | migration section | test assertions | 4 |
| old protocol fully removed | all affected surfaces | source/docs/tests | expected-plan, transaction, bootstrap, frozen-round helpers | scoped zero-result search | 6 |

## Coding Guardrails

- Before coding, state the files touched, the design item served, excluded
  modules, and validation target.
- When implementation deviates from this design, record the reason and whether
  topology, class design, or tasks must change.
- Do not treat design-stage validation plans as executed implementation proof.
  Mark planned checks separately from already-run evidence.
