# Agent Harness Core

Generic multi-client agent harness core for repository-aware AI workflows.

Chinese translation: [README_CN.md](README_CN.md).

This package provides reusable workflow contracts, change workspace tooling,
memory contracts, skills, subagents, hooks, slash command prompts, and client
projection utilities. It is the project-agnostic core layer: product,
organization, codebase, build, and domain knowledge belong in an overlay or
target repository, not in this package.

## What It Ships

| Surface | Purpose |
|---|---|
| `harness-project` | Project core harness assets into a repository or user scope. |
| `harness-change-doc` | Create, locate, index, and update regulated change workspace documents. |
| `harness-change-validate` | Validate change workspaces and memory contracts. |
| `harness` | Package helper command, including `harness manifest`. |
| `harness.manifest.json` | Source of truth for installable assets, client targets, and capabilities. |
| `skills/` | Categorized source skills; runtime skill directories are projected flat. |
| `agents/roles/` | Canonical source subagent roles; client files are rendered from these sources. |
| `rules/` | Stable workflow contracts. |
| `hooks/intents/` | Hook intent descriptions rendered into client-specific hook payloads. |
| `commands/harness/` | Slash command prompt sources for clients with command projection support. |
| `templates/` | Generic change, memory, and spec templates. |

## Install Into A Repository

Use `harness-project` for a complete harness install. Skill-only installers can
install individual skills, but that path does not install rules, tools,
templates, subagents, hooks, or project memory. Commands are also outside the
skill-only installation path.

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex,claude,opencode,omp \
  --content rules,templates,skills,subagents,hooks
```

The default projection mode is a real materialized copy. Use
`--mode symlink` only for explicit local harness development where the target
may depend on the source checkout.

Use `--dry-run --json` before writing into a target repository:

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --dry-run --json
```

Verify an installed projection:

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --verify --json
```

## Optional Third-Party Skills

Core workflow skills are installed by default when `--content skills` is used.
Utility skills under `skills/third-party/` are opt-in because they wrap external
tools or broad productivity workflows rather than the core control loop.

Install all optional third-party skills:

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content skills \
  --skill-categories third-party
```

Install only selected third-party skills:

```bash
npx @catwithoutear/agent-harness-core harness-project \
  --target /path/to/repo \
  --clients codex \
  --content skills \
  --skills glab,redmine
```

Use `--include-optional-skills` only when the target should receive every
default and optional skill in one projection. New third-party skills must stay
project-agnostic and declare `enabledByDefault: false` in
`harness.manifest.json`.

## AI Installation Prompts

Copy one of these prompts into an AI coding agent when you want it to install
the core harness. Replace placeholders before running commands.

### Project Scope

```text
Install Agent Harness Core into this repository.

Use a real copy install, not symlinks. First inspect the current git status and
do not overwrite unrelated user changes. Then run a dry-run:

node <agent-harness-core>/bin/harness-project.js \
  --target <repo> \
  --clients codex,claude,opencode,omp \
  --scope project \
  --content rules,templates,skills,subagents,hooks,commands \
  --mode copy \
  --conflict backup \
  --dry-run --json

Explain the planned targets, conflicts, and unsupported-client warnings. If the
plan is acceptable, run the same command without --dry-run. Then verify by
replacing --dry-run --json with --verify --json.

Keep generated runtime files as projection outputs. Edit source assets and
rerun the projector instead of hand-editing projected files.
```

### User Global Scope

```text
Install Agent Harness Core into my user-global agent environment.

Confirm this is intended because global assets affect every repository for this
user. Do not project repository rules or templates globally. Use a real copy
install, not symlinks. Use <state-target> only for projection state; do not
choose an unrelated repository unless it is acceptable to write
.harness/projection-state.json there.

First run:

node <agent-harness-core>/bin/harness-project.js \
  --target <state-target> \
  --clients codex,claude,opencode,omp \
  --scope global \
  --content skills,subagents,hooks,commands \
  --mode copy \
  --conflict backup \
  --dry-run --json

For Codex, command prompts project to ~/.codex/prompts/ and are deprecated
personal shortcuts; prefer skills for shared reusable behavior. If the dry-run
is acceptable, run the same command without --dry-run. Then verify by replacing
--dry-run --json with --verify --json.
```

## User-Global Agent Constitution

The reusable user-global instruction template lives at
`templates/user-global/AGENTS.md`.

This template is documentation-only. It is not listed in
`harness.manifest.json`, is not projected by `harness-project`, and does not
write to any user-global `AGENTS.md` automatically.

Use it only when the user explicitly asks to install or update global agent
instructions:

```text
Install the Agent Harness Core user-global constitution into my user-global
agent instructions.

Read templates/user-global/AGENTS.md first. Compare it with my existing
user-global AGENTS.md or equivalent global instruction file. Propose the exact
merge, explain conflicts or duplicated rules, and wait for confirmation before
writing any global file.
```

## Change Workspace Design Packs

When the implementation-design trigger rule applies, create the detailed design
topology pack before deriving task slices:

```bash
harness-change-doc --repo-root /path/to/repo add-implementation-design <change-id>
```

The generated `implementation-design/` pack separates `Subsystem` capability or
runtime boundaries from `Module` code organization boundaries, then captures
code topology, file/class mapping, runtime flow, error model, implementation
order, constraints, and traceability.

## Self-Host The Core For Codex

This repository can install its own Codex-facing runtime projection from its
source assets. That is useful when developing the harness with the same harness.

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --conflict overwrite \
  --json
```

Then verify:

```bash
node bin/harness-project.js \
  --target . \
  --clients codex \
  --content rules,templates,skills,subagents,hooks \
  --verify --json
```

The self-hosted projection creates runtime files such as `.agents/skills/`,
`.codex/agents/`, `.codex/hooks/`, `.changes/templates/`, `.memory/`, `.rules/`,
and `.harness/projection-state.json`. Edit the source directories and manifest,
then re-run the projector; do not hand-edit projected runtime files.

## Slash Commands

The core package ships workflow command prompts under `commands/harness/`.
`harness-project --content commands` projects only to client command surfaces
that have an explicit capability entry in `harness.manifest.json`.

| Prompt | Purpose |
|---|---|
| `harness route` | Choose the smallest correct skill, command, agent, hook, or projection path. |
| `harness workflow` | Run the evidence-gated workflow loop over a non-trivial task. |
| `harness plan` | Convert settled design artifacts into bounded task slices and validation gates. |
| `harness verify` | Select, run, and report the smallest credible validation loop. |
| `harness review` | Review a target with evidence-first findings and gate decisions. |
| `harness handoff` | Produce a compact handoff packet for another agent or future session. |

These prompts do not replace skills. They route the model to the right skill or
command and keep execution shape consistent across clients.

Client command support is intentionally not uniform:

| Client | Projection target | Invocation |
|---|---|---|
| Claude | `.claude/commands/harness/*.md` or `~/.claude/commands/harness/*.md` | `/harness:workflow` |
| OMP | `.omp/commands/harness-*.md` or `~/.omp/agent/commands/harness-*.md` | `/harness-workflow` |
| Codex | global only: `~/.codex/prompts/harness-*.md` | `/prompts:harness-workflow` |
| OpenCode | not file-projected yet; OpenCode uses `opencode.json` `command` entries | use projected skills |

Codex custom prompts are deprecated by Codex and should be treated as personal
shortcuts, not the primary shared workflow surface. OpenCode command support
needs config merge semantics before core can project it safely.

## Development

Run the default test suite:

```bash
npm test
```

Validate the manifest directly:

```bash
node bin/harness.js manifest --json
```

Recommended pre-handoff checks after changing source assets:

```bash
npm test
node bin/harness.js manifest --json
node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json
git diff --check
```

## Ownership Rules

- Keep this package project-agnostic. Do not add target repository facts,
  product-specific workflows, private host names, issue tracker assumptions, or
  build-system details to core assets.
- Put stable contracts in `rules/`, executable policy in `lib/`, operational
  prompts in `skills/`, and client projections behind `harness-project`.
- Runtime projections are generated artifacts. Change the source asset and
  manifest entry, then re-project.
- Keep `harness.manifest.json` aligned with every added, renamed, or removed
  asset.
