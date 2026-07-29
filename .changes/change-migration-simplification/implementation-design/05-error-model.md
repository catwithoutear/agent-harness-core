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
| no recognized legacy or archive input | plan builder | nonzero with clear error | after correcting input | none | focused fixture |
| source/archive conflict | preflight | nonzero; source untouched | after resolving conflict | none | conflict fixture |
| generated path is a directory or symlink | install preflight | nonzero; legacy source retained | after resolving conflict | Git if desired | focused fixture |
| interrupted additive write | process or environment | incomplete but valid files | rerun same apply | unnecessary | partial-state fixture |
| symlink, directory, or invalid UTF-8 generated input | preflight | nonzero; source retained | after correcting path/content | none | parity fixture |
| concurrent edit | unsupported usage | result is not guaranteed | rerun with one writer | Git if needed | documented boundary |

## Idempotency

Archive-only and fully structured states are accepted. Atomic writes accept
identical existing bytes and reject different bytes. Once no top-level legacy
source remains, apply returns `already_migrated=true` without touching generated
files.

## Cleanup and Partial Failure

Source removal is last and conditional on archive byte equality. No rollback
state is stored. Temporary files are renamed atomically by the existing helper.

## Logs, Metrics, and Troubleshooting Anchors

The JSON plan lists sources, archives, generated paths, mode, and
`already_migrated`. Errors name the conflicting path.
