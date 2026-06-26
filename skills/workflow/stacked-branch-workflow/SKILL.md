---
name: stacked-branch-workflow
description: Use when planning, splitting, inspecting, rebasing, cascading, merging, or force-pushing stacked branches, stacked MR/PR chains, dependent branches, or large changes needing reviewable branch boundaries.
---

# Stacked Branch Workflow

## Core Principle

A good branch stack is a reviewable dependency chain. Planning and maintenance
share the same invariant: each branch must answer one review question, depend
only on lower branches, and remain safe to rebuild when a lower branch changes.

Use this skill in two modes:

- **Planning mode**: split a large change into reviewable layers.
- **Maintenance mode**: inspect, rebase, cascade, push, or merge an existing
  stack without losing branch boundaries.

## Mode Selection

| User intent | Mode | Mutate refs? |
|---|---|---|
| Split a large change or decide whether to split | Planning | No |
| Review or inspect an existing stack's topology/status | Maintenance report | No |
| Rebase, replay, cascade, merge, or push a stack | Maintenance execution | Only after the safety checks below |

If the user asks for review, status, or a plan, stop at a report. Do not run
mutating Git commands unless the user explicitly asks to execute the stack
maintenance action.

## When Not To Use

- Single-commit fixes with no dependent branches.
- Repository-specific documentation, validation, packaging, or memory policy.
  Follow the active repo instructions for those.
- Review content or code correctness. Use a review skill after the stack shape
  is clear.

## Stack Invariants

1. **Dependency direction**: foundation before consumers.
2. **Behavior boundary**: pure refactors and behavior changes do not share a
   branch.
3. **Review boundary**: one branch, one question a reviewer can hold in mind.
4. **Test boundary**: tests live on the lowest branch that can validate the
   behavior.
5. **Rollback boundary**: riskier or broader changes sit higher in the stack.
6. **Independent validity**: each branch should compile and be explainable on
   its own.

## Planning Mode

Use when creating a new stack or deciding whether a large MR should be split.

### Default Shape

```text
main
  -> base-refactor       pure refactor, no behavior change
  -> model-interface     types, schemas, config, protocol
  -> core-logic          policy, state transition, business rules
  -> integration         handlers, CLI, UI, config loading
  -> tests-docs          integration tests, docs, migration notes
```

Compress the shape when the change is small. Skip a refactor layer when there
is no real refactor to do.

### Splitting Algorithm

1. State the final user-visible behavior.
2. List the internal changes required.
3. Separate mechanical refactor from behavior change.
4. Identify new or changed interfaces.
5. Identify core logic.
6. Identify integration/wiring.
7. Attach tests to the lowest branch that can validate them.
8. Check that every branch can compile and be reviewed independently.
9. Produce the dependency-ordered stack.

### Review Checklist

For each proposed branch:

```text
[ ] Can it be described in one sentence without "and"?
[ ] Does it solve exactly one problem?
[ ] Does it avoid mixing refactor and behavior change?
[ ] Can it compile independently?
[ ] Can it be tested independently?
[ ] Does it have a clear rollback boundary?
[ ] Does it avoid depending on upper branches?
[ ] Is its risk appropriate for its position?
```

For a planning example, see
`references/example-session-expire.md`. Load it only when the user asks for an
example or the split is unclear; it is not needed for maintenance-only tasks.

## Maintenance Mode

Use when branches already exist and one or more layers need rebase, replay,
amend, push, or merge.

### First Pass: Map Reality

Before changing refs, gather:

```text
git status --short --branch
git branch --show-current
git log --oneline --graph --decorate --branches --remotes --max-count=<N>
git merge-base <base> <branch>
git rev-list --left-right --count <remote>...<local>
```

Produce a compact map:

```text
base
  -> L1 <branch> local=<sha> remote=<sha|none> state=<sync|ahead|behind|diverged>
  -> L2 <branch> local=<sha> remote=<sha|none> state=<sync|ahead|behind|diverged>
```

Verify whether each branch is an ancestor of the next. A sibling branch is not
part of a linear stack even if its diff appears to contain lower-layer content.

### Before Mutating Refs

Do this before any rebase, reset, amend, or force-push plan:

```text
[ ] Fetch remotes or state explicitly why remote state is unavailable.
[ ] Check every involved worktree for dirty state.
[ ] Record old local branch SHAs and expected remote SHAs.
[ ] Identify which branches are already pushed or shared.
[ ] Decide whether temporary backup refs are needed.
[ ] Confirm the intended parent for every rewritten branch.
```

If any item is uncertain, stop and report the uncertainty instead of rewriting
refs. For pushed/shared branches, prefer a bottom-up plan plus explicit
`--force-with-lease` expectations over broad history rewrites.

### Cascade After A Lower-Layer Change

When a lower branch is amended:

1. Rebuild the changed lower branch on its intended parent.
2. Rebase or replay each upper branch onto the refreshed parent, bottom-up.
3. Resolve conflicts only within the semantic scope of that layer.
4. After each layer, inspect the layer delta against its parent.
5. Stop if an upper branch forces a redesign of a lower interface.

Preferred manual form:

```bash
git checkout L1
git rebase <base>
git checkout L2
git rebase --onto L1 <old-L1> L2
git checkout L3
git rebase --onto L2 <old-L2> L3
```

`<old-L1>` and `<old-L2>` are the pre-rewrite parent SHAs or refs recorded
before mutation. Do not guess them after refs have moved.

`git rebase --update-refs` is acceptable for a truly linear local-only stack,
but inspect every moved ref afterwards.

Never use `--update-refs` until you have confirmed the stack is linear and the
affected refs are safe to rewrite. Avoid it on shared, divergent, partially
pushed, or sibling-heavy stacks. After `git rebase --abort`, inspect refs
manually; refs moved before the abort may not all be restored to the state you
expected.

### Post-Cascade Checks

For each layer:

```text
git diff --check <parent>..<branch>
git range-diff <old-parent>..<old-branch> <new-parent>..<new-branch>
git log --oneline --graph --decorate <base>..<top>
```

Add project-specific build/test commands only after reading the active repo
instructions. This skill does not define repository validation policy.

## Push And Merge Mode

### Before Force Push

For every branch to push:

```text
[ ] The local branch is the intended branch.
[ ] The remote branch and expected old SHA were fetched recently.
[ ] The branch's parent is the intended lower layer or base.
[ ] The layer delta was inspected after replay.
[ ] Any shared users of the branch are accounted for.
```

Use `--force-with-lease`, not blind force push:

```bash
git push --force-with-lease origin <local>:<remote>
```

Push bottom-up unless the review system explicitly requires a different order.
If only the lowest branch is ready for review, push only that branch and keep
upper layers local.

### Merge Order

Merge bottom-to-top:

```text
merge L1 -> rebase L2 -> merge L2 -> rebase L3 -> merge L3
```

Do not merge an upper branch before its lower dependency unless the hosting
system natively enforces stacked dependencies and rollback expectations are
clear.

## Output Templates

### Stack Plan

```text
Stack plan:
- Base:
- Layers:
- Review question per layer:
- Tests per layer:
- Rollback boundary:
- Open decisions:
```

### Maintenance Report

```text
Stack status:
- Base:
- Topology:
- Local/remote divergence:
- Layers needing cascade:
- Proposed rebase/replay sequence:
- Checks before push:
- Push order:
- Risks / unknowns:
- Confidence:
```

## Common Mistakes

- Never treat sibling branches as a linear stack because their diffs overlap;
  ancestry, not content similarity, defines a stack.
- Never rewrite a pushed branch before fetching and checking the expected remote
  SHA; otherwise `--force-with-lease` cannot protect the intended state.
- Never fix only the top branch after a lower-layer API change; cascade the
  dependent layers or explain why they are unaffected.
- Never let an upper branch reshape a lower interface silently; stop, amend the
  lower layer, then replay consumers.
- Never split by directory labels such as "models, managers, handlers" when the
  semantic review question cuts across directories.
- Never defer all tests to the final branch when lower branches can be tested;
  it hides regressions until the stack is expensive to rebuild.
- Never let repository-specific documentation or validation rules leak into this
  generic Git workflow skill; active repo instructions own those details.
