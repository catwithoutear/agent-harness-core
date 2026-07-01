---
artifact: timeline-event
status: draft
tags: [workflow, user-global-constitution, language-boundary]
description: "User accepted semantic-content-only trigger for README synchronization."
---

# Semantic README Sync Scope

## Event

The user accepted that README synchronization should be mandatory for semantic content changes, not for purely mechanical edits.

## Decision

The core `AGENTS.md` rule should require paired `README.md` / `README_CN.md` updates when the meaning, command, section, install guidance, warning, behavior claim, or user-facing instruction changes. Formatting-only, typo-only, punctuation-only, and line-wrap-only edits do not require paired changes unless they affect meaning.

## Evidence

- Coordinator recommendation: "语义变化强制同步，非语义编辑不强制同步"
- User answer: "同意"

## Residual Risk

Agents may under-classify meaningful wording changes as typo-only edits. Review should check the paired README whenever a README file changes.
