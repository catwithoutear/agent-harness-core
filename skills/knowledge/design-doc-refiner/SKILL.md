---
name: design-doc-refiner
description: Use when turning rough technical notes, issue analysis, or draft designs into implementation-ready design documents with contracts, risks, tests, and task slices.
---

# Design Doc Refiner

Convert rough technical input into an implementation-ready design document. Do
not merely polish language. Restructure, clarify, expose assumptions, and make
the result useful for implementation, review, and validation.

## Core Rule

A refined design is ready only when an implementer can identify what changes,
what does not change, which contracts are affected, how failures behave, and
how the result will be verified. If the input does not support that specificity,
preserve the gap as an ambiguity instead of inventing detail.

## Workflow

1. Identify audience, system boundary, output format, and review-only vs rewrite
   intent.
2. Separate source facts, inferred assumptions, contradictions, and open
   questions.
3. If the user asks for review-only output, do not rewrite the document. Return
   findings, ambiguity questions, and readiness notes only, or use
   `multi-lens-design-review` when a formal readiness decision is needed.
4. Read `references/output-contract.md` before drafting a rewritten or refined
   document.
5. Preserve existing terminology unless it is ambiguous; define new terms near
   the first use.
6. Produce the refined design, ambiguity table, and implementation task
   breakdown only when rewrite/refinement is in scope.
7. Do not choose between unresolved product, ownership, or policy alternatives
   without evidence or user input.

## Scope Packet

Before choosing an approach, preserve the confidence of claims that affect the
design:

- confirmed source facts with artifact or source references;
- disputed claims where repository evidence conflicts with the request;
- unverifiable claims that must remain assumptions or questions;
- outcome expectations, non-goals, constraints, code landscape, risk areas, and
  scoping confidence.

Do not turn disputed or unverifiable claims into implementation tasks. Keep
them visible in the refined document or ambiguity table until evidence or the
user resolves them.

## Approach Selection

When more than one credible approach exists, include a short approach-selection
pass before writing implementation tasks:

- success criteria for the selected direction;
- the status quo and reusable repository patterns;
- 1-3 viable alternatives with tradeoffs;
- the recommended approach and why it wins for this task;
- any research boundary, with external research used only when the decision
  depends on public APIs, libraries, standards, or other non-repository facts.

This is not a challenge pass. Use `grill-with-docs` when the selected approach
needs evidence-backed pressure testing before coding.

## Refinement Rules

- Convert vague claims into concrete implementation statements.
- Preserve technical accuracy over prose quality.
- Mark inferred details as assumptions.
- Do not invent APIs, fields, classes, files, states, schemas, protocols, or
  build targets unless they are clearly implied by the source input.
- Prefer tables for module changes, interface changes, risks, compatibility,
  and tests.
- Prefer numbered steps for workflows and failure paths.
- Use diagrams only when they clarify ownership, data flow, control flow, or
  state transitions.
- Keep task slices reviewable and tied to validation.

## Mini Example

Input:

```text
Improve import cleanup. Failed imports sometimes leave temporary records.
Need better retry and cleanup.
```

Good refinement:

- defines the cleanup phase for success, retry exhaustion, and cancellation,
- states that allocated resources must be tracked before side effects occur,
- asks which component owns the cleanup list instead of inventing a class,
- adds validation for success, retryable failure, final failure, cancellation,
  and idempotent cleanup.

Bad refinement:

- says "the import module will be more robust" without ownership, failure
  behavior, compatibility, or tests,
- invents `ImportCleanupManager` when no input identifies that boundary.

## Review-Only Output

When the request is "review this design", "find gaps", "is this ready", or
otherwise review-only:

- do not produce a full rewritten design,
- do not silently fix wording or structure,
- report confirmed blockers, ambiguities, and missing implementation contracts,
- include exact source text that motivated each issue,
- end with a readiness recommendation or route to `multi-lens-design-review`.

## Relationship To Other Skills

- Use `design-code-explainer` after implementation exists and the goal is to
  map code back to design.
- Use `multi-lens-design-review` when the goal is readiness review rather than
  rewriting or refining.

## Common Mistakes

- Hiding missing facts inside polished prose.
- Creating fake precision by inventing file names or APIs.
- Producing tasks that are work themes rather than reviewable slices.
- Treating validation as an appendix instead of part of implementation
  readiness.
