# Minimal Implementation Gate

Use this gate after mapping the current behavior and before selecting custom
code. The objective is the smallest safe implementation that fully satisfies
the current requirement, not the fewest lines in isolation.

## Understand Before Choosing

Establish enough source-backed context to name:

- the requested behavior and explicit non-goals;
- the entry path, relevant callers and consumers, and the authoritative owner;
- inputs, outputs, side effects, failure paths, and lifecycle boundaries;
- behavior, compatibility, security, data, error, and observability invariants;
- the narrowest runnable check, or why execution is unavailable.

Do not simplify a path you have not understood. If the behavior, ownership, or
invariants remain ambiguous, gather evidence or request the owner decision before
choosing an implementation level.

## Ordered Decision Ladder

Evaluate in order and stop at the first level that completely meets the current
requirement and safety floor:

1. **No implementation:** Is the change actually required, or can the need be
   removed, deferred, configured, documented, or satisfied by current behavior?
2. **Repository capability:** Does the repository already own the behavior in a
   helper, shared module, configuration path, base abstraction, command, or local
   pattern with matching semantics?
3. **Standard library or runtime:** Can a language standard-library or runtime
   built-in provide the behavior clearly and portably?
4. **Native platform capability:** Can an already-supported operating-system,
   runtime, build, deployment, database, or service-platform capability provide
   it without adding a parallel implementation? Account for portability,
   operability, and the repository's supported environments.
5. **Approved installed dependency:** Can a dependency already present and
   accepted by the repository provide the behavior without an unnecessary
   wrapper? A new dependency is a separate architecture choice, not this level.
6. **Direct local expression:** Can one clear expression or a small local change
   solve it without hiding behavior, compressing errors, or harming readability?
7. **Minimum custom code:** Add only the custom concepts, states, branches, files,
   and extension points justified by current requirements or verified risks.

The ladder is a decision order, not a demand for clever one-liners. Prefer a few
obvious lines over a dense expression when that preserves local reasoning.

## Root Cause And Shared Ownership

For a defect, trace the believable failure path before choosing the edit. When
one rule or invariant causes failures in multiple paths, fix its authoritative
shared owner and inspect affected consumers. Do not patch only the reported leaf
unless the leaf genuinely owns the behavior.

Reuse follows semantics, not similar syntax. Keep separate implementations when
their requirements, invariants, or change reasons differ; forced sharing can be
more complex than duplication.

## Safety Floor

A smaller solution is acceptable only when it preserves all applicable:

- explicitly requested behavior and compatibility;
- input validation, authorization, privacy, and security boundaries;
- failure propagation, cleanup, rollback, and lifecycle behavior;
- data integrity, concurrency, resource, log, and metric contracts;
- maintainability proportionate to the task's actual risk.

Never rank source lines, file count, or dependency count above these boundaries.
If the first adequate solution is irreducible because of them, keep it and say
why.

## Compact Disposition

Record only what affects the decision; do not narrate every obvious rung:

```text
Selected level: <ladder level and concrete mechanism>
Why higher levels do not fit: <brief evidence for material rejections>
Shared owner/root cause: <owner or N/A with reason>
Safety floor: <preserved invariants>
Runnable check: <narrow command/check, or unavailable reason>
```
