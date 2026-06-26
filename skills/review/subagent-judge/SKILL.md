---
name: subagent-judge
description: Use when evaluating custom subagent prompt quality, role clarity, dispatch fit, authority boundaries, output contracts, validation behavior, or cross-client projections.
---

# Subagent Judge

## Purpose

Evaluate whether a subagent prompt is a bounded, dispatchable specialist that can return useful evidence to a parent agent. Judge the role design, not the model provider or the user's task idea.

## Core Judgment

A good subagent has a narrow mission, clear dispatch triggers, explicit inputs, bounded authority, client-native metadata, evidence requirements, and a structured output contract. If any of those are missing, the parent agent will either avoid dispatching it, over-dispatch it, or trust vague output that cannot be verified.

## Workflow

1. Identify the target subagent file or files and the client format: Codex TOML,
   Claude Markdown, OpenCode Markdown, OMP Markdown, Pi Markdown, or another
   prompt format.
2. Read the full subagent prompt and any sibling projections with the same role name.
3. MANDATORY: read `references/rubric.md` before scoring.
4. If multiple client projections exist, compare prompt bodies separately from client-specific metadata.
5. Score the subagent using the rubric and return the report contract.
6. Separate blocking issues from non-blocking improvements.

## What To Inspect

- Role name, description, and dispatch trigger.
- Mission scope and "do not use" boundaries.
- Required inputs and stopping condition.
- Tool, permission, sandbox, and mode fit.
- Evidence and repository-context rules.
- Output contract and handoff usefulness.
- Failure behavior when inputs are ambiguous or context is insufficient.
- Cross-client consistency without forcing identical metadata.

## Anti-Patterns

NEVER give a high score to a subagent that sounds competent but has no dispatch boundary. A broad specialist is usually a generic agent with a label.

NEVER ignore authority leaks. A review-only or planning-only subagent must not be allowed to edit, commit, publish, or resolve work unless that is its explicit job.

NEVER require client projections to have identical frontmatter. Compare semantic role body separately from client-native metadata.

NEVER judge a subagent only by whether it is long or detailed. Long prompts can hide unclear mission, missing inputs, and vague output.

NEVER turn the evaluation into a rewrite unless the user asks. Provide review findings and a concrete revision breakdown.

## Output

Return:

1. Subagent Evaluation Report
2. Blocking Issues
3. Non-blocking Improvements
4. Missing Subagent Guidance
5. Risk Assessment
6. Suggested Revision Breakdown
