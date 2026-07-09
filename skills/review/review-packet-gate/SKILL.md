---
name: review-packet-gate
description: Use when preparing or judging review packets, gate decisions, re-review evidence, finding disposition, or readiness of a plan or implementation.
---

# Review Packet Gate

Review from evidence. A finding is valid only when it cites the changed
artifact, source path, design source, or command output that proves the risk.

## Packet

Require:

- scope under review,
- intended behavior,
- relevant design or requirement,
- diff or artifact paths,
- validation already run,
- scope-alignment evidence for the accepted requirement or design,
- changed contracts, consumers, or adjacent surfaces that must be complete,
- validation gaps and whether each gap is a finding or accepted residual risk,
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

- resolved with evidence,
- still open,
- superseded by a different fix or requirement,
- deferred with owner and reason,
- false positive with evidence.

Then review the new diff introduced by the fix. Fixes can introduce new risks.

## Common Mistakes

- Approving because tests passed while the design requirement was not checked.
- Blocking on a preference without concrete risk.
- Accepting a packet that omits the changed artifact.
- Losing deferred findings during re-review.
