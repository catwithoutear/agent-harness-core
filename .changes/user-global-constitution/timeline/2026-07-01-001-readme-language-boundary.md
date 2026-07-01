---
artifact: timeline-event
status: draft
tags: [workflow, user-global-constitution, language-boundary]
description: "User accepted English core README additions plus a Chinese README_CN entry point."
---

# README Language Boundary

## Event

The user clarified that new core `README.md` content should be English, while a new `README_CN.md` should provide a Chinese entry point and be linked from `README.md`. A later decision refined `README_CN.md` from concise entry point to full translation.

## Decision

Use English for core `README.md` additions. Add `README_CN.md` and link from `README.md` to `README_CN.md`. The exact scope of `README_CN.md` is superseded by `2026-07-01-003-readme-cn-full-translation.md`.

## Evidence

- User answer during `grill-with-docs`: "core README 新增内容使用英文，再补充一个README_CN ，在README中指路"
- Existing core `README.md` is English.
- Requirements already distinguish user-facing Chinese from long-lived English assets.

## Residual Risk

The original concise-entry recommendation was superseded. The remaining risk is translation drift between `README.md` and `README_CN.md`.
