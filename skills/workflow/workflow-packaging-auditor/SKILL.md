---
name: workflow-packaging-auditor
description: Use when auditing recent work history to identify repeated workflows worth packaging as skills, custom subagents, hooks, scripts, or automations.
---

# Workflow Packaging Auditor

## Purpose

Look back over my recent work from the last 30 days and identify repeated manual workflows worth packaging.

Convert repeated, costly, or error-prone work into the **smallest useful reusable asset**:

- **Skill**: repeatable checklist, playbook, decision tree, or command sequence.
- **Custom subagent**: bounded specialist role suitable for delegation.
- **Automation**: scheduled or condition-triggered check, report, reminder, or
  hook/script when the trigger belongs in repository tooling.
- **Extend existing**: improve an existing asset instead of creating a duplicate.
- **Skip**: leave unpackaged — weak evidence, unlikely recurrence, or already adequately covered.

NEVER create speculative, overlapping, or overly broad assets. Prefer **one narrow asset** over one broad asset. Prefer **reuse or extension** over duplication. Every created asset must be **easy to delete if wrong**.

---

## Evidence Priority

1. **Recent sessions and task summaries** — highest-confidence signal. Concrete sessions, diffs, issue summaries, explicit user requests.
2. **Memories and rollout summaries** — pattern detection across sessions; connect related work under different names.
3. **Chronicle, if enabled** — discovery only. Confirm important claims in source systems. Do not rely on Chronicle alone.
4. **Existing assets** — skills, custom agents, automations, hooks, scripts, templates, memory notes. Inspect BEFORE proposing new assets.

If a source is unavailable, state the limitation and continue with available evidence.

---

## Candidate Qualification Rules

**Only act on a candidate when ALL of the following hold:**

1. **Recurrence** — occurred at least twice, or clearly likely to recur and costly to repeat.
2. **Stable structure** — stable inputs, repeatable procedure, clear output or stopping condition.
3. **Material value** — packaging would improve speed, quality, consistency, reliability, auditability, or reduce context loading.
4. **Not already adequately covered** — existing assets don't already solve it well. If partially covered, extend instead.

**Skip the candidate when any of the following apply:**

- one-off task • weak evidence • unclear recurrence • unstable procedure • no obvious output
- too broad • too sensitive • primarily judgment-based with no reusable process
- already covered well enough • would require unavailable access/permissions
- turns a one-off task into permanent process • no clear trigger or notification rule (for automations)

---

## Form Selection

Choose the **smallest appropriate form**.

### Skill

A repeatable process that benefits from a checklist, playbook, decision tree, or command sequence.

Examples: recurring code review procedure, build failure triage, worktree setup and repair, release checklist, research synthesis workflow.

### Custom Subagent

A bounded specialist role or investigation that can be delegated independently. Must have: narrow mission, clear inputs, clear stopping condition, explicit output format, constraints on authority.

Examples: plan checker, regression-risk investigator, C++ include-order auditor, dependency-conflict analyst.

### Automation

A scheduled or condition-based recurring action. Must have: schedule/trigger, expected action, notification condition, failure behavior.

Examples: daily summary, weekly stale-branch report, periodic dependency check, failed-job monitor.

### Extend Existing

Use when an existing asset already covers 50%+ of the candidate. Prefer extension when: the new workflow is a variant, the current asset is missing only a step/check/command, or creating a separate asset would fragment behavior.

### Skip

Candidate is not ready. Common reasons: not enough evidence, unclear repeatability, too many special cases, no stable input/output, better solved by documentation than an active asset.

---

## Scoring Model

| Dimension | Score | What to look for |
|---|---:|---|
| Recurrence evidence | 0-3 | Multiple sessions, concrete instances, dates attached |
| Cost or time burden | 0-3 | Minutes wasted, context reloaded, mental re-derivation |
| Error-proneness | 0-3 | Steps frequently missed, wrong order, inconsistent result |
| Procedure stability | 0-3 | Same inputs/outputs each time, no hidden special cases |
| Clear output / stopping condition | 0-3 | Know when done, know what "good" looks like |
| Not already covered | 0-3 | Existing assets absent or clearly insufficient |

Internal score → confidence label:

| Score | Label | Action |
|---|---:|---|
| 15-18 | High | Create if missing or insufficiently covered |
| 11-14 | Medium | Shortlist; create only if evidence is concrete and asset is small |
| 7-10 | Low | Listed under "Needs More Evidence" |
| 0-6 | Very Low | Skip |

---

## Procedure

### Step 1: Establish review window

Use the last 30 days of available work history. If less, use all available. Record: earliest date, latest date, unavailable sources, assumptions.

Concrete methods:
- Scan `.memory/` entries — check timestamps, look for recurring themes across entries
- Query Chronicle timeline if enabled — extract date ranges and topic clusters
- Scan recent session transcripts or task records — count task types, look for repeated phrasing

### Step 2: Collect repeated-work evidence

**This is the most important step.** Quality of the final shortlist depends entirely on evidence quality.

Look for these signals using the specific methods described:

| Signal | How to detect |
|---|---|
| Similar task phrasing | Grep session logs for repeated nouns/verbs (e.g., "review MR", "setup worktree", "triage build") |
| Repeated troubleshooting | Scan for same error class appearing in multiple sessions; same debug commands run manually |
| Repeated command sequences | Look for 3+ commands run together more than once; check shell history if available |
| Repeated config edits | Scan for edits to same config files across sessions with similar patterns |
| Repeated research topics | Cross-reference `.memory/` entries and Chronicle topics for clustered themes |
| Repeated review criteria | Check for same checklist items or review comments appearing across MRs |
| Repeated manual status checks | Look for recurring `git status`, `git log`, build status, or system health queries |
| Recurring "how should I do X" | Search for explicit methodology or decision-seeking questions across sessions |
| Recurring correction of same issue class | Scan review findings or self-corrections for the same type of problem appearing repeatedly |

For each candidate, capture: workflow name, approximate dates, source evidence, observed repetition count, likely inputs/outputs, current manual burden, and overlapping existing assets.

### Step 3: Inspect existing assets

Before recommending creation, inspect: skills, custom agents, automation definitions, hooks, scripts, templates, memory notes, AGENTS.md / CLAUDE.md equivalents.

For each candidate, classify existing coverage as: none, partial, adequate, duplicative, or obsolete. Do not create a new asset if adequate coverage exists.

### Step 4: Score candidates

Apply the scoring model above. Convert raw scores to confidence labels. Do not expose raw scoring in output unless the user requests it.

### Step 5: Produce compact shortlist FIRST

Before creating anything, produce a compact shortlist table:

| Repeated workflow | Evidence & dates | Confidence | Recommended form | Worth creating? |

"Worth creating?" must include a terse reason. Examples:
- "Yes — repeated, stable, no existing coverage."
- "Extend existing skill — missing validation step only."
- "Skip — one-off, evidence is weak."
- "Needs more evidence — likely recurring but only one confirmed instance."

**MANDATORY - READ ENTIRE FILE**: For a concrete example of a filled shortlist, read [`references/examples/shortlist-example.md`](references/examples/shortlist-example.md).

### Step 6: Create only high-confidence missing items

After the shortlist, create or extend only items that are: high-confidence, clearly missing, narrow, practical, source-aware, and easy to validate.

Do not create assets for medium-confidence candidates unless the evidence is unusually strong and the asset is very small.

**MANDATORY**: Before creating any asset, read the relevant template:

| Asset type | Template to read |
|---|---|
| Skill | [`references/templates/skill.md`](references/templates/skill.md) |
| Subagent | [`references/templates/subagent.md`](references/templates/subagent.md) |
| Automation | [`references/templates/automation.md`](references/templates/automation.md) |

Do NOT load templates if no assets will be created (Step 6 is skipped).

**MANDATORY**: Follow the output format in [`references/output-contract.md`](references/output-contract.md) for the final response.

---

## Source-Awareness Rules

- Prefer direct source evidence over memory summaries.
- Use memory summaries to find patterns, not as the only proof.
- Treat Chronicle as discovery-only unless confirmed elsewhere.
- Record uncertainty explicitly. Do not expose sensitive details unnecessarily.
- Use dates whenever possible. Distinguish confirmed recurrence from inferred recurrence.

Recommended phrasing:
- "Confirmed in two sessions: …"
- "Likely recurring, but only one direct instance found."
- "Chronicle suggested this pattern; not enough source confirmation."
- "Existing skill appears to cover this; recommend extension."

---

## Quality Bar

A good result is: evidence-backed, conservative, compact, non-duplicative, useful immediately, narrow enough to maintain, explicit about uncertainty.

A bad result is: speculative, too broad, creates many overlapping assets, ignores existing skills/agents, relies only on memory, turns one-off tasks into permanent process.

---

## Default Behavior

If evidence access is limited, do not invent history. Instead:

1. State which sources were unavailable.
2. Use available evidence only.
3. Produce shortlist with appropriately lower confidence.
4. Create nothing unless enough direct evidence exists.
5. List what needs more evidence before packaging.
