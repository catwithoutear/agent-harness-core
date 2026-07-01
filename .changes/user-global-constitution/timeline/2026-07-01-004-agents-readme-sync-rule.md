---
artifact: timeline-event
status: draft
tags: [workflow, user-global-constitution, language-boundary]
description: "User required README/README_CN sync rule in core AGENTS.md."
---

# AGENTS README Sync Rule

## Event

The user clarified that the restriction for keeping `README.md` and `README_CN.md` synchronized should be added to core repo `AGENTS.md`.

## Decision

The first implementation slice must update core `AGENTS.md` with an editing rule: when an agent changes `README.md` or `README_CN.md`, it must check whether the paired file needs the corresponding update and keep both synchronized for semantic content.

## Evidence

- User answer during `grill-with-docs`: "同步更新 README 的限制应当在 core repo 的AGENTS.md中更新要求"
- Existing core `AGENTS.md` is the repository-level instruction file future agents read before editing core assets.

## Residual Risk

The rule should be scoped to semantic README content changes, not whitespace-only or typo-only edits that do not affect translated meaning.
