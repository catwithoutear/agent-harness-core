---
name: review-packet-gate
description: Use when preparing or judging review packets, gate decisions, re-review evidence, finding disposition, or readiness of a plan or implementation.
---

# Review Packet Gate

Review from evidence. A finding is valid only when it cites the changed
artifact, source path, design source, or command output that proves the risk.

## Packet

Require:

- scope under review;
- intended behavior;
- relevant design or requirement;
- diff or artifact paths;
- validation already run;
- scope-alignment evidence for the accepted requirement or design;
- changed contracts, consumers, or adjacent surfaces that must be complete;
- validation gaps and whether each gap is a finding or accepted residual risk;
- known residual risks.

Reject the packet as `NOT_READY` when the scope, intended behavior, source
artifact, or validation expectation is missing. Do not review a vague summary as
if it were the diff.

## Completeness Checks

For implementation review, distinguish:

- correctness findings: the changed behavior is wrong, unsafe, or regresses;
- scope-alignment findings: the implementation does not match the accepted
  requirement, design, or task slice;
- consumer completeness findings: shared contracts, importers, callers,
  projections, generated outputs, or paired documentation were not updated;
- validation-gap findings: required evidence is missing or weaker than the
  review gate claims;
- accepted residual risks: gaps explicitly carried forward with owner, reason,
  and follow-up path.

## Decision

Use the shared gate vocabulary:

- `READY`: no blocking finding remains.
- `READY_WITH_NOTES`: no blocker remains, but named residual notes must travel
  forward.
- `NOT_READY`: missing evidence, missing validation, unresolved finding, or
  unsafe scope.
- `NEEDS_USER_DECISION`: correctness depends on product, ownership, or policy
  intent that cannot be inferred from source evidence.
- `NEEDS_COUNCIL`: only the coordinator should emit this for high-risk
  independent evidence conflicts.

Specialist reviewers should recommend council escalation when needed, but the
coordinator owns the final `NEEDS_COUNCIL` decision.

## Minimal Example

Packet: "Review `skills/entry/ask-harness/SKILL.md`; intent is to improve skill
routing examples; tests added in `tests/test-skills.js`; `npm test` passed."

Decision: `READY_WITH_NOTES` when examples improve routing and no blocker
remains, but note that forward-testing with a fresh agent was not run.

If the packet only says "review the skill changes" with no diff path, intent, or
validation, return `NOT_READY`.

## Finding Rules

- Lead with bugs, regressions, safety risks, and missing validation.
- Order findings by severity.
- Include file path, line or section, observed evidence, and expected behavior.
- Separate confirmed findings from questions.
- Do not include style preference unless it creates a concrete maintenance or
  behavior risk.
- If the review is clean, state the remaining test gap or residual risk.

## Re-review

On re-review, do not repeat the first review blindly. For each prior finding,
state one of:

- resolved with evidence;
- still open;
- superseded by a different fix or requirement;
- deferred with owner and reason;
- false positive with evidence.

Then review the new diff introduced by the fix. Fixes can introduce new risks.

## Common Mistakes

- Approving because tests passed while the design requirement was not checked.
- Blocking on a preference without concrete risk.
- Accepting a packet that omits the changed artifact.
- Losing deferred findings during re-review.

## Review-Run Protocol

This is the sole structured review protocol. It is selected by the exact
unversioned `protocol=review-run` field. Do not create a second route based on
assurance labels, Markdown shape, provider, or a reviewer assertion. Requests
that do not satisfy this contract fail closed; they are not reinterpreted as a
legacy review.

The coordinator persists one immutable dispatch contract before dispatch:

```json
{
  "contract_digest": "sha256:<digest>",
  "rules": [{"rule_id": "<id>", "source_ref": "<portable-ref>"}],
  "scope": ["<portable-scope>"],
  "dimensions": [{"dimension_id": "<id>"}],
  "relations": [{
    "relation_id": "<id>",
    "unit_key": {"unit_path": "<path>", "anchor_kind": "<kind>", "anchor_value": "<value>"},
    "dimension_id": "<id>",
    "rule_ref": {"rule_id": "<id>", "source_ref": "<ref>"}
  }]
}
```

The same digest, exact rules, scope, dimensions, and target identity go to the
reviewer and verifier. Discovery may add a target-derived relation, but it may
not remove an assigned relation and every expansion must reference an assigned
rule source and dimension. A relation is identified by
`UnitKey + DimensionId + RuleRef`; a summary, narrative, or row count cannot
replace relation-level evidence.

### Target Identity

For a Git worktree or artifact set, resolve the portable target before
dispatch. The helper writes JSON to stdout and never persists local roots:

```text
node <review-packet-gate-skill-root>/scripts/review-target-digest.mjs target \
  --kind git-worktree --code-root <path> --base <commit> [--head <commit>] \
  [--untracked-scope <path>]... [--include-path <path>]... \
  --declaration <utf8-file> --json

node <review-packet-gate-skill-root>/scripts/review-target-digest.mjs target \
  --kind artifact-set --artifact-root <path> --include-path <path>... \
  --declaration <utf8-file> --json
```

The helper uses `fingerprint_format=review-target`, UTF-8 declarations with one
final LF, and fail-closed target errors. The result is evidence for the
request and discovery record, not a substitute for the dispatch contract.

### Isolated Dispatches

```text
reviewer: request + dispatch contract + target
  -> correctness findings + relation-level review-ledger

verifier inventory: request + dispatch contract + target
  -> sealed discovery + shard-plan

verifier compare: sealed discovery + shard closure + reviewer ledger
  -> coverage aggregate only

coordinator: aggregate + review result + implementation evidence
  -> durable gate-result
```

Inventory receives no reviewer ledger, findings, prior comparison, or
conclusion. The reviewer owns correctness findings and the verifier owns
coverage comparison. Neither role emits `overall_gate` or mutates the target.

### Relation Ledger

Every expected relation has exactly one explicit status: `covered`,
`not-covered`, or `not-applicable`. Each entry requires evidence;
`not-applicable` additionally requires reviewer authority and a rationale. It
can never be inferred from an omission. Missing, duplicate, unknown, stale, or
unassigned relations remain visible as typed gaps:
`RULE_SOURCE_GAP`, `UNIT_IDENTITY_GAP`, `RULE_COVERAGE_GAP`,
`APPLICABILITY_GAP`, `EVIDENCE_GAP`, `STALE_REVIEW`, and
`CONCLUSION_CONFLICT`.

Discovery must be sealed before planning, and the sealed discovery plus shard
closure must exist before comparison or aggregation. A failed child, unavailable
source, target mismatch, or unresolved boundary produces `coverage_gate=NOT_READY`.

### Durable Lifecycle

Records are canonical JSON with a self-digest, portable relative references,
immutable parent lineage, and fenced control revisions. The regulated document
tool owns the run root:

```text
harness-change-doc --state-root <state-root> --code-root <code-root> \
  init-review-run <change> --run-id <request-id> --json
```

The protocol store owns child records below
`.changes/<change>/review-runs/<run-id>/`; validators are read-only. The
minimum lifecycle is:

```text
created -> discovering -> planning -> running -> aggregating
        -> completed | cancelled | invalidated
```

Failed or cancelled attempts remain visible, retries are bounded, and resume
must reread the fenced current control revision. A completed or cancelled run
has an aggregate report, including pre-dispatch closure or cancellation
failures.

### Separate Gates

| Gate | Owner | Meaning |
|---|---|---|
| `coverage_gate` | verifier | Scope, rules, dimensions, relations, evidence, and staleness are adequate. |
| `review_gate` | reviewer | Correctness findings permit or block progress. |
| `implementation_verification_gate` | verification workflow | Tests, builds, and source/runtime checks pass independently. |
| `overall_gate` | coordinator | Synthesis of all required decisions. |

Every `gate-result` emits all four fields. The aggregator never invents
correctness or implementation results. `overall_gate` is fail-closed when any
required gate is absent or `NOT_READY`; `coverage_gate=READY` can coexist with
`review_gate=NOT_READY` when complete coverage finds a defect.

## Output Packets

Context packet:

- goal and non-goals;
- active change or explicit no-change reason;
- relevant source files and current state;
- constraints, risks, and owner questions;
- planned validation.

Review packet:

- scope reviewed;
- intended behavior and design source;
- owning subsystem and module when implementation-design exists;
- diff or artifact paths;
- validation already run;
- findings and residual risks.

Handoff packet:

- current phase;
- changed files;
- exact commands and results;
- unresolved questions;
- next checkpoint.

## Council Handling

Council is not majority vote. Use one synthesizer over multiple independent
positions. Preserve evidence quality, minority concerns, and the final decision
owner. Do not use council for routine disagreement, style preference, or missing
basic context.
