---
name: pve-vm-operations
description: Use when listing, inspecting, creating, updating, deleting, or changing the power state of QEMU virtual machines through the Proxmox VE REST API.
---

# PVE VM Operations

Operate Proxmox VE QEMU virtual machines through the bundled REST client. This
skill covers QEMU VMs only. Do not use it for LXC containers, cluster
membership, storage administration, host networking, backup policy, or VMware
to-PVE migration planning.

## Load What You Need

- Read [references/official-api.md](references/official-api.md) before choosing
  an endpoint, authentication mode, or destructive option.
- Use `scripts/pve_vm.py` for repeatable REST calls and task polling.
- Use `environment-profile-vault` when credentials must be stored or injected;
  it is optional when the required `PVE_*` variables are already injected by a
  trusted environment. Never put a password or API token secret in a prompt,
  repository file, shell argument, or command output.

## Connection Contract

The client reads these environment variables:

| Purpose | Variable |
|---|---|
| API base URL | `ENV_PROFILE_ADDRESS` or `PVE_ADDRESS` |
| User for ticket login | `ENV_PROFILE_USERNAME` or `PVE_USERNAME` |
| Password for ticket login | `ENV_PROFILE_PASSWORD` or `PVE_PASSWORD` |
| API token identity | `PVE_API_TOKEN_ID` |
| API token secret | `PVE_API_TOKEN_SECRET` |
| Private CA bundle | `PVE_CA_FILE` |

Environment-profile variables form one ticket-authenticated connection. Do not
combine an `ENV_PROFILE_ADDRESS` with ambient `PVE_API_TOKEN_*` variables; the
client rejects that mixed provenance. API-token mode uses an explicit
`--endpoint` or `PVE_ADDRESS` with both token variables. Prefer a
least-privilege API token with an expiry for automation. A username without a
realm is normalized to `@pam`; use an explicit realm when that is not correct.

TLS certificate verification is enabled by default. Prefer `PVE_CA_FILE` or
`--ca-file`. Use `--insecure` only after the user accepts the certificate risk;
never silently downgrade to plain HTTP.

Client safety bounds are one hour for a single HTTP request, 24 hours for a
mutation task, and five minutes between task polls. Timeout values must be
finite, positive, and within those limits. The task command validates its task
and poll settings even for a one-shot status read.

Example with a saved local profile:

```bash
python3 <environment-profile-vault-base>/scripts/environment-profile-vault.py \
  run <profile> -- \
  python3 {baseDir}/scripts/pve_vm.py list
```

Resolve `<environment-profile-vault-base>` from the loaded skill for the
current client and scope. Do not hard-code a Codex, Claude, OpenCode, OMP,
project, or global installation root.

## Read Operations

Read operations may run without an additional mutation confirmation:

```bash
python3 {baseDir}/scripts/pve_vm.py version
python3 {baseDir}/scripts/pve_vm.py list
python3 {baseDir}/scripts/pve_vm.py nextid
python3 {baseDir}/scripts/pve_vm.py get --node <node> --vmid <vmid>
python3 {baseDir}/scripts/pve_vm.py task --upid <upid> --wait
```

Before a mutation, always inspect the VM with `get`. For creation, inspect
`nextid` and confirm the target node, storage, network bridge, VMID, and image or
boot source from current PVE state. Do not infer those values from an old note
or another cluster.

## Mutation Gate

Create, update, delete, and power actions are externally mutating operations.
Use this sequence:

1. Read current state and the live API schema relevant to the requested fields.
2. Present the exact endpoint, node, VMID, changed fields, expected effect,
   rollback or recovery path, and the asynchronous task timeout.
3. Ask for explicit user confirmation immediately before execution.
4. Run the command once without `--execute`; inspect the redacted plan.
5. Run the identical command with `--execute`; the client always waits for the
   returned task to stop successfully.
6. Re-read the VM or list to verify the requested end state.

Without `--execute`, every mutating command is plan-only and makes no network
request. A prior request to create this skill or discuss a mutation does not
authorize a later live mutation.

The plan reports the normalized endpoint (or `<unset>`), connection source,
request timeout, task timeout, and poll interval without reading credentials or
constructing a network client.

### Create

```bash
python3 {baseDir}/scripts/pve_vm.py create \
  --node <node> --vmid <vmid> \
  --param name=<name> --param memory=4096 --param cores=2
```

PVE accepts many create parameters. Consult the live API Viewer rather than
copying a static parameter catalog into the skill. Supply known secret-bearing
fields with `--secret-param-env KEY=ENV_VAR`. The CLI rejects sensitive key
names and opaque secret-capable fields such as `args` when passed through
`--param`; do not assume it can infer secrets hidden inside every arbitrary
non-sensitive field value.

### Update

```bash
python3 {baseDir}/scripts/pve_vm.py update \
  --node <node> --vmid <vmid> \
  --param memory=8192 --param digest=<current-digest>
```

Use the `digest` returned by `get` when feasible so a concurrent configuration
change fails instead of being overwritten. The client uses the asynchronous
POST configuration route, rejects `background_delay` because it can suppress
the UPID, and always waits on the returned task.

### Power

```bash
python3 {baseDir}/scripts/pve_vm.py power \
  --node <node> --vmid <vmid> --action shutdown
```

Prefer `shutdown` over `stop`. PVE defines `stop` as an immediate power cut that
can damage guest data; use it only after the user explicitly accepts that risk.

### Delete

```bash
python3 {baseDir}/scripts/pve_vm.py delete --node <node> --vmid <vmid>
```

Before deletion, verify VM identity, power state, protection, HA/replication or
backup references, and recovery evidence. The safe defaults are
`purge=0` and `destroy-unreferenced-disks=0`. Enable `--purge` or
`--destroy-unreferenced-disks` only when the user names that wider deletion
scope. Never retry a timed-out delete until the task and VM absence/presence
have been reconciled.

## Failure And Task Handling

- Every executed mutation must return a UPID. The client automatically polls
  the node encoded in it until `status=stopped`; success requires
  `exitstatus=OK`. UPIDs must match PVE's fixed field count, hexadecimal field
  widths, and field character restrictions. The accepted compatibility flag
  `--wait` is unnecessary.
- The REST client rejects all HTTP redirects so credentials cannot be forwarded
  to another origin or downgraded to HTTP.
- On a mutation transport or response-read failure, malformed UPID, task
  failure, unknown task state, or timeout, report the result as unresolved with
  operation, node, VMID, and any known UPID. Reconcile remote state before
  retrying. This includes failures while reading an HTTP error response body.
- Ticket authentication is renewed once after an HTTP 401. Other failures are
  not retried automatically.
- Empty or whitespace-only ticket and CSRF values are rejected immediately.
- Report HTTP status and redacted PVE errors. Do not print request headers,
  cookies, CSRF values, passwords, or token secrets.
- Task status and failure data redact known credential values before they are
  returned or embedded in an error.
- Read results and API error objects redact opaque secret-capable keys such as
  `args`, including nested occurrences.
- VM status reads accept only the official `running` and `stopped` values.
- Treat an unknown response shape, missing `data`, missing UPID, or unverifiable
  target identity as a stop condition.

## Output Contract

For mutation plans and executed mutation results, report:

- normalized endpoint and connection source without credentials;
- operation, node, VMID, and redacted changed-field names;
- request, task, and poll timeout boundaries;
- plan-only or executed status;
- UPID and final task `exitstatus` for asynchronous work;
- post-operation verification result from the caller's required follow-up
  `get` or `list`; the script does not perform that second read automatically;
- any unrun live check, unresolved task, TLS exception, or rollback gap.

Read operations return their endpoint-specific data rather than repeating the
mutation connection/timeout envelope. The caller should report the configured
target separately when presenting read evidence.
