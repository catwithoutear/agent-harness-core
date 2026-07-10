---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation, review-coverage, review-verification]
description: "Design constraints, anti-pattern checks, and readiness self-review."
---
# Constraints and Self Check

## N/A Usage

Before readiness or freeze, every row below needs either evidence or
`N/A - <reason>`. Do not leave empty result cells in a frozen design.

## Constraints

| Constraint | Applies to | Enforcement or review check |
|---|---|---|
| Core remains project-agnostic. | Every source asset and fixture. | Reject product files, build commands, proprietary rules, or target repository paths in implementation review. |
| Existing Review -> Verify chain remains authoritative. | Packet skill, roles, workflow, commands. | No parallel skill/root; source anchors show additions to existing owners. |
| Deep identity is portable and reproducible. | Digest helper and packet contract. | Full object IDs, canonical byte components, declared non-Git input, and no local path as identity. |
| Deep failure is fail-closed. | Helper, verifier, workflow. | Missing/stale fingerprint, packet seal, or required source cannot produce unqualified coverage `READY`. |
| Helper stays bounded and read-only. | New script. | Stdout-only contract; no caches, packet writes, ledger parser, network calls, or source edits. |
| No V1 ledger parser/schema. | Script, fixtures, roles, tests. | Reject AST/model/store additions; fixtures guide role behavior but are not parsed for semantic verdicts. |
| Verifier authority is limited. | New role and command routing. | Read-only inventory/compare; no reviewer findings in inventory; no editing or `overall_gate`. |
| Compatibility is preserved when mode absent. | Packet skill, reviewer role, workflow, and commands. | No mode is legacy evidence-first review with no helper, verifier, coverage gate, or coverage assurance claim. |
| Projection stays generic and four-client. | Manifest, projector, tests. | Register role through current manifest; no client-specific prompt forks. |
| Evidence labels are phase-correct. | Tests, reviews, handoff. | Mark static/helper evidence, projection evidence, and fresh-agent evidence with separate fidelity. |

## Self Check

| Check | Result | Evidence | Follow-up |
|---|---|---|---|
| Requirement/source fact to implementation-step trace is complete | draft self-check passed | `01-problem.md:## Source Artifacts`; `06-implementation-plan.md:## Design-to-Code Traceability` | Formal review must independently confirm. |
| Stable source anchors are present or explicitly not applicable | draft self-check passed | `02-code-topology.md:## Source Anchors` uses symbols/headings; script anchors are planned names. | Reconfirm names before source edits. |
| Verification cells distinguish plan from executed evidence | draft self-check passed | `06-implementation-plan.md` labels planned commands and fresh-agent fidelity. | Do not change labels to verified until commands run. |
| Document integrity was checked with available mechanical signals | passed | `harness-change-validate --strict-layout`, `git diff --check`, balanced-fence scan, separator scan, and r04 review gate. | Re-run after task-slice or source-design changes. |
| No circular dependency | draft self-check passed | `02-code-topology.md:## Module Topology` flows helper -> skill -> roles/workflow; manifest -> projector. | Formal review checks diagram against source. |
| No catch-all class without a bounded responsibility | N/A - no production class hierarchy is introduced. | `03-class-design.md:## N/A Usage` and responsibility table. | Reject generic session/model objects during implementation. |
| Subsystem and module boundaries are distinct when needed | draft self-check passed | `02-code-topology.md` has separate subsystem and module diagrams. | Multi-lens topology review. |
| Every core class maps to a file and test seam | draft self-check passed | `03-class-design.md:## Responsibility Table`. | Confirm planned filenames remain bounded. |
| Failure path and rollback path are documented | draft self-check passed | `04-runtime-flow.md:## Failure and Rollback Sequence`; `05-error-model.md`. | Challenge stale/seal edge cases. |
| Implementation steps can be compiled or verified incrementally | draft self-check passed | `06-implementation-plan.md:## Implementation Order`. | Convert only after design gate is ready. |
