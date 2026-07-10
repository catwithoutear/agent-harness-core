---
artifact: review-round
status: reviewed
tags: [review, design, implementation, review-coverage, review-verification]
description: "Challenge and multi-lens readiness review of the review coverage implementation-design pack."
---
# implementation-design Review Round 1

## Decision

`NOT_READY`

The pack has the required topology, ownership, flow, failure, and test-seam
structure, but four identity/portability and scope contracts remain incomplete. Task
slicing and source edits remain blocked until they are corrected and re-reviewed.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| IDC-R01-F01 | blocking | Replace raw `git diff --binary` bytes as a fingerprint component with a canonical Git object/content record that is independent of diff rendering. |
| IDC-R01-F02 | blocking | Define the exact portable Target Packet fingerprint section and deployed helper resolution path; require verifier recomputation from those fields. |
| IDC-R01-F03 | blocking | Add an artifact-set target path or explicitly preserve the frozen artifact-identity contract; a Git-worktree-only helper is insufficient for generic core review. |
| IDC-R01-F04 | blocking | Remove the newly specified JSON input/asset manifests; they violate the frozen V1 ban on a new serialized schema. |

### IDC-R01-F01: Raw Git diff output is not a canonical portable fingerprint input

- Category: compatibility and correctness.
- Evidence: `implementation-design/01-problem.md:## Boundary Conditions`
  specifies raw stdout from `git diff --binary`; the frozen contract requires a
  portable target identity across worktrees and handoff in `design.md:## Target
  Fingerprint` and `specs/review-coverage.md:Requirement: Portable Review
  Target`.
- Risk: diff rendering may vary with Git implementation/version or repository
  configuration even after disabling external diff/text conversion. The same
  source state can then produce different target fingerprints, creating false
  `STALE_REVIEW` outcomes across clients or machines.
- Required correction: use full base/head object IDs for committed state. For
  staged and unstaged state, enumerate changed paths with NUL-delimited Git
  path output, reject unmerged entries, and hash tagged length-prefixed records
  of normalized path, entry mode/type, deletion state, index blob bytes for
  staged entries, and raw worktree bytes or symlink target for unstaged entries.
  Continue to record scoped untracked and declared non-Git input with the same
  record framing. Tests must cover staged/unstaged overlap, deletion, mode-only
  change, symlink, unmerged-index failure, and scope changes.

### IDC-R01-F02: Target identity cannot yet be independently reconstructed

- Category: completeness and portability.
- Evidence: `implementation-design/03-class-design.md:## Markdown Role
  Interfaces` gives the Expected Coverage Packet shape, but does not give a
  Review Target Packet fingerprint section with helper version, base/head,
  object format, component digests, and normalized declared-input records. Its
  command examples use relative `node scripts/...` paths even though coordinators
  normally run from the target code root.
- Risk: a fresh verifier cannot tell whether a copied `TargetFingerprint` is
  reproducible from the supplied packet. A projected skill can also fail to
  locate its helper, which makes behavior client/cwd dependent.
- Required correction: define the exact Review Target Packet target-identity
  section, including digest algorithm/version, base/head object IDs, Git object
  format, component digest table, declared input-manifest digest/records, and
  optional execution coordinates outside that section. Invoke the helper by an
  explicit installed review-packet-gate skill root, not the caller cwd. Require
  inventory and comparison to recompute identity from these portable fields
  before they consume or join packets.

### IDC-R01-F03: The Git-only helper drops frozen artifact-target support

- Category: compatibility and completeness.
- Evidence: `implementation-design/01-problem.md:## Boundary Conditions` and
  `03-class-design.md:### review-packet-digest.mjs` define only a Git worktree
  command. The frozen `design.md:## Review Target Packet` allows a committed,
  uncommitted, or artifact identity, and the contract is core-wide rather than
  code-only.
- Risk: deep review of an implementation design, generated artifact, or other
  explicit file set outside a Git worktree would either invent a Git identity or
  lose the required target binding. That silently narrows the accepted V1
  contract.
- Required correction: add a bounded `artifact-set` helper mode with an explicit
  target root and nonempty canonical artifact manifest. Hash normalized relative
  path, type, executable bit, and raw file or symlink bytes; record exclusions
  with reasons. Keep root paths as execution coordinates, never portable output.
  Add artifact-set deterministic tests and make deep inventory/compare require
  an accessible code or artifact root for recomputation.

### IDC-R01-F04: Closed JSON helper manifests violate the V1 non-goal

- Category: scope alignment.
- Evidence: `implementation-design/03-class-design.md:### review-packet-digest.mjs`
  introduces closed JSON `input-manifest` and `artifact-manifest` shapes;
  `requirements.md:## Non-Goals` freezes "no deterministic ledger parser or
  new serialized schema in V1."
- Risk: a helper-specific schema becomes a second protocol representation next
  to the Markdown packet, creating drift and an unplanned parsing/validation
  surface. Renaming it a local manifest does not remove the contract.
- Required correction: replace parsed JSON manifests with repeated typed CLI
  paths plus one opaque, UTF-8, LF-normalized declaration file whose bytes are
  bound into the fingerprint but whose records are not parsed by code. Keep the
  human-readable declaration in the Markdown packet and have verifier prompts,
  not a new parser, check its semantics against the helper-returned paths and
  digest.

## Challenge And Lens Synthesis

| Lens | Result | Evidence |
|---|---|---|
| `boundary_contracts` | NOT_READY | F02-F04 leave packet portability, target-kind, and protocol-representation boundaries underspecified. |
| `topology_readiness` | READY_WITH_NOTES | Existing skill, role, manifest, generic projector, and tests are mapped with bounded ownership. |
| `control_lifecycle` | NOT_READY | F01 prevents a reliable fingerprint-to-stale transition across handoff. |
| `failure_recovery` | READY_WITH_NOTES | Fail-closed states and rollback are present; add unmerged/deletion/mode edge cases with F01. |
| `verification_observability` | NOT_READY | Helper test plan lacks the F01 representation cases and F03 artifact-target coverage. |
| `implementation_readiness` | NOT_READY | File order is useful, but no implementation slice should guess packet reconstruction or introduce a forbidden helper schema. |
| `artifact_chain` | READY_WITH_NOTES | The pack preserves frozen V1 owners and non-goals; corrections are implementation-design details permitted by r04. |

## Evidence Checked

- Frozen `requirements.md`, `design.md`, `proposal.md`,
  `specs/review-coverage.md`, and `reviews/draft-r04.md`.
- All seven files in `implementation-design/` and its generated index.
- Current packet, reviewer, workflow, command, manifest, projector, validator,
  and source/projection test anchors named by the pack.
- `node bin/harness-change-validate.js --state-root . --change
  review-coverage-contract --strict-layout`: verified (exact), zero errors and
  zero warnings before this decision.
- `git diff --check`: verified (exact) before this decision.

## Residual Risk

No source assets have changed, so no helper, projection, or fresh-agent
behavior has run. Static document validation does not prove the omitted
canonicalization and transfer contracts; that is why this gate is `NOT_READY`.
