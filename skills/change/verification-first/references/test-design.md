# Test Design

Use for behavior, regression, or fault-path checks. This reference grants no
edit or execution authority. Within an already authorized implementation or
testing task, do not request repeated approval for each test. In review or
planning, record checks outside existing authority as proposals or gaps;
continue already authorized inspections and checks.
It does not require TDD or changes to a settled public API.

## Observable Boundary And Expected Results

Use the narrowest stable boundary that exposes the risk. Preserve relevant
caller order, repeated calls, and state; record what a narrower proxy omits.
Prefer a caller-visible contract or stable local seam over private state.
Take expected results from requirements, known-good literals, worked examples,
fixtures, or an independently justified model. Repeating the production
algorithm inside an assertion does not provide independent evidence.

## Bounded Increments

Where implementation includes tests, keep each increment centered on one
behavior or failure contract and the supporting implementation. This supports
test-first work without imposing a red-green ritual or horizontal test batches.

## Substitutions And Controlled Failure

Prefer affordable real components and representative fixtures. Substitute
external, volatile, unavailable, or unsafe effects when necessary. An internal
fake may be justified by otherwise inaccessible fault injection, legacy
coupling, or interaction/order that is itself contractual. State the reason,
observable assertion, and material coverage gap using existing fidelity terms.
Do not change production boundaries solely to make a private step mockable.

## Intentional Perturbation

If a check deliberately changes code, fixtures, or fault state, confirm that
the intended condition reached the actual execution target. Compare with the
baseline or observe the state directly; verify the rebuilt artifact when
compiled code changed. An unrelated setup failure is not the predicted signal.
Restore temporary state. Do not create a mutation merely to satisfy this rule.

## Regression Closure

A minimized case is useful only when it retains the real failure pattern.
After a fix, rerun an existing original scenario or record why it was not run.
A narrow passing check does not prove omitted paths.
