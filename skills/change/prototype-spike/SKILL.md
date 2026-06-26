---
name: prototype-spike
description: Use when a proposal or design has unresolved feasibility risk that needs a bounded experiment, throwaway prototype, API probe, parser trial, or proof of concept before implementation.
---

# Prototype Spike

Use a spike as a bounded evidence loop for proposal or design uncertainty. A
prototype answers a question; it is not production implementation.

## Core Rule

Run the smallest experiment that can decide a proposal/design question, then
write the result back to the owning change artifact and discard, reimplement, or
explicitly route any kept work through the normal implementation workflow.

## Lifecycle Placement

`prototype-spike` may alternate with `proposal.md` and `design.md`:

```text
research / requirements
  -> proposal draft
  -> spike for unresolved direction or feasibility
  -> proposal revision
  -> design draft
  -> spike for risky interface, parser, migration, performance, or integration assumption
  -> design revision and freeze
  -> change-planner task slicing
```

Default trigger points:

- before proposal only when no candidate direction can be chosen from source
  reading alone;
- after proposal draft when the selected direction needs feasibility evidence;
- during design drafting when a specific design assumption needs proof;
- after design review only when the design must be reopened;
- not during normal implementation, unless the coordinator explicitly replans.

## Boundaries

Do not use this skill when repository-native precedent or source reading already
answers the question. Do not use it to bypass design, review, or task planning.
Avoid editing production paths unless the user approves and the worktree is
isolated.

Preferred locations:

- `.changes/<change>/prototype/` for task-specific evidence worth keeping;
- `/tmp/<change>-prototype/` for throwaway scripts, fixtures, generated files,
  or logs.

## Spike Brief

Write a brief in `research.md`, `proposal.md`, or `design.md` before running the
experiment:

```text
Spike:
- Question:
- Why source reading is insufficient:
- Location:
- Timebox/scope:
- Success signal:
- Discard/absorb decision:
```

## Execution

1. State the question and the artifact it will update.
2. Build the narrowest experiment that answers the question.
3. Use real repository types, payloads, protocols, or representative fixtures
   where possible.
4. Keep generated output and logs out of production directories.
5. Record the result and update the owning proposal/design decision.
6. Before production use, pass the chosen behavior to `change-planner` and
   implement in repository-native style.

## Example Spike Loop

```text
Spike:
- Question: Can the existing parser preserve unknown fields during rewrite?
- Why source reading is insufficient: callers use two serialization paths.
- Location: /tmp/change-123-parser-spike
- Timebox/scope: one fixture and two parser entry points.
- Success signal: unknown fields survive parse -> modify -> serialize.
- Discard/absorb decision: discard script; add production test if behavior is chosen.

Spike result:
- Answer: path A preserves fields; path B drops them.
- Evidence: fixture output diff.
- Production decision: reimplement chosen path through normal task slice.
- Follow-up plan change: design must route rewrite through path A or define field loss.
```

## Common Mistakes

- Letting exploratory code become production code without redesign and review.
- Running a broad experiment without a single decision question.
- Treating a mock-only success as proof of integration behavior.
- Forgetting to revise proposal/design after the spike answers the question.
