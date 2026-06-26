---
name: skill-judge
description: Use when evaluating SKILL.md packages, trigger descriptions, progressive disclosure, bundled resources, validation, or skill quality before migration or release.
---

# Skill Judge

Evaluate a skill as a reusable agent capability, not as ordinary prose. A good
skill has a precise trigger, a narrow job, enough expert knowledge to change the
agent's behavior, and a small enough body that it does not waste shared context.

## Workflow

1. Read the target `SKILL.md` completely.
2. Read only the bundled resources needed to understand the behavior being
   evaluated.
3. Read `references/rubric.md` before scoring.
4. Compare frontmatter, body, resources, and validation evidence against the
   rubric.
5. Return risk-ordered findings before suggestions.

## Core Questions

- Would the description trigger for the right requests and avoid the wrong
  ones?
- Does the skill teach non-obvious procedure, tradeoff, tool behavior, domain
  knowledge, or failure handling?
- Is the body concise enough for repeated loading?
- Are long examples, rubrics, schemas, or tool details moved into references or
  scripts?
- Are bundled scripts or assets necessary and testable?
- Can another agent follow the output contract without hidden context?

## Scoring

Use a 100-point score:

- Trigger and scope: 20
- Knowledge delta: 20
- Progressive disclosure: 15
- Procedure and failure handling: 15
- Resources and validation: 15
- Output contract and examples: 15

Treat authority leaks, dangerous cleanup instructions, invalid frontmatter, or
project-specific leakage in a generic skill as blocking regardless of score.

## Verdict Calibration

Use the score and blocking issues together:

- `READY`: 90-100, no blocking issues, and only minor improvements remain.
- `READY_WITH_NOTES`: 75-89, no blocking issues, or 90+ with named residual
  risks that should be carried forward.
- `NOT_READY`: 60-74, or any blocking issue that can be fixed without changing
  the skill's purpose.
- `NEEDS_REDESIGN`: below 60, contradictory purpose, unsafe authority, or a
  trigger/body mismatch that makes the skill unreliable.

Never let a high score override a blocking issue. Report the blocking issue
first, then show the score as context.

## Example Finding

```text
High - Trigger is too broad
Evidence: description says "Use when working with docs" but the body only
handles API reference generation.
Impact: model may load the skill for unrelated documentation edits.
Required fix: narrow the description to API docs and add negative triggers in
the body.
```

## Output

Return:

1. Verdict: `READY`, `READY_WITH_NOTES`, `NOT_READY`, or
   `NEEDS_REDESIGN`.
2. Score: `N/100`.
3. Blocking Issues.
4. Non-blocking Improvements.
5. Trigger/Scope Notes.
6. Resource and Validation Notes.
7. Suggested Revision Breakdown.
