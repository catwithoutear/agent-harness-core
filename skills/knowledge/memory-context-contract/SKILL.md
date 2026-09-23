---
name: memory-context-contract
description: Use when a project-selected durable knowledge provider, project vocabulary, source-verified context, or context packet requirements may affect a repository task.
---

# Memory Context Contract

Use the durable knowledge provider selected by the target repository to route
attention, preserve verified project vocabulary, and avoid rediscovering stable
architecture. Do not use durable knowledge as a substitute for current
filesystem evidence. Core does not select, install, or name a provider for the
project.

## Read Order

1. Resolve the provider and its read/write authority from the nearest
   repository instructions or explicit configuration. If none is selected, do not guess or initialize one.
2. Use the provider's index/search surface to open only entries that match the
   current task, repo, subsystem, or vocabulary.
3. Verify drift-prone facts against current source, docs, commands, or config.
4. Include the relevant entries in the context packet with source paths.
5. Promote new durable knowledge only after the current task verifies it and
   the provider's write policy authorizes the promotion.

Skip durable knowledge only for self-contained tasks that clearly do not depend on repo
history, vocabulary, architecture, prior decisions, or reusable commands.

## Context Retrieval Receipt

When context retrieval is attempted or planned, carry a validated
`codebase-build.context-retrieval-receipt` v1 in the context packet. The closed
producer shape and digest rules are in
`references/context-retrieval-receipt.schema.json` and
`references/context-retrieval-receipt.md`; validate it with the deployed
client-neutral shared skill script
`.agents/skills/memory-context-contract/scripts/context-retrieval-receipt.mjs`
before using its gate result. For project or user scope, use the packet's
absolute shared-skill path or resolve it from `HOME`; never substitute a
client-specific path such as `.zcode/skills`.

The receipt is evidence of the retrieval attempt, not a provider-selection or
provider-invocation instruction. Unknown fields and a missing or mismatched
`digest` fail closed. The validator maps states as follows:

| Receipt state | Context gate | Meaning |
|---|---|---|
| `CONTEXT_READY` | `READY` | 已读取 |
| `NO_RELEVANT_HIT` | `READY_WITH_NOTES` | 仅尝试 |
| `DEGRADED` / `QUERY_FAILED` | `READY_WITH_NOTES` | context gap |
| `PLANNED` | `NOT_READY` (non-zero) | 未执行检索 |

`CONTEXT_READY` must contain an executed search and a read object with `uri`.
`NO_RELEVANT_HIT` must contain an executed search with `read=null`.
`DEGRADED` and `QUERY_FAILED` require executed retrieval and preserve a
context gap. `PLANNED` requires `execution=PLANNED`, `search=null`, and
`read=null`; it cannot be used as evidence that retrieval occurred. Receipt
validation only translates evidence; it does not invoke a provider, write a
spool, run hooks, or classify an automatic lane.

For a receipt with another schema, use that producer's documented validator
and gate mapping; do not pass it to the `codebase-build` validator. If no
matching validator is available, report the retrieval claim as an unverified
context gap. Keep producer-specific schema and digest rules with the producer
or its integration.

## What Belongs Where

| Content | Owner |
|---|---|
| Durable project vocabulary | the repository-selected provider's vocabulary or index structure |
| Source-verified subsystem knowledge | the repository-selected durable provider |
| Task-local terminology | `.changes/<change>/terminology.md` |
| Task-local decisions and tradeoffs | `.changes/<change>/decisions/` |
| Unverified notes or open questions | active change workspace, not the durable provider |

Do not promote task-local ADRs into global memory unless the project explicitly
adopts them as long-lived guidance.

## Examples

- A term coined for one proposal belongs in `.changes/<change>/terminology.md`
  until multiple tasks use it unchanged.
- A verified subsystem entry point belongs in the selected durable provider
  only after source paths and validation commands prove it on the current branch.
- A previous session note saying "tests passed" is routing context only; rerun or
  cite current evidence before relying on it.

## Context Packet

Include:

- task goal and non-goals,
- provider and durable entries read,
- source files or commands used to verify current truth,
- vocabulary that must be used consistently,
- constraints and owner questions,
- planned validation,
- facts that may be stale.

Keep it compact. The packet is a map for the work, not a full provider export.

## Drift Rules

- Treat durable knowledge as routing and source-verified context, not as proof of current
  filesystem state.
- Verify drift-prone facts against the current repo before acting.
- Say when a fact came from the durable provider and was not reverified.
- Prefer current branch files over durable knowledge when they disagree.
- Record the disagreement in the task artifact if it affects the work.

## Common Mistakes

- Reading the whole provider corpus and bloating the context.
- Treating a durable entry as approval to edit without checking current files.
- Writing one-off implementation details into durable knowledge.
- Inventing a provider, path, or write API when the repository has not selected one.
- Skipping terminology because it is "just naming"; vocabulary drift often
  breaks later review and search.
