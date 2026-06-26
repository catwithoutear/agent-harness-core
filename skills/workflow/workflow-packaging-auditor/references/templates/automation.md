# Automation Template

When proposing or creating an automation, use this structure:

```markdown
# <Automation Name>

## Purpose

<What recurring check/report/reminder this automation performs.>

## Trigger

- Schedule: <daily/weekly/monthly/condition-based>
- Time: <time if known>
- Condition: <condition if applicable>

## Action

<What the automation does.>

## Notification Rule

Notify only when:

- <condition>

## Output

- <report/reminder/check result>

## Failure Handling

If the automation cannot complete:

- report the failed source
- report the last successful run if available
- do not silently retry forever

## De-duplication

This automation should not duplicate:

- <existing automation if any>
```

### Automation design principles

A good automation has:
- **Clear trigger** — schedule or condition that activates it
- **Explicit action** — what it does when triggered
- **Notification rule** — when to alert (not on every success)
- **Failure behavior** — what happens when it can't complete
- **De-duplication check** — does not overlap with existing automations

NEVER create an automation without a clear trigger and notification rule.
