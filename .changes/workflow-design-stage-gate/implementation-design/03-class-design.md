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

N/A - this change introduces no class, object ownership, public API type, or
threaded runtime component. It modifies text contracts, matching manifest
description metadata, tests, and generated projections.

## Responsibility Table

| Class or interface | Source anchor | Type | Single responsibility | Forbidden responsibility | Dependencies | Lifecycle | Thread safety | Error model | Test seam |
|---|---|---|---|---|---|---|---|---|---|
| N/A | Text assets only | N/A | No new class or interface | Do not create a gate manager or phase object | N/A | Per agent run | N/A | Review findings | Skill and projection tests |

## Interface Drafts

N/A - no declaration-level interface or parsing helper is required.

## Rejected Alternatives

| Alternative class/interface shape | Why rejected | Tradeoff kept |
|---|---|---|
| `StageGateManager` or phase-state object | Adds mutable state and authority not required by the design. | The active coordinator reads the artifacts and uses existing review decisions. |
