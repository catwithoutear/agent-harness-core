---
name: change-workspace-operator
description: Use when creating, locating, validating, or updating regulated .changes workspaces, terminology.md, task docs, reviews, timelines, or change indexes.
---

# Change Workspace Operator

Use `harness-change-doc` for regulated writes and discovery. Use
`harness-change-validate` for policy checks, inventory, cleanup suggestions, and
memory checks. Prefer the tools over hand-created files because they write the
front matter, artifact type, tags, description, and index links consistently.

Resolve the state root before regulated writes. Prefer `--state-root
<state-root>` for the canonical `.changes` owner. `--repo-root <repo>` remains a
legacy alias for the same state root; do not use it to mean the implementation
checkout. Use `--code-root <code-root>` only when the source checkout differs
from the canonical state root. Regulated writes reject a symlink alias or a
linked worktree as the state root; pass the canonical shared owner instead.

For linked worktrees, run
`harness-change-doc --state-root <state-root> --code-root <code-root> resolve --change <change> --json`
or record why the active change is unresolved. Do not select a change solely
from dirty git status or `--all-active` validator output.

## Commands

| Need | Command |
|---|---|
| Read policy | `harness-change-doc --state-root <state-root> policy --json` |
| Create a structured workspace | `harness-change-doc --state-root <state-root> --code-root <code-root> init <change-id> --description "..." --json` |
| Resolve roots | `harness-change-doc --state-root <state-root> --code-root <code-root> resolve --change <change> --json` |
| Index a change | `harness-change-doc --state-root <state-root> index <change-id> --json` |
| List artifacts | `harness-change-doc --state-root <state-root> list <change-id> --json` |
| Locate artifacts | `harness-change-doc --state-root <state-root> locate <change-id> --artifact <artifact> --json` |
| Read artifacts | `harness-change-doc --state-root <state-root> read <change-id> --artifact <artifact>` |
| Read execution map | `harness-change-doc --state-root <state-root> execution-map <change> --json` |
| Assign a slice | `harness-change-doc --state-root <state-root> assign-slice <change> --slice <slice> --status planned` |
| Add terminology | `harness-change-doc --state-root <state-root> add-terminology <change-id> --tags terminology --description "..."` |
| Add implementation design pack | `harness-change-doc --state-root <state-root> add-implementation-design <change-id> --description "..."` |
| Add review round | `harness-change-doc --state-root <state-root> add-review <change-id> --target <name> --round <n> --description "..."` |
| Add decision record | `harness-change-doc --state-root <state-root> add-decision <change-id> --slug <topic>` |
| Add timeline event | `harness-change-doc --state-root <state-root> add-timeline <change-id> --slug <event>` |
| Add task slice | `harness-change-doc --state-root <state-root> add-task-slice <change-id> --slug <slice>` |
| Inspect a legacy migration | `harness-change-doc --state-root <state-root> migrate <change-id> --dry-run` |
| Apply a legacy migration | `harness-change-doc --state-root <state-root> migrate <change-id> --apply` |
| Validate one change | `harness-change-validate --state-root <state-root> --change <change-id>` |
| Validate worktrees | `harness-change-validate --state-root <state-root> --change <change> --worktrees` |
| Machine status | `harness-change-validate --state-root <state-root> --change <change-id> --status --json` |
| Machine status with worktrees | `harness-change-validate --state-root <state-root> --change <change-id> --worktrees --status --json` |
| Inventory files | `harness-change-validate --state-root <state-root> --change <change-id> --inventory --json` |
| Cleanup hints | `harness-change-validate --state-root <state-root> --change <change-id> --suggest-cleanup --json` |
| Enforce layout | `harness-change-validate --state-root <state-root> --change <change-id> --strict-layout` |
| Check memory | `harness-change-validate --state-root <state-root> --memory --json` |

Use `--all-active` only for repository audits. Resolve the active change first
before injecting validator output into an agent prompt; otherwise the agent may
optimize for the wrong workspace.

`harness-change-doc --repo-root <repo> ...` and
`harness-change-validate --repo-root <repo> ...` remain valid for existing
scripts, but new workflow text should use `--state-root` when it means the
canonical change workspace.

## Legacy Migration

Use migration only when a legacy proposal workspace needs structured-only
artifacts such as directory task slices, structured reviews or decisions, or an
implementation-design pack. First run `migrate <change-id> --dry-run` and review
the listed sources, archive destinations, and generated paths. Then run
`migrate <change-id> --apply` with one writer for the change workspace.

The operation archives exact bytes of top-level `review-log.md`, `timeline.md`,
and `tasks.md` under `.changes/archive/<change-id>/legacy/`, writes indexes and
one provenance decision, and never fabricates review rounds, task slices, or an
implementation-design pack. Archive or generated-file conflicts stop before
source removal. Writes are archive-first and monotonic, so an interrupted run
is completed by running apply again. Once no top-level legacy source remains,
repeat apply is a no-op and preserves subsequent edits. Validate the migrated
change before creating the next structured artifact.

## Example Flows

- New task term: run `add-terminology`, fill the table, then validate the change.
- Scope packet before design: record confirmed, disputed, and unverifiable
  claims in `requirements.md`, `research.md`, `proposal.md`, or `design.md`
  with source references, outcome expectations, constraints, code landscape,
  risk areas, and scoping confidence. Do not create a new template unless the
  existing owning artifact cannot hold the evidence.
- Design path: challenge the proposal, wait until the solution-design review is
  ready, then assess the implementation-design trigger. When the trigger
  applies, populate and review the pack before using `change-planner` to create
  task slices. Review the complete task set before implementation. Writers
  create structure and validators check repository policy; neither makes a
  semantic readiness decision.
- Multi-worktree assignment: create the task slice first, then use
  `assign-slice` to write or update `execution-map.md`. The map owns scheduling
  fields; task slices own implementation details and evidence.
- Claimed or active work: include `--branch` and `--worktree`. Relative
  `Worktree` values are normalized locally, and the persisted value is a local
  execution coordinate, not portable branch truth.
- Gated status update: `blocked`, `ready`, `merged`, and `superseded` require
  `--last-evidence <change-relative.md#heading>`. Keep `Last Evidence`
  change-relative; do not put URLs, commit hashes, or free-text logs in the map.
- Stacked topology: use `--topology stacked` only with `--depends-on` or
  `--base`, and use `stacked-branch-workflow` for git stack operations.
- New implementation design pack: run `add-implementation-design`, then fill the
  required topology documents. Keep `Subsystem` as the capability/runtime
  boundary and `Module` as the code organization boundary. The tool creates all
  standard paths for stable indexing, but the pack README's minimum/N/A rule
  still applies: core documents are `01`, `02`, and `06`; fill `03`, `04`, `05`,
  and `07` when their risk surfaces exist, otherwise mark sections `N/A` with a
  reason. For small localized work below the trigger threshold, keep a no-design
  reason in the plan instead of creating the pack.
- If a solution decision changes after the pack or task set exists, return to
  solution design and revisit dependent artifacts. Do not hide the change in a
  task slice.
- New review round: only for a gate, council, re-review, freeze decision, or
  other review event that changes the decision state. Run `add-review`, write
  concise findings and the decision, then ensure `reviews/README.md` makes the
  current authoritative round obvious.
- New timeline event: only for a user decision, design pivot, superseding event,
  validation state reversal, handoff, or other chronology that changes how later
  agents should interpret the workspace. Run `add-timeline`, write the event
  and evidence pointer, then keep the detailed evidence in the owning document.
- Unexpected file warning: run `--inventory --json`, read the file, choose move,
  allowlist, consolidate, or remove, then rerun with `--strict-layout` only after
  the semantic decision is clear.

## Execution Map Contract

`execution-map.md` is the scheduling authority for multi-worktree execution in
the V1 shared-state model. V1 does not implement branch-local-state. The
canonical state lives under one `.changes/<change>` state_root, while code edits
may happen from one or more code_root worktrees.

The map columns are `Slice`, `Topology`, `Status`, `Branch`, `Worktree`, `Base`,
`Depends On`, `Owner`, and `Last Evidence`.

- `planned` may omit `Branch` and `Worktree`.
- `claimed`, `active`, `blocked`, and `ready` require `Branch` and `Worktree`.
- `blocked`, `ready`, `merged`, and `superseded` require `Last Evidence`.
- `parallel` rows must not depend on other rows.
- `stacked` rows need `Depends On` or `Base`; ready stacked dependencies should
  be `ready` or `merged`, and merged stacked dependencies should be `merged`.
- `Worktree` is local and advisory during handoff. Reassign stale local paths
  through `assign-slice`; keep portable evidence in task slices, reviews, or
  decisions and reference it from `Last Evidence`.

## Review And Timeline Discipline

Read `README.md` first. It should summarize the current phase, authoritative
review round, open blockers, and key superseded events. Keep review and
timeline child files as low-frequency evidence nodes, not as a mandatory
transcript of every action.

Use `reviews/` for decision-changing review facts: gate results, subagent review
findings, council synthesis, re-review outcomes, and freeze decisions. Do not
add a review file for every local edit, test rerun, or routine status update.

Use `timeline/` for chronology that affects interpretation: accepted user
decisions, design direction changes, superseded rules, validation state
reversals, long-running handoff points, and rollback-relevant events. Do not use
timeline events as a command log.

Top-level `review-log.md` and `timeline.md` are legacy migration inputs only.
Read them when present, but do not treat them as canonical v2 state. Move current
state into `reviews/` or `timeline/` with `harness-change-doc`, mark superseded
history in the directory README, and keep README summaries high-signal.

## Reading Output

- `ERROR` means the workspace is not valid.
- `WARN` means a human or coordinator must decide whether it blocks freeze.
- `NEXT_ACTION: ready` means the validator found no blocking issue for that
  mode.
- `GUIDE` is routing guidance, not proof that a suggested move or cleanup is
  semantically correct.
- Cleanup suggestions are candidates. Read the file before moving, allowlisting,
  consolidating, or deleting anything.

## Regulated Writes

Use tool-created files for artifacts with schema, tags, and indexes:

- `terminology.md`,
- `implementation-design/README.md` and standard implementation-design detail
  files created by `add-implementation-design`,
- `reviews/*.md`,
- `decisions/*.md`,
- `timeline/*.md`,
- `tasks/*.md` slices.

Hand editing is acceptable after the tool creates the artifact. Keep the YAML
front matter valid and keep directory README indexes synchronized.

## Common Mistakes

- Creating a review file by hand and forgetting `reviews/README.md`.
- Adding review or timeline files for routine progress that belongs in the
  current task slice, README summary, or final response.
- Treating top-level `review-log.md` or `timeline.md` as current v2 authority
  instead of legacy migration input.
- Treating `--all-active` output as if it identifies the current task.
- Ignoring `terminology.md` because the change looks small.
- Using warnings as decoration instead of resolving or explicitly accepting
  them before freeze.
