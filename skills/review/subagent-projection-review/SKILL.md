---
name: subagent-projection-review
description: Use when reviewing canonical subagent roles, client projections, authority boundaries, packet contracts, or projection metadata drift.
---

# Subagent Projection Review

Review canonical role sources and rendered client projections as one contract.
The goal is to catch drift before a client-specific projection grants extra
authority, loses packet requirements, or stops matching the canonical role.

## Inputs

- Canonical role source.
- Rendered client projection files.
- Client metadata requirements.
- Manifest entry for the agent, when packaged.
- Any shared packet or authority contract referenced by the role.

## Check

- Authority boundaries are explicit.
- Input and output packet requirements match the role.
- Forbidden actions are stated for read-only or review roles.
- Client metadata is valid for the target client.
- Runtime names are client-native but map back to one canonical role.
- Project-specific context is passed through packets, not patched into generic
  role bodies.
- Tool permissions match the role's authority.
- Model or effort hints are client-specific metadata, not behavioral drift.

## Authority Review

Classify the role before judging permissions:

- Coordinator: may route work, synthesize decisions, and request gates.
- Implementer: may edit scoped files when assigned a bounded slice.
- Reviewer: read-only by default; may produce findings and gate decisions.
- Synthesizer: read-only; may compare independent positions but must not decide
  by vote or edit artifacts.

If a projection grants write authority to a reviewer or synthesizer, report it
as high severity unless the canonical role explicitly allows it.

## Example Finding

High severity: canonical role says "read-only reviewer", but the Codex
projection enables write tools or omits the forbidden-action paragraph. Required
fix: remove write authority or change the canonical role first.

Non-finding: Claude uses YAML frontmatter and Codex uses TOML metadata while the
same instruction body, authority, and packet contract remain intact.

## Output

Report drift by:

- role,
- client,
- file,
- severity,
- evidence,
- required fix.

State `no drift found` only after checking every selected client projection.

## Common Mistakes

- Comparing rendered projections only to each other and not to the canonical
  role.
- Treating metadata differences as drift when behavior is identical.
- Forgetting that project context belongs in task packets, not generic role
  bodies.
- Leaving one client unreviewed after changing shared role text.
