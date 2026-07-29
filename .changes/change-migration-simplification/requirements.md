---
artifact: requirements
status: reviewed
tags: [requirements, migration, validation]
description: "Accepted requirements for simplifying legacy workspace migration."
---

# Requirements

- Preserve each recognized legacy file byte-for-byte in the archive.
- Never overwrite a different archive or fixed generated file.
- Preserve post-migration edits by making repeat apply a no-op.
- Recover process interruption by rerunning, without transaction state.
- Treat migration as single-writer local tooling.
- Keep Node and Python outcomes, JSON fields, and exit classes aligned.
- Remove migration digest, transaction, lock, snapshot, bootstrap, and
  frozen-round protocol code from commands, validators, tests, policy, and
  user guidance.
