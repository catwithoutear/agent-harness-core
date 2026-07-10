---
artifact: review-round
status: reviewed
tags: [review, workflow, review-coverage, review-verification]
description: "Challenge and multi-lens readiness review of the initial review coverage contract draft."
---
# draft Review Round 1

## Decision

`NOT_READY`

The direction is sound, but the draft cannot freeze yet. Four blocking contract
gaps prevent the proposed verifier from proving the exact coverage claim the
change is intended to add.

- Challenge verdict: `NOT_READY`.
- Multi-lens design decision: `NOT_READY`.
- Council escalation: not required; the source evidence is consistent and each
  blocker has a direct correction path.

## Review Packet

- Scope: all artifacts under `.changes/review-coverage-contract/`.
- Intended behavior: a delegator provides a neutral target packet, a reviewer
  returns findings plus review coverage, and an independent verifier detects
  omitted code, rules, and evidence without claiming defect freedom.
- Upstream decision: extend the existing Review -> Verify chain, use semantic
  units rather than raw line ranges, preserve proportional modes, and keep
  implementation verification separate.
- Source owners checked: `review-packet-gate`, `workflow-control`, `reviewer`,
  `planning-reviewer`, harness review/workflow commands, subagent manifest,
  projector, and subagent/projection tests.
- Validation already run: change workspace validation passed with zero errors
  and zero warnings before this review.

## Challenge Assumptions

| Assumption | Status | Evidence and consequence |
|---|---|---|
| Existing review packet and workflow owners can host the protocol. | verified | `review-packet-gate` already owns packet completeness and gates; `workflow-control` already orders review before verification. |
| A bare line-by-rule matrix is the wrong primary model. | verified | `planning-reviewer` prefers semantic anchors, and the draft correctly treats line ranges as supporting evidence. |
| A new verifier role is justified for deep mode. | partial | Independent meta-review is a distinct read-only mission, but the draft has not yet defined a portable phase handoff that works with static projected roles. |
| The verifier can discover rules omitted from the packet. | partial | The lower-bound argument is correct, but no closed Rule Source Inventory or unavailable-source behavior is defined. |
| `state_root`, `code_root`, and worktree belong in every target identity. | disputed | Current workflow requires them for regulated change writes; generic reviews may have no change workspace, and worktree paths are local coordinates rather than portable identity. |
| Existing readiness vocabulary can represent the new gate without another state model. | partial | Reuse is appropriate, but coverage readiness and correctness readiness must be separate named decisions. |
| Structured Markdown is sufficient for V1. | unknown | No forward evaluation or concrete comparison fixture has tested the proposed format across clients. |
| An implementation-design pack is required before slicing. | verified | The selected direction crosses workflow, review skill, subagent role, manifest, client projection, and tests with dependency-order and contract risk. |

## Pre-Mortem

1. The packet omits an active rule source, both agents use the same incomplete
   source list, and the verifier reports false completeness.
2. A client cannot preserve the two-phase verifier interaction, so the verifier
   sees the reviewer ledger before inventory construction and reproduces the
   reviewer's omissions.
3. An uncommitted target fingerprint excludes an untracked or generated input;
   code changes while the ledger still appears current.
4. One unit contains several rules but only one unit-level disposition, so a
   finding cannot be traced to the rule that produced it and untested rules look
   covered.
5. A coverage `READY` result is propagated as the overall review decision even
   though blocking correctness findings or failed implementation validation
   remain.

## Selected Lenses

| Lens | Result | Reason |
|---|---|---|
| `boundary_contracts` | `NOT_READY` | Unit-rule result ownership, rule-universe closure, and coverage-vs-review gate boundaries are incomplete. |
| `control_lifecycle` | `NOT_READY` | The two-phase verifier handoff and target-fingerprint invalidation path are not portable enough to implement. |
| `verification_observability` | `NOT_READY` | The draft names synthetic cases but lacks an owned forward-evaluation contract and precise assurance outputs. |
| `implementation_readiness` | `NOT_READY` | Source owners are mapped, but the handoff, serialization, and mode-selection decisions remain open. |
| `artifact_chain` | `NOT_READY` | Requirements demand per unit-rule dispositions while the design and example collapse them into one unit-level result. |

## Findings

### Blocking

| ID | Category | Finding and evidence | Required correction |
|---|---|---|---|
| RCC-R01-F01 | correctness / artifact-chain | `requirements.md` Functional Requirement 8 requires a disposition for every applicable unit-rule relation. `design.md` Review Coverage Ledger instead stores multiple `AppliedRuleRefs` beside one `Disposition` and one `FindingRefs` list; the example applies three rules but cannot identify which rule produced `F-003`. The ledger therefore cannot represent the promised audit trail. | Replace `AppliedRuleRefs` plus one unit disposition with per-rule `RuleResult` entries containing `RuleRef`, applicability, disposition, EvidenceRefs, and FindingRefs. Keep a unit-level summary only as derived output. |
| RCC-R01-F02 | completeness / assurance | The verifier is expected to find rules omitted from the packet, but `rule_sources` remains a packet field and the design does not define a closed, independently discoverable rule-source universe. Global/client-loaded instructions may also be unavailable to a projected subagent. The draft's own lower-bound proof shows that completeness is impossible under this ambiguity. | Add a Rule Source Inventory contract separate from the Review Profile. Define discoverable sources, precedence, version/digest, unavailable-source handling, and the exact relative universe for which coverage may be claimed. Treat packet rule sources as a seed, not closure. |
| RCC-R01-F03 | control-flow / compatibility | `design.md` requires the verifier to record expected inventories before seeing the ledger, then compare after the ledger exists. Current core projects static role text to four clients; neither the manifest nor projector provides a portable resume, hidden-input, or same-agent phase protocol. Independence therefore depends on unspecified client behavior. | Define client-neutral phase packets: an immutable Expected Coverage Packet bound to the target fingerprint, followed by a Comparison Packet containing that packet and the reviewer ledger. Permit phase 2 to run in the same or a fresh verifier. The coordinator owns pairing and fingerprint checks. |
| RCC-R01-F04 | boundary / gate semantics | `requirements.md` says coverage `READY` means sufficient review coverage, but `design.md` Gate Semantics also requires that no blocking review finding remain. This merges meta-review completeness with code-review outcome and makes the verifier partly responsible for correctness disposition. | Emit separate `coverage_gate`, `review_gate`, and coordinator-owned `overall_gate`, each using shared vocabulary plus an explicit `assurance` label. A blocking finding may coexist with `coverage_gate=READY` while `review_gate` and `overall_gate` remain `NOT_READY`. |

### Should Fix

| ID | Category | Finding and evidence | Recommended correction |
|---|---|---|---|
| RCC-R01-F05 | compatibility / worktrees | Target identity makes `state_root`, `code_root`, and worktree unconditional and treats worktree as identity. The existing workflow makes worktree a local execution coordinate, while reviews outside a regulated change may have no active change. `base + patch digest` also does not say whether staged, unstaged, scoped untracked, ignored, or generated inputs participate. | Separate portable target fingerprint from optional execution coordinates. Require change-state fields only when a change workspace applies. Define fingerprint inputs and explicit exclusions. |
| RCC-R01-F06 | maintainability / proportionality | Mode routing says deep is required for explicit exhaustive review and merely "considered" for broad high-risk surfaces. It provides no mandatory escalation rule, downgrade record, size boundary, or statement about what quick and standard may claim. | Add a deterministic mode-selection table with mandatory deep triggers, coordinator override, downgrade reason, and assurance claims allowed per mode. |
| RCC-R01-F07 | validation risk | Validation lists omitted-unit and omitted-rule scenarios, but current repository tests primarily lock role text, manifest consistency, and projected content. No fixture or fresh-agent evaluation is assigned to demonstrate that independent inventory actually catches omissions. | Define at least one neutral packet, reviewer ledger, expected inventory, and expected gap result for each core failure mode. Record whether it is a deterministic fixture, a fresh-agent forward evaluation, or an accepted residual gap. |
| RCC-R01-F08 | implementation readiness | Hybrid RuleRef uses `@revision`, but user-global instructions, installed skills, generated prompts, and uncommitted rules may not have a Git revision. The identity cannot yet cover all sources named by the Review Profile. | Allow a source version discriminator chosen from Git object/revision, package version, projection hash, or content digest, and record which form was used. |
| RCC-R01-F09 | simplicity / serialization | The draft leaves Markdown versus machine-readable serialization open. A nested per-rule structure in one Markdown ledger row will be hard to compare and risks premature schema/tool work if solved with a parser immediately. | For V1, use two normalized Markdown tables: Unit Inventory and Rule Results (`UnitId | RuleRef | Disposition | EvidenceRefs | FindingRefs`). Defer a parser until forward evaluation proves it necessary. |

### Confirmed Strengths

- The proposal rejects line-by-rule coverage as the primary model and preserves
  revision-bound line ranges only as supporting evidence.
- The lower-bound argument correctly proves that a verifier cannot detect a
  shared omission without independent evidence.
- The draft preserves the existing review packet and workflow owners instead of
  introducing a parallel process skill.
- Reviewer and proposed verifier authority remain read-only.
- Quick, standard, and deep modes are directionally correct and reuse an
  established inventory pattern from `code-simplifier`.
- The draft explicitly separates review coverage from tests, builds, static
  analysis, and runtime verification.
- Deferring task slicing until an implementation-design pack exists is correct
  for this cross-asset change.

## Evidence Checked

- `.changes/review-coverage-contract/{README,requirements,research,proposal,design,terminology,tasks}.md`
- `.changes/review-coverage-contract/specs/README.md`
- `skills/review/review-packet-gate/SKILL.md`
- `skills/workflow/workflow-control/SKILL.md`
- `agents/roles/reviewer.md`
- `agents/roles/planning-reviewer.md`
- `agents/roles/harness-orchestrator.md`
- `commands/harness/review.md`
- `commands/harness/workflow.md`
- `harness.manifest.json` agent entries and client capabilities
- `lib/project/projector.js` agent rendering
- `lib/manifest/validate.js` agent validation
- `tests/test-subagents-hooks.js` source and projection coverage
- `node bin/harness-change-doc.js --state-root . --code-root . resolve --change review-coverage-contract --json`
- `node bin/harness-change-validate.js --state-root . --change review-coverage-contract`: pre-review pass, zero errors and zero warnings.

## Missing Evidence

- No forward evaluation demonstrates independent omitted-unit or omitted-rule
  detection.
- No cross-client evidence demonstrates the proposed two-phase handoff.
- No finalized Rule Source Inventory or target fingerprint example exists.
- No behavioral delta spec or implementation-design pack exists; both are
  correctly deferred until the blocking contract decisions converge.

## Required Next Action

1. Correct RCC-R01-F01 through RCC-R01-F04 in requirements, proposal, design,
   terminology, and tasks as applicable.
2. Resolve RCC-R01-F05 through RCC-R01-F09 or explicitly defer them with owner,
   reason, and validation consequence.
3. Add the behavioral delta spec after the contract is internally consistent.
4. Re-run challenge and multi-lens re-review before changing draft artifacts to
   reviewed or frozen.

## Re-review Criteria

- Every UnitId-to-RuleRef relation has its own disposition and evidence path.
- The claimed rule universe is independently enumerable and names unavailable
  source limits.
- The two verifier phases communicate through portable, fingerprint-bound
  packets without relying on hidden client session behavior.
- Coverage, code-review, and overall gate decisions are separate and composable.
- Target fingerprint and coverage-mode selection are explicit.
- Validation includes owned omission-detection fixtures or a named residual gap.
