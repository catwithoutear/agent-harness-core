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
- Current repository root and whether it has a `harness.manifest.json`.
- Available core skills, overlay skills, commands, agents, hooks, and clients.
- Active `.changes` workspace when the request is change-bound.
- Negative triggers in the manifest, especially domain implementation requests
  that do not need harness routing.

If the manifest is present, trust it over memory or old conversation state. If
the manifest is absent, answer from visible files only and state that the result
is best-effort.

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
