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
impact. Dispatch `code-simplifier` with the resolved Scope Packet when the
client supports subagents. The same complete review duty applies when the
coordinator performs the pass inline.

## Edit Authorization

Choose edit mode from current authorization for the resolved scope, not from
who authored the code. Explicit permission to simplify existing or externally
authored changes allows an apply pass without repeated confirmation. For
review-only or unauthorized changes, return opportunities without editing;
preserve unrelated changes and ask only when ownership or scope is unresolved.

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
  `requested_mode=opportunities` for review-only or not-yet-authorized changes,
- `behavior_invariants` that must not change,
- `validation_target` with the narrowest relevant command or explicit
  no-command reason,
- ownership/authorization status for committed changes that were not authored in
  the current session,
- active `.changes/<task>/` artifacts that name affected files or decisions,
- target branch or base commit, if known.

For a filesystem-backed scope, execute
`review-packet-gate:Source Navigation and Acceptance` before dispatching the
first pass. Carry its selected inventory, fixed-root invocation and snapshot
with this same Scope Packet. Use its source and bounded-return checks when
accepting the comparisons. Authorized edits require a new current snapshot;
retain the pre-edit evidence. This does not change edit authority or select
the formal review-run protocol.

If the branch mixes unrelated tasks and the scope cannot be resolved from branch
name, commit messages, change artifacts, or the user request, report
`NEEDS_CONTEXT` with the ambiguous commits or files.

If the target is unknown and choosing between candidate bases changes ownership,
scope, or authorization, report `NEEDS_CONTEXT` with the candidate bases instead
of guessing.

## Complete Coverage

Build a complete Unit Inventory for the resolved task scope. Inspect every
class, function, method, and key block, including assertions, wrappers, and
intermediate state. Group trivial units only when they share the same purpose,
evidence, and disposition. Scope includes necessary callers, callees, helpers,
tests, and local patterns; it does not expand to the whole repository.

Check every dimension below for every relevant unit. Investigate according to
its semantics and risk; record reasoned N/A only after checking applicability.
Missing source or evidence is a coverage gap, never a completed check. Unit
size, risk, and dispatch arrangements cannot reduce scope or omit dimensions.

## Minimality Decision

Before proposing a replacement or removal, read the `workflow-control` reference
`references/minimal-implementation.md` from the current harness source or
projected runtime. Apply its ordered ladder after the behavior map is established
and keep its safety floor subordinate to the Scope Packet's behavior invariants.

Use the ladder to find avoidable custom code, not to reopen accepted requirements
or bypass edit authorization. If the reference is unavailable, report that
coverage gap and continue only with simplifications supported by current source,
local patterns, and the supplied invariants.

## Simplification Pass

1. Produce the Scope Packet and complete Unit Inventory.
2. Re-read the scoped files and nearby call sites; map behavior and invariants.
3. Inspect every unit through these dimensions:
   - the ordered minimal-implementation ladder and shared-owner decision,
   - operation-level public capability reuse and block necessity,
   - data shape, ownership, lifetime, and producer-to-consumer side effects,
   - control flow and branching,
   - naming and API clarity,
   - duplication and local patterns,
   - error handling and observability,
   - tests and validation readability.
4. Execute the canonical comparison steps before choosing key-block
   dispositions, with behavior invariants held fixed. Apply the method to
   actual operations and required results, not just whole helper names.
   Check the strongest keep reason and the proposed
   final call sites before rejecting an alternative. Attach the canonical
   `Capability Comparison Evidence` to key-block dispositions, including keep
   decisions; a whole-function inventory row cannot hide distinct operations.
5. Classify each unit as `essential`, `optional`, or `redundant`; choose
   `keep`, `simplify`, `replace`, `remove`, or `needs decision` with evidence.
6. Pass the Scope Packet to `code-simplifier` when dispatching. Preserve
   `edit_authorized`, `requested_mode`, `behavior_invariants`,
   `validation_target`, and complete resolved scope.
7. Make only behavior-preserving edits authorized by the action and scope.
8. Re-run relevant validation or explain why no command is available.

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
Action: apply; complete scoped inventory and all dimensions checked.
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
3. Scope Packet, Unit Inventory, dimension coverage, and evidence gaps.
4. Minimality disposition and material ladder levels considered.
5. Validation run.
6. Complexity intentionally left unchanged, with concrete keep reasons.

Use `workflow-control:Review Coverage` completion checks when accepting a
delegated result. `NO_SAFE_SIMPLIFICATION` requires inspectable key-block
comparisons and no unresolved coverage gap; a successful invocation or passing
static check alone does not establish that result.
