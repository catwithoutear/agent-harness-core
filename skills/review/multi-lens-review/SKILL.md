---
name: multi-lens-review
description: Use when reviewing code, a diff, commit, merge request, or current task across complete scope and code dimensions with the mandatory project-native baseline and optional fresh supplemental passes.
---

# Multi-Lens Review

This is the one normal code-review procedure. It owns the common code process
and its ten dimension families; the applicable project-native baseline remains
mandatory. `workflow-control:Review Coverage` owns shared scope, while
`review-packet-gate` owns packet materials, findings, re-review, and formal
gates.

## Activation Boundary

- Use for ordinary code, diff, commit, merge request, or complete-task review;
  no explicit multi-lens request is needed.
- Invoke the applicable project-native baseline. It adds domain obligations but
  does not replace this procedure.
- Use `multi-lens-design-review` for requirements, design, plans, and tasks;
  use `grill-diff` for interactive hunk review.
- Fresh outside-voice, neutral, and code-only passes are optional supplements.
  They do not replace the intent-aware review, `review-verifier`, or a formal
  gate.
- Preserve review-only boundaries unless the user explicitly asks for fixes,
  commits, pushes, or external comments.

## Inputs

Accept code, diff, commit, merge request, and complete-task targets the active
repository or client supports:

- branch diff or commit range,
- local staged or unstaged diff,
- merge/pull request URL or id,
- supplied code-bearing patch or generated artifact,
- named files, modules, or symbols.

Resolve the base and target from repository state when possible. Ask only when
choosing the wrong base would change findings.
For a mixed code/design target, use this procedure for code surfaces and
`multi-lens-design-review` for design obligations. A plan or report without
implementation is not a code target.

## Protocol

1. Resolve full task scope and intent through `workflow-control:Review Coverage`;
   identify the applicable project-native baseline.
2. Use `review-packet-gate:Packet` for materials and its completeness and
   finding rules. Do not copy packet fields or formal-gate behavior here.
   For ordinary filesystem-backed code targets, execute
   `review-packet-gate:Source Navigation and Acceptance` before the first
   dispatch and again when accepting material source comparisons. Pass the
   selected source inventory and fixed-root read invocation with the existing
   packet; do not provide expected findings to a fresh pass.
3. Assess every Lens Selection family and the project baseline across the
   complete task scope, then allocate deeper investigation by risk. For
   reuse/necessity, read and apply
   `workflow-control/references/minimal-implementation.md:Capability Comparison
   Evidence` from current source or runtime. Execute its comparison steps with
   behavior invariants held fixed before choosing a key-block disposition.
   Require its compact evidence for
   key blocks; current correctness does not establish implementation necessity.
   For persistence or lifecycle changes, trace the first durable or externally
   visible state change through affected callers, callees and material failure
   exits, including unchanged shared frameworks. Identify which owner finalizes
   failure or preserves retry state, and when that protection becomes active.
   A state inventory or the presence of a cleanup guard alone does not establish
   that an early return or exception is covered; name any untraced boundary.
4. Assign bounded reviewer or specialist passes only when needed; one pass may
   cover multiple families. For outside-voice passes, provide neutral facts
   instead of prior diagnosis.
5. Verify findings against current source or execution evidence, deduplicate by
   root cause, risk-order the report, and apply the confidence scale below.
6. State coverage, evidence-backed N/A, validation, and gaps. Missing source or
   unresolved applicability cannot count as a completed dimension.

## Lens Selection

Authoritative code-review dimension families; check each:

- behavior and correctness,
- compatibility and migration,
- data integrity and persistence,
- concurrency, lifecycle, and state transitions,
- security and trust boundaries,
- performance and scale,
- observability, operations, and rollback,
- documentation, tests, and user-facing contract,
- operation-level public capability reuse and block necessity,
- project idioms, naming, API clarity, and maintainability.

Add the repository-native dimensions. Use `workflow-control:Review Coverage`
for scope and disposition duties and its minimal-implementation reference for
reuse/necessity analysis. One pass may cover multiple families; independent
passes may partition them. Neither arrangement reduces the complete duty.
Do not invent a specialist role when one bounded reviewer pass is enough.

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

### Independent Code-Only Pass

When one fresh, independent code perspective is useful, replace the usual
outside-voice context with only the code target (including necessary nearby code
and tests) and general review rules. Start it with no prior turns when the
client supports that: use `fork_turns=none` for Codex and the client's fresh
subagent or session equivalent elsewhere.

Use this prompt:

> Act as an independent reviewer. Read only code and assess design,
> architecture, correctness, and maintainability from its structure, logic, and
> semantics. Do not read or reference pre-written requirements, proposals,
> designs, implementation-designs, tasks, reviews, or prior findings, so their
> conclusions do not bias your assessment.

This is an optional fresh lens, not a new role, protocol, or gate. Synthesize
its evidence with the normal review; it does not replace intent-aware review or
`review-verifier` coverage comparison.

## Synthesis

The coordinator owns the final report:

- accept only evidence-backed findings,
- keep unsupported claims in `Needs Confirmation`,
- take the lower confidence when independent reviewers disagree,
- preserve minority concerns when evidence remains plausible,
- avoid grouping by lens when risk ordering is clearer.

Before accepting reuse/necessity coverage, follow
`workflow-control:Review Coverage` completion checks. A safe local simplification
may be reported as a nonblocking opportunity; do not promote it to a runtime
defect merely because the current form is longer. Return missing comparison
evidence as a coverage gap even when no correctness finding was established.

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

All families checked; deeper investigation:

- behavior/correctness for retry semantics,
- compatibility for CLI flag defaults,
- observability for retry logging.

Final report merges duplicate "retry never stops" findings into one P1 with
source evidence, downgrades an unsupported logging preference to residual
notes, and records security N/A with evidence that the retry path introduces no
changed trust boundary or input authority. Other families retain their
checked dispositions; missing evidence remains a gap.

## Common Mistakes

- Treating ordinary code review as a separate baseline that this skill only
  augments.
- Omitting the applicable project-native baseline or any Lens Selection family.
- Sending prior suspected bugs to a fresh outside reviewer.
- Reporting every lens output without evidence triage.
- Treating majority opinion as correctness.
- Expanding the review scope after dispatch without updating the packet.
