---
artifact: timeline-event
status: draft
tags: [workflow, user-global-constitution, constitution-template]
description: "User accepted documentation-only template with no manifest or projector changes."
---

# Documentation-Only Template

## Event

The user accepted that the first implementation slice should keep the constitution template documentation-only.

## Decision

Do not add the user-global constitution template to `harness.manifest.json` in this slice. Do not change projector behavior or projection tests. The template is discoverable through README guidance and can be copied or installed manually when explicitly requested.

## Evidence

- Coordinator recommendation during `grill-with-docs`: "本轮 documentation-only，不进 manifest，不改 projector"
- User answer: "同意"

## Residual Risk

Future requests for one-click user-global installation will need a separate installer design, including target path, conflict handling, dry-run behavior, verification, and rollback.
