---
artifact: task-slice
status: reviewed
tags: [implementation, user-global-constitution, constitution-template]
description: "Add user-global constitution template and README guidance."
---

# Slice: Template And README

## Objective

Add the approved user-global agent constitution as a core-owned template and document the explicit installation prompt.

## Scope

- Source design: `design.md`
- Goal: make the constitution reusable and discoverable without installing it automatically.
- Non-goals: no projector behavior change, no manifest change, no global file write, no hook change, no skill rewrite.
- Scope: documentation/template only.
- Subsystem: core templates and README documentation.
- Module: `templates/`, `README.md`, `README_CN.md`, and `AGENTS.md`.
- Changed surfaces:
  - `templates/user-global/AGENTS.md`
  - `README.md`
  - `README_CN.md`
  - `AGENTS.md`
- Prerequisites: user accepts the constitution text in `design.md`.

## Steps

- [x] Create `templates/user-global/AGENTS.md` with the approved English constitution.
- [x] Keep the template heading as `# Agent Constitution`.
- [x] Add English README guidance for explicit user-global installation by an AI agent.
- [x] Add `README_CN.md` as a full Chinese translation and point to it from `README.md`.
- [x] Update `AGENTS.md` to require synchronized README/README_CN updates when either file changes semantic content.
- [x] Keep language boundary documented: Chinese for user-facing communication and full `README_CN.md`; English for long-lived core source assets.
- [x] Ensure `README_CN.md` faithfully covers the same sections and installation guidance as `README.md`.
- [x] Do not modify `harness.manifest.json`, projector code, or projection tests in this slice.

## Validation

- [x] Run `node bin/harness-change-validate.js --repo-root . --change user-global-constitution`.
- [x] Run `git diff --check`.
- [x] Confirm no user-global `AGENTS.md` was written.
- [x] Confirm `harness.manifest.json`, projector code, and projection tests were not changed by this slice.
- [x] Inspect `README.md` and `README_CN.md` for language-boundary consistency and translation completeness.
- [x] Inspect `templates/user-global/AGENTS.md` to confirm the title remains `# Agent Constitution`.
- [x] Inspect `AGENTS.md` to confirm the sync rule is present and scoped to semantic README/README_CN changes.

Validation evidence:

- `node bin/harness-change-validate.js --repo-root . --change user-global-constitution`: ready, 0 errors, 0 warnings.
- `node tests/run-tests.js`: all requested tests passed.
- `node bin/harness.js manifest --json`: ok, 0 errors, 0 warnings.
- `git diff --check`: passed.
- `rg -n "[ \t]+$" README.md README_CN.md AGENTS.md templates/user-global/AGENTS.md`: no trailing whitespace matches.
- `rg -n "^#|^##|^###" README.md README_CN.md`: section structure inspected.

## Review

- Review packet:
  - Scope: template and README guidance.
  - Design source: `design.md`.
  - Validation: workspace validation plus affected repo checks.
- Review owner: coordinator.
- Review result: `READY_WITH_NOTES`.

Residual notes:

- The core worktree still contains pre-existing simplify-related dirty files outside this slice. Keep this slice in a separate logical commit.
- `.changes/` is ignored by the user-level gitignore; force-add this workspace if it should be committed.

## Rollback

- Remove the new template, README section, `README_CN.md`, and the `AGENTS.md` synchronization rule.
- No user-global state rollback should be needed.

## Open Decisions

- None.
