---
name: skill-authoring-governance
description: Use when creating, editing, auditing, packaging, or routing harness skills and their manifest metadata.
---

# Skill Authoring Governance

Keep skills small, operational, and discoverable. A skill is a reusable
procedure or reference for future agents, not a narrative about one session.

## Quality Bar

- Frontmatter description starts with `Use when...` and names triggering
  situations, symptoms, tools, or artifacts.
- Description does not summarize the full workflow in a way that lets an agent
  skip the body.
- Body contains only operational guidance that is not obvious from the general
  system prompt.
- Heavy references, scripts, and assets are separate resources and are loaded
  only when needed.
- Failure boundaries, common mistakes, and forbidden shortcuts are explicit.
- The manifest route matches the skill's real audience, clients, source path,
  runtime name, triggers, negative triggers, and requirements.

## Checklist

- Folder name and frontmatter `name` use hyphen-case.
- Frontmatter contains only `name` and `description`.
- Body gives necessary procedure, not project history or release notes.
- References, scripts, and assets are included only when directly useful.
- `harness.manifest.json` records category, audience, triggers, requirements,
  runtime name, and clients.
- Runtime projection remains flat even when source skills are categorized.
- Skill-only distribution is not described as a full harness install.
- Tests or review evidence cover the behavior the skill is meant to change.

## Manifest Routing

Each packaged skill should have:

- `id`: stable package id,
- `category`: source grouping only,
- `audience`: `user` or `model`,
- `source`: categorized source directory,
- `runtimeName`: flat client-visible name,
- `description`: exactly the SKILL.md frontmatter description,
- `triggers`: concrete phrases or situations,
- `negativeTriggers`: common cases where the skill must not fire,
- `requires`: files, commands, or state needed before use,
- `clients`: supported projections.

Update the manifest and `SKILL.md` together. Tests should fail if their
descriptions drift.

## Example Edits

- Better trigger: `Use when reviewing canonical subagent roles, client
  projections, authority boundaries, packet contracts, or projection metadata
  drift.`
- Better body example: a three-row route table that shows which skill or command
  to choose.
- Bad body example: a session story explaining why the author made the change.

## When to Add Resources

- Add a script when a deterministic or repetitive operation would otherwise be
  rewritten.
- Add a reference when the detail is too large or conditional for the main body.
- Add an asset when the skill uses a reusable output template or static file.
- Do not add README, changelog, install guide, or session-history files inside a
  skill folder unless the skill directly consumes them.

## Review Questions

- Would a future agent know when not to use this skill?
- Does the skill close the failure mode that motivated the change?
- Can the agent follow it without hidden conversation context?
- Are commands and file paths current for the core package rather than a
  project overlay?
- Is there a cheaper tool or validation guard that should enforce the rule
  instead of prose?

## Common Mistakes

- Writing a broad "best practices" essay with no concrete trigger.
- Duplicating a detailed rule that belongs in a validator, hook, or manifest.
- Letting an orchestration skill obscure required specialist skills.
- Migrating project-domain behavior into core.
