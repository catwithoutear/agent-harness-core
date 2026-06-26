# Design Code Explanation Report Contract

Read this file before drafting a design-to-code explanation report.

## Output Shape

Use this structure unless the user requests a different format:

1. Title block: change name, branch or commit range, design source, code source,
   timestamp, authoring agent, and validation status.
2. Executive summary: what was built, what problem it solves, and the
   highest-risk areas a maintainer should understand first.
3. Evidence index: design artifacts, source files, diffs, commits, tests,
   generated files, runtime evidence, and explicitly missing evidence.
4. Architecture overview: implementation style, subsystem topology, dependency
   direction, and a high-level diagram when useful.
5. Code layout: changed or relevant files/modules/classes, responsibilities,
   key symbols, and why each exists.
6. Runtime flows: trigger/input, dispatch, validation, state, side effects,
   output, error handling, cleanup, and observability.
7. Design-to-code traceability: every material design point mapped to source
   anchors and status.
8. Subsystem I/O contracts: module, class, function, API, config, persistence,
   and external-system inputs/outputs.
9. Design patterns and rationale: pattern choices explained from current code
   shape, not generic definitions.
10. Deviations, gaps, and risks: design/code differences, partial coverage,
    compatibility risk, operational risk, and evidence limits.
11. Reading and maintenance path: reading order, extension points, safe
    modification boundaries, tests, and debugging entry points.
12. Appendix: validation commands, extra trace tables, and detailed anchors.

Keep every heading in file reports. If a section has no material content, state
the evidence-backed reason it is empty.

## Language Contract

Match the user's requested language. The bundled HTML template is Chinese by
default. When the requested report language is not Chinese, translate all
visible template scaffolding before handoff: `html lang`, title, navigation,
section headings, badges, table headers, captions, status labels, button text,
and default explanatory text. Keep identifiers, paths, commands, API names,
branch names, commit ids, and canonical status or enum values unchanged when
they are evidence anchors.

## Visual Evidence Contract

HTML/PDF reports must make the design-code relationship visible, not just
traceable by line number.

Required for non-trivial subsystem reports:

- topology diagram for subsystem boundaries and dependency/data direction,
- component diagram when module/service/library/plugin/storage boundaries and
  dependencies are material,
- class/module relationship diagram when ownership or collaboration matters,
- at least one focused runtime flow or state diagram for the highest-risk path,
- trace timeline diagram when the change is primarily ordered events, job
  phases, queues, streams, logs, or tool calls,
- short code excerpts beside or below each important diagram,
- expandable/clickable rendered diagrams in HTML reports,
- collapsible floating table of contents in long HTML reports.

Code excerpt rules:

- Use excerpts as primary evidence; paths and line numbers are provenance.
- Keep excerpts small, usually 5-20 lines.
- Include only core fields, signatures, branch points, or stub boundaries
  needed for the explanation.
- Do not paste whole files or long methods.
- Introduce each excerpt with what it proves, then explain the mapping in 1-3
  sentences.

Raw diagram source policy:

- Do not include raw Mermaid, DOT, PlantUML, or SVG source by default.
- Do not include renderer notes by default.
- Include raw source or renderer notes only when requested, when rendering
  failed, or when report generation itself is being debugged.

## Traceability Table

Use this table for the core mapping:

| Design anchor | Design intent | Code anchor | How code realizes it | Status | Evidence |
|---|---|---|---|---|---|
| `design.md:## Retry Policy` | Retry transient failures. | `path/to/retry-module.ext:88`, `RetryPolicy.nextDelay` | Maps retryable errors to bounded backoff and stops after the configured attempt limit. | Implemented | `path/to/retry-test.ext:41`; `git diff -- path/to/retry-module.ext` |

Rules:

- `Design anchor` cites a section, heading, paragraph label, issue note, or
  short phrase.
- `Code anchor` cites file paths and symbols. Include line numbers when
  available from the current checkout.
- `How code realizes it` explains concrete behavior, not the design wording.
- `Status` is one of: Implemented, Partial, Diverged, Missing, Inferred, Not
  applicable.
- `Evidence` includes tests, validation commands, runtime logs, or exact source
  facts.

## I/O Contract Table

Use this table for subsystems, modules, classes, or functions:

| Unit | Inputs | Outputs | State/side effects | Failure behavior | Evidence |
|---|---|---|---|---|---|
| `PlanningUnit` | request payload, config | plan object, warnings | reads policy cache | rejects invalid policy | `path/to/planner.ext:88` |

For functions, include parameter meaning and return/error semantics. For
modules, include external inputs such as config, database rows, RPC payloads,
messages, files, queues, and timers.

## Diagram Contract

Every diagram needs:

- a short title,
- a one-sentence purpose,
- source evidence caption,
- readable scope boundary,
- no more than 15 nodes unless a larger map is explicitly explained.

Use several small diagrams instead of one unreadable map. Do not render a
diagram whose nodes cannot be tied back to design or source evidence; mark
inferred nodes in the caption and traceability table.

## Trace Timeline Contract

Use a trace timeline when ordering matters across a run, state machine, async
job, log stream, message bus, queue, or tool call sequence.

Visual rules:

- vertical time axis on the left,
- dashed containers for phases, turns, retries, subjobs, or lifecycle windows,
- color-coded event boxes for input, control, execution, result, persistence,
  error, and final output,
- right-side callouts for payload snippets, stdout/stderr, database changes,
  files produced, state snapshots, or decisions,
- collapse repeated homogeneous events with `x N`.

Evidence rules:

- Every event category maps to a source/log/design anchor or is marked inferred.
- Pair the diagram with code or log excerpts proving event emission, handling,
  payload shape, or state update.

## Output Mode Contract

| Mode | Required artifact | Must not do |
|---|---|---|
| Chat explanation | final answer only | do not create files unless requested |
| Markdown | `.md` report | do not load or copy HTML template |
| HTML | `.html` report derived from template | do not omit required sections |
| PDF | `.html` source plus `.pdf` export | do not export before HTML and diagram checks |

Use the target repository's report path convention when one exists. Otherwise
write only to a user-specified path.

## HTML Report Requirements

- Use `assets/report-template.html` as the starting layout.
- Treat the template as a Chinese default. Translate all visible scaffolding for
  non-Chinese reports before handoff.
- Keep all 12 report sections from Output Shape.
- Keep the report self-contained when practical.
- Render diagrams in the main body; if a renderer is unavailable, create an
  equivalent inline SVG or simple HTML diagram.
- Make diagrams clickable/expandable for close reading.
- Use a collapsible floating table of contents for long reports.
- Make source paths monospace and line-wrappable.
- Replace every `{{TOKEN}}` with evidence-backed content or an explicit
  evidence-backed empty-state sentence.
- Before handoff, scan generated HTML for unresolved `{{`, `}}`, `TODO`,
  `PLACEHOLDER`, `替换为`, and generic sample paths such as `path/to/`,
  `example/`, or `sample/`. Any match is a report-generation defect unless it
  appears inside a deliberate quoted example in the appendix.

## PDF Report Requirements

Generate HTML first, then print/export to PDF. Preferred command order:

1. `chromium --headless --disable-gpu --print-to-pdf=<out.pdf> <in.html>`
2. `google-chrome --headless --disable-gpu --print-to-pdf=<out.pdf> <in.html>`
3. `wkhtmltopdf <in.html> <out.pdf>`
4. `soffice --headless --convert-to pdf <in.html>`

Check page count with `pdfinfo` when available. Spot-check rendered pages when
available. If diagram rendering fails, fix it before export or explicitly state
that the PDF is text-only.

## Validation Checklist

Before handoff, verify:

- every material design section appears in traceability,
- every `Implemented` row has at least one code anchor,
- every `Diverged`, `Missing`, or `Partial` row is called out in gaps,
- every diagram has source evidence,
- requested output files exist,
- HTML contains all required section anchors,
- generated HTML has no unresolved template tokens, placeholder text, or sample
  evidence paths,
- PDF command and renderer limitations are recorded when PDF is requested.
