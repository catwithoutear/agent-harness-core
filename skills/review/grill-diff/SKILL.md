---
name: grill-diff
description: Use when reviewing local code changes chunk by chunk, validating a diff interactively, explaining every modified hunk, or the user asks to grill my diff, do a chunk review, or question each change.
---

# Grill Diff

Review modified code one chunk at a time. Question intent, correctness, risk,
and expected behavior until each chunk is confirmed, changed, skipped, or
explicitly unresolved.

## When Not To Use

- Large diffs with 20+ files or 500+ changed lines. Narrow by file, module, or
  behavior first.
- Pure formatting, generated code, lockfile churn, or mechanical renames.
- Already merged or deployed code.
- Broad architecture review. Use `multi-lens-review` after a baseline review
  method is selected.
- Design or planning interrogation. Use `grill-me` or `grill-with-docs`.

## Procedure

1. List changed files and estimate review chunks.
2. Process in dependency order: interfaces, data structures, control flow,
   persistence, errors, tests, docs.
3. Read surrounding code and at least one caller or callee when behavior can
   change.
4. For each chunk, state what changed and the likely intent.
5. Inspect five gaps: dependency, intent, completeness, approach, and craft.
6. Ask one focused question only when source evidence cannot answer it.
7. Provide your recommended answer after the question.

## Review Gaps

| Gap | Question |
|---|---|
| Dependency | Who relied on the old behavior? |
| Intent | Does the diff match the stated goal? |
| Completeness | What related case is still unfixed? |
| Approach | Is there a simpler local pattern? |
| Craft | Is the code clear without cleverness or churn? |

Prioritize dependency, intent, and completeness above craft. Do not turn a bug
review into style debate.

## Example Chunk

```text
Chunk: src/cache.ts set() now updates ttl before value.
Evidence: get() reads ttl first and returns expired before loading value.
Question: Should failed value serialization still update ttl, or should ttl only
move after the value write succeeds?
Recommended answer: update ttl only after value write succeeds; otherwise a
failed write can hide a valid old value until ttl expires.
```

## Output

Track chunks as:

- `confirmed`
- `needs change`
- `unclear`
- `skipped`

Final summary:

1. Confirmed chunks.
2. Needs-change chunks with severity and recommended fix.
3. Unresolved questions and whether they block merge.
4. Highest-risk areas.
5. Suggested next actions.
