---
artifact: requirements
status: draft
tags: [requirements, workflow, review, external-workflow]
description: "Requirements for non-UI external workflow, planning, and review absorption."
---

# Requirements

## Goal

Strengthen harness core workflows so agents can move from rough task input to
source-grounded requirements, approach selection, planning-artifact challenge,
implementation readiness review, and verification evidence without adding
frontend- or UI-specific process.

## Inputs

- User direction to follow the workflow and produce a draft first.
- Current harness core skills for workflow control, change workspaces, design
  refinement, planning, review gates, and verification.
- GitLens skill scan covering `dev-scope`, `deep-planning`, `challenge-plan`,
  `deep-review`, `review`, `investigate`, `triage`, `prioritize`, and
  `update-issues`.

## Non-Goals

- Do not add or plan frontend, UI, accessibility, CSS, visual audit, live UI
  exercise, webview, browser-driver, or design-system skills.
- Do not import GitLens-specific file paths, labels, commands, issue tracker
  scripts, branch naming, build commands, or product facts.
- Do not create a parallel workflow framework when existing core skills can be
  extended.
- Do not implement changes before this draft is reviewed and frozen.

## Acceptance Criteria

- The draft separates accepted candidates, deferred candidates, and rejected
  frontend/UI candidates.
- Each accepted candidate maps to an existing core asset or names why a new
  asset is justified.
- The proposal strengthens workflow, planning, review, and verification
  contracts without broadening runtime projection unexpectedly.
- The implementation plan can be sliced after review into bounded edits with
  focused tests and projection verification.
