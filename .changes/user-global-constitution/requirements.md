---
artifact: requirements
status: draft
tags: [requirements, user-global-constitution, language-boundary]
description: "Requirements for user-global agent constitution absorption."
---

# Requirements

## Functional Requirements

1. Provide a reusable user-global constitution template in Agent Harness Core.
2. Keep the constitution text in English because it is long-lived agent-facing content.
3. Keep user-facing design discussion, plans, explanations, and review summaries in Chinese.
4. Preserve professional terminology in common industry English where that is clearer than translation.
5. Keep new core `README.md` content in English because it is a long-lived repository asset.
6. Add `README_CN.md` as a full Chinese translation of `README.md`, and add a pointer from `README.md` to `README_CN.md`.
7. Update core `AGENTS.md` so future agents must keep `README.md` and `README_CN.md` synchronized when either file changes semantic content.
8. Include only constitution-level behavioral rules:
   - semantic map before mutation;
   - independent thinking with respect for agreed direction;
   - bounded autonomy;
   - verification before claiming done;
   - no guessing current facts;
   - respect for project conventions;
   - avoidance of unowned state;
   - pause for security and irreversible changes;
   - simplicity through understanding;
   - evidence and traceability.
9. Make the template discoverable from core documentation without forcing global installation.

## Non-Goals

1. Do not modify the user's actual global `AGENTS.md` in this change.
2. Do not add installer behavior that automatically overwrites user-global instructions.
3. Do not add the constitution template to `harness.manifest.json` in the first slice.
4. Do not change projector behavior in the first slice.
5. Do not add a second coding-discipline framework.
6. Do not require project-specific files such as `IMPLEMENT.md`, `CHANGELOG.md`, backup files, archive zips, or session tracker footers.
7. Do not require a fixed test framework, fixed command set, or fixed coverage threshold.
8. Do not mix this change with the existing uncommitted `simplify`, `grill-diff`, or `code-simplifier` edits.

## Constraints

- Core must remain project-agnostic.
- Source assets belong in source directories, not projected runtime directories.
- User-global installation must remain explicit.
- The first implementation slice should be documentation/template only.
- The first implementation slice should not touch `harness.manifest.json`, projector code, or projection tests.
- `README_CN.md` should be reviewed against `README.md` whenever either file changes.
- Formatting-only or typo-only README edits do not require paired README/README_CN changes unless they affect meaning.
