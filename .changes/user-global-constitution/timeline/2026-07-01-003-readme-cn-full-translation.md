---
artifact: timeline-event
status: draft
tags: [workflow, user-global-constitution, language-boundary]
description: "User chose full README_CN translation rather than concise entry point."
---

# README_CN Full Translation

## Event

During `grill-with-docs`, the user rejected the recommendation to keep `README_CN.md` as a concise Chinese entry point.

## Decision

Create `README_CN.md` as a full Chinese translation of the English `README.md`. Link to it from `README.md`.

## Evidence

- Coordinator recommendation: "`README_CN.md` 只做 concise Chinese entry point，不做 full translation"
- User answer: "完整翻译"

## Residual Risk

A full translation can drift from the English README. The implementation slice must include a translation completeness check and should define how future README updates keep both files synchronized.
