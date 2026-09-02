---
artifact: research
status: draft
tags: [research, ponytail-minimality]
description: "Source-backed coverage and ownership assessment for Ponytail minimality absorption."
---
# Research

## Sources

- Ponytail commit `2ed6c52c9d7e5e56942508591085fd45dea277d3`:
  `skills/ponytail/SKILL.md`, `skills/ponytail-review/SKILL.md`,
  `docs/platform-native.md`, and `benchmarks/agentic/`.
- Current harness source:
  `skills/workflow/workflow-control/SKILL.md`,
  `skills/workflow/simplify/SKILL.md`,
  `skills/change/diagnose/SKILL.md`,
  `skills/change/verification-first/SKILL.md`,
  `skills/review/multi-lens-design-review/SKILL.md`,
  `skills/review/multi-lens-design-review/references/design-principles-baseline.md`,
  `agents/roles/planning-reviewer.md`, and
  `agents/roles/code-simplifier.md`.

## Findings

| Item | Current coverage | Gap | Smallest owner |
|---|---|---|---|
| Ordered pre-implementation ladder | Partial: planning review checks necessity, reuse, repository patterns, and simplification. | No explicit pre-code order; standard library, native platform, and approved dependency are not consistently distinguished. | One progressively loaded reference below `workflow-control`. |
| Understand first | Strong: constitution semantic mapping, simplify behavioral mapping, nearby caller/callee inspection. | No new rule needed; the canonical reference should route to these existing obligations. | Existing constitution and `simplify`. |
| Root cause/shared point | Strong for root cause in `diagnose`; partial for choosing one shared policy owner. | Connect the ladder to root-cause and knowledge-ownership checks without duplicating diagnosis. | Canonical reference plus existing `diagnose` and CQ-10 baseline. |
| Safety floor | Strong in constitution, simplify, verification-first, and design baseline. | Make the floor explicit at the minimality decision so one-line or low-LOC choices cannot outrank it. | Canonical reference. |
| Runnable check | Strong: `validation_target`, feedback-loop selection, task slice validation. | No new mechanism needed; require the ladder disposition to carry the existing narrow check. | Existing `verification-first`. |
| Over-engineering review | Partial: present inside planning-review principles and `design_quality`. | It is not independently selectable as a design-risk lens. | `multi-lens-design-review` and `planning-reviewer`. |
| Native platform first | Weak outside broad repository-pattern guidance. | Add a non-frontend platform check between runtime/stdlib and installed dependency/custom code. | Canonical reference and review routing. |
| Behavior A/B evaluation | Absent. Current tests prove prompt/source contracts and projection, not agent behavior. | Add a bounded evaluation recipe with seeded workspaces, fair arms, deterministic behavior/safety gates, and self-tested instruments. | A workflow-control reference added only after instruction contracts. |

## Rejected Expansion

- A new minimality skill would compete with `workflow-control` and `simplify`.
- New modes, hooks, per-session state, client adapters, and command aliases would
  copy Ponytail distribution mechanics rather than absorb its useful discipline.
- A provider-specific live runner would choose a model/client contract and add
  runtime complexity before the evaluation questions are stable.
- LOC alone is not an outcome: smaller output must first preserve required
  behavior, safety, and completeness.

## Open Questions

- None.
