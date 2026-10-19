---
name: harness-deploy
description: Use when installing, updating, or migrating Harness skills, agent roles, or client projections into user-global or project locations.
---

# Harness Deploy

Deploy the requested Harness assets through their existing owners, using the
fewest necessary destinations. This skill covers agent configuration and
instruction deployment; application releases and service rollout belong to
their project procedures. A plan-only request remains read-only.

## Resolve The Installation

Before writing, identify:

- Canonical Core source, any project-owned overlay, and their current revisions.
  Read the source or deployed Core manifest with package identity
  `@catwithoutear/agent-harness-core`; resolve deployed tools from that package.
- Requested clients, exact target repositories, scope and assets. Preserve
  previously agreed selections, stopped clients and user overrides. Do not
  infer all clients or all assets from a command's defaults.
- Each selected client's actual loaded roots and precedence, including user,
  project, plugin and configured external roots. Check installed configuration
  or loader evidence when support is uncertain. Record physical paths as well
  as discovery paths; aliases to one directory are not separate installations.
- Existing assets by runtime name, scope, owner and current content. Projection
  state is historical inventory: corroborate paths and hashes against files
  and the current source/rendering. Keep its existing authoritative state root;
  do not create another state file merely because global payloads live elsewhere.

Use `skill-cleaner` for a skills inventory when useful. Its supported adapters
and an explicit `--root` report do not prove another client's complete loading
scope. Resolve native agent roles separately; names alone do not prove ownership.

## Choose The Smallest Deployment

| Need | Installation choice |
|---|---|
| Reusable Core skills and generic roles | Prefer one User Global installation per supported client; avoid duplicate project copies. |
| Project rules, domain skills or roles | Use the owning overlay's project deployment procedure. |
| Several clients consume the same shared skill root | Project to that physical root once; do not add client-specific mirrors. |
| Client needs a separate native role format | Render that client's supported native role; this is not a duplicate across independent clients. |
| Explicit project override | Preserve it and verify the client's precedence; do not silently replace or remove it. |
| Core source self-hosting | Keep its required local development projection; it is an explicit exception to global-only user deployment. |

Select clients and content explicitly. For a few skills, use `--skills`; do not
reinstall optional utilities, roles, hooks or full runtimes to ship one skill.
Skill-only installation is not a full Harness installation. Reuse an overlay
deployer's global phase rather than adding a parallel installer or state owner.
Stopped clients' dedicated copies stay unchanged, but clients consuming a shared
root may still see its updates. If the user's exclusion also covers shared
content, resolve that scope conflict before writing.
If its supported interface requires a wider pass, disclose that limitation;
do not invent flags or bypass its managed migration.

For supported CLI sequences, state-root behavior and existing ZCode/DSH roles,
read [references/commands.md](references/commands.md) only when needed.

## Apply And Verify

1. Run a dry-run with the exact selected tool, clients, scope and assets. Inspect
   every destination and diagnostic; a successful dry-run is not ownership,
   conflict, loader or rollback proof. If current content already satisfies
   the request, verify it and omit unnecessary writes.
2. Before replacement or removal, preserve the selected existing payloads and
   affected state/configuration with the owner's backup facility or a narrow
   filesystem archive. Keep private backups under `~/backup` or the user's
   chosen external archive, outside **all** loaded roots. Preserve bytes,
   modes, links and original-to-saved mappings; verify recoverability before
   removing originals. `--conflict backup` alone is not a full prior snapshot.
3. Apply only the authorized plan. Recheck source and target drift before
   writing; preserve custom fields, models, permissions and presets. Do not
   hand-edit projected assets, regenerate whole profiles, add dependencies or
   restart services as an incidental deployment step.
4. Run the same selection with `--verify`; inspect `ok`, `errors`, warnings and
   record dispositions, not just the exit code. Where a local runtime is
   shipped, verify from that installed runtime too. Inventory the selected
   clients' loaded roots again: projector verification covers selected targets,
   not stray definitions elsewhere.
5. Check preserved assets and source-worktree state. For native refresh, obtain
   a fresh dry-run showing no changes. For the generic projector, a dry-run
   still lists planned assets; use current-source/content verification rather
   than claiming its planned count is a change count. Do not reapply merely
   to demonstrate idempotency.

Report partial writes with changed, failed and remaining targets plus recovery
paths. Keep complete recovery copies when cleanup or rollback fails; pause the
affected operation, diagnose and reconcile it before retrying. Do not describe
a partially successful deployment as complete.

## Handle Existing Duplicates

- Archive copies inside loaded roots can be discovered despite `.bak` names or
  deeper nesting. Move authorized historical backups outside those roots;
  never restore an archive directory into a discovery root.
- Remove a redundant managed project copy only after its package/asset/client/
  target identity matches its ownership state and its current file hash matches
  that state's recorded `target_hash`, the retained global definition exists
  and matches current source/rendering, and that client can actually load it.
  Use the owner's migration so its state and rollback remain consistent.
- Preserve modified, unowned, intentional overrides and unknown-format files.
  Missing or drifting global definitions block removal of dependent local
  copies. Unrelated duplicates found during inventory are reported separately;
  discovery is not permission for a broader cleanup.
- Symlinks may explain duplicate discovery paths, but do not follow unexpected
  links for mutation. Do not use links as an unverified workaround for a
  client's loading or precedence behavior.

## Handoff

Report selected source revision, clients, destinations and assets; what changed
or was retained; backup mappings; verification and duplicate-inventory results;
and any unsupported capability or unresolved loading gap. Distinguish file,
schema and projection checks from live agent behavior. State whether a new
session or profile reload is needed; do not imply it already occurred.
