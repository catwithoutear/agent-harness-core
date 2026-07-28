# Design Doc Refiner Output Contract

Use this contract unless the user requests another structure.

## Output Sections

Return these sections in order:

1. Improved Solution Design
2. Ambiguities / Missing Information
3. Validation Intent

## Solution-Design Readiness Gate

Before returning the document, check whether it answers these questions:

| Gate | Pass Condition | If Missing |
|---|---|---|
| Change surface | Affected modules, contracts, data, workflows, and users are identified at the most specific level supported by the input. | Add an ambiguity instead of inventing names. |
| Failure behavior | Retry, rollback, cleanup, interruption, idempotency, and concurrency are covered where relevant. | Add a failure-behavior open question. |
| Verification | Tests or manual checks map to goals, risks, and compatibility concerns. | Add validation gaps and missing test questions. |
| Compatibility | Old data, old callers, defaults, migration, and rollback are addressed when contracts or persistence change. | Add compatibility questions. |
| Downstream readiness | The design is clear enough to assess whether implementation design is required. | Preserve the missing ownership or topology fact as an ambiguity. |

## Improved Solution Design Structure

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

```

## Ambiguities / Missing Information

Use this table:

| Item | Why It Matters | Suggested Resolution |
|---|---|---|

Rules:

- Include contradictions and missing implementation details.
- Do not silently resolve conflicts.
- Distinguish missing facts from assumptions.

## Validation Intent

Use this table:

| Goal or Risk | Planned Evidence | Success Condition | Known Gap |
|---|---|---|---|

Rules:

- Map planned evidence to solution goals, failure behavior, compatibility, and
  material risks.
- Keep unverified assumptions and unavailable environments explicit.
- Do not turn this section into implementation topology or task slices.

## Downstream Boundary

After this design is reviewed ready:

1. apply the implementation-design trigger;
2. create and review the topology pack when required;
3. use `change-planner` to derive formal task slices from the accepted upstream
   artifacts.
