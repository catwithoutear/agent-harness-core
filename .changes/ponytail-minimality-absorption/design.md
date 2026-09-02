---
artifact: design
status: draft
tags: [design, ponytail-minimality]
description: "Minimal source ownership for Ponytail discipline and evaluation absorption."
---
# Design

## Detailed Design Index

| Area | Document |
|---|---|
| Canonical implementation ladder | `skills/workflow/workflow-control/references/minimal-implementation.md` |
| Workflow entry | `skills/workflow/workflow-control/SKILL.md` |
| Post-implementation pass | `skills/workflow/simplify/SKILL.md`, `agents/roles/code-simplifier.md` |
| Independent review lens | `skills/review/multi-lens-design-review/SKILL.md`, `agents/roles/planning-reviewer.md` |
| Behavior evaluation, implemented last | `skills/workflow/workflow-control/references/minimality-behavior-evaluation.md` |
| Contract and projection tests | `tests/test-skills.js`, `tests/test-subagents-hooks.js`, `tests/test-projection.js` |

## Dependency Direction

- `workflow-control` owns the pre-implementation decision point and its compact
  canonical ladder.
- Other skills and roles route to that reference; they do not copy or fork the
  ladder.
- `diagnose`, the design-principles baseline, and `verification-first` retain
  ownership of root-cause evidence, knowledge ownership, and validation fidelity.
- The evaluation reference measures the settled candidate contract. It does not
  feed new state back into runtime behavior.

## Guardrails

- The ladder is sequential but not a demand to use every lower level. Stop at
  the first safe level that fully meets current requirements.
- Native-platform-first is limited to backend/runtime/OS/build/deployment
  capabilities and must respect portability and repository support constraints.
- Size is a diagnostic signal after correctness, safety, and completeness gates,
  never the primary acceptance criterion.

## Implementation-Design Assessment

No implementation-design pack is required. The change adds two references and
routes existing prompt contracts to them. It introduces no public API, runtime
dependency order, lifecycle, persisted state, migration, concurrency, or failure
protocol. The file-owner table above is sufficient for the bounded content
change.
