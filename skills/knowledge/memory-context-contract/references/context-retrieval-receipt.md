# Context retrieval receipt

The only producer contract is Codebase `lib/context-retrieval.mjs`: schema
`codebase-build.context-retrieval-receipt`, version `1`, receipt type
`retrieval`. The closed top-level fields are `schema`, `version`,
`receipt_type`, `claim_id`, `lane`, `query`, `created_at`, `route`, `worktree`,
`ok`, `state`, `execution`, `transport`, `query_outcome`, `provider`, `search`,
`read`, `error`, and `digest`. The JSON shape is defined in
`context-retrieval-receipt.schema.json`.

## Digest and validation

`digest` is `sha256:` plus the SHA-256 digest of Codebase canonical JSON for
the receipt without its `digest` field. Object keys are sorted recursively,
array order is preserved, and `-0` is represented as `0`. Unknown or missing
top-level fields, malformed nested values, and a digest mismatch fail closed.

Use the deployed shared skill script (or the packet-provided absolute path) to
validate a receipt or run the read-only check:

```text
node .agents/skills/memory-context-contract/scripts/context-retrieval-receipt.mjs --receipt FILE --json
```

For a user-scope projection, resolve the same script below `HOME` when the
packet does not provide an absolute path. Do not use `.zcode/skills`.

Missing or invalid input is non-zero. A valid `PLANNED` receipt is also
non-zero because planning is not retrieval evidence.

## Nested state rules

- `CONTEXT_READY` requires `execution=EXECUTED`, a `search` object, and a
  `read` object whose `uri` is present in `search.candidate_uris`.
- `NO_RELEVANT_HIT` requires `execution=EXECUTED`, a `search` object with no
  candidate URIs, and `read=null`.
- `DEGRADED` and `QUERY_FAILED` require `execution=EXECUTED`, preserve an
  error, and translate to a context gap. A degraded receipt may have an
  unavailable transport or an executed MCP transport.
- `PLANNED` requires `execution=PLANNED`, `search=null`, `read=null`, and no
  error or provider claim.

## State-to-gate mapping

| Receipt state | Harness gate | Interpretation | Exit |
| --- | --- | --- | ---: |
| `CONTEXT_READY` | `READY` | 已读取 | 0 |
| `NO_RELEVANT_HIT` | `READY_WITH_NOTES` | 仅尝试 | 0 |
| `DEGRADED` | `READY_WITH_NOTES` | context gap | 0 |
| `QUERY_FAILED` | `READY_WITH_NOTES` | context gap | 0 |
| `PLANNED` | `NOT_READY` | 未执行检索 | 1 |

The validator only verifies and translates producer evidence. It does not
select or invoke a knowledge provider, write Spool, run hooks, classify an
automatic lane, or create a parallel workflow.
