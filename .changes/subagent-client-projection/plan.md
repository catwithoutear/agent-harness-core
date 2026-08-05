---
artifact: plan
status: reviewed
tags: [workflow, implementation, validation, subagent-client-projection]
description: "Compact plan for closing minimal four-client subagent projection findings."
---

# Plan

## Goal

Complete the minimal four-client projection contract so that all eleven
canonical subagents are emitted at the correct project and global discovery
paths, use the exact manifest runtime name, contain the canonical role body,
and are verified against the current client renderer.

## Source-Verified Context

- `harness.manifest.json` owns the eleven agent assets, their `runtimeName`,
  supported clients, and project/global target templates.
- `lib/project/projector.js:84-121` expands each supported agent/client pair into
  a projection record.
- `lib/project/projector.js:132-192` renders agent content, writes it, and stores
  source and target hashes in projection state.
- `lib/project/projector.js:242-302` verifies an installed projection. Its
  rendered branch currently compares the target only with the historical state
  hash, so an old rendering can verify after renderer-only changes.
- `lib/project/projector.js:320-351` owns the minimal Codex TOML and Markdown
  client conversion.
- `tests/test-subagents-hooks.js` covers all 11 x 4 fresh outputs, runtime names,
  project/global paths, minimal metadata, and canonical body fidelity.
- `tests/test-projection.js` owns apply/verify behavior and is the correct seam
  for a renderer-drift regression test.
- `.changes/canonical-subagent-role-contracts/` owns the separate canonical role
  completion phase; those role-body edits are inputs, not projection changes.

## Settled Direction

For a projection state record whose effective mode is `render`, regenerate the
expected content with the current `renderManagedContent(record)` path and
compare it exactly with the installed target. Preserve the existing state hash
checks so projection-state tampering and target modification diagnostics remain
available. This intentionally strengthens every existing rendered record,
including hooks; it does not change hook format or discovery behavior.

## Scope

- Existing minimal metadata and target-path changes in `harness.manifest.json`
  and `lib/project/projector.js`.
- Existing 11 x 4 projection contract checks in
  `tests/test-subagents-hooks.js`.
- One localized current-renderer verification fix in
  `lib/project/projector.js`.
- One regression test in `tests/test-projection.js` that simulates an old
  OpenCode projection and matching historical state hash without changing the
  canonical source.
- Review and validation evidence for the complete projection phase.

## Non-goals

- No changes to canonical role semantics in this phase.
- No permission, sandbox, tools, model, or delegation metadata.
- No semantic policy schema, capability compiler, assurance model, or dynamic
  `code-simplifier` projection.
- No hand edits to `.codex/`, `.claude/`, `.opencode/`, or `.omp/` projections.
- No broader rewrite of copy or symlink verification.

## Approach

Keep the existing manifest-to-record-to-render pipeline intact. Strengthen only
the verification boundary for rendered records, prove the historical-hash
failure mode with one focused regression, and reuse the existing exhaustive
11 x 4 projection assertions for format, path, runtime name, and body fidelity.

## Implementation Steps

1. Add an exact current-renderer comparison to the `render` branch of
   `verifyProjection()` while retaining existing mode, source, and state hash
   checks.
2. Add a regression test that projects an OpenCode subagent, removes
   `mode: subagent`, updates only the recorded target hash to match that stale
   file, and requires verification to fail against the current renderer. Assert
   that the source hash remains unchanged, the stale target matches its updated
   historical hash, the record status is `mismatch`, and the error identifies a
   current-renderer content mismatch.
3. Run a behavior-preserving simplification pass over the bounded diff.
4. Perform independent correctness re-review against the user-set projection
   boundary.
5. Run focused, package, manifest, self-host projection, change-workspace, and
   static validation.
6. Run the smallest available read-only client discovery checks; record any
   unavailable client as an explicit runtime validation gap.

## Validation

- `node tests/run-tests.js --projection --subagents --hooks`: focused projection
  and subagent verification, exact repository-owned test surface.
- `npm test`: full package regression, exact.
- `node bin/harness.js manifest --json`: manifest contract validation, exact.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`:
  current self-hosted Codex projection verification, exact for the installed
  Codex surface.
- `node bin/harness-change-validate.js --state-root . --change subagent-client-projection`:
  owning change validation, exact.
- Available client list/debug commands: runtime discovery smoke; fidelity is
  client-specific and must be reported without upgrading unavailable checks.
- `git diff --check`: static patch sanity.

### Per-client Discovery Acceptance

| Client | Runtime check | Unavailable or unsupported command handling |
|---|---|---|
| Codex | Confirm that the active Codex custom-agent registry exposes all eleven runtime names; pair it with self-host projection verification. | If no standalone list/debug command exists, record registry evidence plus exact projection verification as partial runtime evidence. |
| Claude | Run the installed Claude agent discovery surface when available. | The CLI is currently absent; record `not run` and use official path/frontmatter contract plus exact generated-file checks as structural substitute evidence. |
| OpenCode | In a freshly projected temporary project, run `opencode agent list --pure` and `opencode debug agent <runtimeName> --pure`; require the eleven names and representative canonical body/config evidence. | A command failure is blocking unless clearly environmental and recorded. |
| OMP | In a freshly projected temporary project, invoke the installed OMP `discoverAgents()` implementation and require all eleven names and representative system prompts; separately confirm CLI project/global roots. | If the installed parser cannot be invoked, retain source/CLI-path evidence only and record the runtime check as partial. |

The final gate is `READY` only if every client has runtime discovery evidence.
Missing client software or a client without a discovery command yields
`READY_WITH_NOTES` when exact format/path/body checks and authoritative client
contract evidence pass. A present client rejecting or omitting a projected
agent is `NOT_READY`.

## Review Packet

- User-set projection boundaries in this plan and change README.
- Diff for `harness.manifest.json`, `lib/project/projector.js`,
  `tests/test-subagents-hooks.js`, and `tests/test-projection.js`.
- Focused and full validation output.
- Per-client discovery evidence or an explicit unavailable/not-run record.

## Rollback

Revert the manifest path, agent renderer, current-renderer verification, and
projection tests as one projection-only change. Canonical role-body edits remain
owned by `.changes/canonical-subagent-role-contracts/` and are not part of this
rollback.

## Implementation-Design Assessment

No implementation-design pack is required. The behavior is settled and local
to the existing projection module plus its existing test seams; it introduces
no new subsystem boundary, dependency order, lifecycle, migration, concurrency,
or persisted-state format.

## Planning Gate

`READY`: the change is bounded, the failure mode is reproducible in a focused
test, implementation ownership is explicit, and validation and rollback are
defined. The next action is independent plan review before code mutation.
