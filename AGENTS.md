# Agent Harness Core Instructions

This repository is the source package for a generic agent harness. It must stay
project-agnostic and reusable across target repositories.

## Operating Model

- Treat `harness.manifest.json` as the installable asset index and client
  capability contract.
- Treat `skills/`, `agents/roles/`, `rules/`, `hooks/intents/`, `commands/`,
  `templates/`, `lib/`, and `schemas/` as source.
- Treat `.agents/`, `.codex/`, `.rules/`, and `.harness/` as projected runtime
  output when they exist. Do not hand-edit projected files.
- For non-trivial work, use the evidence-gated workflow: observe, gather
  source-verified context, plan, review the plan when risk warrants it,
  implement a bounded slice, review, verify, then hand off.

## Boundaries

- Do not add project-specific product facts, build commands, private endpoints,
  issue tracker assumptions, or domain workflows to core assets.
- If an instruction only applies to one target repository, it belongs in that
  repository's overlay, memory, rules, or skills.
- Do not rely on native client recursive discovery. Source skills may be
  categorized, but runtime skill projection must remain flat.
- Do not add compatibility aliases for removed command names unless an approved
  design explicitly changes that boundary.

## Editing Guidance

- When adding or renaming an asset, update `harness.manifest.json`, tests, and
  projection expectations in the same change.
- When editing a projected runtime file, stop and edit the corresponding source
  file instead.
- Use `harness-change-doc` and `harness-change-validate` for regulated change
  workspace state when a task needs durable planning, review, or handoff
  records.
- Keep README material user-facing and stable. Put detailed procedure in skills,
  rules, or implementation docs.

## Codex Self-Hosting

Install this repository's own Codex runtime projection from source assets:

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,skills,subagents,hooks \
  --conflict overwrite \
  --json
```

Verify the projection:

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,skills,subagents,hooks \
  --verify --json
```

## Verification

Run these checks before handoff after changing source assets:

```bash
npm test
node bin/harness.js manifest --json
node bin/harness-project.js --target . --clients codex --content rules,skills,subagents,hooks --verify --json
git diff --check
```
