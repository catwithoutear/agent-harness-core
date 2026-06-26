---
name: verification-first
description: Use when choosing, writing, running, or reporting the smallest credible validation loop for a change, including tests, builds, artifact checks, command evidence, or verification gaps.
---

# Verification First

Choose the smallest credible feedback loop before claiming a design, fix, or
implementation is safe. If validation did not run, say so and record the gap.

## Core Rule

Validation is part of the plan, not a final decoration. Every task slice should
know what evidence would prove it and how to report missing evidence honestly.

## Boundaries

Use this skill for:

- selecting validation while writing proposal, design, or task slices;
- choosing a reproducer command for a known behavior;
- deciding whether a build, unit test, integration scenario, artifact validator,
  or manual/source check is the minimum credible loop;
- reporting `verified`, `not run`, `blocked`, or `partial` evidence.

Do not use it to diagnose an unknown failure by itself; use `diagnose` first.
Do not treat document validation, formatting, or a broad build as behavioral
proof unless that is the whole change surface.

## Feedback Loop Selection

Prefer the narrowest loop that can falsify the risk:

1. artifact/schema validation for `.changes`, specs, generated docs, or package
   manifests;
2. formatting/static sanity checks;
3. focused unit tests or direct command checks;
4. integration or API scenario;
5. end-to-end or remote/product scenario only when lower-level evidence cannot
   cover the behavior;
6. source review as partial evidence only when execution is unavailable.

Do not run tests before the relevant build or generated artifact exists. If a
pre-existing build or fixture is reused, record that assumption.

## Validation Fidelity

When a local or narrower check stands in for a broader release, CI, integration,
or product gate, label how much it can prove:

| Fidelity | Meaning |
|---|---|
| `exact` | Same repository-owned command, configuration, fixture class, and execution surface as the target gate. |
| `equivalent` | Different wrapper, but materially the same executable, inputs, environment contract, and assertions. |
| `approximate` | Useful early signal, but it omits part of the target environment, generated inputs, external service, template, or orchestration path. |
| `remote-only` | No credible local substitute exists; the target remote/product gate remains authoritative. |

Rules:

- Pair status with fidelity, such as `verified (exact)` or `not run
  (remote-only)`.
- Do not claim an `approximate` check proves the broader gate.
- Do not upgrade fidelity because a check passed; fidelity describes coverage
  shape, not outcome.
- If a repository-owned script reports fidelity, quote that label rather than
  inventing a stronger one.
- If no fidelity can be determined, report `partial` and name what is missing.

## Change Shape Matrix

| Change shape | Minimum credible loop |
|---|---|
| `.changes`, skill, rule, or docs only | artifact validator plus static check |
| parser/helper behavior | focused unit or command check for the changed behavior |
| API/CLI contract | contract artifact validation plus focused scenario |
| state transition or lifecycle logic | success and failure scenario where feasible |
| migration/compatibility behavior | old and new data/config examples |
| remote integration behavior | local checks first, then remote/product scenario if required |

## Evidence Format

Record validation in `tasks/*.md`, review packets, handoff notes, or release/MR
text:

```text
Validation:
- <command or check>: verified (exact)
- <command or check>: verified (equivalent)
- <command or check>: not run (remote-only; <reason>)
- <command or check>: blocked (<environment, approval, dependency, or missing build>)
- <evidence source>: partial / approximate (<what it proves and does not prove>)
```

Use status terms precisely:

- `verified`: command/check ran and passed;
- `not run`: skipped intentionally, with reason;
- `blocked`: could not run because of environment, dependency, approval, or
  missing artifact;
- `partial`: only lower-level, indirect, or source-review evidence exists.

## Integration Points

- Feed validation targets into `change-planner` task slices.
- Feed executed evidence into `review-packet-gate`.
- Re-run after implementation fixes or review-driven replanning.
- Use `change-workspace-operator` for artifact validation commands in
  repositories that provide regulated change tooling.

## Example Validation Record

```text
Validation:
- harness-change-validate --repo-root . --change change-123: verified (exact)
- unit test for parser preserving unknown fields: verified (equivalent)
- API compatibility scenario: not run (remote-only; requires deployed service)
- source review of rollback path: partial / approximate (confirms branch path, not runtime behavior)
```

## Common Mistakes

- Saying "should pass" after only reading code.
- Running a broad build and calling it behavioral verification.
- Reporting a local approximation as if it proves the remote or product gate.
- Omitting exact command, environment, or reason a check was skipped.
- Omitting fidelity when a check stands in for a broader gate.
- Failing to rerun validation after review fixes.
