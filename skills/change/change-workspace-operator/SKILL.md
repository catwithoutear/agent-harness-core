---
name: change-workspace-operator
description: Use when creating, locating, validating, or updating regulated .changes workspaces, terminology.md, task docs, reviews, timelines, or change indexes.
---

# Change Workspace Operator

Use `harness-change-doc` for regulated writes and discovery. Use
`harness-change-validate` for policy checks, inventory, cleanup suggestions, and
memory checks. Prefer the tools over hand-created files because they write the
front matter, artifact type, tags, description, and index links consistently.

Always pass `--repo-root <repo>` when operating outside the current working
directory or when the command output may be shown to another agent.

## Commands

| Need | Command |
|---|---|
| Read policy | `harness-change-doc --repo-root <repo> policy --json` |
| Index a change | `harness-change-doc --repo-root <repo> index <change-id> --json` |
| List artifacts | `harness-change-doc --repo-root <repo> list <change-id> --json` |
| Locate artifacts | `harness-change-doc --repo-root <repo> locate <change-id> --artifact <artifact> --json` |
| Read artifacts | `harness-change-doc --repo-root <repo> read <change-id> --artifact <artifact>` |
| Add terminology | `harness-change-doc --repo-root <repo> add-terminology <change-id> --tags terminology --description "..."` |
| Add implementation design pack | `harness-change-doc --repo-root <repo> add-implementation-design <change-id> --description "..."` |
| Add review round | `harness-change-doc --repo-root <repo> add-review <change-id> --target <name> --round <n> --description "..."` |
| Add decision record | `harness-change-doc --repo-root <repo> add-decision <change-id> --slug <topic>` |
| Add timeline event | `harness-change-doc --repo-root <repo> add-timeline <change-id> --slug <event>` |
| Add task slice | `harness-change-doc --repo-root <repo> add-task-slice <change-id> --slug <slice>` |
| Validate one change | `harness-change-validate --repo-root <repo> --change <change-id>` |
| Machine status | `harness-change-validate --repo-root <repo> --change <change-id> --status --json` |
| Inventory files | `harness-change-validate --repo-root <repo> --change <change-id> --inventory --json` |
| Cleanup hints | `harness-change-validate --repo-root <repo> --change <change-id> --suggest-cleanup --json` |
| Enforce layout | `harness-change-validate --repo-root <repo> --change <change-id> --strict-layout` |
| Check memory | `harness-change-validate --repo-root <repo> --memory --json` |

Use `--all-active` only for repository audits. Resolve the active change first
before injecting validator output into an agent prompt; otherwise the agent may
optimize for the wrong workspace.

## Example Flows

- New task term: run `add-terminology`, fill the table, then validate the change.
- New implementation design pack: run `add-implementation-design`, then fill the
  required topology documents. Keep `Subsystem` as the capability/runtime
  boundary and `Module` as the code organization boundary. The tool creates all
  standard paths for stable indexing, but the pack README's minimum/N/A rule
  still applies: core documents are `01`, `02`, and `06`; fill `03`, `04`, `05`,
  and `07` when their risk surfaces exist, otherwise mark sections `N/A` with a
  reason. For small localized work below the trigger threshold, keep a no-design
  reason in the plan instead of creating the pack.
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
