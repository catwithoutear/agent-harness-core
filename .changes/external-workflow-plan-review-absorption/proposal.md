---
artifact: proposal
status: draft
tags: [proposal, workflow, review, external-workflow]
description: "Proposal for workflow, planning, and review absorption from external skills."
---

# Proposal

## Why

The GitLens skill scan surfaced useful workflow discipline beyond
`challenge-plan`: scope packets, approach comparison, review completeness, and
evidence gates. These are valuable for harness core because they strengthen how
agents plan and review work before implementation.

The same scan also contains many frontend/UI and product-specific skills. Those
must not enter this change. The absorption boundary is workflow, planning,
review, and verification only.

## What Changes

Absorb only the workflow-control, planning, review, and verification disciplines
that are generic to agent work. Do this by extending existing harness assets
first. Add a new runtime skill only if an accepted candidate has a distinct
trigger, stable output contract, and no adequate existing owner.

### Accepted First-Wave Tracks

#### Track A: Scope Packet Before Approach Selection

Borrow the `dev-scope` discipline, but express it in `.changes` terms:

- classify source claims as confirmed, disputed, or unverifiable;
- capture outcome expectations without adding UI-specific review;
- map code landscape and risk areas;
- record constraints and scoping confidence.

Preferred home: `design-doc-refiner`, `change-workspace-operator`, and change
workspace requirements guidance.

#### Track B: Approach Selection With Alternatives

Borrow the `deep-planning` discipline:

- define success criteria before choosing an approach;
- inspect current source and reusable patterns;
- question the status quo when local patterns look historical or limiting;
- use external research only when the domain is not purely internal;
- compare 1-3 approaches and recommend one with tradeoffs.

Preferred home: `architecture-scout` for source research and
`design-doc-refiner` for the refined approach document.

#### Track C: Planning Artifact Challenge Gate

This is already partly absorbed into `grill-with-docs` in the current working
tree. Keep it as an evidence-backed challenge pass for drafts, proposals,
plans, designs, detailed designs, and selected approaches, not a new runtime
skill:

- assumptions,
- source-verified claims,
- pre-mortem,
- severity,
- alternatives,
- readiness verdict.

Preferred home: `grill-with-docs` plus tests that guard trigger routing,
read-only boundaries, and separation from formal design readiness review,
approach generation, task slicing, and implementation review.

#### Track D: Review Gate Completeness

Borrow the `deep-review` and impact-audit discipline:

- compare implementation evidence against the accepted scope packet or design;
- trace changed symbols to consumers and adjacent contracts;
- distinguish correctness findings from completeness findings and validation
  gaps;
- produce a readiness verdict that names residual risk.

Preferred home: `review-packet-gate`, `multi-lens-design-review`,
`planning-reviewer`, and `reviewer`.

### Deferred

#### Track E: Evidence Discipline For Improvement Claims

Track E is deferred to a follow-up verification-focused change. The generic
lesson remains useful, but the first wave should stay focused on workflow,
planning, and review contracts.

- measured claims need before/after evidence;
- convention claims need a repository-owned convention;
- speculation stays as an open question and must not trigger implementation.

Potential future home: `verification-first` and review packet evidence format.

#### Tracker Automation

Tracker automation from `triage`, `prioritize`, and `update-issues` should wait
until there is a tracker-agnostic adapter design. The safety lessons are useful:
evidence packs, confidence gates, dry-run before mutation, and explicit user
approval for external state changes. The GitHub commands and label conventions
are not portable core assets.

## Impact

If accepted, this change will likely touch source skills under `skills/change/`,
`skills/knowledge/`, `skills/workflow/`, and `skills/review/`, plus selected
subagent role prompts and tests. It should not touch third-party UI skills,
frontend assets, browser tooling, or tracker-specific scripts.

The current uncommitted `grill-with-docs` planning-artifact challenge slice
should be treated as Track C evidence and reviewed against this draft before
additional tracks start.

## Validation

- `node bin/harness-change-validate.js --repo-root . --change external-workflow-plan-review-absorption`
- `npm test` after source skill or test edits begin.
- `node bin/harness.js manifest --json` after manifest edits.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json` after projection-affecting edits.
- `git diff --check`

## Rollback

Before implementation, rollback is deleting this draft change workspace. After
implementation starts, rollback is reverting the accepted source skill, role,
manifest, test, and projected runtime changes for the affected tracks.

## Recommended Review Order

1. Treat Tracks A-D as the frozen first-wave scope.
2. Keep Track E as a follow-up verification change unless the user reopens the
   scope.
3. Slice implementation by existing asset owner, not by external source skill.
4. Run skill/manifest tests and projection verification after each accepted
   implementation slice.
