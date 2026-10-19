# Context retrieval receipt fixtures

These five fixtures are frozen outputs generated from the current Codebase
`lib/context-retrieval.mjs` producer using the
`codebase-build.context-retrieval-receipt` v1 schema and deterministic fake
MCP responses. They keep ordinary Harness clones and CI independent of a
sibling Codebase checkout. The optional real producer contract test runs only
when `CODEBASE_CONTEXT_PRODUCER_ROOT` is explicitly set.

The fixtures cover `CONTEXT_READY`, `NO_RELEVANT_HIT`, `DEGRADED`,
`QUERY_FAILED`, and `PLANNED`.
