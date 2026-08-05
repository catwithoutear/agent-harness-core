---
artifact: plan
status: reviewed
tags: [workflow, implementation, validation, rollback]
description: "Bounded plan for continuous workflow convergence semantics."
---

# Workflow Convergence Plan

## Goal

When the active instruction both requires using a workflow and expresses an
intent to continue until the overall objective converges, completes, or passes
its acceptance criteria, keep taking the next safe in-scope action without
waiting for another "continue" message. Do not require one fixed phrase, word
order, or language-specific spelling.

## Settled Decisions

- Completion is evaluated against the overall objective, not a phase or slice.
- `READY` advances a phase; it does not complete the objective.
- `READY_WITH_NOTES` completes the objective only when every residual note is
  allowed by the acceptance criteria.
- Findings, failed checks, incomplete work, and ordinary technical uncertainty
  feed the next iteration; they do not request another user prompt.
- A handoff or context-compaction checkpoint preserves continuation state and is
  not completion.
- `NEEDS_USER_DECISION` is reserved for a decision that belongs to the user or
  named owner and cannot be resolved from accepted decisions and current
  evidence.
- Continuous convergence requires both a workflow-use signal and an
  overall-completion signal in the current instruction or still-active user
  context.
- A workflow request without completion intent uses the ordinary workflow. A
  completion request without a workflow signal does not activate this specific
  workflow convergence contract.

## Scope

- `skills/workflow/workflow-control/SKILL.md`
- `rules/loop-contract.md`
- `commands/harness/workflow.md`
- `agents/roles/harness-orchestrator.md`
- the `workflow-control` manifest entry
- focused canonical and projection regression tests

## No-Design Reason

The desired behavior and authority boundary are settled. The change adds no
runtime state, API, persistence format, dependency, or executable scheduler.
It is a coordinated prompt-contract edit with direct text assertions, so a
separate solution design and implementation-design topology pack would not add
useful implementation constraints.

## Approach

1. Define the semantic conjunction of workflow use and overall-completion
   intent, with positive and negative examples.
2. Define mandatory re-entry after incomplete work, findings, or failed checks.
3. Preserve owner-decision and existing authority boundaries as the only
   workflow-level reason to wait for user input.
4. Make handoff preserve the next action without treating it as completion.
5. Add regression assertions for canonical sources and projected content.

## Validation

- Validate this change workspace with `harness-change-validate`.
- Run focused skill, subagent, and projection tests for the changed contracts.
- Run the full repository test suite.
- Validate the manifest and verify the self-hosted Codex projection.
- Run `git diff --check` over the current worktree.

## Rollback

Revert only the convergence-specific paragraphs, trigger terms, assertions, and
this change workspace. Do not revert pre-existing role, projection, design
baseline, or test edits in the dirty worktree.

## Result

- Canonical workflow assets now require the semantic conjunction of a
  workflow-use signal and an overall-completion signal; no fixed phrase, word
  order, or language is privileged.
- Manifest situations are composite and do not use a standalone completion
  phrase as the continuous-convergence trigger.
- Focused and full repository tests pass.
- Manifest validation and refreshed self-hosted Codex projection verification
  pass; Codex reports only the pre-existing unsupported
  `pre-compact-handoff` hook warning.
- Change-workspace validation and `git diff --check` pass.
