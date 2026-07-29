---
artifact: plan
status: reviewed
tags: [workflow, migration, validation, rollback]
description: "Implementation plan for monotonic change workspace migration."
---

# Plan

1. Replace Node migration planning and apply code with direct preflight,
   archive-first installation, and idempotent resume.
2. Mirror the same behavior in the Python command.
3. Remove migration transaction and bootstrap validation from both validators.
4. Update policy, operator guidance, and paired README migration examples.
5. Replace transaction-focused tests with legacy, conflict, interruption-resume,
   already-migrated, and Node/Python parity tests.
6. Remove Core's obsolete bootstrap and transaction control records.
7. Run focused tests, full tests, manifest validation, projection verification,
   change validation, and `git diff --check`.

Rollback is a normal Git restore of this change. Migration fixtures use temporary
repositories only.
