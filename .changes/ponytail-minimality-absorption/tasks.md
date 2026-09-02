---
artifact: tasks
status: draft
tags: [implementation, validation, ponytail-minimality]
description: "Priority-ordered implementation checklist with behavior evaluation last."
---
# Tasks

## 1. Implementation

### Priority 1 - P0 Foundation

- [x] Add one canonical minimal-implementation reference.
- [x] Route the workflow pre-implementation decision to it.
- [x] Preserve existing understanding, diagnosis, safety, and verification owners.
- [x] Add focused source-contract tests.

### Priority 2 - P0 Review And P1 Native Platform

- [x] Route post-implementation simplify and its specialist to the canonical
      ladder without weakening authorization or behavior invariants.
- [x] Add an independently selectable over-engineering design lens.
- [x] Route planning review to that lens and the canonical ladder.
- [x] Lock non-frontend native-platform scope and multi-client projection.

### Priority 3 - P0 Harness Evaluation, Last

- [x] Add a provider-neutral behavior-level A/B evaluation reference only after
      priorities 1 and 2 pass their focused checks.
- [x] Require isolated seeded workspaces, fair baseline/candidate arms,
      correctness/safety/completeness gates, size signals, and scorer self-tests.
- [x] State whether a real A/B run was executed; do not substitute static tests.
      Current status: `LIVE_AB_COMPLETE`; the authorized Codex CLI run used
      three fresh workspaces per arm. Candidate passed the complete behavior gate
      3/3 and baseline 1/3; see `reviews/minimality-ab-r01.md`.

## 2. Validation

- [x] Run focused skill, role, and projection tests.
- [x] Run the full package suite, manifest validation, self-projection verify,
      exact change validation, and `git diff --check`.
- [x] Review the final diff for duplicated rules, accidental frontend content,
      parallel workflow/state, new dependencies, and cryptographic machinery.
