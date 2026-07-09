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

## Self Check

| Check | Result | Evidence | Follow-up |
|---|---|---|---|
| Requirement/source fact to implementation-step trace is complete |  |  |  |
| Stable source anchors are present or explicitly not applicable |  |  |  |
| Verification cells distinguish plan from executed evidence |  |  |  |
| Document integrity was checked with available mechanical signals |  |  |  |
| No circular dependency |  |  |  |
| No catch-all class without a bounded responsibility |  |  |  |
| Subsystem and module boundaries are distinct when needed |  |  |  |
| Every core class maps to a file and test seam |  |  |  |
| Failure path and rollback path are documented |  |  |  |
| Implementation steps can be compiled or verified incrementally |  |  |  |
