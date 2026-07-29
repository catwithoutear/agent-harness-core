---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Object lifecycle, normal flow, failure flow, rollback flow, and state transitions."
---
# Runtime Flow

## N/A Usage

If lifecycle, sequence, state, failure, rollback, concurrency, migration, and
idempotency behavior are not material to this change, write `N/A - <reason>`
under the sections below instead of leaving diagrams or tables blank.

## Object Lifecycle

```mermaid
flowchart LR
  Detect --> Preflight --> Archive --> Scaffold --> RemoveLegacy --> Done
  Archive -->|interrupted| Rerun
  Scaffold -->|interrupted| Rerun
```

## Main Sequence

```mermaid
sequenceDiagram
  participant User
  participant Command
  participant Filesystem
  User->>Command: migrate --apply
  Command->>Filesystem: detect and preflight
  Command->>Filesystem: install missing archives
  Command->>Filesystem: install scaffold
  Command->>Filesystem: remove matching legacy sources
  Command-->>User: applied plan
```

## Failure and Rollback Sequence

```mermaid
sequenceDiagram
  participant Command
  participant Filesystem
  Command->>Filesystem: preflight
  alt conflict
    Command-->>Command: fail without source removal
  else process interruption after additive write
    Command-->>Filesystem: rerun and complete remaining writes
  end
```

## State Transitions

| State | Entered by | Exits to | Invariants |
|---|---|---|---|
| legacy | top-level legacy input exists | partial or structured | source remains until archive matches |
| partial | archive or scaffold partly exists | structured | rerun never overwrites conflicts |
| structured | archive exists and legacy input removed | structured | rerun is idempotent |
| concurrent mutation | unsupported | caller retries after exclusive access | command provides no lock guarantee |

## Traceability

| Flow or state | Requirement / source fact | Source anchor | Verification plan |
|---|---|---|---|
| conflict preflight | no overwrite | migration helper | conflicting archive fixture |
| partial resume | rerun recovery | migration helper | archive-only and partial scaffold fixture |
| structured idempotence | repeat-safe | command | repeated apply fixture |
