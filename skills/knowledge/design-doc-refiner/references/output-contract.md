# Design Doc Refiner Output Contract

Use this contract unless the user requests another structure.

## Reader-Facing Design And Plan

Apply this presentation guidance when sharing a solution design or implementation
plan with the user. It does not replace required design sections, ordered task
slices, or readiness gates.

- Lead with observable behavior or guarantees: what someone can do, what changes
  on success or failure, and which relevant behavior stays outside the scope.
  Group that overview by behavior, then expand into mechanisms and source
  locations. Keep execution steps in dependency order.
- Make the overview understandable without opening every detail. Keep failure
  behavior, material risks, uncertainty, and validation gaps visible; use short
  sentences in the user's language rather than fixed word or nesting limits.
- Support each material behavior with the most useful evidence or illustration:
  a before/after example, state transition, call path, schema, or code excerpt.
  Use current source anchors for existing code. Label proposed code and mockups
  as sketches; do not invent existing paths or line numbers.
- Place each unresolved decision beside the behavior or mechanism it changes.
  Explain the meaningful options, the recommendation and its reason, and the
  effect on scope, behavior, compatibility, or validation. Give decisions stable
  labels when other artifacts or feedback need to refer to them.
- Ask only about choices that affect the solution and cannot be resolved from
  accepted requirements, existing authorization, or current evidence. Do not
  manufacture a question quota or reopen settled decisions. Unselected options
  and unopened defaults are not approval; pause only dependent work when a user
  decision is required, following `workflow-control:Continuous Convergence`.
- Choose the smallest useful presentation through `show-me` when a visual helps.
  Use HTML when navigation, comparison, or contextual feedback materially helps
  the reader; a short plan can remain Markdown.

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

## Behavior Summary

Describe the observable changes or preserved guarantees before implementation
detail. Apply Reader-Facing Design And Plan above.

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
