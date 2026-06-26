# Skill Template

When creating a new skill, use this structure:

```markdown
---
name: <kebab-case-name>
description: >
  <One-sentence description of when this skill should be used. Include explicit
  trigger scenarios and searchable keywords.>
---

# <Skill Name>

## Purpose

<What this skill does and what problem it solves.>

## When to Use

Use this skill when:

- <condition>
- <condition>

## When Not to Use

Do not use this skill when:

- <condition>
- <condition>

## Inputs

Required:

- <input>

Optional:

- <input>

## Procedure

1. <step>
2. <step>
3. <step>

## Validation

Before finishing, verify:

- <check>
- <check>

## Failure Handling

If <problem>, then <fallback>.

## Related Assets

- <existing skill/subagent/automation, if any>
```

### Description field rules

The description is the **only field the agent sees before loading** the skill. It MUST:

1. **WHAT**: state what the skill does
2. **WHEN**: include explicit trigger scenarios like "Use when user asks..."
3. **KEYWORDS**: include searchable domain terms

Example of a good description:
```yaml
description: >
  Create, edit, and analyze .docx files with support for tracked changes and
  formatting. Use when working with Word documents, tracked changes, or
  professional document formatting.
```

Example of a bad description:
```yaml
description: "Helps with document tasks."
```

### Skill design principles

- Narrow — one clear purpose, not a "helper" or "everything" skill
- Actionable — agent can immediately act on instructions
- Non-overlapping — does not duplicate existing skills
- Easy to test — has clear validation criteria
- Easy to delete — reversible; does not entrench itself
