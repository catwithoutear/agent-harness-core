---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 3: register the read-only verifier and extend role/projection contracts."
---
# Slice: delegated-verifier-projection

## Objective

Add the narrowly authorized deep-coverage verifier while preserving the
reviewer's findings-first authority and the existing four-client projection
mechanism.

## Scope

- Source design: `implementation-design/02-code-topology.md` role boundaries;
  `03-class-design.md` responsibility table; `06-implementation-plan.md` step
  3; `07-constraints.md` authority and projection constraints.
- Goal: standard/deep reviewer output gains its conditional ledger, deep
  verification gains a read-only inventory/compare role, and all supported
  client projections expose the canonical source unchanged.
- Non-goals: verifier code editing, full duplicate correctness review,
  overall-gate ownership, projector rewrites, manifest-validator rewrites, or
  client-specific role prompt forks.
- Scope: reviewer conditional output, new verifier role, manifest registration,
  role/manifest/projection contract tests, and generated self-projection only
  through the project tool.
- Subsystem: delegated coverage verification.
- Module: canonical roles, manifest asset index, and existing generic
  projection tests.
- Changed surfaces: `agents/roles/reviewer.md`, new
  `agents/roles/review-verifier.md`, `harness.manifest.json`,
  `tests/test-subagents-hooks.js`, `tests/test-manifest.js`, and
  `tests/test-projection.js`.
- Prerequisites: slices 001 and 002 `READY`; the verifier must consume the
  helper and packet contracts rather than recreate them.

## Steps

- [x] Add failing role/manifest/projection assertions, including the new agent
      count and four-client rendering expectation.
- [x] Extend the reviewer only for explicit standard/deep coverage output;
      preserve legacy no-mode evidence-first behavior and findings ordering.
- [x] Create the verifier role with phase-1 information isolation, phase-2
      expected/ledger compare authority, read-only restriction, and explicit
      exclusions from edits, overall gates, and broad correctness re-review.
- [x] Register the single canonical role in the manifest and reuse existing
      generic projection code unless a failing test proves a concrete generic
      gap.
- [x] Refresh self-projection through `harness-project` only after source tests
      require it, then record the verification output.

## Validation

- [x] `npm test -- --manifest --subagents --projection` fails before source
      additions and passes after them.
- [x] `node bin/harness.js manifest --json` reports the new role without
      diagnostics.
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json` passes after any tool-mediated refresh.
- [x] `git diff --check` passes for all slice surfaces.

## Review

- Review packet: role diffs, manifest row, focused red/green test output,
  rendered client projection evidence, and authority-boundary checklist.
- Review owner: delegated-agent and projection reviewer using separation of
  duties, compatibility, projection-drift, and simplicity lenses.
- Gate: `READY` only when the new role remains source-canonical, read-only, and
  project-agnostic across all manifest clients.

## Rollback

- Revert the manifest role row, verifier role, reviewer conditional sections,
  contract tests, and tool-generated projections as one bounded slice.

## Open Decisions

- None
