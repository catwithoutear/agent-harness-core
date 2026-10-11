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

## Operation-Level Discovery

Decompose each unit into actual operations and required results: Boolean,
position/value, count, transformation, formatting, insertion, or aggregation.
Match those semantics against current public capabilities, exact declarations,
supported dependencies, callers, and failure/ownership contracts. Inspect both
handwritten code and existing helper/algorithm calls: a result may be more
powerful than its consumer needs. Search with operation/result vocabulary and
local production patterns, rather than only the custom helper's name.

A helper with no complete replacement may still contain replaceable operations.
State which part is reusable and why the remaining policy needs local code.
A failed name search or an existing library call does not close this dimension.
Keep discovery bounded to the operation and current task; do not enumerate an
entire library or introduce a dependency to obtain a shorter expression.

## Necessity And Consumer Trace

For every relevant key block, assertion, wrapper, branch, and intermediate
state, identify the requirement or invariant it protects and the strongest
concrete keep reason. Ask what observable behavior would change if it were
removed or replaced. Retain distinctions only when a consumer must act
differently; preserve contract checks, diagnostics and defensive boundaries
when their verified requirements justify them. Current safety or absence of a
warning does not establish necessity, and fewer lines do not establish safety.

Trace producer -> projection/adaptor -> traversal -> consumer. Locate side
effects, repeated evaluation, ownership transfer, final use, and later reuse.
Check evaluation count/order, short-circuiting, exceptions, and aliasing. A
consumer that happens to traverse once does not make a destructive lazy
projection safe for every consumer; neither is it proof of a current defect.
Keep the claim tied to the actual path and proposed alternative.

Before rejecting a proposal, reconstruct its final signature, data ownership,
and call sites. Judge those, rather than constraints of the old signature that
the proposal explicitly changes. Separate values consumed at last use from
callbacks or state needed again later.

## Counterfactual And Optional Ablation

Always reason through the deletion/replacement counterfactual. When a material
necessity or equivalence question remains testable, consider an isolated,
single-factor ablation: freeze the baseline, change only that construct, and
compare the behavior invariants through the same relevant checks. Use the
existing `verification-first` skill to choose falsifying checks and report
status, fidelity and evidence in the current Review Packet or task artifact.
Tests passing support only the exercised invariants; they do not prove an
uncovered contract unnecessary.

Execute an experiment only within granted edit/runtime authority, in an owned
reversible workspace. Review-only work may propose the experiment or use
source evidence. Do not require live ablation for every unit, modify unrelated
state, or add a parallel experiment protocol. Report inconclusive or unexecuted
experiments honestly; keep required boundaries when evidence is insufficient.

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
Keep/removal evidence: <requirement, strongest keep reason, counterfactual>
Runnable check: <narrow command/check, or unavailable reason>
```

### Capability Comparison Evidence

For a key block retaining multiple operations, wrappers, branches, or
intermediate state, make the operation-level comparison inspectable. Execute
the following steps in order before choosing its disposition, and record the
comparison in the existing disposition or referenced review evidence:

- **Block and purpose:** source anchor, actual operations and required results.
  Separate the operations being questioned from the behavior they must protect.
  Fix the applicable validation, defaults, errors, ordering and lifetime as
  constraints on the comparison; necessity of a protective check does not by
  itself establish necessity of surrounding calls or intermediate state.
- **Capability checked:** exact interface/implementation or production pattern
  inspected, with a source reference; a helper name or failed name search alone
  is insufficient. If unavailable, record the bounded search and remaining gap.
- **Alternative and keep reason:** construct the proposed final call form under
  those fixed behavior constraints, then test the strongest reason for
  retaining the current operations against its actual semantics. Preserve
  protective checks and local state when their removal is not the operation
  being questioned. Rejecting a candidate that drops a required boundary
  rejects that candidate, not every simplification of the block; check whether
  the existing capability can simplify the operations while keeping the boundary.
  Record the source-backed semantic difference that accepts or defeats the
  keep reason. A difference in input categories alone
  is not proof that an interface needs separate calls; inspect per-operation
  options and failure behavior before deciding.
- **Safety and disposition:** preserve defaults, validation, failure propagation,
  evaluation order/count, ownership and temporary lifetime as applicable;
  choose keep/simplify/replace/remove/needs decision and state validation limits.
  A keep reason must explain why the questioned operations are needed, not just
  why some other part of the block must remain. An unverified equivalent call
  form or a comparison against different behavior remains a coverage gap.

An inline paragraph can supply all four facts. Group trivial blocks only when
purpose, inspected capability, invariants and disposition are shared. Split out
a key block whose keep reason differs; a function-level row must not hide it.
No exhaustive table or new artifact is required. An unavailable comparison
supports a gap, not a checked keep decision or `NO_SAFE_SIMPLIFICATION`.

For example, a batch reader may allow a failure policy on each read. Different
required/optional inputs do not justify separate batches if the same call form
preserves their defaults and errors. Retain a pre-read type check when an
optional policy also suppresses malformed values. Conversely, keep batches
separate when a required validation or observable side effect must occur
between them and the batch interface cannot express that boundary. Cite that
boundary; neither shorter code nor identical helper names decide equivalence.
Rejecting an unchecked batch reader supports retaining the type check; it does
not establish that multiple reads must remain separate. Evaluate the checked
call form before accepting that keep conclusion.
