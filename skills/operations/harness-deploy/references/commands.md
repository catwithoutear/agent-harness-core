# Deployment Commands

Run the current source package's CLI, or its verified installed equivalent.
Resolve paths and capabilities before substituting the placeholders below.
These examples do not authorize new targets, clients or writes.

## Selected Core Skills

Use `harness-project --help` and the current manifest for available options.
`--target` owns projection state even with `--scope global`: native global
targets expand under the home directory, while state stays at
`<state-owner-root>/.harness/projection-state.json`. Reuse the established root;
an unknown/incompatible home state is not permission to overwrite it.

```bash
node <core-root>/bin/harness-project.js \
  --target <state-owner-root> --scope global --clients codex \
  --content skills --skills <selected-skill-names> --conflict backup \
  --dry-run --json
```

Inspect the listed files, scope and conflicts, then apply the same arguments
without `--dry-run` if authorized. Verify with the same selection plus
`--verify --json`. Resolve user-global roots from the selected client's manifest;
Codex currently projects shared skills to `~/.agents/skills/<runtimeName>/`.
Do not also copy them into a project or another client's skill root when that
client already consumes the shared directory.

Core `--conflict backup` snapshots conflicting targets under
`~/backup/agent-harness-core/`; it does **not** archive every managed,
unmodified target before a source update. Preserve all selected prior targets
and the affected state when rollback requires them. `skip`, unmanaged or
unsupported records are not proof that the requested installation completed.
Do not manufacture ownership by editing stored hashes to match a new payload.

For a full install, select only required manifest content kinds and supported
clients. `--content subagents` uses the client agent renderer. A project overlay
may own its own filtering and migration; use its documented deployer and
verify the installed Core/overlay runtime, without a source override, when
that is an actual shipped capability.

## Existing Native Roles

ZCode uses `harness-native-roles` outside the generic projector's client list.
DSH uses the optional Core host bundle described by `integrations.dsh`.
Confirm the installed loader consumes the shared skill root before projecting
skills through Codex. Do not invent `--clients zcode`, `--clients dsh`, or a
`.dsh/agents` directory.

Resolve ZCode's actual Desktop global agents directory before applying:

```bash
node <core-root>/bin/harness-native-roles.js \
  --client zcode --agents-dir <existing-global-agents> \
  --dry-run --json > <reviewed-plan.json>

node <core-root>/bin/harness-native-roles.js \
  --client zcode --agents-dir <existing-global-agents> \
  --from-plan <reviewed-plan.json> --json

node <core-root>/bin/harness-native-roles.js \
  --client zcode --agents-dir <existing-global-agents> --verify --json
```

Read native definitions before accepting the plan; names alone do not establish
ownership. Stale plans and unknown formats fail before writing. Metadata is
preserved except canonical name/description and role body. Inspect partial
`changed`, `failed`, `remaining` and `backups` before retry/recovery. After verify,
a fresh dry-run should show empty `changed_roles`. Loading requires a new
session; the tool does not restart a client.

## DSH Host Roles

Resolve the selected existing profile and back up its package manifest, lockfile,
patch and owned role definitions outside loaded roots. Inspect the Core bundle
patch and proposed removals before authorized writes. Install through the native
plugin manager; no parallel installer or profile generator is needed:

```bash
dsh plugin --profile <profile-name> add <core-path-or-tarball>
```

The Core package registers one host `harness-roles` instance and reads roles from
its own manifest at activation. Preserve profile-owned model/provider/budget
settings as `harness-roles.config.agentOptions`; omission inherits the parent.
Do not copy canonical personas into presets. Remove only verified owned legacy
Harness role rows and the old `@local/dsh-harness-roles` bundle/dependency via
native plugin management. Inspect preset-local rows too: local shadowing can
hide host tools. Retain any linked local plugin until references are replaced;
remove it only within the authorized deployment scope. The old
`harness-native-roles --client dsh` path is unavailable.

Verify the selected profile's effective configuration with
`dsh --profile <profile-name> --dump-config`; protect output that may contain
private settings. Inventory host and preset tools to exclude duplicate Harness
roles. In a new or explicitly reloaded session, check role visibility for the lead
and a teammate, read-only restrictions, leaf/depth behavior and dispatch/output.
Package checks and configuration dumps do not prove live reload or model behavior.
If a migration fails, restore the profile snapshot and native dependency state;
report partial changes and retained recovery artifacts. Never restart services
as an incidental deployment step.
