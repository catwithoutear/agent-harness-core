---
artifact: change-index
status: draft
tags: [workflow, user-global-constitution]
description: "User-global agent constitution change workspace."
---

# User-Global Agent Constitution

## Task Summary

- Task: absorb constitution-level engineering discipline rules into Agent Harness Core as a reusable user-global template.
- Source: user discussion plus `/tmp/global-engineering-discipline-absorption-plan.md`.
- Confirmed decisions:
  - User-facing plans, explanations, review reports, and answers use Chinese.
  - Long-lived rules, skills, agent prompts, configuration, code, and templates use English.
  - Core `README.md` additions use English because the README is a long-lived repository asset.
  - Add `README_CN.md` as a full Chinese translation of `README.md`, and link to it from `README.md`.
  - Update core `AGENTS.md` to require synchronized updates when `README.md` or `README_CN.md` changes.
  - README synchronization is required for semantic content changes, not formatting-only or typo-only edits.
  - Keep the template title as `# Agent Constitution`.
  - The first slice is documentation-only: do not add the template to `harness.manifest.json` and do not change projector behavior.
  - Professional terminology should prefer common industry English.
  - The user-global layer should contain constitution-level rules only.
  - Do not add project-specific workflow mechanisms such as mandatory `IMPLEMENT.md`, `CHANGELOG.md`, backup files, archive zips, session trackers, fixed coverage thresholds, or fixed test commands.
  - Do not auto-install or overwrite user-global `AGENTS.md` in this change.

## Current Phase

- Phase: implementation reviewed
- Owner: coordinator
- Next checkpoint: user reviews the implementation diff before commit.

## Task Tag Registry

| tag | description |
|---|---|
| user-global-constitution | User-global agent behavior constitution and install template work. |
| language-boundary | Boundary between Chinese user-facing communication and English long-lived agent assets. |
| constitution-template | Reusable template content for user-global AGENTS-style instructions. |

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `requirements.md` | draft | Capture accepted requirements and non-goals. |
| `terminology.md` | draft | Define task-local terms used by the constitution design. |
| `proposal.md` | draft | Explain the change shape, impact, validation, and rollback. |
| `design.md` | draft | Provide the detailed design and candidate constitution text. |
| `specs/README.md` | draft | Record that no delta spec file is needed for this template-only change. |
| `tasks/README.md` | draft | Index implementation task slices. |
| `timeline/README.md` | draft | Index decision-changing chronology. |
| `reviews/README.md` | reviewed | Index review rounds and freeze readiness notes. |
