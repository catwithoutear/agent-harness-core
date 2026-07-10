---
artifact: requirements
status: frozen
tags: [requirements, workflow, review, review-coverage, review-verification]
description: "Requirements for auditable delegated review coverage and independent verification."
---

# Requirements

## Goal

Make delegated code review coverage inspectable and independently checkable.
The workflow must expose which code units were considered, which discoverable
review rules were applied or rejected as not applicable, what evidence supported
each conclusion, and what remains uncovered.

## Functional Requirements

1. The delegator must provide a neutral Review Target Packet containing the
   requested outcome, accepted requirements or design, non-goals, target
   fingerprint, scope seed, rule-source seed, known validation, and risks.
2. Every review must have a Portable Target Fingerprint. Commit review uses base
   and head revisions. Uncommitted review uses a base revision plus a digest of
   staged changes, unstaged changes, and scoped untracked file content.
3. Generated or ignored inputs that affect the reviewed behavior must be
   included in the fingerprint or listed as explicit exclusions with a reason.
4. `state_root`, `code_root`, active change, and worktree are optional Execution
   Coordinates. They are required when a regulated change or linked worktree is
   active, but they are not portable review identity.
5. The packet must not include expected findings or prior reviewer conclusions
   when independent review is requested.
6. Packet scope and rule-source fields are seeds, not completeness authority.
   Reviewer and verifier must independently expand them from source evidence.
7. Review coverage must be expressed in semantic Coverage Units such as classes,
   functions, methods, configuration entries, changed hunks, behavior paths,
   contracts, consumers, generated surfaces, tests, or documentation pairs.
8. Each unit must have a canonical `UnitKey` tuple of `UnitPath`, `AnchorKind`,
   and `AnchorValue` under the target fingerprint. UnitPath is target-tree
   relative, `/`-separated, exact-case, and contains no `.` or `..` segment.
   Anchor values must uniquely identify the anchor kind; a human-readable
   `UnitRef` may add navigation detail, but a line range cannot be the key.
9. Deep verification must build a Rule Source Inventory that records every
   discoverable active source, authority or precedence, version reference,
   availability, inclusion decision, and unavailable-source limitation.
10. A `RuleRef` must be a structured identity containing `rule_id`, `source_ref`,
    and `version_ref`. Version references may use a Git object, package version,
    projection hash, or content digest. File-backed source references use the
    UnitPath normalization rules plus a stable section/key anchor and occurrence
    ordinal where duplicates are legal.
11. The Review Profile must be derived from the Rule Source Inventory and record
    rule trigger conditions, surface tags, expected evidence, and precedence.
12. Reviewer coverage must use a Unit Inventory keyed by the UnitKey tuple, Rule
    Results keyed by the UnitKey tuple plus `RuleId`, `RuleSourceRef`, and
    `RuleVersionRef`, and compact Observed Rule Sources evidence. Every
    applicable or explicitly considered relation has its own applicability,
    disposition, evidence, and finding links.
13. The reviewer must return risk-ordered findings, Unit Inventory, Rule Results,
    Observed Rule Sources, valid exclusions, uncovered items, and the target
    fingerprint.
14. In deep mode, verifier phase 1 must independently produce an immutable
    Expected Coverage Packet before reviewer output is available to that phase.
15. Verifier phase 2 must accept a Comparison Packet containing the Expected
    Coverage Packet and reviewer ledger. It may run in the same or a fresh agent;
    correctness must not depend on client session resume behavior.
16. The verifier must report unit-identity gaps, code-scope gaps, rule-source
    gaps, rule-relation gaps, unsupported N/A decisions, evidence gaps,
    stale-review state, and conclusion conflicts separately.
17. A changed target fingerprint, RuleRef version, UnitRef, or material
    dependency must invalidate affected results and require delta re-review.
18. The protocol must emit separate `coverage_gate`, `review_gate`,
    `implementation_verification_gate`, and coordinator-owned `overall_gate`
    decisions. Each uses existing readiness vocabulary and an explicit assurance
    label.
19. `coverage_gate=READY` means coverage is sufficient for the selected mode and
    discoverable universe. It may coexist with `review_gate=NOT_READY` when the
    review found a blocking defect.
20. Coverage must scale through `quick`, `standard`, and `deep` modes with
    explicit eligibility, mandatory escalation triggers, override ownership, and
    allowed assurance claims.
21. Deep mode is mandatory for explicit exhaustive review, user-requested
    independent verification, security or trust-boundary change, destructive or
    data-loss behavior, public or serialized contracts, persistence or migration,
    concurrency or lifecycle semantics, unresolved cross-module impact, and
    prior reviewer conflict.
22. A mandatory deep review may be downgraded only through an owner decision that
    records the reason and residual risk; the coverage gate cannot become
    unqualified `READY` after such a downgrade.
23. Runtime tests, static checks, builds, and source verification remain a
    separate implementation-verification gate after review coverage.
24. Formal or high-risk review ledgers may be persisted under the owning
    `.changes/<change>/reviews/` artifact. Routine low-risk reviews must not
    create mandatory process logs.
25. Implementation validation must include deterministic contract fixtures and
    a fresh-agent forward evaluation or an explicit residual limitation for
    omission-detection behavior that static text tests cannot prove.

## Coverage Mode Requirements

| Mode | Eligibility or trigger | Allowed claim |
|---|---|---|
| `quick` | Only low-risk mechanical or documentation changes with directly enumerable scope, no behavior or contract change, and obvious validation. Any uncertainty escalates to standard. | Changed files and obvious adjacent surfaces were checked; no independent completeness claim. |
| `standard` | Default for normal behavior changes without a deep trigger. | Changed semantic units and justified adjacent units were dispositioned within the discoverable rule universe; coordinator-audited, not independently complete. |
| `deep` | Any mandatory trigger in Functional Requirement 21 or explicit coordinator escalation. | Expected units, rule sources, and canonical UnitKey-plus-rule relations were independently compared for the target fingerprint. |

## Assurance Boundary

The protocol may claim that a named target fingerprint and discoverable review
universe were enumerated and dispositioned with evidence at a named coverage
mode. The gate must list unavailable required sources, explicit exclusions, and
uncovered units or relations.

It must not claim proof that:

- no defect exists;
- all indirect impact was discovered outside the declared discovery method;
- every reviewer conclusion is correct without independent re-review of every
  applicable canonical unit-rule relation;
- hidden or unavailable instruction sources were checked;
- sampling provides deterministic completeness.

## Non-Goals

- Do not require every available rule to be applied to every changed line.
- Do not make line-number ranges the primary review unit.
- Do not replace normal code review, tests, builds, static analysis, or runtime
  verification.
- Do not add project-specific C++, frontend, security, or product rules to core.
- Do not add a deterministic ledger parser or new serialized schema in V1.
- Do not depend on one client's ability to pause and resume the same subagent.
- Do not replace council handling or convert conflicting reviews into majority
  voting.
- Do not persist a ledger for every trivial review.

## Acceptance Criteria For Draft Freeze

- The packet, target fingerprint, optional execution coordinates, Rule Source
  Inventory, profile, unit, per-rule result, phase packet, gate, and staleness
  contracts are internally consistent and project-agnostic.
- The verifier can detect packet omissions relative to an independently recorded
  discoverable universe and names sources it cannot inspect.
- Each canonical UnitKey tuple plus rule relation has its own applicability,
  disposition, evidence, and finding traceability.
- UnitPath, AnchorKind, and AnchorValue have one normalized grammar across
  expected and reviewer packets, including overloaded symbols and non-code
  anchors.
- Reviewer Observed Rule Sources can be compared with verifier Rule Source
  Inventory without relying on unrecorded source expansion.
- Independent inventory and comparison work through immutable packets without
  relying on hidden client session behavior.
- Coverage, code-review, implementation-verification, and overall gate decisions
  remain distinct and composable.
- Mode selection and downgrade handling are explicit.
- Worktree coordinates cannot be mistaken for portable review identity.
- Validation assigns deterministic fixtures, projection checks, and forward
  evaluation to concrete implementation evidence.
- The selected approach extends existing harness owners and justifies the new
  deep-mode verifier role before implementation.
