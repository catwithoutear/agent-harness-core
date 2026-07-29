---
artifact: proposal
status: reviewed
tags: [proposal, migration, workflow]
description: "Replace controlled migration transactions with a direct filesystem upgrade."
---

# Proposal

## Why

Legacy change migration currently wraps a small, Git-tracked Markdown layout
upgrade in an authorization digest, persistent transaction state, locking,
snapshots, recovery guards, frozen review-round hashes, and historical bootstrap
validation. That machinery is disproportionate to the operation and is mirrored
in Node and Python.

## What Changes

Keep migration as a tool operation, but reduce it to:

1. detect legacy top-level artifacts;
2. preview source, archive, and generated paths;
3. copy legacy bytes unchanged into the archive;
4. create the structured indexes and provenance note;
5. remove the archived top-level legacy entries;
6. validate the resulting workspace.

The operation is monotonic. Archive writes happen before source removal.
Existing identical files are accepted; conflicting files stop the operation.
An interrupted run is resumed by running the same command again.

## Impact

- Do not translate legacy prose into structured review rounds or task slices.
- Do not change state-root or multi-worktree behavior.
- Do not change unrelated change-document commands.
- Keep Node and Python command behavior aligned.
- Existing committed migration and bootstrap files may remain readable as
  ordinary historical files, but they no longer authorize or invalidate work.

## Validation

Exercise legacy, conflicting, partial, already-migrated, and Node/Python parity
fixtures, followed by the repository test and projection commands.

## Rollback

Restore this change through Git. Migration tests operate only on temporary
repositories.
