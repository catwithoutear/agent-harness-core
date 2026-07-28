---
artifact: task-slice
status: draft
tags: [implementation]
description: "projection-and-final-verification"
---
# Slice: projection-and-final-verification

## Objective

Prove that the reviewed canonical workflow reaches every existing client
surface according to the current capability matrix and passes the full
repository gate.

## Scope

- Source design: `implementation-design/06-implementation-plan.md:Validation
  Matrix`; reviewed slices 001 and 002.
- Goal: projection tests cover actual supported and unsupported client paths,
  self-hosted runtime is regenerated, and all repository checks pass.
- Non-goals: new projector routes, new client support, command aliases, or
  changes to workflow meaning.
- Scope: projection assertions, generated self-hosted runtime, full
  verification, simplify pass, and final review.
- Subsystem: package projection.
- Module: projection tests and verification.
- Changed surfaces: `tests/test-projection.js` and projector-owned runtime
  outputs generated from canonical assets.
- Prerequisites: slices 001 and 002 are reviewed `READY`; their task-owned
  commits form the recorded stacked base.

## Steps

- [ ] Add projection assertions for updated skills, rules, templates, and
  workflow/plan command content.
- [ ] Verify project skills/rules/templates for existing supported clients;
  Claude/OMP project commands succeed; Codex/OpenCode project commands remain
  unsupported; Codex global prompts retain the deprecated warning and updated
  text.
- [ ] Run a behavior-preserving simplify review over the exact source diff.
- [ ] Regenerate the self-hosted Codex runtime from canonical sources.
- [ ] Run focused and full repository verification and prepare the final review
  packet.

## Validation

- [ ] `npm test -- --skills`: passes.
- [ ] `npm test -- --projection`: passes.
- [ ] `npm test`: passes.
- [ ] `node bin/harness.js manifest --json`: passes.
- [ ] Codex self-host projection and `--verify --json`: pass for
  `rules,templates,skills,subagents,hooks`.
- [ ] Run:
  `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --conflict overwrite --json`.
- [ ] Run:
  `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`.
- [ ] `git diff --name-status <implementation-base>..HEAD` contains only the
  reviewed workflow-stage source, metadata, tests, and generated projections;
  it contains no writer, validator, schema, policy, migration, route,
  client-capability, or phase-state change.
- [ ] `node bin/harness-change-validate.js --state-root . --change
  workflow-design-stage-gate --strict-layout --status --json`: 0 errors; only
  explicitly accepted warnings remain.
- [ ] `git diff --check`: passes.

## Review

- Review packet: implementation base, aggregate
  `git diff --name-status <implementation-base>..HEAD`, stacked task commits,
  projection capability matrix, focused/full test output, projector/verify
  output, change validation, simplify result, excluded-surface proof, and
  residual warnings.
- Review owner: independent final reviewer; coordinator owns the overall gate.

## Rollback

- Revert the task-owned commit and regenerate projections from reviewed slices
  001 and 002.

## Open Decisions

- None
