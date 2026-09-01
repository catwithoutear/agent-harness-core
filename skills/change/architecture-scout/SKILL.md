---
name: architecture-scout
description: Use when mapping unfamiliar repository architecture, locating entry points, tracing cross-module flows, verifying source-backed boundaries, or preparing research evidence before change planning.
---

# Architecture Scout

Map only enough architecture to answer the current change question. Use this
skill before planning when subsystem ownership, entry points, call flow, or
local precedent is unclear.

## Core Rule

Use generated or remembered knowledge as navigation, not proof. Source files and
repository-owned artifacts verify the claim.

## Boundaries

Use this skill for:

- unfamiliar subsystems, entry points, registrations, or dispatch paths;
- cross-module flows and ownership boundaries;
- architecture-risk assessment before `proposal.md`, `design.md`, or
  `tasks/*.md` are finalized;
- source-backed research for `change-planner`.

Do not use it for:

- a small known-file edit with clear ownership;
- bug diagnosis from a concrete failure symptom; use `diagnose`;
- choosing a solution between alternatives; use the owning design process and
  `grill-with-docs` when decisions need pressure-testing;
- promoting speculative branch-only findings into the project-selected durable
  knowledge provider.

## Research Flow

1. Locate the active change with `change-workspace-operator` when one exists.
2. Read relevant entries from the project-selected durable knowledge provider,
   plus `.specs`, rules, and current change artifacts, before broad source
   search. If the repository selects no provider, proceed without inventing one.
3. Use repository-native code navigation first when available, then targeted
   text search.
4. Verify every generated, inferred, or remembered architecture claim against
   source:
   - the path exists in the current checkout;
   - the named symbol, endpoint, command, state, or artifact exists;
   - at least one caller, callee, registration, route, or sibling precedent
     supports the claimed flow.
5. Write non-trivial findings to `.changes/<change>/research.md` or the
   repository's equivalent research artifact.
6. Pass only verified entry points, boundaries, precedents, unknowns, and risks
   to `change-planner`.

## Approach Handoff

When scouting before approach selection, return source-backed inputs rather
than a final design:

- the status quo path and its verified entry points;
- reusable repository patterns and known limitations;
- source-backed alternatives discovered in the codebase;
- unknowns, risks, and evidence gaps that affect the choice;
- external research needs only when the decision depends on public APIs,
  libraries, standards, or other non-repository facts.

The owning design process selects the approach. Use `grill-with-docs` later if
the selected approach needs pressure testing before implementation.

## Output Template

```text
Architecture scout:
- Scope:
- Artifacts and durable knowledge read:
- Source-verified entry points:
- Runtime or artifact path:
- Ownership boundary:
- Reuse precedents:
- Status quo and alternatives:
- Risks:
- Unknowns:
- Files read:
```

## Example Scout

Request: "I need to add retention policy validation, but I do not know where
that policy is enforced."

Good scout:

- reads current requirements and terminology first,
- finds the command/API entry point and config parser,
- verifies the manager or service that enforces policy,
- identifies one sibling policy validation precedent,
- records the boundary and open questions in `research.md`.

Bad scout:

- lists many files from search results without proving the execution path,
- treats a generated architecture summary as fact,
- writes a broad module tour that does not tell the planner where to edit.

## Common Mistakes

- Skipping the repository-selected durable knowledge provider and rediscovering known paths.
- Treating central helper names as architectural importance without call-path
  evidence.
- Updating durable knowledge from an unmerged worktree.
- Producing architecture prose that cannot become a task slice.
