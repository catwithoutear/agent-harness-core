---
name: environment-profile-vault
description: "Use when a local environment profile must be added, retrieved, updated, deleted, or injected into an automation command without GPG encryption."
---

# Environment Profile Vault

Store a small local profile containing `address`, `username`, `password`, and
an optional SSH `known_hosts` value. The historical name remains for
compatibility; this skill uses plaintext JSON with private local permissions,
not GPG encryption.

## Commands

```bash
vault="$HOME/.agents/skills/environment-profile-vault/scripts/environment-profile-vault.py"
python3 "$vault" init
python3 "$vault" add <profile>
python3 "$vault" update <profile>
python3 "$vault" upsert-env <profile>
python3 "$vault" list
python3 "$vault" get <profile> --field address
python3 "$vault" get <profile> --field password
python3 "$vault" delete <profile>
python3 "$vault" set-ssh-known-hosts <profile>
python3 "$vault" run <profile> -- <executable> [arguments...]
```

`add`, `update`, and `set-ssh-known-hosts` prompt in a local terminal.
`upsert-env` is the automation route: it reads the values from
`ENV_PROFILE_ADDRESS`, `ENV_PROFILE_USERNAME`, and `ENV_PROFILE_PASSWORD` by
default, never accepts them as command-line arguments, and creates or replaces
the named profile. Use `--address-env`, `--username-env`, and `--password-env`
only to name alternate environment variables already scoped to the direct
automation process.

## Storage And Automation Boundary

- Profiles are stored at `~/.agents/private/environment-profiles/profiles.json`.
  The directory is `0700`; the file is `0600`.
- `run` injects profile fields only into one direct child as
  `ENV_PROFILE_ADDRESS`, `ENV_PROFILE_USERNAME`, `ENV_PROFILE_PASSWORD`, and,
  when configured, `ENV_PROFILE_SSH_KNOWN_HOSTS`.
- Literal profile values in the child stdout/stderr are replaced with
  `[REDACTED]`. This is output hygiene, not a sandbox: use only a trusted child.
- `get --field password` intentionally prints the stored password for local
  automation. Do not paste that output into chat, source, logs, or command-line
  arguments.
- The deprecated `init --recipient ...` spelling is accepted and ignored so
  earlier local initialization commands do not require GPG during migration.

## Do Not Use

- Do not put a real profile in the skill package or a repository file.
- Do not use this generic profile store to select a target, infer a protocol,
  or perform remote actions. The calling workflow owns those choices.
- Do not delete legacy `config.json` or `profiles/*.json.gpg` data merely
  because the plaintext store is empty.
