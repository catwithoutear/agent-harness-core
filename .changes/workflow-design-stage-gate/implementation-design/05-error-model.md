---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Error contract, retry, rollback, idempotency, and observability model."
---
# Error Model

## N/A Usage

If error categories, retry, rollback, idempotency, and observability are not
material to this change, write `N/A - <reason>` under the sections below instead
of leaving tables or notes blank.

## Error Categories

| Error | Source | Caller-visible result | Retry | Rollback | Verification plan / evidence |
|---|---|---|---|---|---|
| Phase skipped | Agent moves from proposal directly to topology or tasks while solution choices remain | Reviewer returns `NOT_READY` and names the missing phase | Complete and review the owning artifact | Supersede downstream draft if necessary | Skill scenarios and independent review |
| Excess ceremony | Agent creates design artifacts for trivial or localized work without trigger evidence | Coordinator returns to fast or compact path | Re-plan using the smaller path | Remove unneeded draft artifacts through normal workspace rules | Fast/compact wording tests |
| Pack reopens solution | Implementation design selects behavior not accepted by solution design | Return to solution design | Review changed solution, then refresh pack | Supersede affected pack review | Multi-lens review |
| Task hides architecture | Slice contains unresolved ownership, dependencies, failure behavior, or test seams | Task-set review `NOT_READY` | Complete required pack or refine slices | No source implementation begins | Planner and task-set review |
| Guidance drift | Skills, commands, rules, docs, or projections teach different order | Test/review failure | Align canonical source and reproject | Revert bounded guidance slice | Skill and projection tests |

## Idempotency

N/A - the change adds no runtime operation, persistence, retry loop, or
idempotency contract.

## Cleanup and Partial Failure

The implementation consists of canonical text assets, matching description
metadata, and tests. A partial edit is not released: finish the bounded slice,
run tests, then regenerate and verify projections. Rollback reverts the
task-owned commit and regenerates projections.

## Logs, Metrics, and Troubleshooting Anchors

- CLI output and status JSON remain the observable surfaces.
- Reviews and task artifacts retain semantic traceability.
- Existing `harness-change-validate` output remains structural evidence only.
- No new diagnostics, metrics, protocol state, or log file is introduced.
