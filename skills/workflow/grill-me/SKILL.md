---
name: grill-me
description: Use when the user wants an interactive grill session for a plan, design, proposal, or decision tree, including prompts like grill me, stress-test my plan, or ask me one question at a time.
---

# Grill Me

Interview the user until the plan is precise enough to execute or reject. Keep
the session interactive: ask one question at a time and wait for the answer
unless the user asks for a batch.

## Rules

- Explore first when the repository can answer the question.
- Ask about decisions, not trivia.
- Provide your recommended answer with each question.
- Track what is resolved, what changed, and what remains blocked.
- Stop when remaining uncertainty belongs to product judgment, risk appetite, or
  missing external input.

## Question Order

1. Goal and non-goals.
2. User-visible behavior or contract.
3. Data model, state, ownership, or lifecycle.
4. Failure modes and recovery.
5. Compatibility, migration, and rollback.
6. Validation and observability.
7. Implementation slice boundaries.

## Example Question

```text
Question: Should this plan preserve the old response shape for existing clients,
or is this task allowed to introduce a breaking API change?
Recommended answer: preserve the response shape unless the task explicitly owns
a versioned API migration; that keeps validation local to the new behavior.
```

## Output

When the session ends, summarize:

- Resolved decisions.
- Changed assumptions.
- Remaining blockers.
- Recommended next artifact or implementation step.
