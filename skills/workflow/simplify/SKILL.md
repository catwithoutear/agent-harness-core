---
name: simplify
description: Use when authorized code changes need a behavior-preserving simplification pass across the current task scope, including uncommitted diffs and task commits, before final verification.
---

# Simplify

Run this after non-trivial code edits and before final verification. The job is
to improve the current task scope without changing behavior.

## Trigger Discipline

Invoke this skill after modifying code unless the change is docs-only,
format-only, generated output, or a one-line mechanical edit with no logic
impact. Dispatch `code-simplifier` for standard or deep passes when the client
supports subagents.

Use a deep pass only when the user explicitly asks for deep simplification,
unit-by-unit cleanup, or a simplification/refactor task, or when the current
authorized slice is itself de-redundancy or behavior-preserving refactor work.

## Edit Authorization

If the current request is review-only, if the diff was authored externally, or
if you did not just make the code change, do not edit automatically. Return
simplification opportunities and ask for edit permission or wait for an explicit
apply request.

If tests are failing for behavior, fix or report the behavior failure before
performing style or clarity cleanup.

## Scope Packet

Resolve the task scope before inspecting code. Do not rely on `git diff` alone.
Do not treat an empty current diff as an empty review when the task already has
commits on the branch.

Include:

- current uncommitted changes from `git diff` and `git diff --cached`,
- committed task range from `git log <base>..HEAD` and
  `git diff <base>..HEAD`,
- base selection from the MR target, upstream tracking branch,
  repository default branch, merge-base with the target, or an explicit
  user-supplied base,
- included commits and excluded commits with reasons,
- `edit_authorized`: true only when the current request authorizes editing this
  resolved scope,
- `requested_mode=apply` for an authorized simplification pass, or
  `requested_mode=opportunities` for review-only, externally authored, or
  not-yet-authorized changes,
- `behavior_invariants` that must not change,
- `validation_target` with the narrowest relevant command or explicit
  no-command reason,
- ownership/authorization status for committed changes that were not authored in
  the current session,
- active `.changes/<task>/` artifacts that name affected files or decisions,
- target branch or base commit, if known.

If the branch mixes unrelated tasks and the scope cannot be resolved from branch
name, commit messages, change artifacts, or the user request, report
`NEEDS_CONTEXT` with the ambiguous commits or files.

If the target is unknown and choosing between candidate bases changes ownership,
scope, or authorization, report `NEEDS_CONTEXT` with the candidate bases instead
of guessing.

## Coverage Mode

Pick one mode after the Scope Packet:

- `quick`: all are true: files <= 2, effective logic diff lines <= 40,
  changed units <= 3, no public API, data, persistence, error, log, metric,
  concurrency, lifecycle, security, transaction, resource, or cross-module
  behavior, and validation is obvious.
- `standard`: default. Cover changed units plus nearby callers, callees,
  helpers, tests, and local patterns needed to preserve behavior.
- `deep`: build a complete unit inventory for the resolved scope and analyze
  every class, function, method, and key block. Group trivial units only when
  they share the same purpose, evidence, and disposition.

## Simplification Pass

1. Produce the Scope Packet and choose `quick`, `standard`, or `deep`.
2. Re-read the scoped files and nearby call sites.
3. Identify the intended behavior and invariants that must not move.
4. Inspect the scoped changes through these dimensions:
   - data shape and ownership,
   - control flow and branching,
   - naming and API clarity,
   - duplication and local patterns,
   - error handling and observability,
   - tests and validation readability.
5. For deep mode, classify each unit as `essential`, `optional`, or
   `redundant`, then mark disposition: `keep`, `simplify`, `replace`,
   `remove`, or `needs decision`.
6. For standard or deep subagent work, Pass the Scope Packet to `code-simplifier`.
   Do not drop `edit_authorized`, `requested_mode`, `behavior_invariants`,
   `validation_target`, resolved scope, or coverage mode.
7. Make only behavior-preserving edits authorized by the mode and scope.
8. Re-run the relevant validation or explain why no command is available.

## Do Not Use

- Do not introduce new abstractions unless they remove real complexity.
- Do not broaden scope beyond the resolved task scope unless the user asks.
- Do not edit review-only or externally authored diffs without explicit
  permission.
- Do not perform style-only churn after tests have already failed for behavior.
- Do not simplify by hiding important state, errors, or lifecycle boundaries.

## Example Pass

```text
Scope Packet: uncommitted retry diff plus commits a1b2c3..d4e5f6 on the task
branch; no unrelated commits found.
Mode: standard.
Changed: request retry loop.
Simplification: replaced nested conditionals with early returns matching the
existing module pattern.
Invariant preserved: retry count, final error, and metrics emission are
unchanged.
Validation: existing retry tests pass.
```

## Output

Report:

1. Simplifications made.
2. Behavior invariants preserved.
3. Scope Packet and coverage mode.
4. Validation run.
5. Complexity intentionally left unchanged.
