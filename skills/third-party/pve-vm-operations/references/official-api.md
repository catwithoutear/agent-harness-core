# Proxmox VE Official API Reference

This is a focused routing reference, not a frozen copy of the PVE schema.
Parameter sets and permissions may change. Verify them in the live official API
Viewer and the target cluster before executing a mutation.

## Primary Sources

- [Proxmox VE API Viewer](https://pve.proxmox.com/pve-docs/api-viewer/)
- [Proxmox VE API authentication](https://pve.proxmox.com/wiki/Proxmox_VE_API)
- [QEMU/KVM Virtual Machines (`qm`)](https://pve.proxmox.com/pve-docs/qm.1.html)
- [PVE API shell (`pvesh`)](https://pve.proxmox.com/pve-docs/pvesh.1.html)
- [QEMU API implementation](https://git.proxmox.com/?p=qemu-server.git;a=blob;f=src/PVE/API2/Qemu.pm;hb=HEAD)

Source refresh used for this skill: 2026-08-25. Refresh before relying on
version-sensitive parameters or permissions.

## Authentication

The external REST base is HTTPS on port 8006 with paths under `/api2/json`.

Ticket authentication:

1. `POST /access/ticket` with `username` and `password`.
2. Send the returned ticket as `PVEAuthCookie`.
3. Send `CSRFPreventionToken` on POST, PUT, and DELETE.
4. Tickets have a limited lifetime; the official documentation currently says
   two hours.

API token authentication sends:

```text
Authorization: PVEAPIToken=USER@REALM!TOKENID=TOKEN_SECRET
```

API tokens are stateless and do not require a CSRF token. Prefer a dedicated,
least-privilege token with a bounded expiry rather than a root password for
repeated automation.

The bundled client refuses HTTP redirects. A PVE API call should remain on the
configured HTTPS origin; following a redirect could disclose the Authorization
header, authentication cookie, CSRF token, or login body.

## QEMU VM Endpoint Map

| Purpose | Method and path | Result shape |
|---|---|---|
| Version | `GET /version` | version data |
| Cluster VM inventory | `GET /cluster/resources?type=vm` | array; filter `type=qemu` |
| Next free VMID | `GET /cluster/nextid` | integer; numeric strings are tolerated for older responses |
| Node VM inventory | `GET /nodes/{node}/qemu` | QEMU VM array |
| VM configuration | `GET /nodes/{node}/qemu/{vmid}/config` | config including `digest` when available |
| VM status | `GET /nodes/{node}/qemu/{vmid}/status/current` | `status` is `running` or `stopped` |
| Create VM | `POST /nodes/{node}/qemu` | UPID |
| Update VM asynchronously | `POST /nodes/{node}/qemu/{vmid}/config` | UPID, or null only when `background_delay` is requested and the task finishes within that delay |
| Update VM synchronously | `PUT /nodes/{node}/qemu/{vmid}/config` | null |
| Delete VM | `DELETE /nodes/{node}/qemu/{vmid}` | UPID |
| Start | `POST /nodes/{node}/qemu/{vmid}/status/start` | UPID |
| Graceful shutdown | `POST /nodes/{node}/qemu/{vmid}/status/shutdown` | UPID |
| Immediate stop | `POST /nodes/{node}/qemu/{vmid}/status/stop` | UPID |
| Reboot | `POST /nodes/{node}/qemu/{vmid}/status/reboot` | UPID |
| Task status | `GET /nodes/{node}/tasks/{upid}/status` | `running` or `stopped`, plus `exitstatus` |

PVE JSON responses wrap the operation result in a top-level `data` field.
Mutations generally return a UPID string. The UPID begins with the node name;
use that node for task polling. A stopped task is successful only when its
`exitstatus` is `OK`.

The official UPID decoder accepts exactly
`UPID:<node>:<8-hex-pid>:<8-or-9-hex-pstart>:<8-hex-starttime>:<type>:<id>:<user>:`.
Type and user are non-empty, ID may be empty, and those text fields cannot
contain colons, whitespace, or `/`. The bundled client validates this grammar
before task polling.

The bundled client rejects `background_delay`, so its asynchronous update route
must return a UPID and follows the same task-completion contract as the other
mutations.

`args` is an opaque QEMU argument string and may contain secret-bearing device
configuration. Pass it only through `--secret-param-env`, never ordinary
`--param`. The client also redacts `args` from read and error output.

## Safety-Relevant Semantics

- VMIDs are integers from 100 through 999999999; lower values are reserved.
- Node names follow PVE's `pve-node` grammar: alphanumeric characters and
  internal hyphens, with an alphanumeric first and last character.
- The asynchronous POST config route is preferred for changes involving
  hotplug or storage allocation.
- `digest` provides optimistic concurrency protection for configuration
  changes.
- `shutdown` sends an ACPI event for a clean guest shutdown.
- `stop` exits QEMU immediately and is comparable to removing physical power.
- `purge` removes the VM from related configurations such as backup,
  replication, and HA records.
- `destroy-unreferenced-disks` widens deletion to matching VMID disks not
  referenced by the current configuration.
- The bundled client additionally caps request timeout at 3600 seconds, task
  timeout at 86400 seconds, and poll interval at 300 seconds so platform timer
  limits cannot escape structured error handling. Task and poll values are
  validated for both one-shot task reads and waits.
- Socket and response-read failures, including failures while reading an HTTP
  error body, are normalized to structured transport errors; a mutation that
  encounters one remains unresolved until reconciled.
- Task status fields must be strings from the documented enum before set
  membership or completion checks. Known credential values are redacted from
  task errors and returned task data.

## Refresh Checklist

Before create, update, or delete:

1. Open the exact endpoint in the official API Viewer.
2. Confirm method, required parameters, parameter types, and permissions.
3. Read the target cluster version with `GET /version`.
4. Confirm the VM or free VMID from the target cluster, not from cached notes.
5. Confirm task response and task-polling semantics for the installed version.
