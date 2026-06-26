---
name: multi-lens-review
description: Use when a review needs multiple independent lenses, fresh outside-voice passes, confidence calibration, false-positive suppression, or synthesis after the baseline review method is selected.
---

# Multi-Lens Review

Use this as a review orchestrator, not as the baseline review method. First
select the repository's normal review procedure or domain skill, then use this
skill to add independent lenses, neutral outside-voice passes, calibration, and
synthesis.

## Activation Boundary

- Use only when the user asks for multi-lens, outside-voice, fresh-agent,
  confidence calibration, false-positive suppression, or reviewer synthesis.
- Do not use it as a shortcut around the repository's required review method.
- Preserve review-only boundaries unless the user explicitly asks for fixes,
  commits, pushes, or external comments.
- For small low-risk changes, run one baseline review and state why extra
  lenses were skipped.

## Inputs

Accept any review target the active repository or client supports:

- branch diff or commit range,
- local staged or unstaged diff,
- merge/pull request URL or id,
- supplied patch, generated artifact, report, or plan,
- named files, modules, or symbols.

If the base or target is ambiguous, resolve it from repository state when
possible. Ask only when choosing the wrong base would change findings.

## Protocol

1. Build a shared review packet: target, base, intended behavior, changed
   artifacts, relevant design or requirements, known validation, risks, and
   out-of-scope boundaries.
2. Select lenses from the changed surface, not from a fixed checklist.
3. Dispatch independent passes only when the surfaces are genuinely separable.
4. For outside-voice passes, provide neutral facts instead of prior diagnosis.
5. Triage each finding against source evidence before promoting it.
6. Deduplicate by root cause and risk-order the final report.
7. State which lenses ran, which were skipped, validation performed, and
   residual unknowns.

## Lens Selection

Common lens families:

- behavior and correctness,
- compatibility and migration,
- data integrity and persistence,
- concurrency, lifecycle, and state transitions,
- security and trust boundaries,
- performance and scale,
- observability, operations, and rollback,
- documentation, tests, and user-facing contract.

Use only lenses justified by the review packet. Do not invent a specialist
role when one bounded reviewer pass is enough.

## Fresh Neutral Packet

Use this for outside-voice or fresh-agent review. It must avoid contaminating
the reviewer with expected findings.

Required headings:

```text
Background
Goal
Review Target
Relevant Context
```

Include exact target artifacts, neutral task intent, current constraints, and
the evidence sources the reviewer may inspect. Do not include suspected bugs,
prior reviewer opinions, expected fixes, or "focus on X because I think Y is
wrong."

## Synthesis

The coordinator owns the final report:

- accept only evidence-backed findings,
- keep unsupported claims in `Needs Confirmation`,
- take the lower confidence when independent reviewers disagree,
- preserve minority concerns when evidence remains plausible,
- avoid grouping by lens when risk ordering is clearer.

Every main finding must include location, trigger, impact, evidence, and a
confidence score.

## Confidence Calibration

Use a 1-10 score:

| Score | Meaning | Handling |
|---|---|---|
| 9-10 | Directly verified from source or reproduced output. | Main report. |
| 7-8 | Strong source-backed pattern with low uncertainty. | Main report. |
| 5-6 | Plausible but needs confirmation. | Main report only with caveat. |
| 3-4 | Weak or speculative. | Appendix or `Needs Confirmation`. |
| 1-2 | Speculation. | Suppress unless severity is critical. |

Before promoting a finding, quote or summarize the exact artifact fragment that
motivates it. If the source cannot be inspected, confidence is at most 4 unless
independent runtime evidence proves the behavior.

## Example Synthesis

Packet: "Review the diff from `main...feature-x`; intent is to add import
retry; tests run: unit retry suite; changed files: parser, retry policy, CLI."

Lenses selected:

- behavior/correctness for retry semantics,
- compatibility for CLI flag defaults,
- observability for retry logging.

Final report merges duplicate "retry never stops" findings into one P1 with
source evidence, downgrades an unsupported logging preference to residual
notes, and states that security was skipped because no trust boundary changed.

## Common Mistakes

- Letting "multi-lens" replace the baseline review method.
- Sending prior suspected bugs to a fresh outside reviewer.
- Reporting every lens output without evidence triage.
- Treating majority opinion as correctness.
- Expanding the review scope after dispatch without updating the packet.
