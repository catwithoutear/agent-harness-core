---
artifact: change-index
status: reviewed
tags: [workflow, design, review, validation, design-principles-baseline]
description: "Add one project-agnostic code and architecture design-principles baseline to canonical design review."
---

# Design Principles Baseline

## Task Tag Registry

| tag | description |
|---|---|
| `design-principles-baseline` | Canonical, project-agnostic design-quality principles used by design review. |

## Task Summary

- Task: add a stable code and architecture design-principles baseline and make
  canonical design review load it.
- Source: user direction on 2026-08-05 plus current design-review skills, roles,
  templates, tests, and projection behavior.
- Confirmed decisions:
  - the user's principle list is a minimum, not a closed checklist;
  - enrich it with reusable software design, architecture, reliability,
    operability, security, and evolution knowledge;
  - keep one canonical body and avoid a second review framework;
  - preserve risk-based lens selection and allow reasoned `N/A` decisions;
  - keep language-specific mechanisms as conditional examples rather than
    universal mandates.

## Current Phase

- Phase: canonical baseline implemented, reviewed, and verified.
- Owner: coordinator.
- Current authoritative review: `reviews/design-principles-r01.md`.
- Next checkpoint: handoff; no blocking finding remains in this change scope.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `plan.md` | reviewed | Semantic map, bounded edit, validation, and rollback. |
| `reviews/` | reviewed | Canonical baseline, integration, and validation gate. |
