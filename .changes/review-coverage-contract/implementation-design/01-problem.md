---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation, review-coverage, review-verification]
description: "Detailed design problem, goals, non-goals, and boundaries."
---
# Problem, Goals, and Boundaries

## Goal

- Make the frozen deep-review protocol operable with one portable,
  reproducible target identity and one sealable Expected Coverage Packet.
- Keep ownership narrow: the existing review skill owns packet formation, the
  reviewer owns correctness findings and its ledger, the new verifier owns
  inventory/compare coverage evidence, and the coordinator owns mode selection
  and `overall_gate` composition.
- Preserve today's evidence-first review when `coverage_mode` is absent and
  avoid adding a generic parser, schema, top-level ledger root, or client-only
  protocol.
- Give implementation agents exact source ownership, validation seams, and
  rollback boundaries before task slicing.

## Non-goals

- Do not claim that a coverage-ready result proves defect freedom or replaces
  tests, review findings, or implementation verification.
- Do not automate semantic unit discovery, RuleRef extraction, or ledger
  comparison with a deterministic parser in V1. Those remain explicit agent
  packet responsibilities with fixtures and forward evaluation.
- Do not add a new package command, project-specific build command, persistent
  process log, or a second review workflow.
- Do not make the verifier an editor, a correctness re-reviewer by default, or
  the owner of `overall_gate`.
- Do not use local `state_root`, worktree, or branch paths as portable review
  identity.

## Boundary Conditions

- `coverage_mode` absent is legacy evidence-first review: it keeps the existing
  packet and reviewer behavior and emits neither `coverage_gate` nor a coverage
  assurance claim.
- An explicit `coverage_mode` opts into this protocol. `quick` requires Target
  Identity but has no verifier or independent-completeness claim; `standard`
  requires Target Identity and the reviewer ledger/coordinator audit; `deep`
  additionally requires the independent verifier and sealed Expected Coverage
  Packet. Missing, stale, or unreproducible explicit-mode identity is
  `coverage_gate=NOT_READY`.
- The selected helper is a Node 20 script located with its owning skill. It
  reads Git and packet inputs and writes JSON or a digest to stdout only. It
  does not write source, packets, `.changes`, or a cache.
- The helper has two target kinds. `git-worktree` accepts an explicit
  `--base <commit>` and optional `--head <commit>` (default `HEAD`), then
  resolves full object IDs and Git object format. `artifact-set` accepts an
  explicit artifact root and one or more explicit `--include-path` values.
  Both accept a caller-owned `--declaration <utf8-file>` whose normalized bytes
  bind human-recorded scope and exclusions without adding a parsed helper
  schema. Declaration normalization rejects a UTF-8 BOM and invalid UTF-8,
  converts CRLF/bare CR to LF, and reduces terminal LFs to exactly one. Both
  produce `review-target-v1` SHA-256 digests from tagged
  length-prefixed records and never include an absolute local root in the
  portable result.
- A `git-worktree` fingerprint records the base/head commit identities as its
  committed component. It obtains staged and unstaged changed paths with
  NUL-delimited `git -c core.quotePath=false diff --cached --name-only -z
  --no-ext-diff --no-textconv --no-renames <head> --` and `git -c
  core.quotePath=false diff --name-only -z --no-ext-diff --no-textconv
  --no-renames --` output, rejects any unmerged index entry, then records sorted
  normalized paths, deletion state, mode/type, index blob bytes for staged
  entries, and raw worktree bytes or symlink-target bytes for unstaged entries.
  Index state comes from `git ls-files --stage -z`; file/symlink blob bytes come
  from `git cat-file blob <object-id>`. Staged gitlinks record their object ID;
  unstaged gitlink changes fail closed because V1 does not recurse into a
  submodule worktree. The helper never hashes rendered diff text.
- An `artifact-set` fingerprint records the normalized paths, type, executable
  bit, and raw bytes or symlink targets of explicitly included files, plus
  normalized exclusion records. It does not require Git. Non-UTF-8 path input,
  paths outside the selected root, unsupported file kinds, unmerged Git state,
  or a command/read failure stop deep dispatch rather than producing a
  best-effort identity.
- `git-worktree` accepts repeated normalized `--untracked-scope <path>` values;
  no value means the target-tree root. It filters `git ls-files --others
  --exclude-standard` before bytes are read. The helper also accepts repeated
  `--include-path <path>` values for ignored/generated files; each must be
  Git-ignored and cannot also be tracked or selected untracked input. The
  caller's declaration file names the selected scopes, included inputs, and
  exclusions with their reasons. The helper verifies only the typed paths and
  hashes the declaration bytes; the roles verify the human declaration's
  semantics. A scope, include path, exclusion, or declaration change invalidates
  review evidence without introducing a new serialized schema.
- The packet seal uses UTF-8 text with LF-normalized newlines. Exactly one line
  has the form `PacketDigest: sha256:<64-lowercase-hex-or-self>`. The helper
  hashes the normalized bytes after replacing that value with `self`; sealing
  and verification use the same replacement. This is packet-byte sealing, not
  Markdown-table parsing.
- Packet, role, and fixture artifacts may persist only through the existing
  `.changes/<change>/reviews/` path when a formal gate needs them. Helper input
  declarations are caller-owned and must be removed when temporary.
- Deep inventory and compare require an accessible code root for `git-worktree`
  or artifact root for `artifact-set` so the helper can recompute the supplied
  fingerprint. That local root is an execution coordinate, not portable packet
  identity. A phase without the required root is `coverage_gate=NOT_READY`, not
  a copied-digest approval.

## Source Artifacts

| Source | Anchor | Decision or fact | Used by |
|---|---|---|---|
| `design.md` | `## Target Fingerprint` and `## Review Target Packet` | Target identity is portable for committed, uncommitted, or artifact inputs and is separate from execution coordinates. | helper contract, packet fields |
| `design.md` | `## Expected Coverage Packet` | Phase 1 emits an immutable packet with a digest before reviewer output is exposed. | packet sealing, verifier flow |
| `design.md` | `## Review Verifier Algorithm` | Inventory and comparison are distinct, read-only phases. | verifier role and workflow routing |
| `specs/review-coverage.md` | `Requirement: Portable Review Target` | Ignored/generated content is included or explicitly excluded with a reason. | typed paths and declaration bytes |
| `specs/review-coverage.md` | `Requirement: Portable Two-Phase Verification` | A fresh phase-2 verifier must compare sealed packets without session resume. | packet seal and forward evaluation |
| `skills/review/review-packet-gate/SKILL.md` | `## Packet` | Existing review packet is the owner for scope, design, validation, consumers, gaps, and residual risk. | skill extension |
| `agents/roles/reviewer.md` | `## Output Packet` | Reviewer already owns evidence-first findings and review-gap distinctions. | conditional ledger addition |
| `skills/workflow/workflow-control/SKILL.md` | `## Loop` | Review and implementation verification remain distinct workflow steps. | routing and gate composition |
| `commands/harness/review.md` | `## Required Behavior` | Review command selects narrow review skills and records formal gates. | coverage-mode command guidance |
| `commands/harness/workflow.md` | `## Required Behavior` | Workflow resolves change context and applies the implementation-design gate before slicing. | routing order |
| `harness.manifest.json` | `assets.agents` | Roles are explicit installable assets for four clients. | verifier registration |
| `lib/project/projector.js` | `renderAgent` | A registered role body is rendered client-natively without role-specific code. | no projector change |
| `tests/test-subagents-hooks.js` | `subagent projection renders client-native files` | Existing tests inspect canonical and projected role text. | verifier/projection tests |

## Rejected Alternatives

| Alternative | Why rejected | Tradeoff kept |
|---|---|---|
| New top-level `harness review-target` CLI. | It broadens package and README command surface for a helper used only by the review-packet skill. | The script is directly callable from its projected skill directory. |
| Shell-specific `sha256sum`/`shasum` pipeline. | It is not portable across supported client hosts and makes quoting/path behavior part of the protocol. | Node 20 and Git are already core prerequisites. |
| Hash only `git diff`. | It misses untracked and declared ignored/generated inputs, and rendered patch text is not the portable identity. | Git change discovery supplies only the path set; canonical object/content records supply identity. |
| Parse Markdown ledgers and compute gaps in V1. | It creates a new schema/parser subsystem and falsely suggests semantic completeness is mechanically proven. | Deterministic fixtures, role contracts, and fresh-agent evaluation remain explicit evidence. |
| Reuse `reviewer` for deep verification. | It combines correctness and meta-coverage authority and lets inventory see or be biased by findings. | A minimal read-only verifier exists only for deep mode. |
