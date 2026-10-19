---
name: context7-auto-research
description: "Use when fetching current library or framework documentation through Context7-style research before answering API or setup questions."
---
# context7-auto-research

## Read Current Documentation

1. Resolve the library/framework and relevant version from the request and
   repository dependency files. Ask only if material version ambiguity remains.
2. Discover an available Context7 connector and read its tool schema. Resolve
   the library identifier, then query the exact API or setup question.
3. Read the relevant returned documentation and cite it. Check applicability to
   the repository version; do not substitute the latest version silently.
4. If Context7 is unavailable, use current official documentation through an
   available browser/search tool and name the fallback. If neither is available,
   report the evidence gap rather than inventing a verified API answer.

## Installation Boundary

Loading this already-installed skill does not authorize installation or global
configuration changes. Do not run an installer during normal documentation
research. Install or configure a connector only on an explicit user request;
use the client's supported installation mechanism and keep credentials out of
prompts, repository files, and logs.
