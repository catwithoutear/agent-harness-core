---
name: diagnose
description: Use when diagnosing a bug, failed test, production symptom, log anomaly, regression, reproducer gap, or unclear root cause before proposing or editing code.
---

# Diagnose

Diagnose before fixing. Use this skill when a failure exists but the cause,
feedback loop, or minimal change surface is not yet source-proven.

## Core Rule

Build the feedback loop before the fix. A diagnosis is ready only when the
failing behavior, candidate path, falsifiable hypotheses, and source-backed root
cause are recorded.

## Boundaries

Use this skill for:

- failed tests, regressions, log anomalies, production symptoms, and unclear
  reports;
- reproducer gaps and feedback-loop selection for a defect;
- distinguishing unsupported input, caller misuse, runtime failure, and product
  intent gaps;
- root-cause evidence that will feed `change-planner`.

Do not use it for:

- ordinary code review;
- broad architecture orientation with no symptom; use `architecture-scout`;
- implementation after root cause and fix path are already proven;
- validation reporting alone; use `verification-first`.

## Diagnosis Loop

1. State the symptom in observable terms: input, environment, actual result,
   expected result, and source of the report.
2. Locate or create the active change through `change-workspace-operator` when
   the diagnosis is non-trivial.
3. Establish the smallest useful feedback loop:
   - existing test case,
   - focused command or API call,
   - log replay or script,
   - product scenario only when lower-level evidence cannot cover it.
4. Trace the runtime or artifact path in source: entry, coordinator, model,
   persistence, executor, state transition, or output boundary as relevant.
5. Compare with at least one local precedent before adapting behavior.
6. Form one active hypothesis at a time. For each hypothesis, record expected
   evidence, the check performed, observed result, and decision.
7. Stop when root cause has a believable failure path and a minimal change
   surface, then hand off to `change-planner`.

## Research Artifact

Record diagnosis in `.changes/<change>/research.md` or the repository's
equivalent artifact:

- symptom and report source,
- reproduction status,
- feedback loop used or why none exists yet,
- affected path and ownership boundary,
- rejected hypotheses,
- confirmed root cause,
- minimal change surface,
- validation plan for the eventual fix.

## Hypothesis Table

```markdown
| Hypothesis | Evidence expected if true | Check performed | Result | Decision |
|---|---|---|---|---|
| | | | confirmed / rejected / unknown | |
```

Only one hypothesis should be active at a time. If a check cannot distinguish
between hypotheses, it is not a useful feedback loop yet.

## Example Diagnosis

```text
Diagnosis:
- Symptom: import command returns success while the output file is missing.
- Feedback loop: focused command reproduces the missing artifact.
- Runtime path: CLI -> command handler -> planner -> writer finalizer.
- Root cause: finalizer error is logged but not propagated to the command result.
- Minimal change surface: finalizer result propagation and command status mapping.
- Rejected hypotheses: parser option loss; output path normalization.
- Validation plan: focused finalizer failure test plus command-level scenario.
```

## Common Mistakes

- Treating a passing broad build as a reproducer.
- Searching for an error string and ignoring caller state.
- Patching code because an issue looks likely before a falsifiable check exists.
- Leaving the root-cause trail only in chat instead of the change artifact.
