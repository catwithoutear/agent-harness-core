---
artifact: proposal
status: frozen
tags: [proposal, workflow, review, review-coverage, review-verification, rule-profile]
description: "Proposal for integrating review coverage ledgers and independent verification into the existing harness workflow."
---

# Proposal

## Why

Evidence-first findings show why a reported defect matters, but they do not show
what the reviewer considered and what was omitted. Delegated review needs a
traceable coverage contract so the coordinator can distinguish a clean review
from an incomplete one.

The desired outcome is not a claim that code is defect-free. For a named target
fingerprint, discoverable rule universe, and coverage mode, the workflow should
show which semantic units and canonical unit-rule relations were independently
expected, dispositioned, and compared.

## Approaches Considered

### Approach A: Line-By-Rule Matrix

Require every changed line range to list every applied rule and have a second
reviewer validate the matrix.

- Benefit: visually explicit and easy to explain.
- Cost: unstable after edits, blind to semantic neighbors, and grows as changed
  lines multiplied by all rules.
- Decision: rejected as the primary model. Revision-bound line ranges remain
  optional supporting EvidenceRefs.

### Approach B: Semantic Coverage Ledger With Independent Verification

Extend the existing review packet with a Portable Target Fingerprint, optional
Execution Coordinates, a scope seed, and a rule-source seed. The reviewer
returns findings plus Unit Inventory, Rule Results, and compact Observed Rule
Sources tables. These use explicit UnitPath, AnchorKind, AnchorValue, and
versioned rule fields. In deep mode, a read-only verifier independently produces
an Expected Coverage Packet and later compares it with the reviewer ledger
through a Comparison Packet.

- Benefit: detects omissions relative to an independently recorded universe,
  fits worktrees and revision changes, supports risk tiers, and reuses existing
  packet and inventory owners.
- Cost: requires disciplined source/version identity, a dedicated deep-mode
  verifier role, and controlled output size.
- Decision: selected.

### Approach C: Coordinator Checklist Only

Keep reviewer output unchanged and ask the coordinator to check file and rule
coverage before issuing the gate.

- Benefit: smallest implementation and no new role.
- Cost: weak independence, high coordinator prompt load, no canonical unit-rule
  traceability, and shared omissions remain likely.
- Decision: retained only for quick mode and coordinator audit in standard mode.

## Selected Direction

Adopt Approach B with proportional assurance:

- `quick`: coordinator checks directly enumerable changed files and obvious
  adjacent surfaces; no independent completeness claim;
- `standard`: reviewer produces Unit Inventory and Rule Results for changed
  semantic units and justified adjacent units; coordinator audits completeness;
- `deep`: verifier phase 1 independently records expected sources, units, and
  canonical unit-rule relations before phase 2 receives reviewer output.

Deep mode is mandatory for explicit exhaustive or independent review, security
or trust boundaries, destructive or data-loss behavior, public or serialized
contracts, persistence or migration, concurrency or lifecycle, unresolved
cross-module impact, and reviewer conflict. A downgrade requires an owner
decision and cannot produce unqualified coverage `READY`.

## What Changes

The likely first implementation wave will:

- extend `review-packet-gate` with target fingerprint, optional execution
  coordinates, Rule Source Inventory, Review Profile, coverage modes, normalized
  ledger tables, gap taxonomy, and separate gate decisions;
- extend `reviewer` with conditional Unit Inventory, Rule Results, and Observed
  Rule Sources output only when a coverage mode requires it;
- add a narrowly scoped, read-only `review-verifier` role for deep-mode inventory
  and comparison packets;
- update `workflow-control` and harness review/workflow commands so coverage,
  review, implementation verification, and overall decisions remain separate;
- update manifest and client projection contracts for the new role;
- add deterministic contract fixtures, source/projection assertions, and a
  fresh-agent forward-evaluation path.

V1 uses normalized Markdown with explicit UnitPath, AnchorKind, AnchorValue, and
flattened rule identity columns, plus existing gate vocabulary. It does not add a
ledger parser, serialized schema, new top-level artifact root, or parallel
workflow skill.

No source implementation begins from this draft. An implementation-design pack
must define phase packets, role authority, projection flow, file ownership, and
test seams before task slicing.

## Compatibility

- Existing review packets remain valid when coverage mode is absent; they retain
  current evidence-first finding behavior.
- Existing reviewer dispatch remains lightweight unless a packet requests
  standard or deep coverage.
- Project-specific review rules remain in repository overlays, instructions,
  design artifacts, or domain skills.
- Clients receive the same canonical role body through existing projection;
  phase independence comes from packet contracts, not client-specific resume
  behavior.
- Review evidence persisted under `.changes` remains low frequency and reserved
  for formal, high-risk, re-review, council, or freeze events.

## Impact

- Positive: makes clean-review claims auditable rather than self-reported.
- Positive: detects packet or reviewer omissions relative to a named,
  independently derived source and unit universe.
- Positive: binds review evidence to portable source state while retaining local
  worktree coordinates for execution.
- Positive: permits coverage to pass while preserving blocking correctness
  findings in a separate review gate.
- Risk: structured output can become checklist theater without evidence checks
  and forward evaluation.
- Risk: rule-source discovery is necessarily limited when client or global
  instructions are hidden; the gate must expose this limitation.
- Risk: deep mode increases agent and prompt cost; mandatory triggers and
  downgrade ownership must remain explicit.

## Validation

- Validate the change workspace throughout draft convergence.
- Add deterministic fixtures for omitted units, omitted rule sources, omitted
  canonical unit-rule relations, unsupported N/A, stale fingerprints, and gate
  composition.
- Add source assertions for packet, reviewer, verifier, and authority contracts.
- Add projection assertions for the new verifier role across supported clients.
- Run one neutral fresh-agent evaluation in which phase 1 does not see reviewer
  output and phase 2 detects planted omissions.
- Record unsupported client execution as a residual limitation rather than
  treating static projection as behavioral proof.
- Run repository-owned tests, manifest validation, projection verification, and
  diff checks after source edits.

## Rollback

Before implementation, remove this draft workspace. After implementation,
rollback by removing coverage-specific packet fields and verifier projection
while preserving the existing evidence-first review packet, reviewer role, and
review-before-verification workflow.

## Resolved Draft Decisions

1. A dedicated verifier is mandatory only for deep mode; standard may escalate
   when coordinator evidence warrants it.
2. RuleRef is structured and accepts Git, package, projection, or content version
   references.
3. V1 uses two normalized Markdown tables and no deterministic parser.
4. Verifier independence uses immutable phase packets and does not depend on
   resuming the same agent.
5. Portable target fingerprint and local execution coordinates are separate.
6. Coverage, code-review, implementation-verification, and overall gates are
   separate decisions using shared readiness vocabulary.
