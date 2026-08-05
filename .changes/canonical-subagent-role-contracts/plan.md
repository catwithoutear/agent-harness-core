---
artifact: plan
status: draft
tags: [workflow, review, validation, canonical-subagent-roles]
description: "Plan for completing canonical subagent role contracts without projection changes."
---

# Plan

## Goal

Make each canonical subagent role independently dispatchable by restoring the
role-level semantics needed to understand when to use it, what evidence and
inputs it requires, how it works, when it stops, and what it returns.

## Current Semantic Map

Keep these roles unchanged unless review finds a concrete contract gap:

- `code-simplifier`: already defines authorization, inputs, coverage modes,
  rounds, failure statuses, evidence, validation, and output.
- `planning-reviewer`: already defines review principles, authority, inputs,
  review modes, evidence, gate result, and output.
- `review-verifier`: already defines isolated inputs, inventory and compare
  modes, failure vocabulary, and coverage-gate ownership.

Enrich these under-specified roles:

- `code-worker`: scoped implementation method, source context, plan-conflict
  stop, behavior safeguards, validation, and failure handoff.
- `council-synthesizer`: independent-position inputs, evidence weighting,
  conflict handling, minority preservation, and decision-owner boundary.
- `design-alternatives`: orthogonality criteria, repository grounding,
  non-options, comparison, uncertainty handling, and selection handoff.
- `harness-orchestrator`: generic routing, evidence gates, subagent feedback,
  bounded workflow states, stopping conditions, and owner decisions.
- `implementation-planner`: frozen-input gate, traceability, ordered slices,
  deferrals, validation, rollout, rollback, and missing-input behavior.
- `repo-mapper`: entry points, execution and data flow, ownership, precedents,
  coupling, tests, source/inference distinction, and confidence gaps.
- `reviewer`: strict review authority, review packet inputs, evidence-first
  method, finding confidence, validation limits, and existing coverage modes.
- `solution-designer`: selected-direction input, repository grounding,
  boundaries, contracts, state and failure behavior, compatibility, risk, and
  implementation handoff without task sequencing.

The OpenCode prompts are comparison evidence, not copy sources. Product names,
local validator commands, client-native frontmatter, specialized language or
backend policy, and obsolete workflow assumptions remain excluded.

## Scope

- Canonical sources under `agents/roles/`.
- Matching manifest descriptions only when a canonical dispatch description is
  clarified and the existing source-manifest equality invariant requires it.
- Source-level regression assertions in `tests/test-subagents-hooks.js`.

## Non-goals

- No edits to `lib/project/projector.js` or other projection logic.
- No client-native mode, permission, sandbox, model, or tool metadata work.
- No refresh or manual edits under `.codex/`, `.claude/`, `.opencode/`, `.omp/`,
  or other projected runtime roots.
- No project-specific implementation, build, tracker, or environment guidance.
- No new role hierarchy, shared prompt framework, or dependency.

## Approach

Use the canonical role file as the complete behavioral source for each
subagent. Transfer only generic role semantics from the comparison prompts,
keep the existing role boundaries and packet vocabulary, and lock the restored
contracts with source-level tests before any projection work begins.

## Implementation Steps

1. Preserve complete roles and enrich only the eight identified gaps.
2. Keep each role narrow and name adjacent roles for out-of-scope work.
3. Add explicit required inputs, evidence rules, working method, early exits,
   and structured output where missing.
4. Synchronize manifest descriptions only when frontmatter changes.
5. Add source-level assertions for the restored role contracts.
6. Review every canonical role against the subagent rubric and correct blockers.

## Validation

- Source-level subagent tests for all canonical role contracts.
- Manifest validation to confirm source and asset descriptions remain aligned.
- Full package tests to detect unrelated source-asset regressions.
- Change-workspace validation and `git diff --check`.
- Projection verification and runtime refresh are deliberately deferred to the
  next phase because this phase must not modify or repair projections.

## Rollback

Revert the canonical role, matching manifest-description, and source-test edits
as one bounded documentation contract change. No persisted data, migration, or
external system is affected.

## Implementation-Design Assessment

No implementation-design pack is required. The change edits independent
Markdown role contracts plus their existing manifest/test locks; it introduces
no runtime module dependency, lifecycle, state transition, migration, public
API, or implementation-order risk.
