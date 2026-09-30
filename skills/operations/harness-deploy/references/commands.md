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

ZCode and DSH use `harness-native-roles` outside the generic projector's client
list. Confirm the installed loader consumes the shared skill root before
projecting shared skills through Codex. Do not add imaginary `--clients zcode`
or `--clients dsh` routes or invent a `.dsh/agents` directory.

For ZCode, resolve the actual storage directory and the existing Desktop global
agents directory. Do not assume a CLI supports Desktop user agents. For DSH,
resolve the user-selected existing profile and its installed YAML runtime;
do not silently choose another profile.

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

For DSH, replace `--client zcode --agents-dir <existing-global-agents>` with
`--client dsh --profile-dir <selected-existing-profile>` in all three commands.
Read current native definitions before accepting the plan; a matching name does
not establish that custom content may be overwritten. The plan binds source
and original-target hashes, and stale plans fail. Missing roles or unknown
formats stop this refresh; it does not provision profiles or install new roles.

ZCode preserves metadata except canonical name/description and role body.
DSH replaces existing Harness persona bodies while preserving their wrapper,
all other configuration bytes and semantics. Do not use a profile generator
that changes models, permissions or presets. Check the selected installed
schema when applicable without invoking tagged executable YAML or a model.

Apply snapshots drifting files before atomic replacement. A ZCode multi-file
failure can leave earlier files updated: inspect `changed`, `failed`,
`remaining` and `backups` before retry or recovery. Save plan/output records
outside discovery roots and retain only the evidence needed for handoff.
After verify, run a fresh dry-run; native `changed_roles` should be empty.
Loading new files may require a new client session or profile reload, which
these commands do not perform.
