---
name: grill-with-docs
description: Use when stress-testing a plan, proposal, design, terminology choice, or implementation direction against repository artifacts, specs, memory, and source before coding.
---

# Grill With Docs

Challenge a plan against the repository's owned evidence: change artifacts,
specs, memory/context docs, rules, and source code. Resolve decisions in the
owning artifact instead of creating parallel glossary or decision-log roots.

## Core Rule

If source or existing artifacts can answer a question, inspect them before
asking the user. User attention is for decisions that evidence cannot settle.

## When Not To Use

- Before the task has a concrete plan, proposal, or decision under discussion.
- As a substitute for implementation review after code is written.
- For a pure document polish pass. Use `technical-doc-refinement`.
- For a user-only interactive plan interview with no repo artifacts. Use
  `grill-me`.

## Session Flow

1. Locate the active change or planning artifact using the target repository's
   documented command or index.
2. Read relevant specs, memory/context entries, rules, and source paths.
3. Ask one decision question at a time.
4. Provide a recommended answer and the evidence behind it.
5. Update only the repository-owned artifact when the user asks you to apply
   resolved decisions.
6. Keep long-lived memory updates for verified mainline facts, not debate notes.

## What To Challenge

- Does the plan match the initiating task and documented constraints?
- Does it change public behavior, API contracts, serialized data, configuration,
  persistence, recovery, or compatibility?
- Are terms used consistently with the repository's vocabulary?
- Are unsupported input, caller misuse, and runtime failure distinguishable?
- Is the work sliced by behavior rather than file ownership?
- Are validation and rollback concrete enough for another engineer?
- Is a refactor hidden inside a bug fix?

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
