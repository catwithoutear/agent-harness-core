---
name: harness:verify
description: Select, run, and report the smallest credible validation loop for a change.
argument-hint: "<change id, target, or validation question>"
---

# Harness Verify

Use this when the user asks how to validate, whether a change is ready, or what
evidence is still missing.

Input: `$ARGUMENTS`

## Required Behavior

1. Activate `verification-first` when it is installed.
2. Use `change-workspace-operator` for `.changes` validation, status, inventory,
   and strict-layout checks.
3. Identify the behavior or risk to falsify before choosing commands.
4. Prefer repository-owned checks over generic commands.
5. Classify every check by fidelity:
   - `exact`: same command/config/surface as the target gate.
   - `equivalent`: same behavior through a smaller local surface.
   - `approximate`: useful signal, not proof of the broader gate.
   - `remote-only`: cannot be reproduced locally.
6. Run safe available commands when appropriate. If a command is unavailable,
   blocked, too expensive, or remote-only, say so directly.
7. Do not claim an approximate check proves the broader gate.

## Output

- Behavior/risk under validation:
- Selected checks:
- Commands run:
- Results:
- Fidelity:
- Not run or blocked:
- Next validation step:

Use `READY`, `READY_WITH_NOTES`, `NOT_READY`, or `NEEDS_USER_DECISION` only when
the evidence supports that decision.
