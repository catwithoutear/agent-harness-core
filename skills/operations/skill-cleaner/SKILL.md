---
name: skill-cleaner
description: Use when auditing Codex, Hermes, OpenCode, or OMP skills for loaded roots, duplicates, unused skills, prompt-budget cost, compact descriptions, or cleanup candidates.
---

# Skill Cleaner

Use this when trimming skill prompt budget, finding duplicate skills, auditing
enabled/disabled skill roots, comparing skills across Codex/Hermes/OpenCode/OMP,
or deciding which skills/plugins to remove.

## Workflow

1. Run the analyzer from this skill directory:

```bash
python3 scripts/skill-cleaner.py --months 3
```

Useful variants:

```bash
python3 scripts/skill-cleaner.py --no-logs
python3 scripts/skill-cleaner.py --agent codex --agent opencode --no-logs
python3 scripts/skill-cleaner.py --agent hermes --agent omp --months 6 --deep-logs
python3 scripts/skill-cleaner.py --context-tokens 272000 --budget-percent 2 --no-logs
python3 scripts/skill-cleaner.py --root ~/example/skills --no-logs
python3 scripts/skill-cleaner.py --json --no-logs
```

When using the source package instead of an installed skill, run:

```bash
python3 skills/operations/skill-cleaner/scripts/skill-cleaner.py --no-logs
```

2. Read the report in this order:
- `Skill Budget`: context size, skills budget, budgeted usage, and pre-budget full-list pressure.
- `Description candidates`: long descriptions where relaxed grammar saves prompt budget.
- `Duplicates`: same skill name or near-identical description/body across selected agent roots.
- `Unused candidates`: no recent `$skill` mention, `SKILL.md` read, or explicit skill-use trace in selected agent logs.
- `Root summary`: where skills came from and whether config marks them disabled.

3. Before deleting or editing:
- Verify the kept copy exists and is loaded.
- Prefer deleting shared-path duplicates when an agent built-in covers the same behavior.
- Keep repo-local maintainer skills when they encode repo policy or live operations.
- Preserve trigger nouns in descriptions: product, tool, action, object.

## Analyzer Notes

- Supported agents: `codex`, `hermes`, `opencode`, and `omp`.
- OpenCode and OMP include their own skill roots plus shared `~/.agents/skills`.
- `--root <path>` adds an explicit extra skill root and is useful for archives or repo-local experiments.
- It applies Codex-like frontmatter rules: YAML frontmatter only, default name from parent dir, single-line sanitized `name` and `description`.
- It estimates prompt budget with token cost `ceil(utf8_bytes / 4)`, then full descriptions -> equal description truncation -> omitted minimum lines.
- It uses the first selected adapter that reports a context window; fallback is 272,000 tokens and 2%.
- It realpath-dedupes roots, so symlinked roots such as `~/.codex/skills/agent-scripts -> ~/Projects/agent-scripts/skills` do not create false duplicates.
- For duplicate names, it reports description/body similarity and suggests deletion candidates only when bodies are near copies.
- It scans recent known history/session folders for the selected agents. Add `--deep-logs` for archived sessions and less common log folders.
- Usage evidence is heuristic: `$skill`, `Use $skill`, and paths like `skills/<name>/SKILL.md`.

## Output Policy

- Suggest first; edit only when the user asks.
- If asked to apply cleanup, make small grouped commits: descriptions, deletes, config disables.
- Do not delete ignored/untracked skill dirs without naming the destination or confirming they are disposable.
