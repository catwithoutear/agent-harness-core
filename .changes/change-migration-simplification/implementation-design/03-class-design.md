---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Class/interface design, responsibility table, ownership, lifecycle, and test seams."
---
# Class and Interface Design

## N/A Usage

If class, interface, or ownership structure does not affect this change, write
`N/A - <reason>` under the sections below instead of leaving diagrams or tables
blank.

## Class Diagram

N/A - the implementation uses module-level functions and introduces no classes
or long-lived objects.

## Responsibility Table

| Class or interface | Source anchor | Type | Single responsibility | Forbidden responsibility | Dependencies | Lifecycle | Thread safety | Error model | Test seam |
|---|---|---|---|---|---|---|---|---|---|
| Migration plan object | `buildMigrationPlan` / `build_migration_plan` | plain value | emit the five documented JSON fields and ordered source states | authorize a later transaction | filesystem paths | one command | process-local | preflight error | JSON command output |

## Interface Drafts

`migrate <change> --dry-run | --apply`. No digest, state, close, revoke, or
recovery interface remains.

## Rejected Alternatives

| Alternative class/interface shape | Why rejected | Tradeoff kept |
|---|---|---|
| Migration transaction object | creates lifecycle and recovery code | plain plan output remains for preview |
