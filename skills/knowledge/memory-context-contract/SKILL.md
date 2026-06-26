---
name: memory-context-contract
description: Use when .memory, project vocabulary, source-verified context, durable knowledge, or context packet requirements may affect a repository task.
---

# Memory Context Contract

Use memory to route attention, preserve verified project vocabulary, and avoid
rediscovering stable architecture. Do not use memory as a substitute for current
filesystem evidence.

## Read Order

1. Read `.memory/INDEX.md` when present.
2. Open only entries that match the current task, repo, subsystem, or vocabulary.
3. Verify drift-prone facts against current source, docs, commands, or config.
4. Include the relevant entries in the context packet with source paths.
5. Promote new durable knowledge only after the current task verifies it.

Skip memory only for self-contained tasks that clearly do not depend on repo
history, vocabulary, architecture, prior decisions, or reusable commands.

## What Belongs Where

| Content | Location |
|---|---|
| Durable project vocabulary | `.memory/language.md` or the memory index structure owned by the repo |
| Source-verified subsystem knowledge | `.memory/` |
| Task-local terminology | `.changes/<change>/terminology.md` |
| Task-local decisions and tradeoffs | `.changes/<change>/decisions/` |
| Unverified notes or open questions | active change workspace, not durable memory |

Do not promote task-local ADRs into global memory unless the project explicitly
adopts them as long-lived guidance.

## Examples

- A term coined for one proposal belongs in `.changes/<change>/terminology.md`
  until multiple tasks use it unchanged.
- A verified subsystem entry point belongs in `.memory/` only after source paths
  and validation commands prove it on the current branch.
- A previous session note saying "tests passed" is routing context only; rerun or
  cite current evidence before relying on it.

## Context Packet

Include:

- task goal and non-goals,
- memory entries read,
- source files or commands used to verify current truth,
- vocabulary that must be used consistently,
- constraints and owner questions,
- planned validation,
- facts that may be stale.

Keep it compact. The packet is a map for the work, not a full copy of memory.

## Drift Rules

- Treat memory as routing and source-verified context, not as proof of current
  filesystem state.
- Verify drift-prone facts against the current repo before acting.
- Say when a fact came from memory and was not reverified.
- Prefer current branch files over memory when they disagree.
- Record the disagreement in the task artifact if it affects the work.

## Common Mistakes

- Reading all memory and bloating the context.
- Treating a memory line as approval to edit without checking current files.
- Writing one-off implementation details into durable memory.
- Skipping terminology because it is "just naming"; vocabulary drift often
  breaks later review and search.
