---
artifact: requirements
status: draft
tags: [requirements, ponytail-minimality]
description: "Settled requirements for priority-ordered Ponytail minimality absorption."
---
# Requirements

## Goal

Strengthen the existing harness workflow so implementation starts from the
smallest safe solution and review can detect avoidable custom code without
turning minimality into a second workflow or a line-count contest.

## Required Absorption

| Priority | Item | Required outcome |
|---|---|---|
| P0-1 | Pre-implementation minimality ladder | Before custom code, check necessity, repository reuse, standard library/runtime, native non-frontend platform capability, approved installed dependency, direct local expression, then minimum custom code. |
| P0-1 | Understand before simplifying | Map intended behavior, callers, invariants, and ownership before choosing a smaller implementation. |
| P0-1 | Root-cause/shared-point fix | Prefer the authoritative shared owner when one root cause affects multiple paths; do not force reuse when semantics differ. |
| P0-1 | Safety and irreducible boundaries | Never trade away required behavior, validation, errors, security, compatibility, lifecycle, or maintainability merely to reduce lines or files. |
| P0-1 | One runnable check | Every implementation slice names the narrowest runnable check, or an explicit reason execution is unavailable. |
| P0-2 | Independent over-engineering lens | Planning/design review can select over-engineering as an independent risk dimension instead of burying it inside generic design quality. |
| P1 | Native-platform-first dimension | Check language runtime, operating-system, build, deployment, and other non-frontend platform capabilities before adding custom code or a dependency. |
| P0-3 | Behavior-level A/B evaluation | Compare a fair baseline and candidate in isolated seeded workspaces, gate on behavior and safety before size, and self-check the instruments. Implement this last. |

## Constraints

- No frontend content, examples, components, browser APIs, or UI framework
  recommendations.
- Reuse current skills, roles, references, projection, and test routing.
- Do not import Ponytail persona, modes, session state, host adapters, or command
  surface wholesale.
- Do not add a parallel workflow, review protocol, state store, dependency, or
  model-specific runtime.
- Do not add encryption, signatures, SHA-256, digest sealing, or ledger
  machinery for this change.
- The behavior evaluation must distinguish instrument self-test from a real
  model/client A/B run. A static source assertion is not behavior evidence.

## Acceptance Criteria

- One canonical minimal-implementation reference owns the ordered ladder and
  safety floor.
- `workflow-control` loads the reference before task slicing or implementation
  when custom code is proposed.
- planning review exposes a separately selectable over-engineering lens and can
  use the same reference without copying its rubric.
- post-implementation simplification checks the same decision order while
  preserving its existing authorization and behavior boundaries.
- existing `diagnose` and `verification-first` coverage is retained and cited
  rather than reimplemented.
- focused tests prove source routing and multi-client projection.
- the final evaluation artifact defines fair A/B arms, seeded backend tasks,
  behavior/safety gates, size signals, and instrument self-tests; any live run
  remains explicitly labeled until actually executed.
