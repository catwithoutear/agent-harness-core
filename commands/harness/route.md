---
name: harness:route
description: Choose the smallest correct harness skill, command, agent, hook, or projection path for a request.
argument-hint: "<goal or question>"
---

# Harness Route

Use this when the user wants the right harness entrypoint, or when a task could
be handled by multiple skills, tools, agents, or client projections.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `ask-harness` when it is installed.
2. Inspect `harness.manifest.json` when present. Trust the manifest over memory.
3. Check the active `.changes` workspace if the request is change-bound.
4. Prefer deterministic commands before skills when the user needs status,
   creation, validation, projection, inventory, or policy output.
5. Prefer one focused skill over a broad orchestration skill unless the request
   truly crosses workflow boundaries.
6. If an orchestration skill is recommended, name the specialist skill or command
   it must call next.

## Output

- Recommended entry:
- Audience:
- Why:
- Required context:
- Next prompt:
- Related read-only commands:
- Do not use:

Keep the answer short. Do not install, migrate, edit, commit, or push unless the
user explicitly asks for that action.
