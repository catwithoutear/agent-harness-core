---
artifact: plan
status: draft
tags: [workflow, validation, ponytail-minimality]
description: "Priority-ordered plan with harness behavior evaluation last."
---
# Plan

## Goal

Absorb every accepted P0 item and the non-frontend P1 native-platform-first
dimension through the smallest existing harness owners.

## Approach

| Order | Priority | Scope | Exit gate |
|---|---|---|---|
| 1 | P0 foundation | Add the ordered ladder, understanding prerequisite, root/shared-owner rule, safety floor, and narrow runnable-check handoff. Reuse existing `diagnose` and `verification-first` rather than editing them. | Source contract is coherent and focused skill tests pass. |
| 2 | P0 review + P1 | Route simplify/planning review to the ladder; add an independent over-engineering lens; include only backend/runtime/OS/build/deployment native-platform guidance. | Role and multi-client projection tests pass. |
| 3 | P0 evaluation, last | Add the bounded behavior-level A/B evaluation reference only after orders 1 and 2 are stable. Keep provider selection and live execution outside automatic behavior. | Evaluation contract distinguishes fair arms, hard behavior gates, size signals, self-tests, and unexecuted live evidence. |
| 4 | Integration | Run full validation, inspect the complete diff for duplication or over-design, and update change status. | All declared commands pass or gaps are reported precisely. |

Each order is completed and checked before advancing. No evaluation artifact is
added early merely to satisfy a checklist.

## Validation

- [x] `node tests/run-tests.js --skills --subagents`
- [x] `node tests/run-tests.js --projection`
- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `node bin/harness-change-validate.js --repo-root . --change ponytail-minimality-absorption`
- [x] `git diff --check`
- [x] Live isolated `shared-owner-fix` A/B with Codex CLI, three fresh runs per
      arm; candidate full-gate pass 3/3, baseline 1/3.

## Rollback

Revert the references and their routing/test assertions. No cleanup of runtime
state, dependencies, or external systems is required.
