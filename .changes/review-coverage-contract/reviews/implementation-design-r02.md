---
artifact: review-round
status: reviewed
tags: [review, design, implementation, review-coverage, review-verification]
description: "Re-review of the corrected review coverage implementation-design pack."
---
# implementation-design Review Round 2

## Decision

`NOT_READY`

All r01 findings are substantively addressed: the design now uses canonical
Git object/content records, has an artifact-set branch, places target identity
in the Review Target Packet, resolves the helper from the installed skill root,
and avoids a new parsed JSON schema. The r02 pass identified three remaining
packet-reconstruction and compatibility gaps that block the implementation gate.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| IDC-R02-F05 | blocking | Make declaration-byte normalization and repeated helper argument lists explicit in the Review Target Packet and helper contract. |
| IDC-R02-F06 | blocking | Carry the complete target-identity block into the sealed Expected Coverage Packet so a fresh comparison phase can recompute it. |
| IDC-R02-F07 | blocking | Reconcile legacy no-mode compatibility with the requirement that every explicit coverage mode has a target identity. |

### IDC-R02-F05: The declaration and typed arguments cannot yet be reconstructed byte-for-byte

- Category: correctness and portability.
- Evidence: `implementation-design/03-class-design.md:## Declared Inputs`
  carries a declaration digest and an illustrative opaque code block, while the
  helper takes repeated `--untracked-scope` and `--include-path` arguments.
  The text does not state the terminal-newline/BOM rule for declaration bytes or
  give a separate canonical list of the repeated typed arguments.
- Risk: a fresh verifier can receive the same human-readable declaration but
  create a different declaration digest or helper invocation through line-end,
  final-newline, duplicate, ordering, or inferred-path choices. The result is
  false staleness or an unverifiable copied fingerprint.
- Required correction: define declaration canonicalization as UTF-8 without BOM,
  CRLF/CR converted to LF, and exactly one final LF; reject invalid UTF-8. Add a
  Target Input Arguments table with canonical sorted `untracked-scope` and
  `include-path` values, including an explicit `N/A` row when absent. Require
  inventory/compare to build repeated CLI options from that table, compare the
  helper-returned lists and declaration digest, and increment `HelperVersion`
  whenever any target/packet canonicalization rule changes.

### IDC-R02-F06: A sealed Expected Coverage Packet carries only the aggregate fingerprint

- Category: control lifecycle and portability.
- Evidence: `implementation-design/03-class-design.md:## Expected Coverage
  Packet` currently lists `TargetFingerprint` but omits target kind, component
  digests, repeated arguments, declaration payload, and execution coordinate.
  The frozen design permits a fresh phase-2 verifier without prior session
  context.
- Risk: comparison can compare copied digest strings but cannot recompute the
  target identity or distinguish a detached Expected Coverage Packet from one
  prepared with the current target contract.
- Required correction: make Expected Coverage Packet copy the complete Review
  Target Packet target-identity, input-argument, declared-input, and execution-
  coordinate blocks before its own seal. Require comparison to recompute from
  that copy, validate it against the Expected Packet target fingerprint and
  reviewer ledger fingerprint, and reject a missing or incomplete copy as
  `TARGET_RECOMPUTE_UNAVAILABLE`/`NOT_READY`.

### IDC-R02-F07: Mode absent and quick-mode target requirements are contradictory

- Category: compatibility and routing.
- Evidence: `implementation-design/01-problem.md:## Boundary Conditions` says
  new fields are conditional for standard/deep, while
  `03-class-design.md:## Markdown Role Interfaces` says quick packets use the
  same target identity. The frozen proposal preserves existing review behavior
  when coverage mode is absent, while the frozen portable-target requirement
  binds every protocol review to an identity.
- Risk: an implementation agent can either break legacy lightweight review by
  requiring a helper for no-mode dispatch, or let explicit quick coverage make
  an unbound claim. Both contradict an accepted boundary.
- Required correction: state three cases exactly: no `coverage_mode` is legacy
  evidence-first review with no `coverage_gate` or coverage assurance claim;
  explicit `quick` requires Target Identity but no verifier/independent claim;
  explicit `standard` and `deep` require Target Identity plus their respective
  ledger/verifier outputs. Update routing and tests accordingly.

## Re-review Disposition

| Prior finding | Status | Evidence |
|---|---|---|
| IDC-R01-F01 | resolved | `01-problem.md` and `03-class-design.md` now use NUL path discovery plus framed index/worktree/object records instead of rendered patch bytes. |
| IDC-R01-F02 | resolved | The Review Target Packet has format, algorithm, helper version, object IDs, component digests, execution coordinates, and installed-skill-root invocation. |
| IDC-R01-F03 | resolved | `artifact-set` has explicit root/include paths, content records, non-applicable component digests, and planned tests. |
| IDC-R01-F04 | resolved | Parsed JSON manifests were replaced by typed CLI paths and an opaque declaration whose semantics remain in Markdown role contracts. |

## Challenge And Lens Synthesis

| Lens | Result | Evidence |
|---|---|---|
| `boundary_contracts` | NOT_READY | F05-F07 leave declaration, phase-2 reconstruction, and compatibility-routing ambiguity. |
| `topology_readiness` | READY | Helper/skill/roles/workflow/projection/tests still have bounded ownership and no new generic subsystem. |
| `control_lifecycle` | NOT_READY | F06 leaves fresh comparison unable to reproduce the target from its sealed phase-1 input. |
| `failure_recovery` | READY | Invalid input, unmerged state, stale target, seal, source, identity, and later validation errors are distinguished. |
| `verification_observability` | NOT_READY | Planned tests need declaration/argument cases and an Expected Packet identity-copy case. |
| `implementation_readiness` | NOT_READY | Slices 1-4 cannot implement stable command/routing contracts until F05-F07 are resolved. |
| `artifact_chain` | READY | The correction stays inside the frozen helper-selection deferral and preserves all upstream non-goals. |

## Evidence Checked

- r01 and all corrected files in `implementation-design/`.
- Frozen requirements, design, delta spec, proposal compatibility, and r04
  accepted implementation notes.
- Current skill, role, workflow, command, manifest, projector, validator, and
  test anchors named by the pack.
- `node bin/harness-change-validate.js --state-root . --change
  review-coverage-contract --strict-layout`: verified (exact), zero errors and
  zero warnings before this decision.
- `git diff --check`: verified (exact) before this decision.

## Residual Risk

No source asset is implemented. The required fresh-agent evaluation remains an
implementation validation, not current proof; its packet handoff must use the
corrected r03 declaration contract.
