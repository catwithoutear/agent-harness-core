# Review Log

## Review Round design-r04

Decision ID: design-r04

Decision: READY

Frozen: yes

Review Mode: `multi-lens-design-review`

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `implementation_readiness`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Upstream direction, scope, and non-goals. |
| `research.md` | `6deeedfa8f9cc7f3efb16cabbaaa1b6a0ac9ddc2da144001cec326960bc4792c` | Current workflow/tool constraints. |
| `design.md` | `dbf4e4692f30e139c3a13c90e751bad5e21332273c847d861b9fc5e2022ffdf7` | Reviewed solution contract. |
| `skills/workflow/workflow-control/SKILL.md` | `b27053d75a8522281da6190b1b0f63d442c89daac1fd0080454fb71f48260c8e` | Existing trigger and gate semantics. |
| `skills/change/change-planner/SKILL.md` | `242f2d3d31a2451dc5c8acedfce2eeaca955eb287b7277e2cd63f969cb858088` | Current task-slicing boundary. |
| `lib/change/doc-tool.js` | `794f2c38ede2cccd9409d3e321e9529094261a088a6ea8e2b7defdf00a3b4bf4` | Current structural writers and plan-only migration behavior. |
| `lib/change/validator.js` | `cd83bd87cef0a09d5b143a491ad2f5316ce48d9d6581404d1a2ced67e0115869` | Current mode/layout and legacy-artifact behavior. |
| `lib/change/root-resolution.js` | `0af535d20083fa9d4aca7537db83e13458e063d15012f8fa2311d962074d42ea` | State-root/worktree resolution behavior. |
| `schemas/change-workspace.schema.json` | `1327b80a7e0074db0d70f90c131bbbbd982682945852c845376300b831d5b01e` | Legacy/structured layout contract. |
| `harness.manifest.json` | `b09dec0d9a1d55288d51103259e83cd22b5c0fb163e8177d8719a2e38851b6b6` | Core identity evidence. |

Validation Evidence:

- `node bin/harness-change-validate --state-root . --change workflow-design-stage-gate`
  returned `errors=0`; its sole `no specs/ directory` warning is expected while
  this legacy solution-design phase forbids creating structured artifacts.

Findings:

- No blocking contradiction remains. The design now binds the one-time
  bootstrap to a state-root registry and fenced claim/scope/terminal lifecycle.
- Legacy gate preservation is explicit: exact-byte archive plus immutable
  provenance resolves prior `GateEvidenceRef` values without rewriting them.
- Interrupted migration fails closed until a bound transaction is resumed or
  rolled back; `specs/README.md` alone cannot select structured mode.
- Bootstrap close evidence binds authority, scope, base, full source-owned-path
  change snapshot, validation, and a distinct reviewer identity.

### Status

- Final re-review after the migration-bootstrap contract refinements.
- Result: design gate is ready to freeze.

### Blocking

- Blocking Open: 0

### Should Fix

- None. The future bootstrap plan and implementation-design pack must preserve
  the frozen contracts; they are downstream deliverables, not design gaps.

### Fix Applied

- Added state-root claim/scope/consumption fencing, exact historical-evidence
  migration, interrupted-transaction recovery, and source-snapshot scope proof.

### Re-review Result

- `READY`: all selected lenses find the solution design internally consistent
  and sufficient to create the regulated authority and bootstrap plan records.

### Deferred With Reason

- No controlled migration-apply source behavior exists yet. This is the
  explicitly qualified self-hosting condition for the next bootstrap phase, not
  authorization for unrelated Core implementation.

### Freeze Decision

- `design-r04` is frozen `READY` for the solution-design gate.
- Next checkpoint: create the bounded migration-bootstrap authority record and
  its scope-plan gate. Do not create `specs/`, `implementation-design/`, task
  slices, or ordinary Core source changes.

## Review Round design-r05

Decision ID: design-r05

Decision: READY

Frozen: yes

Review Mode: `multi-lens-design-review`

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `implementation_readiness`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Upstream direction, scope, and non-goals. |
| `research.md` | `7fb8934595ddbfa6d50c8ffee9274dca8d1655dc1e5ae5916e96786b83e3b12d` | Reviewed bootstrap source map and ownership boundary. |
| `design.md` | `dbf4e4692f30e139c3a13c90e751bad5e21332273c847d861b9fc5e2022ffdf7` | Reviewed solution contract. |
| `skills/workflow/workflow-control/SKILL.md` | `b27053d75a8522281da6190b1b0f63d442c89daac1fd0080454fb71f48260c8e` | Existing trigger and gate semantics. |
| `skills/change/change-planner/SKILL.md` | `242f2d3d31a2451dc5c8acedfce2eeaca955eb287b7277e2cd63f969cb858088` | Current task-slicing boundary. |
| `lib/change/doc-tool.js` | `794f2c38ede2cccd9409d3e321e9529094261a088a6ea8e2b7defdf00a3b4bf4` | Current structural writers and plan-only migration behavior. |
| `lib/change/validator.js` | `cd83bd87cef0a09d5b143a491ad2f5316ce48d9d6581404d1a2ced67e0115869` | Current mode/layout and legacy-artifact behavior. |
| `lib/change/root-resolution.js` | `0af535d20083fa9d4aca7537db83e13458e063d15012f8fa2311d962074d42ea` | State-root/worktree resolution behavior. |
| `lib/change/harness_change_doc.py` | source-parity-reviewed | Python command mirror. |
| `lib/change/harness_change_validate.py` | source-parity-reviewed | Python validator mirror. |
| `schemas/change-workspace.schema.json` | `1327b80a7e0074db0d70f90c131bbbbd982682945852c845376300b831d5b01e` | Legacy/structured layout contract. |

Validation Evidence:

- `node bin/harness-change-validate --state-root . --change workflow-design-stage-gate`
  returned `errors=0`. The `no specs/ directory` and legacy `review-log.md`
  warnings are expected current-tool behavior whose controlled migration path is
  explicitly this change's future source scope.

Findings:

- No blocker. The scout confirms that Node/Python parity, root resolution,
  policy/schema ownership, validator mode selection, and focused regression
  coverage are all inside the bootstrap's frozen boundary.
- No ordinary workflow-control or planner enforcement is smuggled into the
  bootstrap. That broader work remains downstream of migration and the required
  implementation-design pack.
- `design-r04` remains immutable historical evidence but is stale because its
  reviewed `research.md` digest changed. This round supersedes it as the current
  solution-design gate without rewriting the earlier decision.

### Status

- Re-review after adding source-backed bootstrap ownership evidence.
- Result: source mapping confirms implementation readiness for the bounded
  bootstrap plan, not for ordinary workflow implementation.

### Blocking

- Blocking Open: 0

### Should Fix

- None. The bootstrap plan must enumerate the exact code-root-relative allowlist
  from the verified source map and freeze it before any source change.

### Fix Applied

- Added a source-backed architecture map to `research.md`; no solution contract
  changed.

### Re-review Result

- `READY`: the updated source evidence does not change the design contract and
  confirms the bounded implementation surface.

### Deferred With Reason

- The source-owned migration capability remains absent. Its implementation is
  allowed only after the separate authority and scope-plan gates described by
  this design.

### Freeze Decision

- `design-r05` is frozen `READY` and supersedes `design-r04` as the current
  solution-design gate.
- Next checkpoint: create the migration-bootstrap authority round, then a
  bounded scope-plan round. Do not create structured artifacts, task slices, or
  ordinary Core source changes.

## Review Round design-r06

Decision ID: design-r06

Decision: READY

Frozen: yes

Review Mode: `multi-lens-design-review` evidence correction

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `implementation_readiness`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Upstream direction, scope, and non-goals. |
| `research.md` | `7fb8934595ddbfa6d50c8ffee9274dca8d1655dc1e5ae5916e96786b83e3b12d` | Bootstrap source map and ownership boundary. |
| `design.md` | `dbf4e4692f30e139c3a13c90e751bad5e21332273c847d861b9fc5e2022ffdf7` | Solution contract. |
| `skills/workflow/workflow-control/SKILL.md` | `b27053d75a8522281da6190b1b0f63d442c89daac1fd0080454fb71f48260c8e` | Existing trigger and gate semantics. |
| `skills/change/change-planner/SKILL.md` | `242f2d3d31a2451dc5c8acedfce2eeaca955eb287b7277e2cd63f969cb858088` | Current task-slicing boundary. |
| `lib/change/doc-tool.js` | `794f2c38ede2cccd9409d3e321e9529094261a088a6ea8e2b7defdf00a3b4bf4` | Node document command. |
| `lib/change/harness_change_doc.py` | `0b6ce9c72411f21cb5f4b8e4ef659e9ab56114b543116f3b86fe7b4e040d6cc8` | Python document-command mirror. |
| `lib/change/validator.js` | `cd83bd87cef0a09d5b143a491ad2f5316ce48d9d6581404d1a2ced67e0115869` | Node validator. |
| `lib/change/harness_change_validate.py` | `d2734dcefd375a5f67f9ce2cd4e3358174aa35d2325b4291a46bb5a595d776ec` | Python validator mirror. |
| `lib/change/root-resolution.js` | `0af535d20083fa9d4aca7537db83e13458e063d15012f8fa2311d962074d42ea` | State-root/worktree resolution. |
| `lib/change/js-policy.js` | `7aacdda5f7e4633e1196197e3e7c41e9c7f9b1cc60982b75202074edada73f2b` | Policy and command exposure. |
| `schemas/change-workspace.schema.json` | `1327b80a7e0074db0d70f90c131bbbbd982682945852c845376300b831d5b01e` | Workspace layout contract. |
| `harness.manifest.json` | `b09dec0d9a1d55288d51103259e83cd22b5c0fb163e8177d8719a2e38851b6b6` | Core identity and projected skill ownership. |

Validation Evidence:

- `node bin/harness-change-validate --state-root . --change workflow-design-stage-gate`
  returned `errors=0`; current legacy-layout warnings remain explicitly owned by
  the bounded migration capability.

Findings:

- `design-r05` recorded descriptive text instead of SHA-256 values for two
  reviewed Python mirrors. Its frozen bytes remain historical evidence, but it
  is malformed as a gate-input record and cannot remain authoritative.
- The corrected source set confirms the same `READY` decision. No design or
  research input changed between `design-r05` and this re-review.

### Status

- Corrected the evidence format through a new frozen round; no frozen round was
  rewritten.

### Blocking

- Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Replaced the malformed authoritative review with this fully digested round.

### Re-review Result

- `READY`: the design and scoped bootstrap boundary remain converged.

### Deferred With Reason

- Controlled migration apply is still absent and remains the only authorized
  bootstrap implementation target after the authority and scope-plan gates.

### Freeze Decision

- `design-r06` is frozen `READY` and supersedes malformed `design-r05` as the
  current solution-design gate. `design-r04` and `design-r05` remain immutable
  historical evidence only.
- Next checkpoint: create the migration-bootstrap authority round, then a
  bounded scope-plan round. Do not create structured artifacts, task slices, or
  ordinary Core source changes.

## Review Round migration-bootstrap-authority-r01

Decision ID: migration-bootstrap-authority-r01

Decision: READY

Frozen: yes

Gate Type: migration-bootstrap authority

User Decision Evidence: The user approved the one-time, Core-only
`migration-apply-bootstrap-v1` exception on 2026-07-22. This round records that
policy decision as a bounded authority; it does not authorize any source change
outside the later frozen scope-plan gate.

Authority Inputs:

| Evidence | Result |
|---|---|
| Solution-design gate | `GateEvidenceRef(change_id=workflow-design-stage-gate, artifact_path=review-log.md, decision_id=design-r06, artifact_sha256=733ddb46c9a1dfba85e4360b9acbafef37a445b30c053eef68079dd90bb3076a, decision=READY)`. |
| Root resolution | Explicit state and code roots resolve to `/home/scutech-yyh/WORKSPACE/harness/agent-harness-core`; it is not a linked worktree and has no unresolved root state. |
| Core identity | `harness.manifest.json` declares `@catwithoutear/agent-harness-core`. |
| Base source state | Git `HEAD` is `280ba925c5be2a3879a43e42580068eb3e01c12b`; source-owned status is clean. |
| Migration deadlock | `migrate --dry-run` lists `review-log.md` and `tasks.md` with `apply_supported: false`; `add-implementation-design` rejects this legacy workspace. |
| Trigger result | This shared workflow/schema/validator/command/test change requires an implementation-design pack after controlled migration. |

Executor ID: `migration-bootstrap-executor`

Reviewer ID: `migration-bootstrap-reviewer`

BootstrapClaimSpec (canonical JSON; digest of block content without trailing
newline: `4f3fce1b7a1360500e5a624eb2bda178a39a9683c0ad295bc7b1fb3df65b36cf`):

```json
{"authority_decision_id":"migration-bootstrap-authority-r01","bootstrap_id":"migration-apply-bootstrap-v1","claim_protocol":"exclusive-create-v1","originating_change_id":"workflow-design-stage-gate","state_root_realpath":"/home/scutech-yyh/WORKSPACE/harness/agent-harness-core"}
```

Authority Scope:

- Permitted future source behavior: controlled migration apply,
  preservation/provenance, state-root/control safety, validator support,
  focused migration tests, and matching documentation.
- Excluded behavior: product features, review-verifier V2, client projection,
  ordinary workflow gate enforcement, unrelated cleanup, task slices, and an
  implementation-design pack before migration.
- This authority is claim-only until its successor scope-plan round is frozen
  and atomically advances the control record to `scoped`.

### Status

- Admission facts and user authority are complete; no source code was changed.

### Blocking

- Blocking Open: 0

### Should Fix

- None. The next plan must use the verified source map to freeze the exact
  code-root-relative allowlist and validation matrix.

### Fix Applied

- None; this is an authority gate, not a design repair.

### Re-review Result

- `READY`: the qualified exception may create one `claimed` state-root control
  record and proceed to scope planning.

### Deferred With Reason

- The control record is not yet scoped and does not authorize source execution.

### Freeze Decision

- `migration-bootstrap-authority-r01` is frozen `READY` for
  `migration-apply-bootstrap-v1` under this state root only.
- Next checkpoint: create the matching `claimed` control record, draft and
  review the scope plan, and advance to `scoped` only after that plan is frozen.

## Review Round migration-bootstrap-scope-r01

Decision ID: migration-bootstrap-scope-r01

Decision: READY

Frozen: yes

Gate Type: migration-bootstrap scope plan

Executor ID: `migration-bootstrap-executor`

Reviewer ID: `migration-bootstrap-reviewer`

Reviewed Inputs:

| Path / Evidence | SHA-256 / Value | Purpose |
|---|---|---|
| `design.md` | `dbf4e4692f30e139c3a13c90e751bad5e21332273c847d861b9fc5e2022ffdf7` | Frozen bootstrap lifecycle and migration contract. |
| `research.md` | `7fb8934595ddbfa6d50c8ffee9274dca8d1655dc1e5ae5916e96786b83e3b12d` | Verified source owner map. |
| `plan.md` | `719185fc10b64754a01c82cc3a5207154ca0d0df2b43b39787e1ecbb4d2a7255` | Reviewed bootstrap execution plan. |
| authority gate | `GateEvidenceRef(change_id=workflow-design-stage-gate, artifact_path=review-log.md, decision_id=migration-bootstrap-authority-r01, artifact_sha256=22c9ad716a6d490860709fa73f9b483d4469b24c6704364ed396e99cbbc08299, decision=READY)` | Bounded user authority. |
| claimed control event | `33b5f5d93aedbb2308ab23f010d62bda3c9a7d6ebb8f1280c0181d4cd932da54` | Generation 1 and authority binding. |
| base source state | `HEAD=280ba925c5be2a3879a43e42580068eb3e01c12b`, inventory `73fe34ef60bc904f3c99cf8ce103000afc38101219a16cbfc95500ebaf576326` | Clean Core source-owned baseline. |

Bootstrap Scope Manifest Digest:

`619e686df96d15898db333f413b141fd228e319a77f9ac2ff7e8d3580a5f4c1b`

Scope Review Findings:

- The source-path allowlist is closed to Node/Python document and validator
  parity, root/policy/schema support, one focused regression suite, and paired
  command guidance. It excludes ordinary workflow phase enforcement and all
  product, V2, projection, implementation-pack, and task-slice work.
- The apply contract requires a recomputed dry-run digest and no-write mismatch
  rejection. Its transaction output archives legacy evidence, creates only
  structured indexes/skeleton/provenance, and does not create a pack or slice.
- The pre-mortem covers stale authority, root aliasing, changed legacy input,
  interrupted install, retry, rollback, Python divergence, and historical gate
  loss with a specified rejection or recovery path.

### Status

- Scope plan review completed against the frozen claim and clean source baseline.

### Blocking

- Blocking Open: 0

### Should Fix

- None. Source implementation must not add a path outside the frozen manifest;
  doing so revokes this authority rather than amending this round.

### Fix Applied

- The plan was refined before this review to make the apply precondition and
  committed structured output explicit.

### Re-review Result

- `READY`: the plan is a bounded execution authorization under the claimed
  authority, not an ordinary task slice.

### Deferred With Reason

- Independent close review and all source/test evidence remain required after
  implementation; this gate does not consume the authority.

### Freeze Decision

- `migration-bootstrap-scope-r01` is frozen `READY`. It authorizes only the
  listed scope manifest at base `280ba925c5be2a3879a43e42580068eb3e01c12b`.
- Next checkpoint: atomically advance the claimed control record to `scoped`,
  then implement the one bounded bootstrap execution.

## Review Round migration-bootstrap-implementation-r01

Decision ID: migration-bootstrap-implementation-r01

Decision: NOT_READY

Frozen: yes

Review Mode: independent correctness review plus independent coverage audit

Reviewer IDs: `reviewer-019f8ca2-05de-7470-8947-311ee75d793f`,
`review-verifier-019f8ca2-04bd-77e1-8e96-296ec46a98e8`

Reviewed Inputs:

| Surface | Evidence | Result |
|---|---|---|
| Node/Python migration commands | Current uncommitted allowlisted source diff and focused parity tests. | Recovery, plan binding, archive/provenance, and round mapping require review-driven repairs. |
| Node/Python validators | Current uncommitted allowlisted source diff. | Transaction/provenance validation requires binding to the accepted plan. |
| Root admission | `root-resolution.js`, `root_resolution.py`, plan source manifest, and linked-worktree contract. | The Python mirror is not in the frozen source allowlist. |
| Bootstrap authority lifecycle | `.changes/.control/migration-bootstrap-v1/`, `design.md`, and `plan.md`. | Command/validator control admission and terminal consumption are absent. |

### Findings

1. Resolved before this record: Python rollback referenced an undefined
   `legacy_paths`; the mirror now defines it and has a Python rollback test.
2. Resolved before this record: migration now records and validates a digest for
   each frozen legacy review round, and validators bind committed transaction
   fields to the canonical accepted plan.
3. Open blocker: explicit state-root admission still accepts a symlink alias or
   linked-worktree root. The design requires fail-closed rejection, but the
   required Python mirror `lib/change/root_resolution.py` is absent from the
   frozen source manifest. The exception contract requires a new user decision
   before adding that surface.
4. Open blocker: the scoped bootstrap registry is not yet consumed by a
   validated close transition, and command/validator paths do not validate the
   authority/scope/close lifecycle required by the design.

### Evidence

- Focused `node tests/run-tests.js --change-tools` passed after the resolved
  Node/Python migration, provenance, and transaction-binding fixes.
- Earlier `npm test`, `node bin/harness.js manifest --json`, and `git diff
  --check` passed before this review identified the remaining contract gaps.
- The independent coverage audit is `NOT_READY`: it also records that a deep
  review packet/coverage ledger must be generated for the final high-risk close
  review.

### Required User Decision

Approve or reject a replacement scoped bootstrap authority that adds only
`lib/change/root_resolution.py` to the source allowlist, mirroring the
already-authorized Node root-admission behavior. The replacement must bind a
new scope-manifest digest and generation before any source change to that file.

### Blocking

- Blocking Open: 2

### Re-review Result

- `NOT_READY`: do not create the bootstrap close event, consume the authority,
  or migrate the originating workspace until both blockers are resolved and an
  independent close review is ready.

## Review Round migration-bootstrap-authority-r02

Decision ID: migration-bootstrap-authority-r02

Decision: READY

Frozen: yes

Gate Type: replacement migration-bootstrap authority

Executor ID: `migration-bootstrap-executor`

Reviewer ID: `migration-bootstrap-reviewer`

### User Decision

The user approved replacing the scoped v1 bootstrap authority solely because
the independent implementation review proved that the Python root-resolution
mirror is necessary to make the already-authorized Node admission rule
fail-closed. This is not permission to reuse v1 or add any other source
surface.

### BootstrapClaimSpec

```json
{"bootstrap_id":"migration-apply-bootstrap-v2","expected_authority_decision_id":"migration-bootstrap-authority-r02","exclusive_create":true,"originating_change_id":"workflow-design-stage-gate","state_root_realpath":"/home/scutech-yyh/WORKSPACE/harness/agent-harness-core"}
```

### Scope Boundary

- Revoke `migration-apply-bootstrap-v1` before creating the replacement claim.
- The replacement may add only `lib/change/root_resolution.py` to the existing
  source allowlist and may implement the missing lifecycle admission and close
  consumption checks already described by the frozen design and plan.
- No implementation-design pack, structured `specs/`, task slice, ordinary
  phase-gate enforcement, V2 review-verifier work, projection-only editing, or
  product behavior is authorized.

### Re-review Result

- `READY`: the user decision supplies the required new authority for a
  replacement claim and a separately frozen replacement scope manifest.

## Review Round migration-bootstrap-scope-r02

Decision ID: migration-bootstrap-scope-r02

Decision: READY

Frozen: yes

Gate Type: replacement migration-bootstrap scope plan

Executor ID: `migration-bootstrap-executor`

Reviewer ID: `migration-bootstrap-reviewer`

Reviewed Inputs:

| Path / Evidence | SHA-256 / Value | Purpose |
|---|---|---|
| replacement authority gate | `GateEvidenceRef(change_id=workflow-design-stage-gate, artifact_path=review-log.md, decision_id=migration-bootstrap-authority-r02, artifact_sha256=a182fce6a00623499f735606a8677d6846021800adc198c9f43b101098b8e34a, decision=READY)` | User-approved replacement authority. |
| claimed control event | `20fa6feb07e8d53ac459f055453f463c0a18ea178323effc035d1d482dab3f81` | Generation 1 claim bound to the authority round. |
| revoked predecessor | `migration-apply-bootstrap-v1`, event `99078854551795532ef6b3bbb704eaf5707788350fc234dccb16a83ddf077a67` | Prevents v1 reuse before successor scope. |
| base source state | `HEAD=280ba925c5be2a3879a43e42580068eb3e01c12b` | Common bootstrap baseline. |
| predecessor source snapshot | `7122705fd7aa0aa5cacb8116275e1635aa4fbbf9050416595918401c34437a1b` | Accounts for the reviewed v1 implementation before successor scope. |

Bootstrap Scope Manifest Digest:

`bc894c56c369f1397b5d4c3a492586cef5aeac86f86f75776b492bf3d96debf5`

### Bootstrap Scope Manifest

```json
{"authority_record_sha256":"20fa6feb07e8d53ac459f055453f463c0a18ea178323effc035d1d482dab3f81","base_commit":"280ba925c5be2a3879a43e42580068eb3e01c12b","behavioral_purposes":["archive-and-provenance","controlled-migration-apply","control-and-root-safety","validator-support"],"code_root_realpath":"/home/scutech-yyh/WORKSPACE/harness/agent-harness-core","executor_id":"migration-bootstrap-executor","originating_change_id":"workflow-design-stage-gate","predecessor_snapshot_sha256":"7122705fd7aa0aa5cacb8116275e1635aa4fbbf9050416595918401c34437a1b","reviewer_id":"migration-bootstrap-reviewer","rollback_boundary":"revert-only-allowlist-and-preserve-preexisting-legacy-bytes","source_paths":["README.md","README_CN.md","lib/change/doc-tool.js","lib/change/harness_change_doc.py","lib/change/harness_change_validate.py","lib/change/js-policy.js","lib/change/root-resolution.js","lib/change/root_resolution.py","lib/change/validator.js","schemas/change-workspace.schema.json","skills/change/change-workspace-operator/SKILL.md","tests/test-change-tools.js"],"validation_ids":["bootstrap-lifecycle","change-tool-parity","migration-transaction","root-safety","source-asset-validation"]}
```

### Predecessor Source Snapshot

```json
[{"mode":"100644","path":"README.md","sha256":"6a556da49d68d700d7a105df3e4bc62ff0154d7384a37d646e21241c0174355d"},{"mode":"100644","path":"README_CN.md","sha256":"4ead4bce09024d3bbbf707bb9dac076f9b89cb4c47c6751c24d031980ed20787"},{"mode":"100644","path":"lib/change/doc-tool.js","sha256":"fde6e586fe347904bbd7471848448b1fda5ddc9739d65ae2aa1a3e2822617a51"},{"mode":"100755","path":"lib/change/harness_change_doc.py","sha256":"7f5124ae33e8a661cbbea9c791007b9dff94326b3c89bf2762f4f236d9fbc442"},{"mode":"100755","path":"lib/change/harness_change_validate.py","sha256":"a7885c8aaa948f55019252b0bac93db372864cdda4d956f31c3589803348be90"},{"mode":"100644","path":"lib/change/js-policy.js","sha256":"6acac7489f460f3103f595d1db388ca375258337e27cab456f15ce1967023f66"},{"mode":"100644","path":"lib/change/root-resolution.js","sha256":"2565f7edc0d12c1bd9f630a89e4d000d7192e4615ac5acf0a03804cee9a454a7"},{"mode":"100644","path":"lib/change/validator.js","sha256":"d6749557c56d95fa88a5093a79749009c193df7024ed9976f39518bdb7e41d6e"},{"mode":"100644","path":"schemas/change-workspace.schema.json","sha256":"1740b0abbf1371028025ca827c8fdf68f3ebc62d97b5f7154b6508eaf840d54f"},{"mode":"100644","path":"skills/change/change-workspace-operator/SKILL.md","sha256":"986b7c89e0867c8045bac250a04e097e0aedbe2033a7e8a0ceb1d2f53f96695f"},{"mode":"100644","path":"tests/test-change-tools.js","sha256":"57fe7d7c0b23af8216d946420216248085c444a9419da2ce9f6cc5c06e678360"}]
```

### Scope Review Findings

- The successor preserves the v1 rollback boundary, base commit, behavioral
  purposes, executor/reviewer separation, and all previously allowlisted paths.
- The only new source surface is `lib/change/root_resolution.py`; it mirrors the
  JavaScript rejection of aliased and linked-worktree state-root admission.
- The already-reviewed predecessor snapshot is complete and fully inside v1's
  frozen manifest. The successor may not add a source-owned diff outside the
  replacement manifest.

### Re-review Result

- `READY`: `migration-apply-bootstrap-v2` is scoped only to the manifest above.
  It is an execution authorization, not an implementation-design or task-slice
  authorization.

## Review Round migration-bootstrap-implementation-r01

Decision ID: migration-bootstrap-implementation-r01

Decision: NOT_READY

Frozen: no

Review Mode: implementation review and validator re-check

Reviewed Inputs:

| Path / Evidence | Result | Purpose |
|---|---|---|
| `lib/change/doc-tool.js` | scoped close/admission now verify canonical claim, scope, snapshot, and close-evidence bindings | Repair the prior structural-only admission gap. |
| `lib/change/harness_change_doc.py` | same source-evidence checks and Git snapshot calculation | Preserve Node/Python command parity. |
| `lib/change/validator.js` and `lib/change/harness_change_validate.py` | both reject noncanonical bootstrap JSON blocks | Make malformed authority observable before migration apply. |
| `tests/test-change-tools.js` | focused command tests pass after adding snapshot-mismatch and noncanonical-block cases | Regression evidence. |
| `harness-change-validate --state-root . --change workflow-design-stage-gate` | `errors=1`: `migration-bootstrap-v2` claim block is noncanonical | Live state-root evidence. |

Findings:

1. **Blocking, evidence integrity.** The frozen
   `migration-bootstrap-authority-r02` `BootstrapClaimSpec` JSON block orders
   `expected_authority_decision_id` before `exclusive_create`; canonical JSON
   requires lexical key order. Its recorded `claim_spec_digest` is therefore
   not a digest of the canonical block. Both validators now fail closed on the
   active v2 registry. The frozen r02 bytes must not be normalized or replaced
   in place.
2. **Blocking, lifecycle recovery.** The active v2 record is `scoped`, but the
   current public command surface has no regulated terminal-revocation command
   for a scope that fails evidence validation. A fresh authority cannot be
   created while this record remains nonterminal.

Required Disposition:

- Add a narrowly scoped, compare-and-swap `bootstrap-revoke` containment path
  that records a frozen `NOT_READY` revoke decision, reason, observed
  generation, and exact review digest without treating invalid scope evidence
  as executable authority.
- After the v2 record is terminally revoked, request an explicit user decision
  before creating any replacement authority. The replacement must use new
  canonical frozen claim/scope blocks and must not expand the source allowlist
  or reuse v2 evidence.

Validation Evidence:

- `PYTHONDONTWRITEBYTECODE=1 node tests/run-tests.js --change-tools`: passed.
- Node and Python change validators both report the same live v2 canonical JSON
  blocker.

Gate: `NOT_READY`

## Review Round migration-bootstrap-containment-r02

Decision ID: migration-bootstrap-containment-r02

Decision: NOT_READY

Frozen: yes

Review Mode: implementation repair re-review and terminal-containment gate

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path / Evidence | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Confirms the active v2 record is generation 2 and still `scoped`. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Preserves the invalid v2 scope as containment input, never executable authority. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Requires exact round binding, authority/scope/close identity, and terminal revocation. |
| `lib/change/doc-tool.js` | `16d744149c260f99d18df95ab2a3438fea5c22cfb66ccd12b6e6cf2da5241c97` | Node transition writer and stale-lock recovery guard. |
| `lib/change/harness_change_doc.py` | `adc9dcbfa8f991ba20c879eba3425fc0475b5935cb686685a4f1ddaab5440466` | Python command mirror. |
| `lib/change/validator.js` | `c67758d08076e9c68d9cae7b870296be2a568c2699aaabcd878df36fb2e64d36` | Node evidence validator. |
| `lib/change/harness_change_validate.py` | `f39f25ba29c1f891e926dd2cf441691ee62b9265de5d55d5c4cf146cea95e9e7` | Python evidence-validator mirror. |
| `tests/test-change-tools.js` | `138e46e5b6f497430e8ad7af811b2eddad949aef6bb8ee4755f0b496f5832751` | Node/Python regression coverage for strict rounds, containment, and lock recovery. |

### Findings

1. The active v2 `BootstrapClaimSpec` remains noncanonical and its frozen
   authority/scope evidence must not be edited in place. Both command mirrors
   and validators therefore fail closed before migration apply.
2. The bounded source repair now binds each gate to one unique LF-normalized
   review-round digest, binds close evidence to the authority record and named
   executor/reviewer identities, and rejects malformed or forged evidence in
   both mirrors.
3. `bootstrap-revoke` can terminally contain an invalid scoped record without
   validating it as authority. Regression coverage proves the resulting record
   validates as contained while migration apply remains rejected.
4. Stale migration-lock reclamation is protected by an exclusive recovery guard;
   an interrupted recovery remains fail-closed instead of deleting a later
   claimant's lock.

### Blocking

Blocking Open: 0

### Should Fix

- No additional source repair is required within the frozen v2 allowlist.

### Fix Applied

- Implemented and verified the bounded containment writer, strict evidence
  binding, Node/Python parity, and focused regression coverage.

### Re-review Result

- `NOT_READY`: source repair is ready, but the real v2 control transition is
  irreversible. Do not revoke it or create a replacement authority without a
  new explicit user decision.

### Deferred With Reason

- The only deferred action is execution of `bootstrap-revoke` against the real
  v2 record, followed by a separately approved canonical replacement authority
  with the unchanged source allowlist.

### Freeze Decision

- `migration-bootstrap-containment-r02` is frozen `NOT_READY` as the sole
  terminal-containment gate for `migration-apply-bootstrap-v2` generation 2.
- Its selected-round digest, observed generation, and canonical reason must be
  supplied to the containment command. This round grants no replacement
  authority and no migration permission.

### Status

- Source implementation converged; real control state remains unchanged.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r04

Decision ID: migration-bootstrap-containment-r04

Decision: NOT_READY

Frozen: yes

Review Mode: source repair re-review and terminal-containment gate

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Confirms that the real v2 control record is still generation 2 and `scoped`. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Preserves the malformed v2 scope as containment-only evidence. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Defines exact review binding, single-use state-root authority, and terminal containment. |
| `lib/change/doc-tool.js` | `b489ab3ba5c07e3cb4aca18457ff1c8d9a74bfa1e992db985f703a062f422eaa` | Node control writer enforces strict reviewed inputs and one active state-root lifecycle. |
| `lib/change/harness_change_doc.py` | `6c4f0c00680e3536e20b162f5e57179591b3e279040adfcc121dd72605559884` | Python control-writer mirror for the same admission and close rules. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node validator detects malformed frozen input tables and global authority collisions. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python validator mirror. |
| `lib/change/js-policy.js` | `efddc613c7942628687727b5561980fa60d4180da3f97fc31f44f9569eea004e` | Policy output exposes the regulated migration and bootstrap command boundary. |
| `lib/change/root-resolution.js` | `d37a599a01e7364ed34da545ecc259322428cbc6b78312d605408d40b2e871f0` | Node state-root identity and linked-worktree admission boundary. |
| `lib/change/root_resolution.py` | `096bea15e37b58aac1efd4cc68fe99006fe6cac1dcc7595a741c46da5a2c7527` | Python root-resolution mirror. |
| `schemas/change-workspace.schema.json` | `1740b0abbf1371028025ca827c8fdf68f3ebc62d97b5f7154b6508eaf840d54f` | Schema records the controlled migration and bootstrap artifact contract. |
| `tests/test-change-tools.js` | `716a2cf11cf5d91de35df9c4d467bce65f16605ea83975fe2b5aa4f0984ddd40` | Covers strict reviewed-input rows and competing authorities in Node and Python paths. |
| `README.md` | `08c2a6acbfe49a3ded124ce28cb3306b5f30c3c1d5fbc051d8c4e931588b5b0f` | Documents the English operator contract. |
| `README_CN.md` | `3ffb7cbb1fb69e2264745e4370bd6a2eb4ddf156186c9ec23b5aea876b2e468f` | Keeps the paired Chinese operator contract aligned. |
| `skills/change/change-workspace-operator/SKILL.md` | `98cf1ea9528f0b6345d2574a3211ac49b3d254175efc657c811f35e15460399d` | Projects the regulated operator procedure to runtime clients. |

### Findings

1. The source admission and validation paths now enforce the design's
   state-root-wide single-use rule. A second `claimed`, `scoped`, or `consumed`
   authority for any other change is rejected by both validators, migration
   admission, and close; `bootstrap-revoke` remains available only to contain
   an invalid scoped record.
2. The selected frozen review round now requires a complete `Path` /
   `SHA-256` / `Purpose` table. Each row has one safe relative path, one pure
   digest (optionally Markdown-code wrapped), and a nonempty purpose. Both
   command and validator mirrors reject malformed tables before a close or
   migration transition.
3. The active real v2 registry remains intentionally invalid because frozen
   `migration-bootstrap-authority-r02` lacks the strict input table. Its bytes
   and scoped event remain unchanged; both live validators fail closed, so this
   source repair does not create a migration path or replacement authority.
4. `npm test`, manifest validation, projection refresh, projection verification,
   and `git diff --check` passed for this source snapshot. Node and Python live
   validators report the same single real-v2 evidence blocker.

### Blocking

Blocking Open: 0

### Should Fix

- No additional source repair is required before independent source review.

### Fix Applied

- Added strict frozen reviewed-input table validation, state-root-wide lifecycle
  uniqueness, mirrored Node/Python enforcement, regression coverage, and paired
  operator documentation.

### Re-review Result

- `NOT_READY`: the source repair is ready for independent review. The real v2
  control transition remains irreversible and outside this review round's
  authority.

### Deferred With Reason

- Do not execute `bootstrap-revoke` against the real v2 registry or create a
  successor authority without a new explicit user decision after independent
  review. This round only records evidence for possible terminal containment.

### Freeze Decision

- `migration-bootstrap-containment-r04` supersedes r03 as the source-repair
  containment gate for `migration-apply-bootstrap-v2` generation 2.
- Its exact LF-normalized round digest, observed generation, and canonical
  reason are required by the containment command. This round grants neither
  migration nor replacement-authority permission.

### Status

- Source implementation is frozen for review. Real control state remains
  unchanged and invalid by design.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r03

Decision ID: migration-bootstrap-containment-r03

Decision: NOT_READY

Frozen: yes

Review Mode: implementation repair re-review and terminal-containment gate

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path / Evidence | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Confirms the active v2 record is generation 2 and still `scoped`. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Preserves the malformed v2 scope as containment input, never executable authority. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Defines exact round binding, terminal containment, and legacy archive behavior. |
| `lib/change/doc-tool.js` | `ec3a9b35bfb16616c20cbdd5168907ea07241112306eeda7925b9fb898994a9e` | Node transition writer, exact round selector, and LF-normalized migration provenance. |
| `lib/change/harness_change_doc.py` | `21ea17ca953d62d0335455aa88d0f453bc9b8a93e9e3f5cdc3c7179ea4d6034e` | Python command mirror for the same transition and provenance contracts. |
| `lib/change/validator.js` | `73d3f41ac08442d3e8d2137a6bec863ca7d82680f04de2e77bfe76ea0396810e` | Node validation of new terminal evidence and narrowly bounded historical v1 compatibility. |
| `lib/change/harness_change_validate.py` | `db1c3d5e6b93808434de10dc83d67a48ed67cda848e08f77af63b75582aaaf2f` | Python validator mirror. |
| `tests/test-change-tools.js` | `0827da20c309e7cefd6777d5b6d94bbc5a3ef31c6f0a5da9d7e17ee778e23cc9` | Covers missing new revoke evidence, historical v1 compatibility, bare-marker boundaries, and CRLF archive provenance. |
| `README.md` / `README_CN.md` | `6b61ac76afd179a83ce7046671d709328b9a510de44794f127bbfc47f40096b3` / `9f3a54dd5eb7f97a80f22bf5753c8ea1f74e479874bb03a4649313dadc53bfe6` | Paired operator-facing migration and terminal-evidence contract. |

### Findings

1. The active v2 `BootstrapClaimSpec` remains invalid under the stricter frozen
   round contract because `migration-bootstrap-authority-r02` lacks the required
   reviewed-input digest table. The frozen evidence and scoped event remain
   unchanged; both command mirrors and both validators fail closed.
2. A new terminal revocation can no longer omit `revoke_gate_ref`. The only
   compatibility exception is the pre-existing v1 terminal record shape with a
   prior scoped-event digest and replacement bootstrap identity; it is read-only
   and cannot authorize migration.
3. Legacy frozen-round provenance now hashes LF-normalized round text while the
   archive remains byte-exact. The exact selector also ignores a bare `## Review
   Round` marker, so a marker cannot truncate a selected evidence range.
4. Node and Python command/validator mirrors pass the full suite, manifest
   validation, projection refresh and projection verification. Their live
   validators report the same single malformed-v2 blocker.

### Blocking

Blocking Open: 0

### Should Fix

- No additional source repair is required before a separate review of this
  frozen source snapshot.

### Fix Applied

- Repaired the missing terminal-evidence enforcement and LF provenance parity,
  added regression coverage, and documented the narrow historical boundary.

### Re-review Result

- `NOT_READY`: source repair is ready for independent review, but the real v2
  control transition is irreversible and remains outside this round's authority.

### Deferred With Reason

- Do not execute `bootstrap-revoke` against the real v2 registry or create a
  successor authority without a new explicit user decision after source review.

### Freeze Decision

- `migration-bootstrap-containment-r03` supersedes r02 as the source-repair
  containment gate for `migration-apply-bootstrap-v2` generation 2.
- Its selected-round digest, observed generation, and canonical reason are
  required by the containment command. This round grants neither migration nor
  replacement-authority permission.

### Status

- Source implementation is frozen for review; real control state remains
  unchanged and invalid by design.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r05

Decision ID: migration-bootstrap-containment-r05

Decision: NOT_READY

Frozen: yes

Review Mode: corrected source repair re-review and terminal-containment gate

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Confirms that the real v2 control record remains generation 2 and `scoped`. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Preserves the malformed v2 scope as containment-only evidence. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Defines exact review binding, single-use state-root authority, and terminal containment. |
| `lib/change/doc-tool.js` | `b489ab3ba5c07e3cb4aca18457ff1c8d9a74bfa1e992db985f703a062f422eaa` | Node control writer enforces strict reviewed inputs and one active state-root lifecycle. |
| `lib/change/harness_change_doc.py` | `6c4f0c00680e3536e20b162f5e57179591b3e279040adfcc121dd72605559884` | Python control-writer mirror for the same admission and close rules. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node validator detects malformed frozen input tables and global authority collisions. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python validator mirror. |
| `lib/change/js-policy.js` | `efddc613c7942628687727b5561980fa60d4180da3f97fc31f44f9569eea004e` | Policy output exposes the regulated migration and bootstrap command boundary. |
| `lib/change/root-resolution.js` | `d37a599a01e7364ed34da545ecc259322428cbc6b78312d605408d40b2e871f0` | Node state-root identity and linked-worktree admission boundary. |
| `lib/change/root_resolution.py` | `096bea15e37b58aac1efd4cc68fe99006fe6cac1dcc7595a741c46da5a2c7527` | Python root-resolution mirror. |
| `schemas/change-workspace.schema.json` | `1740b0abbf1371028025ca827c8fdf68f3ebc62d97b5f7154b6508eaf840d54f` | Schema records the controlled migration and bootstrap artifact contract. |
| `tests/test-change-tools.js` | `716a2cf11cf5d91de35df9c4d467bce65f16605ea83975fe2b5aa4f0984ddd40` | Covers strict reviewed-input rows and competing authorities in Node and Python paths. |
| `README.md` | `08c2a6acbfe49a3ded124ce28cb3306b5f30c3c1d5fbc051d8c4e931588b5b0f` | Documents the English operator contract. |
| `README_CN.md` | `3ffb7cbb1fb69e2264745e4370bd6a2eb4ddf156186c9ec23b5aea876b2e468f` | Keeps the paired Chinese operator contract aligned. |
| `skills/change/change-workspace-operator/SKILL.md` | `98cf1ea9528f0b6345d2574a3211ac49b3d254175efc657c811f35e15460399d` | Projects the regulated operator procedure to runtime clients. |

### Findings

1. The source admission and validation paths enforce the design's state-root-wide
   single-use rule. A second `claimed`, `scoped`, or `consumed` authority for
   another change is rejected by both validators, migration admission, and
   close. `bootstrap-revoke` remains available only to contain an invalid scoped
   record.
2. The selected frozen review round requires a complete `Path` / `SHA-256` /
   `Purpose` table. Each row has one safe relative path, one pure digest
   (optionally Markdown-code wrapped), and a nonempty purpose. Both command and
   validator mirrors reject malformed tables before a close or migration
   transition.
3. The active real v2 registry remains intentionally invalid because frozen
   `migration-bootstrap-authority-r02` lacks the strict input table. Its bytes
   and scoped event remain unchanged; both live validators fail closed, so this
   source repair creates neither a migration path nor a replacement authority.
4. The preceding r04 round was appended before r03 by mistake. It remains
   immutable audit evidence but cannot supersede a later round; this r05 round
   restores the ordered audit chain without altering r03 or r04.
5. `npm test`, manifest validation, projection refresh, projection verification,
   and `git diff --check` passed for this source snapshot. Node and Python live
   validators report the same single real-v2 evidence blocker.

### Blocking

Blocking Open: 0

### Should Fix

- No additional source repair is required before independent source review.

### Fix Applied

- Added strict frozen reviewed-input table validation, state-root-wide lifecycle
  uniqueness, mirrored Node/Python enforcement, regression coverage, paired
  operator documentation, and this ordered immutable correction.

### Re-review Result

- `NOT_READY`: the source repair is ready for independent review. The real v2
  control transition remains irreversible and outside this review round's
  authority.

### Deferred With Reason

- Do not execute `bootstrap-revoke` against the real v2 registry or create a
  successor authority without a new explicit user decision after independent
  review. This round only records evidence for possible terminal containment.

### Freeze Decision

- `migration-bootstrap-containment-r05` supersedes r03 and r04 as the ordered
  source-repair containment gate for `migration-apply-bootstrap-v2` generation
  2.
- Its exact LF-normalized round digest, observed generation, and canonical
  reason are required by the containment command. This round grants neither
  migration nor replacement-authority permission.

### Status

- Source implementation is frozen for review. Real control state remains
  unchanged and invalid by design.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r06

Decision ID: migration-bootstrap-containment-r06

Decision: NOT_READY

Frozen: yes

Review Mode: independent-review remediation and terminal-containment gate

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Confirms that real v2 remains generation 2 and `scoped`. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Preserves the malformed v2 scope as immutable containment-only evidence. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Requires originating-change-only migration after a consumed close gate. |
| `lib/change/doc-tool.js` | `6cff49927d400d676783db60b24e32c71013100409bba2c8882ecb52bde80ff4` | Node admission rejects a foreign or revoked authority before migration apply. |
| `lib/change/harness_change_doc.py` | `b6a0878c957f863a4b366f64779bce2c0d50095735e8c49306df88fcc66c2e0e` | Python admission mirror rejects the same foreign or revoked authority. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node validator retains strict frozen evidence and lifecycle collision checks. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python validator mirror. |
| `lib/change/js-policy.js` | `efddc613c7942628687727b5561980fa60d4180da3f97fc31f44f9569eea004e` | Policy exposes the regulated command boundary. |
| `lib/change/root-resolution.js` | `d37a599a01e7364ed34da545ecc259322428cbc6b78312d605408d40b2e871f0` | Node canonical state-root and linked-worktree boundary. |
| `lib/change/root_resolution.py` | `096bea15e37b58aac1efd4cc68fe99006fe6cac1dcc7595a741c46da5a2c7527` | Python root-resolution mirror. |
| `schemas/change-workspace.schema.json` | `1740b0abbf1371028025ca827c8fdf68f3ebc62d97b5f7154b6508eaf840d54f` | Schema excludes Core control state from active change discovery. |
| `tests/test-change-tools.js` | `218209f12d1e8a0bdfa623f7923e61a8da76a31e2b97a7c9acb651c27ddc8dac` | Covers foreign-change apply rejection for scoped, consumed, and revoked states in both mirrors. |
| `README.md` | `2f6d2fc7b5f018549bd6298ce7a9f43045fe62add8159bd5dd5c46943a10f743` | Documents originating-change-only migration in English. |
| `README_CN.md` | `58e70ed959e884ec2131f9c65e6c9a9af3d31f9f2f812ec001a08baff62d97b3` | Keeps the Chinese operator contract aligned. |
| `skills/change/change-workspace-operator/SKILL.md` | `b5077f5cf32ed7b3bf118f9bef7d5a9ae03d1959b41feb6de0e667e4533f7b5b` | Projects the originating-change boundary to runtime operators. |

### Findings

1. Independent review found that an active registry belonging to another change
   could previously fall through migration admission, and an all-revoked root
   could permit a different change. Both paths contradicted the design's
   originating-change-only transition rule.
2. Both command mirrors now reject every apply when the sole non-revoked
   authority belongs to another change. When the root contains only terminal
   revocations, apply remains blocked until a new consumed authority exists.
   The originating change remains the only consumer of that authority.
3. New Node/Python parity coverage exercises `scoped`, `consumed`, and
   `revoked` foreign authority states. Focused and full suites pass, and the
   projection refresh/verification and manifest checks pass.
4. The live v2 record and all earlier frozen evidence remain unchanged. Both
   validators still fail only on authority r02's missing reviewed-input table,
   preserving the intended fail-closed containment boundary.

### Blocking

Blocking Open: 0

### Should Fix

- No additional source repair is required before a fresh independent review.

### Fix Applied

- Removed the cross-change admission fallthrough, added terminal-revocation
  denial, mirrored both language implementations, added state-by-state parity
  coverage, and updated paired operator guidance.

### Re-review Result

- `NOT_READY`: the reviewed source finding is repaired and ready for fresh
  independent review. Real v2 control-state mutation remains outside this
  round's authority.

### Deferred With Reason

- Do not execute `bootstrap-revoke` against real v2, create a successor
  authority, or invoke migration apply under this round. Each action requires a
  new explicit user decision after the source review chain is clean.

### Freeze Decision

- `migration-bootstrap-containment-r06` supersedes r05 as the source-repair
  containment gate for `migration-apply-bootstrap-v2` generation 2.
- Its exact LF-normalized round digest, observed generation, and canonical
  reason may support terminal containment only. It grants neither migration nor
  replacement-authority permission.

### Status

- Source implementation is frozen for review. Real control state remains
  unchanged and invalid by design.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r07

Decision ID: migration-bootstrap-containment-r07

Decision: NOT_READY

Frozen: yes

Review Mode: independent deep source review and coverage-verifier closeout

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `8c47fd06b20611753d9431ac1faf36c9fbe4beb7016c64d09816d03097f82f07` | Immutable real v2 scoped-state residual. |
| `.changes/.control/migration-bootstrap-v2/events/000002-scoped.json` | `b6231064d2853e8d64320f0c17af9e6bc750d8db4ee7dcdc870bd0d6069ce135` | Immutable malformed scope evidence. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Originating-change-only migration and evidence contract. |
| `lib/change/doc-tool.js` | `6cff49927d400d676783db60b24e32c71013100409bba2c8882ecb52bde80ff4` | Node lifecycle, evidence, and migration transaction implementation. |
| `lib/change/harness_change_doc.py` | `b6a0878c957f863a4b366f64779bce2c0d50095735e8c49306df88fcc66c2e0e` | Python command-mirror implementation. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node validator and fail-closed control evidence. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python validator mirror. |
| `lib/change/js-policy.js` | `efddc613c7942628687727b5561980fa60d4180da3f97fc31f44f9569eea004e` | Public regulated command policy. |
| `lib/change/root-resolution.js` | `d37a599a01e7364ed34da545ecc259322428cbc6b78312d605408d40b2e871f0` | Node state-root boundary. |
| `lib/change/root_resolution.py` | `096bea15e37b58aac1efd4cc68fe99006fe6cac1dcc7595a741c46da5a2c7527` | Python state-root mirror. |
| `schemas/change-workspace.schema.json` | `1740b0abbf1371028025ca827c8fdf68f3ebc62d97b5f7154b6508eaf840d54f` | Core control-directory exclusion. |
| `tests/test-change-tools.js` | `218209f12d1e8a0bdfa623f7923e61a8da76a31e2b97a7c9acb651c27ddc8dac` | Scoped, consumed, and revoked foreign-change regression matrix. |
| `README.md` | `2f6d2fc7b5f018549bd6298ce7a9f43045fe62add8159bd5dd5c46943a10f743` | English operator contract. |
| `README_CN.md` | `58e70ed959e884ec2131f9c65e6c9a9af3d31f9f2f812ec001a08baff62d97b3` | Paired Chinese operator contract. |
| `skills/change/change-workspace-operator/SKILL.md` | `b5077f5cf32ed7b3bf118f9bef7d5a9ae03d1959b41feb6de0e667e4533f7b5b` | Projected operator procedure. |

### Findings

1. The independent reviewer rechecked the r06 repair and found no open
   correctness, scope, consumer, documentation, or projection finding. The
   previous foreign-migration admission defect is resolved in both mirrors and
   covered across scoped, consumed, and revoked authority states.
2. The independent coverage verifier recomputed the exact review target,
   verified the sealed expected-coverage packet, and matched all 24 expected
   unit identities and all 18 expected rule relations. It reported no source,
   rule, applicability, evidence, staleness, or conclusion gap.
3. The only retained note is the intentionally immutable real v2 record: both
   validators reject authority r02 because its frozen `READY` round lacks the
   strict reviewed-input table. Migration remains fail closed; this is not a
   source implementation failure and no control transition was performed.
4. The historical r04/r03 ordering anomaly remains immutable audit evidence.
   r05 through r07 are append-only and ordered, so the current remediation adds
   no audit-chain regression.

### Blocking

Blocking Open: 0

### Should Fix

- No source or review-coverage repair remains within this change's approved
  source scope.

### Fix Applied

- Recorded the independent reviewer re-review, exact target recomputation,
  sealed coverage-packet verification, and complete coverage comparison.

### Re-review Result

- `READY_WITH_NOTES` for the source implementation: reviewer and verifier
  gates are both `READY_WITH_NOTES`; full source validation, manifest, runtime
  projection, and diff checks passed.

### Deferred With Reason

- The real v2 registry remains scoped and invalid by design. `bootstrap-revoke`,
  successor authority creation, and migration apply are irreversible or policy
  actions that require a new explicit user decision.

### Freeze Decision

- `migration-bootstrap-containment-r07` supersedes r06 as the final
  source-repair review record for `migration-apply-bootstrap-v2` generation 2.
- It records review readiness only. It is not an authority to mutate the real
  control state, authorize migration, or issue a replacement bootstrap.

### Status

- Source implementation and independent coverage review have converged.
  Real control state remains unchanged and blocked pending user decision.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r08

Decision ID: migration-bootstrap-containment-r08

Decision: NOT_READY

Frozen: yes

Review Mode: authorized terminal-containment verification

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Verifies the current pointer atomically advanced to terminal generation 3. |
| `.changes/.control/migration-bootstrap-v2/events/000003-revoked.json` | `d68622811a50e177da627ca1168bbd49d67f4dafdc8f3b627fe8024b10b1897b` | Records observed generation 2, exact r07 revoke gate, reason, and scoped-event provenance. |
| `review-log.md` | `833eba04e062e93b6ec47f773a25fb09728b6d0b15342626e7814de8337982cf` | LF-normalized digest of exact frozen r07 containment decision material. |
| `design.md` | `abad40d4f105cb503d14628ee77f5b9a59efd5c109e136374bf9e142f2243889` | Defines terminal containment and replacement-authority boundaries. |
| `lib/change/doc-tool.js` | `6cff49927d400d676783db60b24e32c71013100409bba2c8882ecb52bde80ff4` | Node writer that performed the generation-bound terminal transition. |
| `lib/change/harness_change_doc.py` | `b6a0878c957f863a4b366f64779bce2c0d50095735e8c49306df88fcc66c2e0e` | Python mirror verified against the resulting event. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node post-transition validator. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python post-transition validator mirror. |
| `tests/test-change-tools.js` | `218209f12d1e8a0bdfa623f7923e61a8da76a31e2b97a7c9acb651c27ddc8dac` | Regression coverage for containment and no-authorization behavior. |

### Findings

1. After explicit user authorization, `bootstrap-revoke` compare-and-swapped
   `migration-bootstrap-v2` from scoped generation 2 to revoked generation 3.
   The terminal event binds exact r07 evidence, observed scoped-event digest,
   canonical reason, change ID, and real state-root identity.
2. Node and Python validators both now return `errors=0`; the previous frozen
   r02 evidence failure is contained rather than executable. The remaining two
   warnings are ordinary legacy-workspace layout warnings, not control errors.
3. Terminal revocation does not authorize migration apply, a replacement
   authority, or a new bootstrap identifier. Those remain separate policy and
   user-decision boundaries.

### Blocking

Blocking Open: 0

### Should Fix

- No source or terminal-containment repair remains.

### Fix Applied

- Executed and verified the authorized terminal containment transition using
  exact frozen r07 evidence and generation 2 compare-and-swap semantics.

### Re-review Result

- `READY_WITH_NOTES` for terminal containment verification: both validators
  accept the revoked v2 registry, while legacy-layout warnings remain visible.

### Deferred With Reason

- A replacement bootstrap authority, any migration apply, and the structured
  migration itself require a separate explicit user decision and new canonical
  authority/scope evidence. No replacement is implied by this revocation.

### Freeze Decision

- `migration-bootstrap-containment-r08` is the terminal-containment completion
  record for `migration-apply-bootstrap-v2` generation 2.
- It confirms revocation only and grants neither a successor authority nor
  migration permission.

### Status

- Real v2 control state is terminally revoked and validator-clean. Source
  implementation remains review-converged; future replacement work is a new
  decision path.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r09

Decision ID: migration-bootstrap-containment-r09

Decision: NOT_READY

Frozen: yes

Review Mode: post-transition evidence-integrity diagnosis

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Current pointer to the generation 3 terminal event. |
| `.changes/.control/migration-bootstrap-v2/events/000003-revoked.json` | `d68622811a50e177da627ca1168bbd49d67f4dafdc8f3b627fe8024b10b1897b` | Immutable event containing the r07 evidence digest accepted by the writer. |
| `review-log.md` | `c5820a40667f08c729b3871f195ff1f072aef58b9e50a2a7f1f64ba9b3f517af` | Actual LF-normalized r07 range after the r08 append. |
| `lib/change/doc-tool.js` | `6cff49927d400d676783db60b24e32c71013100409bba2c8882ecb52bde80ff4` | Node writer range-selection and hashing behavior. |
| `lib/change/validator.js` | `2376be80c5a42c35acea63a478f4ce2ee77baacb21b746977b587f123b355f7e` | Node validator range-selection and hashing behavior. |
| `lib/change/harness_change_doc.py` | `b6a0878c957f863a4b366f64779bce2c0d50095735e8c49306df88fcc66c2e0e` | Python writer mirror. |
| `lib/change/harness_change_validate.py` | `1c2e3cd36ce62c40be237bf952af22ab1da6de4723cc507dc3d011ee8ffd2062` | Python validator mirror. |
| `tests/test-change-tools.js` | `218209f12d1e8a0bdfa623f7923e61a8da76a31e2b97a7c9acb651c27ddc8dac` | Existing exact-round append coverage and its terminal-round gap. |

### Findings

1. The post-transition Node and Python validators both fail with `revoked
   bootstrap does not bind its revoke review`. This supersedes r08's provisional
   validator-clean claim.
2. The revocation writer accepted `833eba...` while r07 was the final round.
   Its selected text ended with one final LF. Appending r08 introduced the
   separator blank line before the next review heading. The shared range
   selector includes that separator in r07, so both validators now calculate
   `c5820a...` instead. The frozen review body was not edited.
3. The design requires a distinct appended round not to alter an earlier
   binding. The shared writer and validator implementation instead hashes the
   inter-round separator. The existing append test protects a nonterminal scope
   round followed by already-concatenated rounds; it does not cover an event
   bound to the final round followed by a later append.

### Blocking

Blocking Open: 1

### Should Fix

- Define and implement an append-stable canonical review-round boundary in both
  command and validator mirrors, add a regression that revokes from a terminal
  `NOT_READY` round and then appends another round, and provide a separately
  authorized repair path for the already-written generation 3 event.

### Fix Applied

- No source or control repair was applied. This round records the reproducible
  evidence-integrity failure without editing r07, r08, or the immutable event.

### Re-review Result

- `NOT_READY`: terminal containment remains fail closed, but the current event
  is not validator-clean and cannot be represented as complete.

### Deferred With Reason

- Repairing the source contract and reconciling an immutable terminal control
  event are new lifecycle-policy work. The user's authorization covered only
  the generation 2 to generation 3 `bootstrap-revoke` transition, not a
  replacement or corrective authority.

### Freeze Decision

- `migration-bootstrap-containment-r09` supersedes r08's terminal verification
  conclusion. It preserves r08 unchanged as audit evidence and blocks further
  migration/bootstrap progression pending a new approved repair design.

### Status

- The registry is terminally revoked and migration remains blocked. Both
  validators intentionally fail closed on the broken r07 binding; no replacement
  authority or migration apply was performed.

Gate: `NEEDS_USER_DECISION`

## Review Round migration-bootstrap-containment-r10

Decision ID: migration-bootstrap-containment-r10

Decision: READY_WITH_NOTES

Frozen: yes

Review Mode: canonical review-boundary repair and re-review

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-verifier

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `df1a3c47e2f03cd762a73df1166e63136967bab1b1a7dda4748c27a0eeca7aa6` | Canonical boundary contract for append-stable frozen review rounds. |
| `lib/change/doc-tool.js` | `9d8de723840c38e4e874a7959fc0c9413304067dbcd279d0fb347c9424933ffe` | Node command writer and migration provenance extraction. |
| `lib/change/validator.js` | `058d47d91b37b491c5aaeba5293f8cba17e56b5129bb1940b16fb0aacf08a8fa` | Node control and migration validator. |
| `lib/change/harness_change_doc.py` | `62c44e4329bd9adba8d41660e950c23856c8438e6a8fe1c51f34e1f101d6be4d` | Python command writer mirror. |
| `lib/change/harness_change_validate.py` | `1eb308a34c1e08bf3146ce34e50d4c84eb84ad857ecce8b7452a7e506a6dfe7c` | Python validator mirror. |
| `tests/test-change-tools.js` | `06180c7e17c03d4ef0651463045f5881bada4ff55e4adcdd87820f6a844dbf4a` | Command/validator regression and Node/Python parity coverage. |
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Current pointer to the generation 3 revoked event. |
| `.changes/.control/migration-bootstrap-v2/events/000003-revoked.json` | `d68622811a50e177da627ca1168bbd49d67f4dafdc8f3b627fe8024b10b1897b` | Immutable generation 3 terminal event. |

### Findings

1. The defect was at the review-round boundary rather than in r07 or the immutable event: raw slicing included blank separator lines introduced only when a later round was appended.
2. The selected frozen range is now LF-normalized, strips only terminal blank separator lines, and ends with exactly one LF. It preserves all nonblank round content and gives the same digest whether the round is terminal or followed by another round.
3. The Node and Python command writers, validators, and legacy migration-provenance extractors use the same boundary rule. Exact archived legacy file digests remain raw-byte evidence; only per-round digesting is canonicalized.
4. Regression coverage now exercises a terminal `NOT_READY` revoke followed by a later frozen round, plus blank-separated frozen legacy rounds through dry-run, apply, and both validators. `npm test` passes.
5. The live Node and Python validators both accept generation 3 with `errors=0`; the remaining two warnings are the acknowledged legacy workspace topology (`no specs/` and top-level `review-log.md`). No replacement authority or migration apply occurred.

### Blocking

Blocking Open: 0

### Should Fix

- None for the authorized canonical-boundary repair.

### Fix Applied

- Implemented the canonical frozen-review range rule in all four Node/Python writer and validator paths, aligned migration provenance extraction, and updated fixtures so declared evidence follows the same contract.

### Re-review Result

- `READY_WITH_NOTES`: source and live terminal-control validation agree after the append-stability regression. The repair is confined to evidence interpretation; it neither rewrites historical reviews nor changes the immutable generation 3 event.

### Deferred With Reason

- The two validator warnings are legacy-layout migration debt. Their controlled migration remains blocked by the terminally revoked authority and is outside this repair.

### Freeze Decision

- `migration-bootstrap-containment-r10` supersedes r09's source-repair diagnosis and r08's premature clean conclusion. It preserves r07 through r09 unchanged, records the repaired interpretation contract, and keeps the revoked state terminal.

### Status

- Full test suite, manifest validation, runtime projection verification, diff whitespace check, and both live change validators pass. Projection verification retains its known unsupported Codex `pre-compact-handoff` warning.

Gate: `READY_WITH_NOTES`

## Review Round design-r07

Decision ID: design-r07

Decision: READY

Frozen: yes

Review Mode: `multi-lens-design-review` evidence-repair successor convergence

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `verification_observability`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Upstream phase-gate direction and Core-only scope. |
| `design.md` | `4b1b97828d4ad5ba8f99af0db62e7359779b531c456370ff939c2a9916e3064c` | Normative evidence-repair successor, atomic registrar, recovery, and freshness contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Current successor sequencing, validation, rollback, and terminal-state boundary. |
| `README.md` | `4a249286fdab5d63741cc417741b39b729c083e18f54851a82943d0864a6dfbc` | User decision, current blockers, and next checkpoint. |
| `review-log.md` | `c208c187f399a001fc96b72021cefc9c037ab91cfce9a2555278c38634d89dc9` | Canonical digest of frozen containment repair round `migration-bootstrap-containment-r10`. |
| `.changes/.control/migration-bootstrap-v1/current.json` | `18802402936c8757a2a56d6e748b4ba0c57e5e47e31aaf591d25c20a15b7107c` | Terminal v1 predecessor state. |
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Terminal v2 predecessor state. |
| `.changes/.control/migration-bootstrap-v2/events/000003-revoked.json` | `d68622811a50e177da627ca1168bbd49d67f4dafdc8f3b627fe8024b10b1897b` | Immutable v2 revocation evidence. |

### Findings

1. The normative design now distinguishes an evidence-repair successor from
   the original implementation exception. It permits one fresh identity over
   unchanged r10-contained source and grants no source edit, migration, or
   structured-artifact authority.
2. The recovery registrar installs the immutable claimed/scoped prefix as one
   state-root-exclusive operation from frozen stdin bytes. It exposes no
   claimed current pointer and creates no reusable Core command or filesystem
   executable.
3. The control contract defines owner-token fencing, fsync and rename order,
   exact crash/restart states, live-owner refusal, unknown-byte preservation,
   and distinct scoped-versus-consumed failure outcomes.
4. Strict reviewed inputs, predecessor pointers, and the complete live source
   snapshot are rechecked before and after prefix install, before close
   compare-and-swap, before dry-run acceptance, and before migration's first
   write.
5. Multi-lens review rounds r07 through r11 closed the original six correctness
   findings and all follow-up design blockers. The final note-only wording fix
   changed no contract.

### Status

- The successor design is converged. No v3 control state, source edit,
  migration, structured artifact, implementation-design pack, or task slice
  was created by this design review.

### Blocking

- Blocking Open: 0

### Should Fix

- None before generating the exact recovery registrar and successor
  authority/scope packet.

### Fix Applied

- Added the bounded post-revocation evidence-repair policy, stdin-only atomic
  prefix registrar, owner-fenced recovery matrix, complete freshness
  checkpoints, and terminal-state-specific failure disposition.

### Re-review Result

- `READY`: design reviewers found no remaining blocker after four repair loops
  and one final note verification.

### Deferred With Reason

- Registrar implementation, authority/scope event bytes, control installation,
  close review, migration, implementation-design, and task slicing remain
  downstream gates. Existing rejected `/tmp` v3 drafts and digests are stale
  and cannot be reused.

### Freeze Decision

- `design-r07` supersedes `design-r06` as the current solution-design gate for
  the evidence-repair successor.
- Next checkpoint: generate and deep-review the exact stdin registrar plus
  fresh authority/scope packet. Do not write v3 control state until both
  correctness and coverage gates permit it.

Gate: `READY`


## Review Round migration-bootstrap-registrar-r01

Decision ID: migration-bootstrap-registrar-r01

Decision: NOT_READY

Frozen: yes

Review Mode: deep correctness and independent coverage verification

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-reviewer

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `d8373c4fafbbd87b34429510ddcf018aaa9a23ac053f62366305c43d9214481e` | Authoritative evidence-repair and registrar contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Frozen successor sequence, validation, rollback, and terminal boundary. |
| `review-log.md` | `39911b68c215397fca47a297ef8d54780b002bd322f164cf43f02d643313eaf0` | Canonical digest of authoritative design gate `design-r10`. |
| `.changes/.control/migration-bootstrap-v1/current.json` | `18802402936c8757a2a56d6e748b4ba0c57e5e47e31aaf591d25c20a15b7107c` | Terminal v1 predecessor. |
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Terminal v2 predecessor. |

Target Fingerprint:
`sha256:30e0b8f5e03836b1378ed063bfe4fcc351c98c4534012578896cb4a4e74b0550`

Expected Coverage Packet:
`sha256:effe31d1ba566513549ec60a7d45d150167faf73134d42b0095f02ed11d0ae1e`

Correctness Ledger:
`sha256:75afd728394eaa952d35fe41271f3a0f1583d3a7232e51fdc14507153fcb5e4a`

Coverage Verification:
`sha256:51e8eb3dd825b9da9f3c9ed1dfb9caace420f4eb79396a5a895850cb81a4d151`

### Findings

1. The launcher does not independently bind its own bytes, interpreter,
   version, or exact argument vector before unreviewed code can run.
2. The registrar derives any same-ID authority/scope lineage instead of
   requiring the exact reviewed round, event, pointer, and prefix digests.
3. Its reviewed-input parser accepts malformed tables and unsafe path forms;
   path resolution can escape the intended owner roots.
4. Final installation uses replacement-capable rename rather than atomic
   no-replace semantics.
5. Owner, stage, sidecar, freshness, and cleanup operations contain pathname
   and check/use races rather than descriptor-relative fencing.
6. Git, namespace, mount, Node, and Python executables are PATH-selected rather
   than frozen absolute identities under a sanitized environment.
7. Control reads follow links and can launder linked predecessor bytes into the
   validation overlay.
8. Source completeness excludes untracked source-owned paths and hashes through
   race-prone pathname operations.
9. Independent comparison covered all 23 rule sources, 65 units, and 71 rule
   relations. It found no inventory omission; the gate failure is substantive,
   with additional dynamic crash evidence still required after repair.

### Blocking

Blocking Open: 8

### Should Fix

- Prefer a regulated, project-owned atomic-prefix writer using the existing
  command/validator ownership and tests. Continuing the one-shot path would
  require a trusted execution envelope plus Linux-specific syscall and dirfd
  discipline comparable to a permanent security-sensitive subsystem.

### Fix Applied

- No target artifact or real control state was changed. Local mount-namespace
  shadow install/verify reproduced the proposed prefix, but this does not cure
  the confirmed trust-boundary defects.

### Re-review Result

- Correctness `NOT_READY`; independent coverage `NOT_READY`; coordinator
  overall gate `NEEDS_USER_DECISION`.

### Deferred With Reason

- No v3 authority/scope round was appended and no v3 registry was installed.
  Architecture choice between a regulated Core writer, further one-shot
  hardening, or successor abandonment is owner-controlled.

### Freeze Decision

- The reviewed stdin registrar packet is rejected and must not be executed
  against the real state root. Its authority/scope/event digests are stale
  proposal evidence only.

### Status

- Workflow is paused at an explicit architecture/public-command decision. v1
  and v2 remain terminally revoked; migration remains blocked.

Gate: `NEEDS_USER_DECISION`

## Review Round design-r09

Decision ID: design-r09

Decision: READY

Frozen: yes

Review Mode: registrar sidecar durability correction

Selected Lenses: `control_lifecycle`, `failure_recovery`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `d8373c4fafbbd87b34429510ddcf018aaa9a23ac053f62366305c43d9214481e` | Final registrar staging-marker, fencing, cleanup, fsync, and recovery contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Frozen successor execution and validation boundary. |
| `review-log.md` | `68eda26fb69c46e52eeb441def64d6502a709d51856e4c96e96304ef8ff0f1ed` | Canonical digest of authoritative predecessor design gate `design-r08`. |

### Findings

1. Implementation mapping exposed that a marker inside the staged registry
   would be renamed into the immutable final prefix. The design now places it
   in a nonce-bound sibling sidecar with exclusive no-follow creation.
2. Owner-token fencing applies before sidecar creation and writes. Normal and
   recovery cleanup remove transient stage/sidecar state and fsync before
   removing the original lock, then fsync before removing the recovery lock.
   This prevents a durable sidecar from surviving without owner evidence.
3. The recovery matrix explicitly covers absent, sidecar-only, staged,
   exact-prefix pass, exact-prefix freshness failure, and unknown/mismatched
   states. Unknown bytes remain fail closed.
4. Independent re-review found no remaining sidecar lifecycle or crash-state
   blocker. No other successor contract changed.

### Status

- The solution design remains converged and is ready for exact registrar and
  authority/scope packet generation.

### Blocking

- Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Moved the installation marker outside the final registry and completed
  fencing, durability ordering, cleanup, and recovery semantics.

### Re-review Result

- `READY`: the marker correction preserves atomic prefix semantics and closes
  every identified crash window.

### Deferred With Reason

- Registrar code, packet review, control installation, close, migration,
  implementation-design, and task slicing remain downstream gates.

### Freeze Decision

- `design-r09` supersedes `design-r08` as the authoritative solution-design
  gate. Earlier design rounds remain immutable history.

Gate: `READY`

## Review Round design-r08

Decision ID: design-r08

Decision: READY

Frozen: yes

Review Mode: design-gate evidence-boundary correction

Selected Lenses: `artifact_chain`, `boundary_contracts`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Stable upstream direction and Core-only scope. |
| `design.md` | `4b1b97828d4ad5ba8f99af0db62e7359779b531c456370ff939c2a9916e3064c` | Converged normative evidence-repair successor contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Frozen successor sequencing, validation, rollback, and terminal-state boundary. |
| `review-log.md` | `fb462943b545e85841fdd4317eaa55d0611d3373a9421e0c1401e4146dc6dfad` | Canonical digest of `design-r07`, including its complete multi-lens convergence findings. |
| `.changes/.control/migration-bootstrap-v1/current.json` | `18802402936c8757a2a56d6e748b4ba0c57e5e47e31aaf591d25c20a15b7107c` | Terminal v1 predecessor state. |
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Terminal v2 predecessor state. |

### Findings

1. `design-r07` correctly records the converged design, but its strict input
   table included the change README even though README is the mutable current
   phase pointer. Updating that pointer after a successful gate would make the
   gate stale without changing proposal, design, plan, or predecessor state.
2. This round preserves the r07 design conclusion while narrowing strict inputs
   to stable design authority and terminal predecessor evidence. README may
   carry this gate reference and later phase status without becoming an
   upstream design input.
3. No normative design text, successor scope, source bytes, control state, or
   downstream permission changed.

### Status

- The design remains converged. This round corrects only the durable evidence
  boundary before successor packet generation.

### Blocking

- Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Replaced the mutable README binding with a stable pointer to the complete
  `design-r07` canonical round.

### Re-review Result

- `READY`: proposal, design, frozen plan, and terminal predecessor state remain
  exact and sufficient for the solution-design gate.

### Deferred With Reason

- Registrar implementation, successor authority/scope review, control
  installation, close, migration, implementation-design, and task slicing
  remain downstream gates.

### Freeze Decision

- `design-r08` supersedes `design-r07` as the authoritative solution-design
  gate. `design-r07` remains immutable review history.
- Phase/status pointers may reference this gate but are not strict upstream
  inputs to it.

Gate: `READY`

## Review Round design-r10

Decision ID: design-r10

Decision: READY

Frozen: yes

Review Mode: registrar sidecar durability re-freeze

Selected Lenses: `control_lifecycle`, `failure_recovery`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `d8373c4fafbbd87b34429510ddcf018aaa9a23ac053f62366305c43d9214481e` | Final registrar staging-marker, fencing, cleanup, fsync, and recovery contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Frozen successor execution and validation boundary. |
| `review-log.md` | `68eda26fb69c46e52eeb441def64d6502a709d51856e4c96e96304ef8ff0f1ed` | Canonical digest of authoritative predecessor design gate `design-r08`. |

### Findings

1. The marker correction is `READY`: the sidecar remains outside the immutable
   registry, every side effect is owner-token fenced, and cleanup durably
   removes transient state before its ownership locks.
2. `design-r09` contains the same accepted technical conclusion but was
   accidentally appended before its cited predecessor `design-r08`. Its bytes
   remain historical evidence, but the forward reference makes it unsuitable
   as the authoritative gate.
3. This round re-freezes the unchanged design conclusion after `design-r08`.
   It changes no design text, source, control state, or downstream permission.

### Status

- The solution design is converged and causally ordered for successor packet
  generation.

### Blocking

- Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Re-recorded the accepted sidecar durability conclusion as an append-only
  successor after its actual predecessor rather than moving frozen bytes.

### Re-review Result

- `READY`: design and evidence order are sufficient for the next packet gate.

### Deferred With Reason

- Registrar code, packet review, control installation, close, migration,
  implementation-design, and task slicing remain downstream gates.

### Freeze Decision

- `design-r10` supersedes `design-r08` and the non-authoritative out-of-order
  `design-r09` as the current solution-design gate.

Gate: `READY`

## Review Round migration-bootstrap-registrar-r02

Decision ID: migration-bootstrap-registrar-r02

Decision: NOT_READY

Frozen: yes

Review Mode: deep correctness and independent coverage verification

Executor ID: migration-bootstrap-executor

Reviewer ID: migration-bootstrap-reviewer

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `d8373c4fafbbd87b34429510ddcf018aaa9a23ac053f62366305c43d9214481e` | Authoritative evidence-repair and registrar contract. |
| `plan.md` | `422d0135f39d090cef4aa2fd71393c17b2102aeb6f123ea6961a4c7bf3af9125` | Frozen successor sequence, validation, rollback, and terminal boundary. |
| `review-log.md` | `39911b68c215397fca47a297ef8d54780b002bd322f164cf43f02d643313eaf0` | Canonical digest of authoritative design gate `design-r10`. |
| `.changes/.control/migration-bootstrap-v1/current.json` | `18802402936c8757a2a56d6e748b4ba0c57e5e47e31aaf591d25c20a15b7107c` | Terminal v1 predecessor. |
| `.changes/.control/migration-bootstrap-v2/current.json` | `7e0a83321bbaabfa8f62385beb2781838fb0eb0be89a374f1b95812e3137382b` | Terminal v2 predecessor. |

Target Fingerprint:
`sha256:30e0b8f5e03836b1378ed063bfe4fcc351c98c4534012578896cb4a4e74b0550`

Expected Coverage Packet:
`sha256:effe31d1ba566513549ec60a7d45d150167faf73134d42b0095f02ed11d0ae1e`

Correctness Ledger:
`sha256:75afd728394eaa952d35fe41271f3a0f1583d3a7232e51fdc14507153fcb5e4a`

Coverage Verification:
`sha256:51e8eb3dd825b9da9f3c9ed1dfb9caace420f4eb79396a5a895850cb81a4d151`

### Findings

1. The launcher does not independently bind its own bytes, interpreter,
   version, or exact argument vector before unreviewed code can run.
2. The registrar derives any same-ID lineage instead of requiring the exact
   reviewed round, event, pointer, and prefix digests.
3. Reviewed-input parsing accepts malformed tables and unsafe path forms.
4. Final installation lacks atomic no-replace rename semantics.
5. Owner, stage, sidecar, freshness, and cleanup paths are TOCTOU-prone rather
   than descriptor-relative and no-follow fenced.
6. Git, namespace, mount, Node, and Python executables are PATH-selected.
7. Control reads follow links, and shadow copying can launder linked bytes.
8. Source completeness excludes untracked source-owned paths and uses
   race-prone pathname hashing.
9. Independent comparison covered all 23 rule sources, 65 units, and 71 rule
   relations. The gate failure is substantive, not a review-coverage omission.
10. `migration-bootstrap-registrar-r01` recorded the same rejection before its
    cited design gate due an append-order mistake. It remains immutable
    history; this causally ordered round is authoritative.

### Blocking

Blocking Open: 8

### Should Fix

- Prefer a regulated Core atomic-prefix writer. Hardening the one-shot path
  would require a trusted execution envelope plus Linux-specific syscall and
  dirfd discipline comparable to a permanent security-sensitive subsystem.

### Fix Applied

- No target artifact or real control state was changed. Local namespace shadow
  install/verify reproduced the proposal but did not cure the confirmed defects.

### Re-review Result

- Correctness `NOT_READY`; independent coverage `NOT_READY`; coordinator
  overall gate `NEEDS_USER_DECISION`.

### Deferred With Reason

- No v3 authority/scope round was appended and no v3 registry was installed.
  The owner must choose a regulated Core writer, further one-shot hardening, or
  successor abandonment.

### Freeze Decision

- `migration-bootstrap-registrar-r02` supersedes the out-of-order r01 as the
  authoritative registrar rejection. The reviewed packet must not run against
  the real state root.

### Status

- Workflow is paused at an architecture/public-command decision. v1/v2 remain
  terminally revoked and migration remains blocked.

Gate: `NEEDS_USER_DECISION`

## Review Round design-r11

Decision ID: design-r11

Decision: NOT_READY

Frozen: yes

Review Mode: independent multi-lens native-writer design review

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `verification_observability`, `implementation_readiness`,
`artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `e804d656569ff76ff3ee840576690f15b1255b863251bf44fa6e081ad2f93b9d` | First regulated Core prefix-writer revision. |
| `plan.md` | `aaba1d2163a091bdfd9465ddbc54a4f43bbde540ba541bab13c6172f92a92a45` | Separate-change and successor sequencing revision. |
| `README.md` | `050924dc8226f9dd68583a03465c998e32526ffceb6b04e492e97de208779fc6` | Owner decision and current-phase pointer. |
| `review-log.md` | `39911b68c215397fca47a297ef8d54780b002bd322f164cf43f02d643313eaf0` | Last READY solution-design gate, `design-r10`. |

### Findings

1. The design does not state a threat model or close the rejected registrar's
   pathname TOCTOU finding with descriptor-relative operations.
2. Predecessor-set, implementation-snapshot, and prefix digests lack canonical
   payload schemas; `source-owned` enumeration is not reproducible.
3. Recovery does not uniquely cover target-before-marker,
   marker-removed-before-lock-release, or freshness-failed complete prefixes.
4. Diagnostic parity and post-operation receipt evidence lack mechanical
   oracles and durable review bindings.
5. The separate structured change does not enumerate the mandatory proposal,
   challenge, design, trigger, implementation-design review, and pre-slice
   gates.
6. V1/V2 terminal compatibility and the README's current design pointer require
   explicit repair.

### Blocking

Blocking Open: 5

### Should Fix

- Preserve the separate structured-change direction and make each digest,
  crash state, compatibility rule, and verification artifact deterministic.

### Fix Applied

- None in this review-only round.

### Re-review Result

- `NOT_READY`: owner intent is settled, but the public command and recovery
  contract are not implementation-ready.

### Deferred With Reason

- No writer source, v3 control state, migration, implementation-design pack, or
  task slice was created.

### Freeze Decision

- `design-r10` remains the last READY historical design gate.
- `design-r11` records the rejected first native-writer revision and requires a
  new full design review after repair.

Gate: `NOT_READY`

## Review Round design-r12

Decision ID: design-r12

Decision: NOT_READY

Frozen: yes

Review Mode: independent multi-lens repair re-review

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `verification_observability`, `implementation_readiness`,
`artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `a40d56ec81e1a01fab37509fac4441661848a4493a6554587354a52fa39b00c0` | r11 repair plus reader ABA closure. |
| `plan.md` | `e4d09129d7d44c1785fa210b6f13ab1b399957168990770b512580fe97235929` | Explicit separate-change phase ordering and receipt binding. |
| `README.md` | `bdebee61eb6588f52920b31945be4be7c9fe00672bc59262d65c383801615401` | Honest r11 NOT_READY phase pointer. |
| `review-log.md` | `design-r11` | Frozen predecessor finding disposition. |

### Findings

1. Boundary, lifecycle, failure-recovery, digest, inventory, reader ABA, and
   V1/V2 compatibility blockers from r11 are resolved.
2. One reviewer accepted diagnostic and receipt handling; the independent
   observability pass found no stable error-code matrix, no exact receipt
   schema, and no durable receipt after owner cleanup. The stricter finding
   controls readiness.
3. The separate structured-change sequence still lacks a task-set
   validation/review gate between slicing and implementation.
4. Crash equivalence classes are complete. NUL-safe Git parsing and non-UTF-8
   path rejection remain valid implementation-design notes.

### Blocking

Blocking Open: 2

### Should Fix

- Define stable diagnostic codes and a persistent append-only receipt schema.
- Require task-set readiness before implementation.

### Fix Applied

- None in this review-only round.

### Re-review Result

- `NOT_READY`: independent evidence conflicts only on observability depth; the
  stricter mechanical-verification requirement is adopted without council
  escalation because it is directly repairable.

### Deferred With Reason

- No writer source or successor control state was created.

### Freeze Decision

- `design-r12` supersedes r11 as the current NOT_READY design review.

Gate: `NOT_READY`

## Review Round design-r13

Decision ID: design-r13

Decision: NOT_READY

Frozen: yes

Review Mode: correctness re-review plus independent coverage verification

Selected Lenses: `boundary_contracts`, `failure_recovery`,
`verification_observability`, `implementation_readiness`, `artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `30efca4f3f828a1344e20b2717c59d5b52232933398ceb5a8bb09c4c4d70b687` | Persistent receipt and diagnostic-code revision. |
| `plan.md` | `5481c1424741e13c019efd6e36ef3f82cc55d88fb010ae1872b5492fc1473faf` | Task-readiness ordering revision. |
| `README.md` | `41d85ecb6279a4970045d91087bbb79f244fabab46119968614021c740f13265` | r12 disposition pointer. |
| `review-log.md` | `design-r12` | Frozen predecessor review. |

### Findings

1. Receipt handling lacks an exact owner schema, legal state/action matrix, and
   crash-safe receipt publication/recovery window.
2. Diagnostic codes are stable, but reason/subject mapping remains deferred.
3. Task-set readiness appears only in the plan, not the normative phase model
   or validation oracle.
4. Proposal challenge authority is inconsistent, and trusted internal Git
   executable selection is not stated.
5. Prior digest, inventory, ABA, recovery-state, threat-model, and V1/V2
   compatibility repairs remain valid.

### Blocking

Blocking Open: 4

### Fix Applied

- None in this review-only round.

### Re-review Result

- Correctness `NOT_READY`; coverage `NOT_READY`.

### Freeze Decision

- `design-r13` supersedes r12 as the current NOT_READY design review.

Gate: `NOT_READY`

## Review Round design-r14

Decision ID: design-r14

Decision: NOT_READY

Frozen: yes

Review Mode: final correctness and coverage reconciliation

Selected Lenses: `failure_recovery`, `verification_observability`,
`artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `design.md` | `c38fe3d19e695092886079b884cb372aad4b9ff45db4c511853879b0d1719724` | r13 repair revision. |
| `plan.md` | `5481c1424741e13c019efd6e36ef3f82cc55d88fb010ae1872b5492fc1473faf` | Complete writer dependency gate order. |
| `README.md` | `fe58e9a8bcfcf4da3bc953aca7b5d2960e18114713678b291dea37dfac1a8d08` | r13 disposition pointer. |
| `review-log.md` | `design-r13` | Frozen predecessor review. |

### Findings

1. Correctness review accepts all r13 repairs with implementation notes.
2. Coverage comparison finds one controlling contradiction: publication step 4
   omits the mandatory durable receipt between marker removal and global-lock
   release, so the crash oracle does not prove an active prefix always has a
   receipt.
3. NUL-safe Git parsing, non-UTF-8 rejection, and canonical fixtures remain
   implementation-design notes.

### Blocking

Blocking Open: 1

### Re-review Result

- Correctness `READY_WITH_NOTES`; coverage `NOT_READY`; overall `NOT_READY`.

### Freeze Decision

- `design-r14` supersedes r13 as the current NOT_READY design review.

Gate: `NOT_READY`

## Review Round design-r15

Decision ID: design-r15

Decision: READY_WITH_NOTES

Frozen: yes

Review Mode: final correctness re-review plus standard coverage verification

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `verification_observability`, `implementation_readiness`,
`artifact_chain`

Review Owner: `design-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Stable Core-only direction. |
| `design.md` | `5db5d79b07228c08c1df705b74d967b78ffaeb37c910dd0aa4341c9994d94362` | Converged regulated prefix-writer and workflow-stage contract. |
| `plan.md` | `5481c1424741e13c019efd6e36ef3f82cc55d88fb010ae1872b5492fc1473faf` | Separate structured writer change and successor gate order. |
| `review-log.md` | `45515ea2ced12eb2aee71a7f7a9c831883a3971e108f46bc7f1e0c91f7344fc9` | Canonical predecessor round `design-r14`. |

Target Fingerprint:
`sha256:7bd366bdaaa229b5de30d4f292f23ee944a6d158812759f82ceb16ca4bf30ef1`

Coverage Mode: `standard`

### Findings

1. The r14 receipt-order blocker is closed by the mandatory sequence:
   remove marker, fsync registry, durably finalize and revalidate the matching
   receipt, then release and fsync the global lock.
2. Crash oracles cover every persistent receipt/publication window. No active
   prefix can exist without a matching final receipt.
3. All registrar-r02, r11-r14, Core stage-gate, and V1/V2 compatibility rules
   have source-backed dispositions and validation oracles.
4. NUL-safe Git output parsing, non-UTF-8 path rejection, and complete
   canonical diagnostic fixtures remain mandatory implementation-design notes.
5. Standard coverage found no omission or conclusion conflict. Independent-deep
   packet assurance was not claimed in this final bounded re-review.

### Blocking

Blocking Open: 0

### Should Fix

- Carry the three implementation notes into the separate prefix-writer
  implementation-design pack and verification matrix.

### Fix Applied

- Publication step 4 and the crash oracle now make durable receipt creation a
  strict prerequisite of global-lock release.

### Re-review Result

- Correctness `READY_WITH_NOTES`; standard coverage
  `READY_WITH_NOTES`; overall `READY_WITH_NOTES`.

### Deferred With Reason

- Writer source, successor v3 control state, migration, and this legacy
  change's structured artifacts remain downstream and unauthorized.

### Freeze Decision

- `design-r15` supersedes r14 as the authoritative solution-design gate.
- The next permitted action is to create the separate structured Core writer
  change and begin its observe/proposal workflow. No source implementation is
  authorized by this round alone.

Gate: `READY_WITH_NOTES`

## Review Round design-r16

Decision ID: design-r16

Decision: READY

Frozen: yes

Review Mode: simplified design multi-lens review and three repair re-reviews

Selected Lenses: `boundary_contracts`, `control_lifecycle`,
`failure_recovery`, `implementation_readiness`, `artifact_chain`

Review Owner: `planning-reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `proposal.md` | `c47486e0e036b9f30326ed6069b1aeae855d2162cd7429d1f39441d95b0e8078` | Stable workflow-stage objective and non-goals. |
| `design.md` | `3de9ba5f907a3333cfa7e87abe5589812f856119274ab15dc72e9358f11d0c24` | Simplified phase contract and migration boundary. |
| `plan.md` | `9a712941708fc902b60f093d06419d126a8de3271e5aa470358590242f6fb2e3` | Ordered convergence and bounded cleanup gates. |
| `README.md` | `85f6a3ec6d2ca990867f4fd283ad2a3a0b31b06c5b6e317bd94c2a696f4f5b3c` | Current phase, historical control disposition, and next checkpoint. |

### Findings

1. The workflow objective is explicit: proposal and reviewed solution design
   precede implementation-design assessment; a required populated pack precedes
   task slicing.
2. Exact-plan migration approval is correctly limited to one accepted
   transaction, including exact recovery and post-commit idempotent
   verification. It is not represented as identity authentication.
3. Migration plan data integrity and migration-tool integrity have separate
   boundaries: the digest binds target-workspace conversion data, while focused
   source review and tests bind the self-hosting tool diff before apply.
4. A bounded pre-migration cleanup breaks the legacy admission cycle without a
   new protocol: remove obsolete bootstrap admission and public mutation
   commands, retain read-only V1/V2 diagnostics, test parity, and independently
   review the exact diff.
5. Transaction-external drift requires a new plan; an exact persisted partial
   transaction may resume or roll back under the accepted digest.
6. Final re-review found no blocking or should-fix finding.

### Blocking

Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Removed the prefix-writer direction and its separate change.
- Clarified data-plan versus tool-integrity boundaries.
- Replaced one-run wording with one accepted transaction.
- Assigned obsolete bootstrap command removal only to the bounded cleanup.
- Corrected migration drift routing between cleanup and dry-run checkpoints.

### Re-review Result

- Four review passes completed; final correctness and artifact-chain result is
  `READY`.

### Deferred With Reason

- Bounded cleanup source changes, focused tests, and independent source review
  are the next checkpoint and are not claimed as completed by this design gate.
- Migration apply still requires a fresh dry-run packet and explicit owner
  acceptance.
- The implementation-design pack and task slices remain blocked until migration
  commits and validates.

### Freeze Decision

- `design-r16` supersedes `design-r15` as the authoritative solution-design
  gate.
- The next permitted action is the bounded migration cleanup in `plan.md`
  checkpoint 2.

Gate: `READY`

## Review Round bounded-migration-cleanup-r01

Decision ID: bounded-migration-cleanup-r01

Decision: READY

Frozen: yes

Review Mode: independent correctness review after focused migration validation

Review Owner: `reviewer`

Reviewed Inputs:

| Path | SHA-256 | Purpose |
|---|---|---|
| `.changes/workflow-design-stage-gate/design.md` | `3de9ba5f907a3333cfa7e87abe5589812f856119274ab15dc72e9358f11d0c24` | Frozen checkpoint-2 behavior and scope boundary. |
| `.changes/workflow-design-stage-gate/plan.md` | `9a712941708fc902b60f093d06419d126a8de3271e5aa470358590242f6fb2e3` | Ordered cleanup, validation, and review gate. |
| `README.md` | `c3b931372ebc32855101c19af6640ff353d41a84eebb116711a680a4bc0e9e26` | English migration and historical-control guidance. |
| `README_CN.md` | `d8d71ef4a3663d0631f663205ab50dde77c927b5dcde19eaaf62378a4b050391` | Chinese guidance parity. |
| `lib/change/doc-tool.js` | `f04cb48d14ea2e662cfdaa376d0ab79bdcf087de80c8f5c5fda43ffdb1346af8` | Node migration command and removed writer surface. |
| `lib/change/harness_change_doc.py` | `73eeeebd1f996e2555bd10f8967a9f66ca126bcd159452c2f7f7a78e32008cbd` | Python migration mirror and removed writer surface. |
| `lib/change/validator.js` | `a9d6e7eb02ad337795b3e2d94d3a40125f7b424b8c902db886c68d1f65806b45` | Node read-only historical diagnostics. |
| `lib/change/harness_change_validate.py` | `7fecc74cd2e98ae9e59440772dbcacdca805973658f0308430463dbf27b043c3` | Python read-only historical diagnostics. |
| `lib/change/js-policy.js` | `6acac7489f460f3103f595d1db388ca375258337e27cab456f15ce1967023f66` | Public command policy. |
| `skills/change/change-workspace-operator/SKILL.md` | `7e46a14be3e6cdc5c5a98e3286011189abce7c7d9a3debe17dbe4a76e2a7c993` | Operator guidance. |
| `tests/test-change-tools.js` | `a3b4c23b31afa9049b388fc551e64799232024b6dda05ba5f0e31b9592b801e0` | Focused migration, compatibility, and parity coverage. |

### Findings

1. Node and Python migration apply no longer consult bootstrap state on new,
   interrupted-resume, or committed-idempotent paths.
2. `bootstrap-close` and `bootstrap-revoke` have no public dispatch, parser, or
   policy entry. Their command handlers, admission chain, and transition writers
   are removed.
3. V1/V2 readers and evidence validators remain read-only. Nonterminal records
   are reported as historical debt that neither authorizes nor blocks migration.
4. Tests cover V1/V2 scoped and valid consumed states, V1 legacy revocation, V2
   evidence-backed revocation, invalid consumed evidence, Node/Python validator
   parity, and Node/Python migration parity.
5. README, README_CN, and operator guidance state the same boundary.
6. The independent re-review found no remaining correctness, scope, or coverage
   issue.

### Validation Evidence

| Check | Result | Fidelity |
|---|---|---|
| `npm test -- --change-tools` | passed | exact focused command/validator/migration suite |
| `npm test` | passed | exact repository suite |
| `node bin/harness.js manifest --json` | passed, no warnings | exact manifest validation |
| Codex self-host projection and `--verify --json` | passed | exact runtime projection |
| `harness-change-validate --change workflow-design-stage-gate --status --json` | 0 errors, 2 accepted legacy warnings | exact change validation |
| `git diff --check` | passed | exact whitespace check |
| migration apply in the active change | not run | explicitly forbidden; tests use temporary repositories |

### Blocking

Blocking Open: 0

### Should Fix

- None.

### Fix Applied

- Reworded stale validator diagnostics.
- Completed the V1/V2 lifecycle compatibility matrix.
- Removed the unreachable Node/Python bootstrap writer chain.

### Re-review Result

- Initial independent gate: `NOT_READY` with three P2 findings.
- Repair re-review: all three findings resolved; gate `READY`.

### Deferred With Reason

- Active-change migration dry-run and owner approval belong to checkpoint 3.
- Active-change migration apply remains unauthorized.

### Freeze Decision

- Checkpoint 2 is complete and frozen `READY`.
- The next permitted action is checkpoint 3: produce a read-only migration
  dry-run packet and request explicit owner approval.

Gate: `READY`
