---
artifact: plan
status: reviewed
tags: [workflow, design, review, validation, design-principles-baseline]
description: "Compact plan for the canonical design-principles baseline."
---

# Plan

## Goal

Give design-document reviewers one stable, project-agnostic baseline for code
and architecture quality. The baseline must be actionable from evidence, richer
than a slogan list, and integrated into existing canonical review paths.

## Current Semantic Map

- `skills/review/multi-lens-design-review/SKILL.md` owns design-readiness
  orchestration, risk-based lens selection, evidence rules, and readiness
  decisions. It is the smallest correct owner for loading the baseline.
- A reference below that skill is the correct home for the detailed baseline:
  it remains one canonical body, is loaded only for design-quality review, and
  is copied with the skill directory to flat client runtime locations.
- `agents/roles/planning-reviewer.md` owns independently dispatchable planning
  and design readiness review. It should route design-quality checks to the
  same baseline rather than copy the rubric.
- `templates/changes/implementation-design/README.md` already maps detailed
  design to topology and readiness evidence. It may name the baseline as a
  review input, but must not duplicate it.
- `tests/test-skills.js` and `tests/test-subagents-hooks.js` own the semantic
  source locks for skills and canonical review roles. Projection tests establish
  that skill directories, including references, are copied to client runtime.

## Scope

- Add `skills/review/multi-lens-design-review/references/design-principles-baseline.md`.
- Update the owning skill to load and apply the reference without running every
  lens or reporting every principle mechanically.
- Update `planning-reviewer` and the implementation-design index to route to the
  single baseline.
- Add focused source and projection assertions for coverage, integration, and
  project-agnostic content.

## Non-goals

- No new policy schema, score, capability model, or parallel review workflow.
- No project, product, vendor, framework, or language-specific mandate.
- No edits to projector code, manifest routing, client metadata, or projected
  runtime files.
- No requirement to print every baseline item in every review.

## Approach

Keep `multi-lens-design-review` as the existing orchestration owner and place the
detailed baseline in one progressively loaded reference beneath it. Route the
canonical planning reviewer and implementation-design review to that resource,
then use semantic and projection tests to prevent orphaning or duplication.

## Implementation Steps

1. Write the baseline with usage rules, evidence discipline, universal code and
   architecture principles, conditional language mappings, warning signs, and
   tradeoffs.
2. Make the design-review protocol perform a baseline applicability pass before
   selecting the smallest risk-justified reporting lenses.
3. Route the canonical planning reviewer and implementation-design review to the
   same baseline without copying its detailed content.
4. Lock minimum coverage, reference reachability, runtime projection, and
   project-agnostic boundaries in tests.
5. Review the completed diff against the user's minimum list and the baseline's
   own actionability contract.

## Validation

- Focused skill and subagent source tests.
- Projection test showing the baseline reference is copied with the skill.
- Full `npm test` and manifest validation.
- Repository-owned Codex projection verification.
- Change-workspace validation and `git diff --check`.

## Rollback

Remove the reference and its three routing/test additions as one documentation
contract change. No runtime state, persisted data, external system, or public
API is affected.

## Implementation-Design Assessment

No implementation-design pack is required. This is a bounded documentation and
review-contract change within one existing skill family plus its canonical role
and tests. It adds no runtime dependency order, lifecycle, state transition,
migration, concurrency, or failure semantics.
