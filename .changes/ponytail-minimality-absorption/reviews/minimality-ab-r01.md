---
artifact: review-round
status: reviewed
tags: [review, validation, ponytail-minimality]
description: "Live isolated shared-owner-fix A/B with three Codex runs per arm."
---
# Minimality A/B Review Round 1

## Decision

`READY_WITH_NOTES`

- Evaluation status: `LIVE_AB_COMPLETE`.
- Isolation check: pass; all six runs used fresh clones and the expected
  arm-specific project skill.
- Instrument check: pass with the sequencing note recorded below.
- Conclusion: directional improvement in shared-owner selection consistency.

The candidate workflow gate improved shared-owner correctness in this scenario:
all three candidate runs passed the complete behavior gate, compared with one of
three baseline runs. Among runs that passed every hard gate, both arms converged
on the same small implementation shape, so the result is a reliability gain, not
a claim that the candidate produces smaller already-correct diffs.

## Frozen Setup

- Scenario: `shared-owner-fix`.
- Client: Codex CLI `0.152.0`, non-interactive ephemeral execution.
- Model/settings: configured default `gpt-5.6-sol`, reasoning `xhigh`, default
  service tier; no per-run model override.
- Harness baseline: `7e44602136121a5d09e25a946a9d87f6450f7d86`.
- Seed revision: `46d0ab91cb9b88aac65a6da9fc36427beff01c53`.
- Baseline arm template: `bcac6887435011d694723757295c923abac53a15`.
- Candidate arm template: `d9905f37446cd3852b7508d99e8950e6c0a9ceb9`.
- Prompt, permissions, seed, client configuration, and allowed commands were the
  same for both arms. Each run used a fresh clone and explicitly read its own
  project-local `.agents/skills/workflow-control/SKILL.md`.
- Only `workflow-control` was projected into the seeded task. The baseline copy
  came from the frozen harness commit; the candidate copy came from the current
  change and included the minimal-implementation references. No candidate
  minimality text was found in the user-global skill roots before execution.

## Instrument Check

- The scorer was frozen before live execution.
- Before execution, the unchanged seed passed its public tests and failed the
  overdraft/shared-owner behavior gate as expected.
- After execution, a complete shared-owner reference (`candidate-1`) passed all
  checks, while a plausible leaf-only reference (`baseline-2`) failed exactly
  the `withdraw_reuses_overdraft_rule` and shared-owner checks.
- Process note: the complete and leaf-only reference controls were confirmed
  after, rather than before, the first live pair. The scorer was not changed
  after any live result. This is a sequencing deviation, so the result should be
  treated as directional evidence and repeated before using it as a broad
  benchmark claim.

## Results

| Run | Public tests | Full hard gate | Owner selected | Production delta | Dependencies |
|---|---|---|---|---|---|
| baseline-1 | pass | pass | shared `#debit` | +3 lines, 1 file | none |
| baseline-2 | pass | fail | `transferTo` leaf | +3 lines, 1 file | none |
| baseline-3 | pass | fail | `transferTo` leaf, duplicate positive validation | +4 lines, 1 file | none |
| candidate-1 | pass | pass | shared `#debit` | +3 lines, 1 file | none |
| candidate-2 | pass | pass | shared `#debit` | +3 lines, 1 file | none |
| candidate-3 | pass | pass | shared `#debit` | +3 lines, 1 file | none |

Hard-gate summary, in scoring order:

- Correctness: both arms 3/3 for normal transfer and the reported transfer
  rejection.
- Safety and compatibility: candidate 3/3; baseline 1/3 because two runs left
  `withdraw` able to overdraw. All runs preserved the existing positive-amount
  error behavior and transfer atomicity.
- Completeness: both arms 3/3 implemented the request and added a runnable
  regression check.
- Minimality among hard-gate passers: tie. Every qualifying run changed one
  production file by three lines, changed the existing test file, added no
  dependency, and placed the rule in the shared owner.

The candidate averaged about 15% more uncached input tokens in these runs. This
is a cost signal, not a hard behavior gate; output-token volume was effectively
flat. The extra reference reading bought a measurable consistency improvement
in this small scenario, but the sample is too small to generalize the cost or
effect size.

## Environment Notes

- The first pair experienced symmetric transient TLS reconnects; both recovered
  and completed successfully.
- All runs reported that the global skill description catalog exceeded its
  context budget. The task prompt explicitly named the project-local skill path,
  and every run showed that it read the correct arm-specific file.
- Raw agent workspaces and client output were removed after this high-signal
  record was validated.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| AB-001 | note | Keep the candidate shared-owner/root-cause rule; it improved full-gate consistency from 1/3 to 3/3. |
| AB-002 | note | Do not add more evaluation machinery. Repeat this scenario only when a later instruction change could alter the decision. |
| AB-003 | note | This run evaluates the workflow-control implementation gate only; simplify and planning-review surfaces retain repository/static validation rather than a separate live benchmark. |
| AB-004 | note | Prepare both safe and leaf-only controls before the first provider call in the next live evaluation. |
