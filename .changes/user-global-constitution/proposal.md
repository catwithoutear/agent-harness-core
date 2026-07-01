---
artifact: proposal
status: draft
tags: [proposal, user-global-constitution, constitution-template]
description: "Proposal for adding a user-global constitution template to core."
---

# Proposal

## Why

The source prompt contains both broadly useful behavioral principles and overly specific workflow mechanisms. The durable value is the constitution-level guidance: read before mutation, reason independently, verify before claiming done, avoid unsupported facts, respect project conventions, and keep evidence traceable.

Those rules are useful across repositories, but mechanisms such as mandatory backups, mandatory `CHANGELOG.md`, mandatory `IMPLEMENT.md`, fixed coverage thresholds, and session footers would be too heavy and project-specific for the user-global layer.

## What Changes

Add a core-owned user-global constitution template and document how it should be used:

- store the English constitution text as a reusable source template;
- document the language boundary: Chinese for user-facing discussion, English for long-lived agent assets;
- add English README guidance that asks an AI agent to install the template only when explicitly requested;
- add `README_CN.md` as a full Chinese translation of `README.md` and link to it from `README.md`;
- update core `AGENTS.md` so future README semantic-content edits keep `README.md` and `README_CN.md` synchronized;
- keep the first slice documentation-only, with no manifest or projector changes;
- keep installer automation out of the first slice.

## Impact

- Positive: gives a reusable global rule set without importing a large process framework.
- Positive: protects agreed plans while preserving agent judgment.
- Positive: clarifies language use across user communication and agent-loaded assets.
- Positive: gives Chinese readers full access to the README content.
- Positive: records the README synchronization rule where future agents are most likely to see it before editing.
- Neutral: no behavior changes until the user explicitly installs or copies the template.
- Neutral: no projection behavior changes because the template is not a manifest asset in this slice.
- Risk: a global constitution can still become too broad if future edits add workflow mechanics; the template must stay short.
- Risk: `README_CN.md` can drift from `README.md`; `AGENTS.md` must make semantic-content synchronization a repository editing rule without forcing paired changes for formatting-only edits.

## Validation

- Validate the change workspace with `harness-change-validate --repo-root <core> --change user-global-constitution`.
- After implementation, run the core checks affected by templates and docs:
  - `git diff --check`.
- Manually inspect that no user-global file was written.
- Manually inspect that `harness.manifest.json` and projector code were not changed.

## Rollback

Remove the new template, README reference, `README_CN.md`, and the `AGENTS.md` synchronization rule. No manifest, projector, or user-global state rollback should be needed because this proposal does not change projection behavior or install anything automatically.
