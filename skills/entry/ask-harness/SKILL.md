---
name: ask-harness
description: Use when choosing a harness skill, command, prompt, client projection, core-vs-overlay path, or manifest route for agent workflow work.
---

# Ask Harness

Use this as the routing front door for the harness. The answer should help the
user or next agent pick the smallest correct entrypoint before any installation,
migration, implementation, or review work starts.

## Inputs to Check

- User goal and exact wording.
- Current repository root and whether it is a core source checkout or a
  project-local deployment.
- Available core skills, overlay skills, commands, agents, hooks, and clients.
- Active `.changes` workspace when the request is change-bound.
- Negative triggers in the manifest, especially domain implementation requests
  that do not need harness routing.

## Evidence Resolution

Resolve evidence from the current repository root in this order:

1. `harness.manifest.json` is the canonical package contract in a core source
   checkout.
2. `.harness/core/harness.manifest.json` is the same package contract in a
   project-local deployment.
3. `.harness/projection-state.json` records which core assets were actually
   projected into the target. It is historical inventory.
   It does not prove that its target still exists or matches. Corroborate the
   target and recorded hash, or run the applicable projector or deployer with
   `--verify`, before a current installed-state claim.
4. `.harness/*-overlay/` and the client-visible skill directories show overlay
   assets when the overlay does not provide its own manifest.

Before treating either manifest candidate as Core, confirm its `name` is
`@catwithoutear/agent-harness-core`. A differently named root manifest may own
project or overlay policy, but it must not supersede the deployed Core manifest;
use each authority only for the assets it owns.

When a self-hosted core checkout has both manifest paths, use the repository
manifest for source-authoring decisions and projection state for installed-state
decisions. Trust the matching manifest over memory or old conversation state.

Do not report that the repository has no manifest until both manifest paths
have been checked and identity-validated. Do not copy the deployed manifest to
the repository root to make discovery succeed. Only call the result best-effort
when no manifest candidate exists that passes Core identity validation; then
name the missing authority and route from projection state and visible files.

## Routing Order

1. Prefer a single command when the user needs deterministic status, creation,
   validation, projection, or inventory output.
2. Prefer one core skill when the task is generic harness work.
3. Prefer one overlay skill when the task is project-domain work and the overlay
   explicitly owns that domain.
4. Combine skills only when the task naturally crosses boundaries, such as
   skill authoring plus projection review.
5. Ask a clarification only when the safe entrypoint depends on information that
   cannot be discovered from the repo.

Do not treat an orchestration skill as a substitute for the specialist skills it
routes to. If an orchestration skill says to activate a lower-level skill, name
that lower-level skill explicitly in the recommendation.

## Example Routes

| User asks | Recommended route |
|---|---|
| "Which command validates this change workspace?" | `harness-change-validate` first; use `change-workspace-operator` only if the user needs guidance interpreting or fixing output. |
| "Review this project-domain MR." | Use the overlay MR review skill and the overlay domain skill named by the manifest; do not route to a generic core review skill as a replacement. |
| "Improve a core skill and its projections." | Use `skill-authoring-governance`, then `subagent-projection-review` if client-visible role or projection behavior changes. |

## Output

Answer in this shape:

- Recommended entry: skill, command, agent, or hook name.
- Audience: user or model.
- Why: the trigger or manifest field that matched.
- Required context: files, manifest data, or current state needed before use.
- Next prompt: one concrete prompt the user can run.
- Related commands: read-only or status commands first.
- Do not use: common confusion or negative trigger.

Keep the answer short. This skill chooses a path; it does not perform the path.

## Common Mistakes

- Recommending a skill only because its name matches one word in the request.
- Treating the absence of a root manifest as evidence that a project-local
  harness deployment has no manifest.
- Ignoring a manifest negative trigger.
- Recommending overlay-specific skills for a core-only harness task.
- Recommending a destructive or write command before a read-only status command.
- Claiming a skill is installed without checking the manifest or filesystem.

## Never

- Install, migrate, commit, push, or run external installers unless the user
  explicitly asks.
- Invent skill names.
- Hide uncertainty about missing manifests, missing overlays, or unavailable
  clients.
