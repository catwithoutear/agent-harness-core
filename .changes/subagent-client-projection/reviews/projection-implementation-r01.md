---
artifact: review-round
status: reviewed
tags: [review]
description: "Independent minimal four-client projection implementation review."
---
# projection-implementation Review Round 1

## Decision

`READY_WITH_NOTES`

No blocking or code-correctness finding remains. The previous false-green
verification defect is closed. The only residual note is that Claude runtime
discovery was not executed because the Claude CLI is not installed.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| PIR-001 | High | Resolved: rendered targets are compared with current `renderManagedContent(record)` output after the historical hash check. |
| PIR-002 | Medium | Resolved for available runtimes: OpenCode and OMP discover all eleven roles; current Codex runtime exposes the custom roles. Claude remains structural-only evidence. |
| PIR-003 | Note | Resolved: change README now reflects completed implementation and the residual Claude validation note. |

## Correctness Evidence

- `lib/project/projector.js` preserves the existing mode, source hash, and
  historical target hash checks, then compares rendered targets exactly with
  the current renderer.
- `tests/test-projection.js` simulates an obsolete OpenCode projection whose
  stale target hash has been synchronized in projection state. Source hash
  remains unchanged and verification must return `mismatch` with the specific
  current-renderer diagnostic.
- `tests/test-subagents-hooks.js` checks all 44 project projections for exact
  path, runtime name, minimal format, and canonical body, and checks all 44
  global target records.
- Copy and symlink verification branches are unchanged. Hooks reuse the
  strengthened rendered-content verification without a format change.

## Runtime Discovery Evidence

- Codex: self-host projection verifies all eleven agents and the active runtime
  exposes the corresponding custom agent types.
- OpenCode 1.18.11: `opencode agent list --pure` lists all eleven projected
  names as subagents; `opencode debug agent reviewer --pure` resolves
  `name=reviewer`, `mode=subagent`, and the canonical `# Reviewer` prompt.
- OMP 17.2.4: installed `discoverAgents()` finds all eleven project agents and
  loads their canonical headings as `systemPrompt`; CLI help confirms
  `.omp/agents` and `~/.omp/agent/agents` roots.
- Claude: CLI absent. Exact generated Markdown, required frontmatter, target
  paths, runtime names, and canonical bodies are verified structurally.

## Validation

- `node tests/run-tests.js --projection --subagents --hooks`: verified, 19/19.
- `npm test`: verified, all repository tests passed.
- `node bin/harness.js manifest --json`: verified, four clients and eleven
  agents with no errors or warnings.
- Codex self-host projection verification: verified, eleven agents; the
  existing unsupported hook diagnostic remains a non-agent warning.
- `node bin/harness-change-validate.js --state-root . --change
  subagent-client-projection`: verified with zero errors and warnings.
- `git diff --check`: verified.

## Review Boundary

Reviewed only discovery, runtime names, project/global paths, minimal native
formats, canonical body fidelity, and current-renderer verification. Canonical
role semantics were treated as reviewed inputs from the prior phase.
