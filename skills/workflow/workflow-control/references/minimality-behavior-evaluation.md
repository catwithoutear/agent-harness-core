# Minimality Behavior Evaluation

Use this evaluation only to measure whether a harness instruction or role change
improves implementation behavior. It is not a substitute for repository tests,
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
Instrument self-check: <pass/fail per scenario>
Hard gates: <correctness, safety/compatibility, completeness per arm>
Minimality signals: <only gate-passing runs>
Conclusion: <improvement, regression, null result, or inconclusive>
Limitations: <scenario, run-count, environment, or unexecuted-live-run limits>
```

`LIVE_AB_NOT_RUN` is the honest result when provider/client execution, model
choice, credentials, cost, or environment authority has not been granted. Do not
replace it with projection tests, prompt inspection, or an estimated saving.
