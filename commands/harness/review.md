---
name: harness:review
description: Review a design, plan, diff, skill, subagent, or change packet with evidence-first gate decisions.
argument-hint: "<target path, diff, change id, or review question>"
---

# Harness Review

Use this when the user asks for a review or readiness judgment.

Input: `$ARGUMENTS`

## Required Behavior

1. Choose the narrowest review skill:
   - `review-packet-gate` for readiness packets and implementation gates.
   - `multi-lens-design-review` for requirements, proposal, design, specs, or
     implementation-design.
   - `multi-lens-review` for explicit multi-lens or fresh outside review.
   - `skill-judge` for skills.
   - `subagent-judge` for subagent prompts.
2. Read the target and its intent sources before judging.
3. Verify claims against current files, diffs, commands, or artifacts.
4. Lead with findings ordered by severity. Avoid summary-first review output.
5. Separate blockers, should-fix items, notes, and residual risk.
6. If evidence conflicts at high risk, recommend council handling through
   `workflow-control`; do not convert council into majority voting.
7. Record review results in `reviews/` only for formal gates, council,
   re-review, or freeze decisions.

## Output

- Findings:
- Gate decision:
- Evidence checked:
- Missing evidence:
- Residual risk:
- Suggested artifact update:

If there are no findings, say that clearly and name remaining test or evidence
gaps.
