# Subagent Judge Rubric

Score custom subagents across 8 dimensions for a total of 120 points.

## D1: Role Narrowness And Mission Fit (20 points)

| Score | Criteria |
|---|---|
| 0-5 | Generic helper, broad worker, or unclear role. |
| 6-10 | Role exists but overlaps heavily with parent agent or other subagents. |
| 11-15 | Clear specialist role with manageable scope. |
| 16-20 | Sharp mission with explicit use and non-use boundaries. |

Look for:

- one primary job, not a collection of unrelated abilities;
- clear boundary between this subagent and nearby roles;
- no hidden implementation, review, planning, and orchestration duties in one prompt.

## D2: Dispatch Description Quality (15 points)

| Score | Criteria |
|---|---|
| 0-5 | Description is vague or missing. |
| 6-10 | States what the agent does but not when to use it. |
| 11-13 | Good trigger scenarios and keywords. |
| 14-15 | Parent agent can reliably decide when to dispatch and when not to. |

The description must answer:

- What specialist work does this subagent perform?
- When should it be dispatched?
- Which terms, files, workflows, or situations should trigger it?
- Which nearby tasks belong to a different subagent?

## D3: Authority, Tool, And Permission Boundaries (15 points)

| Score | Criteria |
|---|---|
| 0-5 | Tools or permissions contradict the role. |
| 6-10 | Some boundary exists but authority leaks remain. |
| 11-13 | Tools and permissions mostly match the job. |
| 14-15 | Authority is minimal, explicit, and aligned with expected output. |

Review:

- edit permission for review-only or plan-only agents;
- bash/network access for roles that should only inspect text;
- ability to commit, publish, resolve comments, or mutate external systems;
- sandbox and mode settings for Codex/OpenCode/Claude/Pi where present.

Authority mismatch examples:

- A `reviewer` that can edit files by default.
- A `planner` that is instructed to implement code.
- A `repo-mapper` with broad write permissions.
- A role that requires runtime probes but has no shell or browser access.

## D4: Inputs, Context Rules, And Evidence Discipline (15 points)

| Score | Criteria |
|---|---|
| 0-5 | No required inputs or evidence rules. |
| 6-10 | Inputs listed but context/evidence handling is vague. |
| 11-13 | Good input list and evidence expectations. |
| 14-15 | Clear source-of-truth order, uncertainty handling, and stop conditions. |

Check whether the subagent says:

- what inputs it needs before starting;
- which repository files, docs, diffs, or artifacts to inspect;
- how to distinguish facts, inferences, and unknowns;
- what to do when input is missing or contradictory.

## D5: Output Contract And Handoff Utility (15 points)

| Score | Criteria |
|---|---|
| 0-5 | Output is free-form or only a vague summary. |
| 6-10 | Output has headings but weak actionability. |
| 11-13 | Structured output supports parent-agent decisions. |
| 14-15 | Output includes evidence, risks, next action, and open questions in a stable shape. |

Useful subagent output lets the parent agent decide:

- what was checked;
- what evidence supports each finding;
- what remains unknown;
- what smallest next action reduces risk;
- whether the subagent result is advisory, blocking, or ready to execute.

## D6: Failure Handling And Stopping Conditions (10 points)

| Score | Criteria |
|---|---|
| 0-3 | No stopping condition or failure behavior. |
| 4-6 | Basic stop guidance, mostly generic. |
| 7-8 | Clear stopping conditions for common failure modes. |
| 9-10 | Handles missing input, contradictory evidence, insufficient context, and low confidence explicitly. |

Check for:

- when to stop and ask the parent agent for missing input;
- when to return "not enough evidence";
- how to avoid inventing conclusions;
- when not to continue into implementation.

## D7: Client-Native Format And Projection Fit (15 points)

| Score | Criteria |
|---|---|
| 0-5 | Invalid or wrong client format. |
| 6-10 | Valid format but metadata mismatches client semantics. |
| 11-13 | Good client-native metadata and body. |
| 14-15 | Cross-client projections are semantically aligned while preserving native metadata differences. |

For this prompts repo, check:

- Codex uses TOML agent definitions with `name`, `description`, model/sandbox
  settings, and `developer_instructions`.
- Claude uses Markdown frontmatter with native fields such as `name`, `description`, model/tools/permission mode when applicable.
- OpenCode uses Markdown frontmatter with `mode: subagent` and native permission/tool settings.
- OMP uses lean Markdown frontmatter with role name and description.
- Pi uses Markdown frontmatter compatible with its subagent extension when
  present.
- Shared prompt bodies should be semantically aligned, but frontmatter should remain client-native.

## D8: Practical Dispatch Usability (15 points)

| Score | Criteria |
|---|---|
| 0-5 | Parent agent cannot reliably use the subagent. |
| 6-10 | Usable but likely to be under-dispatched, over-dispatched, or produce vague output. |
| 11-13 | Works for common cases with minor gaps. |
| 14-15 | Bounded, actionable, and easy to dispatch, verify, and integrate. |

Mentally simulate:

1. Would the parent agent know to dispatch this subagent from the description alone?
2. Would the subagent know what to inspect?
3. Would its output let the parent agent act without redoing all work?
4. Would a failure or uncertainty be visible?

## Grade Scale

| Grade | Score | Meaning |
|---|---|---|
| A | 108-120 | Production-ready specialist subagent. |
| B | 96-107 | Good, with targeted improvements. |
| C | 84-95 | Adequate but needs clear improvement. |
| D | 72-83 | Significant design issues. |
| F | 0-71 | Needs redesign. |

## Report Contract

```markdown
# Subagent Evaluation Report: [Role Name]

## Summary

- **Total Score**: X/120 (X%)
- **Grade**: [A/B/C/D/F]
- **Client Format**: [Codex/Claude/OpenCode/OMP/Pi/Other]
- **Role Type**: [review/planning/research/implementation/orchestration/etc.]
- **Readiness**: [Production-ready / Needs targeted revision / Needs redesign]
- **Verdict**: [one sentence]

## Dimension Scores

| Dimension | Score | Max | Notes |
|---|---:|---:|---|
| D1 Role Narrowness And Mission Fit | X | 20 | |
| D2 Dispatch Description Quality | X | 15 | |
| D3 Authority, Tool, And Permission Boundaries | X | 15 | |
| D4 Inputs, Context Rules, And Evidence Discipline | X | 15 | |
| D5 Output Contract And Handoff Utility | X | 15 | |
| D6 Failure Handling And Stopping Conditions | X | 10 | |
| D7 Client-Native Format And Projection Fit | X | 15 | |
| D8 Practical Dispatch Usability | X | 15 | |

## Blocking Issues

| Issue | Impact | Required Fix | Evidence |
|---|---|---|---|

## Non-blocking Improvements

| Issue | Suggested Improvement | Priority |
|---|---|---|

## Missing Subagent Guidance

List missing inputs, boundaries, context rules, evidence rules, output requirements, or stopping conditions.

## Risk Assessment

| Risk | Severity | Mitigation | Verification |
|---|---|---|---|

## Suggested Revision Breakdown

| Task | File / Section | Description | Risk | Suggested Order |
|---|---|---|---|---|

## Cross-client Notes

Only include this section when evaluating multiple projections for the same role. Compare semantic body alignment separately from client-specific metadata.
```
