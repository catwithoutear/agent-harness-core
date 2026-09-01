# Shortlist Example

Below is a filled example shortlist from a hypothetical 30-day audit of a
generic engineering team's agent-assisted workflow.

---

## Review Window

- Coverage: 2026-03-26 to 2026-04-26 (30 days)
- Sources used: session transcripts (12 sessions), configured durable knowledge
  records (28), issue summaries
- Sources unavailable: shell history (not logged)
- Assumptions: available sessions represent the main repeated workflows

## Shortlist

| Repeated workflow | Evidence & dates | Confidence | Recommended form | Worth creating? |
|---|---|---|---|---|
| Merge request review packet preparation | 5 sessions: Apr 3, 7, 11, 16, 21 - same packet fields were rebuilt manually | High | Extend existing review skill | Extend existing - repeated and stable, but review skill already covers most of it |
| Worktree setup before feature branches | 4 sessions: Apr 2, 8, 15, 22 - same branch/worktree verification sequence | High | Skill | Yes - stable command sequence, easy to validate, no existing focused skill |
| Failed test triage | 3 sessions: Apr 5, 12, 19 - same classify/rerun/isolate pattern | Medium | Subagent | Needs more evidence - procedure varied by test framework |
| Daily activity summary | 5 manual requests: Apr 1, 4, 8, 11, 14 | High | Automation | Already covered - existing daily summary automation is adequate |
| Config drift check | 2 sessions: Apr 6, 20 - same generated config comparison | Medium | Script or hook | Promising, but needs a stable trigger and output contract |
| One-off migration plan | 1 session: Apr 10 - structured plan for a unique migration | Low | Skip | One-off; not enough evidence of recurrence |

## Created or Extended

### worktree-setup-check

- Type: Skill
- Action: Created a narrow setup checklist with commands, safety checks, and
  validation output.
- Location: `skills/workflow/worktree-setup-check/SKILL.md`
- Why: 4 confirmed instances; stable inputs and stopping condition; no adequate
  existing coverage.

## Deliberately Skipped

| Workflow | Reason |
|---|---|
| One-off migration plan | One confirmed instance; unclear recurrence. |
| Commit message formatting | Already enforced by repository tooling. |

## Needs More Evidence

| Workflow | Missing evidence needed |
|---|---|
| Failed test triage | Need two more examples using the same framework and command sequence. |
| Config drift check | Need a stable trigger and expected notification condition. |
