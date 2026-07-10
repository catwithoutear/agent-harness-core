---
artifact: tasks-index
status: reviewed
tags: [implementation, review, validation]
description: "Ordered implementation and review index for the review coverage contract."
---
# Tasks

## Responsibility

This directory indexes dependency-ordered task slices for the review coverage
contract. The slices are intentionally serial: each implementation gate and
review result is evidence for the next slice. `slice-005` may record an
explicit fresh-agent limitation only when the evaluation mechanism is genuinely
unavailable; it may not substitute static assertions for behavioral evidence.

## Execution Order

| Order | Slice | Depends On | Entry Gate | Exit Gate |
|---|---|---|---|---|
| 001 | Portable target identity | Implementation-design r04 `READY` | Focused test is written and fails before helper creation. | Focused helper tests and slice review are `READY`. |
| 002 | Packet contract fixtures | 001 | Helper output contract is stable. | Packet/fixture static contracts and slice review are `READY`. |
| 003 | Delegated verifier projection | 001, 002 | Packet and role boundaries are fixed. | Manifest, role, and four-client projection checks and slice review are `READY`. |
| 004 | Workflow routing | 001-003 | Helper, packet, and role contracts are available. | Mode/gate routing tests and slice review are `READY`. |
| 005 | Behavioral evidence | 001-004 | Deterministic protocol fixtures pass. | A bounded two-phase evaluation is recorded, or an explicit evaluation limitation is reviewed. |
| 006 | Integration handoff | 001-005 | All preceding slice gates are recorded. | Repository verification, final implementation review, and handoff are `READY`. |

## Child Index

| path | artifact | status | order | description |
|---|---|---|---|---|
| `slice-001-portable-target-identity.md` | task-slice | reviewed | 001 | Slice 1: implement deterministic read-only target and packet identities with focused tests. |
| `slice-002-packet-contract-fixtures.md` | task-slice | reviewed | 002 | Slice 2: document coverage packets and add planted-omission fixtures. |
| `slice-003-delegated-verifier-projection.md` | task-slice | reviewed | 003 | Slice 3: register the read-only verifier and extend role/projection contracts. |
| `slice-004-workflow-routing.md` | task-slice | reviewed | 004 | Slice 4: route review coverage modes and four independent gates through workflows and commands. |
| `slice-005-behavioral-evidence.md` | task-slice | reviewed | 005 | Slice 5: run the bounded two-phase deep-coverage evaluation and record evidence. |
| `slice-006-integration-handoff.md` | task-slice | reviewed | 006 | Slice 6: complete integration verification, final review, and handoff evidence. |
