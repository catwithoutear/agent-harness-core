---
name: technical-doc-refinement
description: Use when refining technical prose, PR/MR descriptions, release notes, runbooks, specs, reports, or architecture notes for clarity, precise terminology, anti-AI tone, and progressive structure.
---

# Technical Doc Refinement

Refine technical writing so it is accurate, direct, readable, and human. This
skill merges technical-document cleanup with a focused anti-AI writing pass; do
not migrate or invoke a separate humanizer skill for core harness docs.

## Boundary

Use this for cleanup-oriented writing work:

- refine PR/MR descriptions, release notes, changelog entries, runbooks,
  technical reports, design docs, specs, and architecture notes,
- remove historical comparison that does not belong in the target doc,
- remove duplicated or filler content,
- sharpen terminology,
- flag contradictions,
- organize content by dependency or reader workflow,
- remove AI-ish tone from user-facing prose.

Use `design-doc-refiner` when the user needs an implementation-ready design with
contracts, task slices, risks, and validation.

Use an external `humanizer`-style writing skill only when the task is
non-technical prose, personal voice matching, marketing copy, or a broad
publication rewrite. Core technical docs should keep voice subordinate to
accuracy, traceability, and terminology.

## Procedure

1. Identify the document purpose and audience.
2. Scan for conflicts before rewriting; do not choose between conflicting facts
   silently.
3. Fix structure first, content second, style last.
4. Replace vague language with precise engineering terms.
5. Remove AI-patterns using `references/writing-patterns.md` when the text is
   user-facing or sounds generated.
6. Preserve required domain terms, code identifiers, legal wording, and quoted
   text.
7. Show material changes or summarize the edited sections.

## Refinement Checks

| Issue | Fix |
|---|---|
| Historical comparison | State current behavior directly unless migration history is the point. |
| Required history | Keep release-note, changelog, or migration context when it is the document's purpose. |
| Redundancy | Keep the most complete version and cross-reference if needed. |
| Filler | Delete words such as "notably", "interestingly", and "it is worth noting". |
| Vague terms | Replace "speed up" with "reduce latency" or another measurable phrase. |
| Conflict | Flag it and ask; do not invent a resolution. |
| Flat structure | Reorder by prerequisite, workflow, or abstraction level. |
| AI tone | Prefer concrete nouns, direct verbs, and varied sentence rhythm. |

## Example Edit

```text
Before: This enhancement significantly improves the current workflow by
leveraging a robust mechanism.
After: The workflow now validates the request before writing state, so failed
requests leave no partial record.
```

## Output

Return:

1. Edited text or patch summary.
2. Conflicts found.
3. Terminology changes.
4. AI-patterns removed.
5. Remaining questions.
