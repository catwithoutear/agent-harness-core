---
artifact: research
status: frozen
tags: [research, workflow, review, review-coverage, review-verification]
description: "Source-grounded observations and guarantee analysis for review coverage verification."
---

# Research

## Confirmed Source Facts

| Observation | Evidence | Consequence |
|---|---|---|
| The current review packet requires scope, intended behavior, design source, diff paths, validation, consumers, gaps, and residual risk. | `skills/review/review-packet-gate/SKILL.md` | Extend this owner with coverage inputs; do not create a parallel packet. |
| The current reviewer output requires findings, file/path evidence, impact, and recommended fixes, but no unit or rule inventory. | `agents/roles/reviewer.md` | Add conditional Unit Inventory and Rule Results output. |
| Workflow control already separates slice review from command/source verification. | `skills/workflow/workflow-control/SKILL.md` | Add coverage verification inside review without replacing implementation verification. |
| Planning review prefers `relative/path:Symbol` and rejects line number alone as a stable source anchor. | `agents/roles/planning-reviewer.md` | Use semantic anchors bound to the target fingerprint. |
| Code simplification already defines quick, standard, and deep modes, Unit Inventory, EvidenceRef, and a `coverage complete` declaration. | `agents/roles/code-simplifier.md` | Reuse proportional modes and inventory concepts. |
| Harness workflow resolves `state_root`, `code_root`, active change, and worktree assignments for regulated work. | `commands/harness/workflow.md` | Preserve them as optional execution coordinates, not universal portable identity. |
| Agent projection renders static role instructions for Codex, Claude, OpenCode, and OMP. | `harness.manifest.json`, `lib/project/projector.js` | Phase independence must use portable packets rather than same-session resume assumptions. |
| Current subagent tests guard role frontmatter, source contracts, and rendered projection text. | `tests/test-subagents-hooks.js` | Add contract and projection checks, but do not treat text assertions as proof of omission-detection behavior. |

## Derived Constraints

1. A packet-only verifier cannot detect facts omitted by the packet. It must
   build its expected coverage from independently discoverable sources.
2. A line-based checklist is insufficient because behavior may depend on
   callers, consumers, generated projections, configuration, tests, or paired
   documentation outside the listed range.
3. A complete code-unit by all-rules matrix is unnecessarily expensive. The
   Review Profile must select rules by surface tags and trigger conditions.
4. Unit-level disposition is insufficient when several rules apply. Traceability
   requires one result for each canonical UnitKey-plus-rule relation.
5. A verifier that re-evaluates every conclusion is a second full reviewer. The
   workflow must distinguish coverage comparison from outcome re-review.
6. Review evidence becomes stale when code, rules, or relevant dependencies
   change. Re-review must bind prior results to a target fingerprint and versioned
   references.
7. Worktree paths help locate local execution but cannot serve as durable review
   identity across machines or handoffs.
8. Cross-client independence requires serialized phase outputs. Static projected
   role text does not guarantee pause, hidden context, or agent resume behavior.
9. Cross-agent relation comparison needs canonical semantic identity. Local
   inventory IDs and opaque shorthand rule references cannot serve as equality
   keys because phase 1 and reviewer output are intentionally independent.

## Sufficiency Argument

Within a declared assurance boundary, deep-mode omission detection is sufficient
when:

1. target fingerprint `T` identifies the reviewed source state;
2. the verifier independently records discoverable rule sources `Q`, expected
   units `U`, and expected canonical unit-rule relations `A`;
3. the reviewer ledger `L` contains one disposition and evidence path for each
   claimed relation;
4. comparison rejects missing units `U - units(L)`, missing sources, missing
   relations `A - relations(L)`, unsupported N/A decisions, and stale references.

Non-empty set differences expose a coverage gap relative to `T`, `Q`, `U`, and
`A`. An empty difference supports `coverage_gate=READY`; it does not prove that
review conclusions are correct or that no defect exists.

## Lower Bound

If both reviewer and verifier see only a packet that omits unit `U` or rule
source `Q`, the verifier cannot distinguish "not applicable" from "applicable
but omitted." The observations are identical. Independent source enumeration is
therefore necessary.

Likewise, deterministic assurance that every conclusion is correct requires
inspection of every applicable canonical unit-rule relation or a sound automated
mechanism that discharges it. Sampling can raise confidence but cannot prove
absence of a missed defect.

If an active rule source is hidden from the verifier and not materialized into a
packet, no protocol can prove that its rules were covered. The correct result is
an explicit unavailable-source limitation, not silent completeness.

## Resolved Draft Decisions

| Question | V1 decision | Reason |
|---|---|---|
| Rule identity | Structured `RuleRef` with `rule_id`, `source_ref`, and `version_ref`; version may be Git, package, projection, or content digest. | Covers repository, installed, generated, and uncommitted sources without forcing a global catalog. |
| Ledger serialization | Unit Inventory and Rule Results keyed by explicit UnitPath, AnchorKind, AnchorValue, and flattened rule fields, plus compact Observed Rule Sources. | Keeps V1 human- and agent-readable without adding a parser or schema. |
| Verifier activation | Dedicated verifier is mandatory for deep mode. Standard may escalate; quick and standard cannot claim independent completeness. | Preserves independence where justified while controlling routine cost. |
| Phase independence | Immutable Expected Coverage Packet followed by a Comparison Packet; phase 2 may use the same or a fresh agent. | Portable across clients and independent of resume semantics. |
| Gate composition | Separate coverage, review, implementation-verification, and overall decisions. | Prevents coverage completeness from being mistaken for correctness or successful validation. |
| Target identity | Portable fingerprint is authoritative; change/worktree roots are optional execution coordinates. | Supports linked worktrees and durable handoff without making local paths portable truth. |
| Cross-agent unit identity | Explicit UnitPath, AnchorKind, and AnchorValue tuple; overloaded symbols and repeated non-code anchors are disambiguated by normalized signatures or ordinals. | Allows independent phase packets to compare units without shared local labels. |
| Reviewer source evidence | Compact Observed Rule Sources records reviewer-used, excluded, or unresolved normalized source versions. | Makes source expansion auditable against verifier inventory. |

## Validation Boundary

Repository tests can deterministically verify role text, packet fields, manifest
entries, projection content, and fixture comparison rules. They cannot prove that
a language-model reviewer will always discover an omitted semantic dependency.

The implementation plan must therefore include:

- deterministic fixtures for missing units, sources, relations, evidence, and
  stale fingerprints;
- source and cross-client projection assertions for reviewer and verifier roles;
- at least one fresh-agent forward evaluation using a neutral packet;
- an explicit residual limitation when a supported client cannot execute the
  forward evaluation automatically.
