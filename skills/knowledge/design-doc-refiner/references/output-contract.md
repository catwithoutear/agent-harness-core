# Design Doc Refiner Output Contract

Use this contract unless the user requests another structure.

## Output Sections

Return these sections in order:

1. Improved Design Document
2. Ambiguities / Missing Information
3. Implementation Task Breakdown

## Implementation-Readiness Gate

Before returning the document, check whether it answers these questions:

| Gate | Pass Condition | If Missing |
|---|---|---|
| Change surface | Affected modules, contracts, data, workflows, and users are identified at the most specific level supported by the input. | Add an ambiguity instead of inventing names. |
| Failure behavior | Retry, rollback, cleanup, interruption, idempotency, and concurrency are covered where relevant. | Add a failure-behavior open question. |
| Verification | Tests or manual checks map to goals, risks, and compatibility concerns. | Add validation tasks and missing test questions. |
| Compatibility | Old data, old callers, defaults, migration, and rollback are addressed when contracts or persistence change. | Add compatibility questions. |
| Task split | Tasks are reviewable slices, not vague work themes. | Split by module, contract, data, validation, or rollout boundary. |

## Improved Design Document Structure

```markdown
# Title

## Background

State the problem, trigger, affected users or operators, and why behavior needs
a design change.

## Goals

List concrete outcomes this design must achieve.

## Non-goals

List related work that is explicitly out of scope.

## Current Behavior

Describe the existing module, workflow, interface, data structure, or
operational behavior when relevant to implementation.

## Proposed Design

Describe the core approach and main control/data flow.

## Detailed Design

### Module Changes

| Module / Component | Change | Reason | Notes |
|---|---|---|---|

### API / Interface Changes

| Interface | Input | Output | Error / Failure Behavior | Compatibility |
|---|---|---|---|---|

### Data Structure Changes

| Structure / Field | Meaning | Persistence / Compatibility | Default / Migration |
|---|---|---|---|

### Workflow

Use numbered steps. Include normal path and important failure paths.

### Error Handling

Describe retry, rollback, cleanup, interruption, idempotency, and concurrent
execution behavior.

### Compatibility

Describe old data, old API callers, default values, upgrade behavior, and
rollback behavior.

### Performance Impact

Describe CPU, memory, I/O, network, lock, cache, index, and scale impact when
relevant.

## Test Plan

| Test Type | Scenario | Expected Result |
|---|---|---|

## Rollout / Migration / Rollback

Describe how to introduce, verify, disable, or revert the behavior.

## Risks

| Risk | Severity | Mitigation | Verification |
|---|---|---|---|

## Open Questions

| Question | Why It Matters | Suggested Resolution |
|---|---|---|

## Implementation Tasks

List ordered implementation tasks. Keep each task independently reviewable when
possible.
```

## Ambiguities / Missing Information

Use this table:

| Item | Why It Matters | Suggested Resolution |
|---|---|---|

Rules:

- Include contradictions and missing implementation details.
- Do not silently resolve conflicts.
- Distinguish missing facts from assumptions.

## Implementation Task Breakdown

Use this table:

| Task | Module | Description | Risk | Suggested Order |
|---|---|---|---|---|

Rules:

- Tasks should map to modules, interfaces, tests, or reviewable slices.
- Include validation work, not only implementation work.
- Do not create fake file names or APIs to make the plan look concrete.
