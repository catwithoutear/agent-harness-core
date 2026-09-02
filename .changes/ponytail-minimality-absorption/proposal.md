---
artifact: proposal
status: draft
tags: [proposal, ponytail-minimality]
description: "Reuse-first proposal for Ponytail minimality absorption."
---
# Proposal

## Why

The harness already protects scope, behavior, safety, root-cause evidence, and
verification, but it does not give implementers one ordered pre-code decision
ladder. Its over-engineering check is also embedded inside broader design
quality, and current tests do not measure agent behavior against a fair baseline.

## What Changes

- Add one canonical, progressively loaded minimal-implementation reference below
  `workflow-control`.
- Route `workflow-control`, `simplify`, `code-simplifier`, planning review, and
  the multi-lens design review to the reference at their existing decision
  points.
- Add `over_engineering` as a separately selectable design lens while retaining
  the existing design-quality baseline as authority for broader design review.
- Lock the contract and projection with focused tests.
- Last, add a small behavior-evaluation reference. It defines fair A/B arms,
  backend-only seeded tasks, deterministic gates, size signals, and instrument
  self-tests without selecting or invoking a model provider.

## Impact

This is a prompt and workflow-contract change. It adds no runtime dependency,
state, public API, client adapter, or automatic external execution. Existing
manifest routing projects the new references with the owning skill directory.

## Validation

- Focused skill, role, and projection tests.
- Full `npm test`.
- Manifest validation and self-projection verification.
- Exact change-workspace validation and `git diff --check`.
- Evaluation instrument review/self-check; a live A/B result is reported only if
  separately authorized and actually run.

## Rollback

Remove the two workflow-control references and their routing/test additions as
one content-contract change. No stored state or migration is involved.
