---
name: simplify
description: Use when authorized code changes were made and a behavior-preserving simplification pass should inspect recently modified code, dispatch code-simplifier, and improve clarity before final verification.
---

# Simplify

Run this after non-trivial code edits and before final verification. The job is
to improve the changed code without changing behavior.

## Trigger Discipline

Invoke this skill after modifying code unless the change is docs-only,
format-only, generated output, or a one-line mechanical edit with no logic
impact. For medium or high risk code changes, dispatch `code-simplifier` when
the client supports subagents.

## Edit Authorization

If the current request is review-only, if the diff was authored externally, or
if you did not just make the code change, do not edit automatically. Return
simplification opportunities and ask for edit permission or wait for an explicit
apply request.

If tests are failing for behavior, fix or report the behavior failure before
performing style or clarity cleanup.

## Simplification Pass

1. Re-read the changed files and nearby call sites.
2. Identify the intended behavior and invariants that must not move.
3. Inspect the diff through these dimensions:
   - data shape and ownership,
   - control flow and branching,
   - naming and API clarity,
   - duplication and local patterns,
   - error handling and observability,
   - tests and validation readability.
4. Make only small behavior-preserving edits.
5. Re-run the relevant validation or explain why no command is available.

## Do Not Use

- Do not introduce new abstractions unless they remove real complexity.
- Do not broaden scope beyond recently changed code unless the user asks.
- Do not edit review-only or externally authored diffs without explicit
  permission.
- Do not perform style-only churn after tests have already failed for behavior.
- Do not simplify by hiding important state, errors, or lifecycle boundaries.

## Example Pass

```text
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
3. Validation run.
4. Complexity intentionally left unchanged.
