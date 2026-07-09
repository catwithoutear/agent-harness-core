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

```mermaid
classDiagram
```

## Responsibility Table

| Class or interface | Source anchor | Type | Single responsibility | Forbidden responsibility | Dependencies | Lifecycle | Thread safety | Error model | Test seam |
|---|---|---|---|---|---|---|---|---|---|

## Interface Drafts

Keep drafts at declaration level. Include ownership, copy/move rules, const
behavior, and error return style when the language makes those explicit.

## Rejected Alternatives

| Alternative class/interface shape | Why rejected | Tradeoff kept |
|---|---|---|
