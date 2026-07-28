---
artifact: proposal
status: draft
tags: [proposal, workflow, design, validation]
description: "Proposal for explicit solution-design and implementation-design phase gates."
---

# Proposal

## Why

The Core workflow correctly requires an implementation-design trigger to be
considered before task slicing, but it does not explicitly place `design.md`
before a conditional `implementation-design/` topology pack. The pack is then
easy to mistake for the place where unresolved solution choices should be made.
That reverses its intended responsibility and creates unnecessary empty packs
for work that still needs a solution-design gate.

## Desired Outcome

Define a generic staged contract in which a directional proposal is challenged,
the solution design is settled and reviewed, implementation-design necessity is
then assessed, and task slices derive only from the accepted preceding artifact.

## Non-goals

- Requiring `design.md` or an implementation-design pack for every low-risk
  documentation or localized change.
- Making validators infer semantic readiness merely from an artifact directory.
- Introducing a workflow engine, project-specific issue process, UI, provider,
  or client-specific phase implementation.
- Changing the review-verifier V2 protocol or treating this workflow change as
  a dependency of V2's design review.

## What Changes

The selected direction is a phase model with explicit artifact responsibilities
and evidence gates:

1. Observe and collect source-backed context.
2. Draft and challenge `proposal.md` to select a direction and enumerate design
   obligations.
3. Draft `design.md` to resolve the selected solution contract and its known
   risks; review it with the appropriate design lenses.
4. After the design gate, assess the implementation-design trigger. When it
   applies, create, populate, and review `implementation-design/` to
   convergence as the topology and execution mapping of the accepted design.
5. Create task slices only after the preceding required gate is ready: after
   `design.md` for an explicit no-pack decision, or after the populated
   implementation-design pack has its own ready gate when the trigger applies.

The workflow must distinguish **assessment** of the trigger from **creation**
of the pack. A structural `add-implementation-design` success is not a design
gate, and a created-but-unresolved pack must not authorize task slicing.

## Risk Boundary

| Risk | Boundary to resolve in design |
|---|---|
| The new phase model adds ritual to small work. | Define a documented lightweight exception and no-design rationale. |
| Agents treat file presence as semantic approval. | Require agents to read the current artifact and review before transitioning. |
| The pack becomes another proposal/design copy. | Define its input as an accepted solution design and its output as implementation topology only. |
| Existing legacy changes cannot be migrated safely. | Preserve legacy artifact validity and apply the new gate prospectively unless an owner explicitly restructures a change. |
| Documentation and client projections drift. | Identify canonical source owners and paired README/README_CN/projection tests before implementation. |
| This task expands into review-verifier V2 work. | Keep V2 as an evidence source and separate change workspace; no shared source edits without an explicit later dependency decision. |

## Impact

If accepted, a later implementation may touch the generic workflow-control and
change-workspace-operator skill contracts, user-facing README and README_CN
guidance, command wording, templates, rules, focused tests, and projection
coverage. Validators, schemas, writers, migration, and policy remain unchanged;
semantic readiness stays with the coordinator and reviewer.

## Validation

This proposal phase validates only artifact integrity and source-backed scope:

- index and validate this workspace;
- challenge the proposal against current workflow, tool, template, and schema
  evidence;
- run `git diff --check` for tracked source changes when implementation begins.

No source behavior or phase enforcement is claimed in this phase.

## Rollback

No Core source asset changes in this phase. The draft can be superseded without
affecting existing change workspaces, packs, task slices, or V2 review runs.
