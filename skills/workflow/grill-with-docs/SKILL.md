---
name: grill-with-docs
description: Use when stress-testing a plan, proposal, design, terminology choice, or implementation direction against repository artifacts, specs, memory, and source before coding.
---

# Grill With Docs

Challenge a planning artifact against the repository's owned evidence: change
artifacts, specs, memory/context docs, rules, and source code. Resolve
decisions in the owning artifact instead of creating parallel glossary or
decision-log roots.

## Core Rule

If source or existing artifacts can answer a question, inspect them before
asking the user. User attention is for decisions that evidence cannot settle.

## When Not To Use

- Before the task has a concrete draft, proposal, plan, design, detailed design,
  selected approach, terminology choice, or decision under discussion.
- As a substitute for formal design readiness or freeze review. Use
  `multi-lens-design-review`.
- As a substitute for source discovery, approach generation, or design
  rewriting. Use `architecture-scout` or `design-doc-refiner`.
- As a substitute for implementation review after code is written.
- For a pure document polish pass. Use `technical-doc-refinement`.
- For a user-only interactive plan interview with no repo artifacts. Use
  `grill-me`.

## Session Flow

1. Locate the active change or planning artifact using the target repository's
   documented command or index.
2. Read relevant specs, memory/context entries, rules, and source paths.
3. For open-ended planning-artifact challenge requests, run the
   `Planning Artifact Challenge Pass` before asking product or scope questions.
   Otherwise ask one decision question at a time.
4. Provide a recommended answer, concern list, or verdict with evidence.
5. Update only the repository-owned artifact when the user asks you to apply
   resolved decisions.
6. Keep long-lived memory updates for verified mainline facts, not debate notes.

## What To Challenge

- Does the artifact match the initiating task and documented constraints?
- Does it change public behavior, API contracts, serialized data,
  configuration, persistence, recovery, or compatibility?
- Are terms used consistently with the repository's vocabulary?
- Are unsupported input, caller misuse, and runtime failure distinguishable?
- Is the work sliced by behavior rather than file ownership?
- Are validation and rollback concrete enough for another engineer?
- Is a refactor hidden inside a bug fix?
- For detailed designs, are topology, file ownership, dependency order, and
  verification claims concrete enough to challenge before a formal readiness
  gate?

## Planning Artifact Challenge Pass

When the user asks to challenge a draft, proposal, plan, design, detailed
design, or selected approach before coding, keep the pass read-only and
evidence-first:

1. Extract explicit and implicit assumptions. Treat them as the attack surface.
2. Verify factual claims against artifacts or source: file paths, API behavior,
   call paths, constraints, and compatibility claims. Mark unverified claims as
   unknown instead of accepting them.
3. Run a pre-mortem: assume the plan was implemented and failed later, then
   name 3-5 realistic failure scenarios.
4. Categorize concerns as correctness, completeness, performance,
   maintainability, compatibility, or validation risk.
5. Classify each concern as `Blocking`, `Significant`, or `Minor`.
6. Propose an alternative or fix for every `Blocking` concern.
7. Render a verdict using the shared readiness vocabulary: `READY`,
   `READY_WITH_NOTES`, `NOT_READY`, or `NEEDS_USER_DECISION`.

Do not create a new task structure, generate a design, or declare a formal
freeze/readiness gate just to run this pass. Use an in-session checklist for
non-trivial challenges, and write back only to the active repository-owned
artifact when the user asks or the workflow requires a review record.

## Challenge Output

Use this compact shape when the user asks for a planning-artifact challenge:

```text
Assumptions:
- <assumption> | status=<verified|disputed|partial|unknown> | evidence=<path, command, or artifact>

Pre-mortem:
- <failure scenario, trigger, and impact>

Concerns:
- [<Severity>] <Category>: <concern>. Evidence: <path or artifact>. Fix: <alternative or next decision>.

Verdict: <READY|READY_WITH_NOTES|NOT_READY|NEEDS_USER_DECISION>
```

## Decision Record

When writing back to an artifact, use this compact shape:

```text
Decision: <short name>
Question: <one precise decision>
Recommended answer: <chosen direction>
Evidence: <artifact/spec/source references>
Rejected alternative: <why not>
Impact: <files, contract, validation, or rollback effect>
```

## Stop Conditions

Stop grilling when:

- every open decision has an answer or named blocker,
- source has answered all code-discoverable questions,
- terminology and behavior deltas are recorded in the owning artifact,
- remaining uncertainty is product or risk tolerance.

## Common Mistakes

- Asking questions the code can answer.
- Inventing a parallel planning, glossary, or decision-record structure.
- Rewriting the whole plan before decisions are explicit.
- Asking multiple unrelated questions at once.
