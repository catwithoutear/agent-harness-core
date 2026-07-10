---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation, review-coverage, review-verification]
description: "Smallest verifiable implementation steps mapped to subsystems, modules, files, and tests."
---
# Implementation Plan

## Implementation Order

| Step | Subsystem | Module | Source anchors | Behavior | Validation | Rollback |
|---|---|---|---|---|---|---|
| 1 | Portable review identity | new `skills/review/review-packet-gate/scripts/review-packet-digest.mjs`; new `tests/test-review-coverage.js`; `tests/run-tests.js` | `design.md:## Target Fingerprint`; `04-runtime-flow.md:## State Transitions` | Implement read-only Git-worktree and artifact-set target actions plus packet sealing with the exact framed-content, scoped-untracked, declaration, failure, and stdout contracts in this pack. | Focused temp Git/artifact-root tests: staged/unstaged overlap, deletion, mode-only change, symlink, unmerged-index rejection, scoped untracked, ignored input, artifact-set, declaration CRLF/final-LF/BOM, repeated-argument order/duplicates, packet seal, and Expected Packet target-identity copy; run `npm test -- --review-coverage`. | Remove the new script/test registration; existing review behavior has no dependency yet. |
| 2 | Packet protocol | `skills/review/review-packet-gate/SKILL.md`; `tests/test-skills.js`; `tests/fixtures/review-coverage/` | `02-code-topology.md:## Source Anchors`; `03-class-design.md:## Markdown Role Interfaces` | Add target packet fields, helper invocation, separator-backed canonical table shapes, expected/comparison packets, gap taxonomy, and exact no-mode/quick/standard/deep rules. Add fixtures that plant omissions and document expected gap classifications. | `npm test -- --skills --review-coverage`; source/fixture assertions for all four routing cases and every normative table header/separator. | Remove coverage-specific sections and fixtures while retaining current evidence-first packet sections. |
| 3 | Delegated roles and projection | `agents/roles/reviewer.md`; new `agents/roles/review-verifier.md`; `harness.manifest.json`; `tests/test-subagents-hooks.js`; `tests/test-manifest.js`; `tests/test-projection.js` | `design.md:## New Role Justification`; `03-class-design.md:## Responsibility Table` | Keep reviewer findings-first and add conditional standard/deep ledger. Add read-only verifier inventory/compare packet authority. Register one four-client specialist role. | `npm test -- --manifest --subagents --projection`; `node bin/harness.js manifest --json`; project/verify all client projections. | Remove verifier manifest entry and role; remove conditional ledger fields; generic projector remains untouched. |
| 4 | Workflow and command routing | `skills/workflow/workflow-control/SKILL.md`; `commands/harness/review.md`; `commands/harness/workflow.md`; `tests/test-skills.js` | `04-runtime-flow.md:## Main Sequence`; `04-runtime-flow.md:## Failure and Rollback Sequence` | Route quick/standard/deep work, require helper verification before deep inventory/compare, and preserve four independent gates. | `npm test -- --skills`; manual source check against frozen mode/gate requirements. | Remove coverage-routing clauses and retain existing review/verification loop. |
| 5 | Behavioral evidence | `tests/fixtures/review-coverage/`; formal `.changes/<change>/reviews/` record when run | `requirements.md:## Functional Requirements (item 25)`; `05-error-model.md:## Error Categories` | Execute a fresh-agent deep evaluation: phase 1 receives no ledger, phase 2 receives planted incomplete ledger and reports the named omissions. Record client/model, packet paths/digests, result, and limitations. | Fresh-agent evaluation is `verified (approximate)` for one client only; static tests remain `verified (exact)` for repository contracts. | Retain limitations and do not claim generalized model behavior. |
| 6 | Full integration and handoff | changed source assets, self projection, change workspace | `AGENTS.md:Verification`; `07-constraints.md:## Self Check` | Run full repository validation, formal implementation review, and record any unsupported-client behavior before task completion. | `npm test`; `node bin/harness.js manifest --json`; self-projection verify; `git diff --check`; change validator. | Revert only the bounded slices that fail their gates; do not discard prior formal review evidence. |

## Design-to-Code Traceability

| Requirement / source fact / design item | Subsystem | Module | Source anchor | Verification plan / evidence | Step |
|---|---|---|---|---|---|
| Portable fingerprint includes uncommitted scoped and declared ignored/generated inputs. | Portable review identity | Digest helper | `specs/review-coverage.md:Requirement: Portable Review Target` | Component/scope-change helper tests; invalid input tests. | 1 |
| Expected packet is immutable and fresh-agent comparable. | Packet protocol | Digest helper, skill, verifier role | `specs/review-coverage.md:Requirement: Portable Two-Phase Verification` | Packet seal tests and fresh-agent phase separation. | 1, 2, 3, 5 |
| UnitKey and RuleRef relations are explicit Markdown fields. | Packet protocol | Packet skill, reviewer/verifier roles, fixtures | `design.md:## Reviewer Ledger` | Static table-contract checks; planted-relation fixture. | 2, 3, 5 |
| Review sources are discoverable and unavailable sources block unqualified coverage. | Deep coverage verification | Packet skill, verifier role | `specs/review-coverage.md:Requirement: Independently Discoverable Rule Universe` | Source/gap fixture and fresh-agent report. | 2, 3, 5 |
| Reviewer evidence and coverage verification have different authority. | Delegated roles | Reviewer and verifier roles | `design.md:## Component Authority` | Role authority/projection assertions. | 3 |
| Workflow keeps coverage, review, implementation verification, and overall gates separate. | Workflow routing | Workflow skill and commands | `specs/review-coverage.md:Requirement: Separate Gate Decisions` | Routing source assertions and four-gate fixture. | 4, 5 |
| Existing review works without coverage mode. | Compatibility | Packet skill and reviewer role | `proposal.md:## Compatibility` | Source test for legacy/conditional branch and review packet regression. | 2, 3 |
| Four-client projection remains canonical. | Projection | Manifest, existing projector, tests | `lib/project/projector.js:renderAgent` | Manifest and all-client projection tests; self-projection verify. | 3, 6 |

## Coding Guardrails

- Before coding, state the files touched, the design item served, excluded
  modules, and validation target.
- When implementation deviates from this design, record the reason and whether
  topology, class design, or tasks must change.
- Do not treat design-stage validation plans as executed implementation proof.
  Mark planned checks separately from already-run evidence.
- Do not add `lib/review`, a package CLI, a new JSON schema, or a parser unless
  a formal review reopens this pack and records why the skill-local helper is
  insufficient.
- Do not alter `lib/project/projector.js` or `lib/manifest/validate.js` merely
  because the verifier is new; change them only if the manifest/projection test
  exposes a concrete generic behavior gap.
- Keep tests honest: source/fixture assertions prove contract wiring, helper
  tests prove byte identity behavior, and a fresh-agent evaluation only proves
  the named run and client/model configuration.
