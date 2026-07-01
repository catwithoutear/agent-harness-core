---
name: grill-diff
description: Use when the user explicitly asks to grill, chunk-review, review each hunk or change, question each change, or step through a local diff or task commit range interactively.
---

# Grill Diff

Review scoped code changes one chunk at a time when the user explicitly asks to
grill, chunk review, review each hunk or change, question each change, or step
through a local diff or task commit range. Question intent, correctness, risk,
necessity, and expected behavior until each chunk is confirmed, needs change,
skipped, or explicitly unresolved.

## When Not To Use

- Large diffs with 20+ files or 500+ changed lines. Narrow by file, module, or
  behavior first.
- Pure formatting, generated code, lockfile churn, or mechanical renames.
- Already merged or deployed code.
- ordinary PR/MR review, findings-first review, review packet or gate review,
  broad risk-ordered review, or multi-lens review.
- Broad architecture review. Use `multi-lens-review` after a baseline review
  method is selected.
- Design or planning interrogation. Use `grill-me` or `grill-with-docs`.

## Authority

Read-only by default. Do not edit, stage, commit, push, publish comments, or
mutate external systems during grilling. If the user asks to apply a resolved
change, stop grilling and switch to an explicit apply mode.

## Scope Packet

Start by resolving the review scope. Do not rely on `git diff` alone.

Include:

- current uncommitted diff and staged diff,
- task commit range relative to the target branch or merge-base,
- already submitted commits that belong to the current task,
- active `.changes/<task>/` artifacts that name affected files or decisions,
- excluded files or commits with reasons.

If the branch mixes unrelated work, narrow by the user request, branch name,
commit messages, and change artifacts before chunking. Ask only when those
signals cannot identify the task boundary.

## Procedure

1. Produce the Scope Packet and estimate review chunks.
2. Process in dependency order: interfaces, data structures, control flow,
   persistence, errors, tests, docs.
3. Read surrounding code and at least one caller or callee when behavior can
   change.
4. For each chunk, state what changed and the likely intent.
5. Inspect six gaps: dependency, intent, completeness, necessity, approach,
   and craft.
6. Ask one focused question only when source evidence cannot answer it.
7. Provide your recommended answer after the question.

## Review Gaps

| Gap | Question |
|---|---|
| Dependency | Who relied on the old behavior? |
| Intent | Does the diff match the stated goal? |
| Completeness | What related case is still unfixed? |
| Necessity | Is this unit essential, optional, redundant, or better replaced? |
| Approach | Is there a simpler local pattern? |
| Craft | Is the code clear without cleverness or churn? |

Prioritize dependency, intent, completeness, and necessity above craft. Do not
turn a bug review into style debate.

## Example Chunk

```text
Scope Packet: current uncommitted diff plus task commit range against
origin/main; docs-only commit excluded.
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
