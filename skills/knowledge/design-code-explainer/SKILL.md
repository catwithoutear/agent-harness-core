---
name: design-code-explainer
description: Use when mapping implementation code back to design artifacts, producing architecture/layout/I-O traceability, or generating Markdown/HTML/PDF handoff reports.
---

# Design Code Explainer

Turn an implemented change into a source-grounded handoff report that explains
what was built, why the code is shaped that way, and where each design decision
appears in code.

## Core Rule

Every important claim must link design text to code evidence. If the code
anchor is missing, stale, or only inferred, say so instead of filling the gap
with narrative.

## Inputs

Accept any combination of:

- design artifacts: requirements, proposals, design docs, implementation plans,
  specs, issue notes, or pasted design text,
- implementation evidence: local diff, branch diff, merge/pull request diff,
  commit range, staged diff, or named files/classes/functions,
- output request: chat explanation, Markdown, HTML, PDF, or handoff report.

If design source or code source is missing, ask for the missing input or state
the boundary. Do not infer a design-to-code relationship from only one side.

## Workflow

1. Identify design source, implementation source, output format, and target
   audience.
2. Read the design chain first and keep stable section anchors.
3. Read implementation evidence from current source and diffs, not generated
   summaries alone.
4. Build a traceability table before drafting prose.
5. Trace each material runtime path: input, validation, state change, side
   effects, output, errors, cleanup, and observability.
6. Select the smallest diagram and excerpt set that makes the mapping clear.
7. Read `references/report-contract.md` before producing a multi-section or
   file report.
8. For HTML output, use `assets/report-template.html` as the Chinese default
   starting layout. If the requested report language is not Chinese, translate
   all visible scaffolding before final output.
9. Validate cheap evidence before handoff: paths, links, diagram syntax when a
   renderer exists, output file existence, unresolved template tokens, placeholder
   text, and PDF render checks when requested.

## Output Modes

| User asks for | Output | Load/use |
|---|---|---|
| explanation in chat | concise Markdown in final answer | report contract only if multi-section |
| Markdown report | `.md` report | `references/report-contract.md` |
| HTML report | `.html` report | report contract and HTML template |
| PDF report | `.html` plus `.pdf` report | HTML first, then PDF export and validation |
| no file artifact | no file by default | do not load render-only resources |

Follow the target repository's report location convention when one exists.
Otherwise write only to a user-specified path.

## Language

Match the user's requested language. The bundled HTML asset is a Chinese
default template. If the user asks for another language, replace `lang`, title,
navigation, headings, badges, captions, status labels, and all visible
scaffolding in that language before handing off. Keep code identifiers, paths,
commands, API names, branch names, commit ids, and canonical enum values
unchanged.

## Traceability Status

Use these statuses consistently:

| Status | Meaning |
|---|---|
| Implemented | Design point has direct code anchors and behavior evidence. |
| Partial | Some design intent appears in code, but behavior, tests, or paths are incomplete. |
| Diverged | Code intentionally or accidentally differs from the design. |
| Missing | No implementation anchor found. |
| Inferred | Relationship is plausible but not directly proven by source. |
| Not applicable | Design point is non-code context or explicitly out of scope. |

Never mark a row `Implemented` without a file/symbol anchor.

## Visual Evidence

For HTML/PDF reports, optimize for quick visual understanding before long
prose:

- include topology diagrams for subsystem boundaries and direction,
- include component diagrams for service/module/library/plugin boundaries,
- include class/module relationship diagrams when object or module ownership is
  material,
- include focused flow/state diagrams for non-trivial runtime paths,
- include trace timeline diagrams for ordered events, job phases, queues,
  streams, tool calls, or logs,
- render diagrams in the main report and make them expandable when practical,
- pair each important diagram with 1-3 short code excerpts,
- use paths and line numbers as provenance, not as the only explanation.

Do not include raw diagram source or renderer notes by default. Add them only
when requested, when rendering failed, or when debugging report generation.

## Example Mapping

Design point: "Retry transient import failures with bounded backoff."

Good report block:

- diagram shows request -> validation -> retry policy -> final result,
- code excerpt shows `RetryPolicy.nextDelay()` and the branch that stops after
  the configured attempt limit,
- traceability row cites the design section, file/symbol anchor, validation
  test, and status `Implemented`.

Bad report block:

- says "retry was implemented" because a design paragraph exists,
- lists only file paths and line numbers without showing the core code,
- omits the missing metric requested by the design.

## Related Skills

- Use `design-doc-refiner` before implementation when the design is too rough
  to implement.
- Use `multi-lens-design-review` when the goal is design correctness or
  readiness review.
- Use `multi-lens-review` when the goal is bug/risk findings on code or diffs.

## Anti-Patterns

- Summarizing design and code separately with no traceability matrix.
- Claiming "implemented as designed" without source anchors.
- Inventing topology, patterns, classes, queues, persistence, or API contracts
  from design text alone.
- Shipping unresolved template tokens, placeholder text, or sample source paths
  in a generated report.
- Hiding `Missing`, `Partial`, or `Diverged` rows in a table without explaining
  their impact.
- Producing a polished HTML/PDF report from unverified generated summaries.
