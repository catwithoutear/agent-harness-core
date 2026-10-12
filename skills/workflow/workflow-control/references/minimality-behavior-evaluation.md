# Minimality Behavior Evaluation

Use this evaluation only to measure whether a harness instruction or role change
improves implementation or proactive review behavior. It is not a substitute for repository tests,
and source-text assertions or successful projection do not count as behavior
evidence.

## Fair A/B Contract

Compare two real agent runs that edit the same seeded backend repository task:

- **Baseline:** the same agent client with the candidate minimality changes
  absent.
- **Candidate:** the same agent client with only the candidate harness changes
  present.

Hold the client, model, reasoning settings, tool permissions, seed revision,
ticket, environment, time limit, and allowed commands constant. Run each arm in
a fresh isolated workspace and ensure baseline discovery cannot load candidate
skills, roles, hooks, rules, or user-global instructions.

Do not compare a bare conversational model with an agent editing files. Do not
reuse one arm's workspace, context, or generated artifacts in the other arm.
Record the exact revisions and material settings used; do not add a new durable
state or evidence protocol for the run.

Verify isolation using delivered instruction metadata and public tool calls
and readbacks; a fresh workspace or fork alone does not prove it. Account for
automatically supplied memory and global skill routing. Freeze the allowed
context, including common client-provided instructions and the public tool
definitions and routing delivered to each arm. If actual delivery cannot be
verified, mark the affected controlled comparison `INCONCLUSIVE`. Candidate guidance,
task-specific evidence or prior results delivered outside that context
invalidate isolation even without a tool read. Reading any unassigned source
or rule also invalidates isolation. Preserve the first report, mark the
deviation and exclude the arm from the controlled treatment comparison.
Freeze corrected allowed inputs before a fresh rerun; do not silently repair
the original record. Do not inspect private model reasoning.

Record the nominal time cap and actual inspection/termination times separately.
After closing inspection, allow only sealing of existing observations and gaps.
An observed overrun cannot support a strict equal-budget or cost claim.

## Backend Scenario Set

Use the smallest backend scenario set that covers the changed decision contract.

| Scenario | Seed and ticket | Hard behavior gates | Minimality observation |
|---|---|---|---|
| `shared-owner-fix` | Two account operations use one debit rule; the ticket reports overdraft through one operation. | Normal debit still works; neither operation can overdraw; callers receive the existing error contract. | Did the agent trace and fix the authoritative shared rule instead of patching only the named leaf or adding parallel validation? |
| `native-platform-reuse` | A service already deploys with a supported operating-system scheduler; the ticket asks for periodic cleanup. | Cleanup executes with the required schedule, identity, failure visibility, and existing deployment contract. | Did the agent reuse the supported scheduler rather than add an in-process scheduler, daemon, or dependency? |
| `safety-floor` | A backend path helper receives an untrusted filename; the ticket asks it to return an upload path. | Normal names resolve below the base directory; traversal is rejected; the existing error style is preserved. | Did fewer lines or files drop validation, error behavior, or the runnable regression check? |

Adapt filenames and commands to the seeded repository, but keep the behavior
questions stable. Add a scenario only when a changed harness rule has no coverage
in this set; do not build a broad benchmark catalog by default.

## Review Opportunity Calibration

For a change in review discovery, use the same fair isolation contract with a
read-only review task. Freeze source, task intent, allowed context and the
expected opportunities before dispatch. Keep expected answers and prior user
suggestions out of both review packets. Use source-backed project miss cases
in the applicable overlay; Core examples remain language and project neutral.

| Case | Positive opportunity | Negative control |
|---|---|---|
| Operation/result reuse | A helper combines policy with manual formatting; an existing formatter covers only the formatting. | A fixed literal needs no formatter, or output/error semantics differ. |
| Algorithm/result fit | Search produces a position used only for existence; a supported predicate algorithm matches the contract. | The caller needs the position, key lookup, or full evaluation for required side effects. |
| Necessity | A wrapper/assertion/intermediate state protects no required distinction or invariant. | The same-looking construct enforces an external contract or failure diagnostic. |
| Ownership/evaluation | A destructive projection moves data during lazy dereference although explicit final consumption is clearer. | A pure reference projection or proven last-use move with the intended traversal. |
| Proposed alternative | A by-value final-use input can replace redundant local state. | A reused callback/state must remain available to later consumers. |
| Comparison under fixed behavior | Repeated adjacent operations can use an existing per-operation policy while retaining validation, defaults and local destinations. | A required validation or observable action must occur between operations and the combined interface cannot express it. |
| Projection and construction | A pure no-argument, value-returning member projection can use a supported eager collection capability. | Composite construction, output parameters, filtering, moves or failure short-circuiting require a different comparison; do not redesign interfaces solely to fit the projection. |

Score proactive detections separately from suggestions adopted after a user
prompt. Name missed valid opportunities, false positives, evidence quality,
behavior regressions and review cost. A useful finding identifies the exact
operation and an equivalent simpler mechanism or a concrete keep reason; an API
name alone earns no detection credit. A clean review, more rounds, fewer lines,
or agreement after prompting cannot establish better recall. A calibration
instrument must distinguish both positive and negative cases before a live A/B.

Evaluate coordinator acceptance separately from reviewer discovery. Supply a
fresh coordinator with the same frozen source and neutral candidate reports:
one rejects an alternative that drops a required safeguard and then claims the
whole block must stay; another compares the actual operations with safeguards
preserved; a negative control cites a real intervening boundary. Require the
coordinator to identify the mismatched comparison as unsubstantiated, request a
bounded source check or follow-up, and accept the concrete keep reason only
when its cited boundary matches the source. Do not put expected verdicts in the
dispatch or count prompted repair as proactive discovery. This is semantic
evaluation by an agent or human, not a text-pattern validator or proof that all
future coverage gaps will be caught.

Include acceptance with an explicit unresolved coverage signal followed by a
no-findings report: require evidence that resolves that named gap, not merely
proof that another pass ran. Also change an operation during a fix and check
that its earlier comparison is not reused for the new result combination.
Score a supported bounded claim separately from an unsupported broader claim;
do not reward extra return requests for exclusions already stated in the report.

Exercise the return as well as the first verdict: preserve the first report,
give only the named comparison gap to its owner, and inspect the corrected
comparison or explicit uncovered result. Record this as prompted recovery,
separately from autonomous discovery. Check that unresolved owner evidence
blocks acceptance and that a real intervening boundary remains protected.
For formal-record tests, exercise pending attempts, `not-covered` closure,
immutable prior results, duplicate relations and a corrected successor using
the existing runtime. Synthetic receipts in these tests verify protocol
behavior, not real provider isolation or model judgment.

## Instrument Self-Check

Before any live agent run, prove each deterministic checker with two references:

1. a complete safe reference must pass every hard gate;
2. a plausible short or leaf-only reference must fail the gate it is meant to
   detect.

If a checker cannot distinguish those references, repair the checker before
spending a live run. For any qualitative over-engineering judgment, compare a
minimal reference with a deliberately over-built but behaviorally correct
reference; require the judgment to name the unnecessary construct and rank the
over-built reference worse. Otherwise report that dimension as inconclusive.

## Scoring Order

Evaluate in this order:

1. **Correctness:** requested normal behavior works.
2. **Safety and compatibility:** adversarial/failure behavior and existing
   contracts remain intact.
3. **Completeness:** the requested task is implemented rather than stubbed or
   skipped.
4. **Minimality signals:** only among submissions that pass the hard gates,
   compare production lines changed, production files changed, new dependencies,
   new concepts/state/extension points, selected ladder level, shared-owner fit,
   and presence of the narrow runnable check.

Track tests and runnable checks separately as positive evidence; do not count
them as production bloat. Size alone cannot win, and a null result is valid when
both arms converge on the same adequate solution.

## Run Sequence

1. Freeze the baseline and candidate harness revisions and the seed revision.
2. Self-check every deterministic instrument with its good and bad reference.
3. Create fresh isolated workspaces for every arm and run.
4. Execute the same task through the same agent client and settings.
5. Run the deterministic behavior gates against the files each agent leaves.
6. Compare minimality signals only for gate-passing submissions.
7. Use repeated runs when the agent is stochastic; report per-scenario results
   and variance rather than only one aggregate percentage.
8. Preserve raw output only in an explicitly owned run location, or remove it
   after scoring. Never commit credentials, client caches, or unowned workspaces.

## Result Record

```text
Evaluation status: LIVE_AB_COMPLETE | LIVE_AB_NOT_RUN | INCONCLUSIVE
Baseline/candidate revisions: <exact revisions>
Client/model/settings: <same settings or mismatch>
Isolation check: <pass/fail and evidence>
Delivered context/tools: <per-arm public definitions/routing and evidence, or unknown>
First report and isolation deviations: <preserved original and excluded arms>
Fresh rerun: <corrected allowed-context revision and report, or not run>
Time: <nominal cap, actual inspection/termination and sealing times>
Instrument self-check: <pass/fail per scenario>
Hard gates: <correctness, safety/compatibility, completeness per arm>
Minimality signals: <only gate-passing runs>
Review discovery: <proactive hits, misses, prompted adoption, false positives, cost>
Conclusion: <improvement, regression, null result, or inconclusive>
Limitations: <scenario, run-count, environment, or unexecuted-live-run limits>
```

`LIVE_AB_NOT_RUN` is the honest result when provider/client execution, model
choice, credentials, cost, or environment authority has not been granted. Do not
replace it with projection tests, prompt inspection, or an estimated saving.
