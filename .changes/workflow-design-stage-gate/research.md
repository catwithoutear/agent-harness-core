---
artifact: research
status: draft
tags: [research, workflow, design, validation]
description: "Observed Core workflow and change-workspace evidence for staged design gates."
---

# Research

## Confirmed Current-State Facts

| Observation | Evidence | Consequence |
|---|---|---|
| The workflow loop says to apply the implementation-design trigger before task slicing. | `skills/workflow/workflow-control/SKILL.md`, Loop step 3 | The ordering against `design.md` is not explicit. |
| The trigger names cross-module and lifecycle/state/failure/migration/idempotency risk. | `skills/workflow/workflow-control/SKILL.md`, "Implementation-Design Trigger Rule" | A pack is for implementation topology risk, not every proposal. |
| `design.md` is an optional change artifact and currently needs a detailed-design index when present. | `schemas/change-workspace.schema.json`, `optional_files` and `design` | The workspace supports solution design before a pack, but does not express its phase gate. |
| `add-implementation-design` requires `README.md` and `specs/README.md`, but does not check whether a solution design has passed review. | `lib/change/doc-tool.js`, `commandAddImplementationDesign` | Tool eligibility is structural, not evidence of design readiness. |
| The pack templates cover code topology, interfaces, runtime flow, error model, and implementation plan. | `templates/changes/implementation-design/README.md`, Detailed Design Index | Its responsibility is mapping settled design to implementation detail. |
| README and README_CN say to create the pack before task slices when the trigger applies. | `README.md`, "Change Workspace Design Packs"; `README_CN.md`, corresponding section | The wording is correct about task slicing but can be misread as making the pack precede solution design. |
| `prototype-spike` already models proposal draft, design draft, design revision/freeze, then task slicing. | `skills/change/prototype-spike/SKILL.md`, Lifecycle Placement | Existing Core guidance supports a distinct solution-design stage. |

## Problem Boundary

The issue is not that every change needs more artifacts. The issue is that a
high-risk change can jump from a directional proposal directly into a detailed
implementation topology pack, allowing the pack to make unresolved solution
choices. Conversely, a localized change must retain a lightweight route and
must not be forced to create empty design packs.

## Derived Constraints

1. `proposal.md` remains directional: problem, alternatives, selected direction,
   non-goals, and risk boundary.
2. `design.md` resolves the solution contract: behavior, ownership, compatibility,
   failure semantics, validation intent, and explicit deferrals.
3. `implementation-design/` is conditional and downstream: it translates an
   accepted design into implementation topology, source anchors, sequencing,
   and test seams.
4. Task slicing begins only after the relevant preceding gate, not merely after
   files exist or a tool command succeeds. When the implementation-design
   trigger applies, that means a populated pack has itself converged through
   review, not merely that the pack directory was created.
5. Validators can report artifact shape and structural eligibility, but must not
   pretend to infer semantic design readiness from file presence.
6. The contract must use existing shared gate vocabulary and avoid a new
   project-specific workflow engine or mandatory ceremony.

## Evidence Boundary

These observations establish a workflow/documentation ambiguity and existing
asset boundaries. `design.md` and
`decisions/DR-002-stage-gate-simplification.md` now select readable workflow
guidance without a mechanical gate protocol.

The migration-bootstrap research below is retained only as historical evidence
for the already completed migration. It is superseded as implementation scope
by `DR-002-stage-gate-simplification.md`; it must not be used to add writer,
validator, schema, policy, control-state, or migration work to the workflow
stage-gate feature.

## Migration-Bootstrap Architecture Scout

### Verified Entry Points And Ownership

| Boundary | Verified current owner | Bootstrap relevance |
|---|---|---|
| Node document command | `bin/harness-change-doc.js` delegates to `lib/change/doc-tool.js`. | Add the controlled claim, migration apply, archive/provenance, and idempotency behavior here. |
| Python compatibility command | `lib/change/harness_change_doc.py` mirrors the document-command surface. | Preserve command and result parity; a Node-only apply path is not acceptable. |
| Node validation command | `bin/harness-change-validate.js` delegates to `lib/change/validator.js`. | Enforce control-record, migration-transaction, provenance, and legacy/structured mode rules. |
| Python compatibility validator | `lib/change/harness_change_validate.py` mirrors validator mode and layout behavior. | Preserve validation parity for every new control state and migration result. |
| State-root selection | `lib/change/root-resolution.js` resolves state/code roots and already fails on linked-worktree ambiguity. | Extend the existing resolver boundary; do not add a separate worktree/root selector. |
| Workspace policy | `schemas/change-workspace.schema.json` and `lib/change/js-policy.js`. | Reserve `.changes/.control`, define structured migration output, and expose only supported commands/artifacts. |
| Regression suite | `tests/test-change-tools.js` imports both Node entry points and invokes the Python mirror. | Focused parity, migration, preservation, retry, root-safety, and rejection tests belong here. |
| User-facing command guidance | `skills/change/change-workspace-operator/SKILL.md`, `README.md`, and `README_CN.md`. | Document the controlled command and matching Chinese/English workflow only after its behavior exists. |

### Verified Status Quo

1. Both current `migrate` implementations only emit a plan. Their proposals
   mark every legacy input as `apply_supported: false`; neither implementation
   has an apply mode.
2. `add-implementation-design` rejects a legacy workspace before it writes,
   while `add-task-slice` is currently only a structural child writer. The
   bootstrap must not use either command as readiness evidence.
3. The validator's all-active scan treats every non-ignored directory directly
   under `.changes/` as a change. A control directory therefore requires the
   same schema exclusion in Node and Python before ordinary all-active use can
   resume.
4. Current structured validation treats a top-level `review-log.md` as legacy
   migration input rather than canonical structured state. The future migration
   must archive it and resolve frozen historical references through provenance,
   not leave it in the active structured workspace.
5. Root resolution already has the relevant fail-closed states for conflicting
   explicit roots, duplicate worktree candidates, and a workspace owned by
   another linked worktree. Bootstrap must reuse those outcomes and add only the
   same-realpath/Core-identity admission checks required by its exception.

### Bootstrap Boundary

The bootstrap source surface is limited to document/validation/root/policy
behavior, mirrored Python support, focused tests, and their documentation. It
does not yet include the ordinary workflow phase-gate enforcement in
`workflow-control` or `change-planner`; after the originating workspace has
migrated, its required implementation-design pack must map that larger change
under the normal workflow.

### Risks To Carry Into The Bootstrap Plan

- The command and validator each have Node and Python implementations; changing
  only one would create a divergent migration authority.
- A partially installed migration output must remain fail-closed even though the
  existing mode detector currently recognizes `specs/README.md` directly.
- Existing `review-log.md` and `tasks.md` are content that must be archived as
  historical evidence, not mechanically reclassified as current structured
  children.
- The code-root snapshot used by the scope gate must exclude only non-source
  state such as `.changes` and projected output; an unrelated source-owned dirty
  path must block bootstrap admission rather than be silently omitted.
