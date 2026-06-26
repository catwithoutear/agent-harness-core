# Skill Judge Rubric

Use this rubric after reading the target skill. Do not score from file length or
style alone.

## Trigger And Scope

Good:

- Description starts with concrete "Use when" conditions.
- Trigger nouns include the task object, action, and context.
- The body states when not to use the skill when nearby skills could be
  confused.

Bad:

- "Use for docs", "Use for coding", or other broad category triggers.
- A skill that claims to orchestrate work but does not name required lower-level
  skills or tools.
- A generic description hiding a narrow body.

## Knowledge Delta

Good:

- The skill contains procedures, tradeoffs, edge cases, or local rules that the
  base model would not reliably infer.
- Examples are compact and behavior-calibrating.

Bad:

- Explains basics the model already knows.
- Repeats generic coding or writing advice without domain consequences.
- Adds theory but no action.

## Progressive Disclosure

Good:

- `SKILL.md` is a concise router and operating procedure.
- Long rubrics, examples, templates, and API details live in `references/`,
  `templates/`, `assets/`, or `scripts/`.
- The body says exactly when to read each resource.

Bad:

- One giant `SKILL.md` with all examples and background loaded every time.
- References exist but are never mentioned.
- Deep reference chains that hide required instructions.

## Procedure And Failure Handling

Good:

- The skill tells the agent how to start, what to inspect, when to stop, and how
  to report.
- It says what to do when inputs are missing or evidence conflicts.

Bad:

- The procedure is just a checklist of qualities.
- The skill silently authorizes edits, deletion, publishing, or external calls
  without a clear user request.

## Resources And Validation

Good:

- Scripts are preferred for deterministic repeated work.
- The skill has a validation path such as `quick_validate.py`, package tests, or
  realistic forward tests.
- Assets are output resources, not extra instruction dumps.

Bad:

- Bundled files are unrelated or undocumented.
- The skill depends on a project path while presenting itself as generic.

## Output Contract

Good:

- Output is stable enough for a parent agent to consume.
- Findings include evidence and required fixes.
- The report separates blocking issues from improvements.

Bad:

- Vague "looks good" summaries.
- Suggestions without evidence.
- Rewrites when the user asked only for review.

## Blocking Anti-Patterns

Flag these before scoring:

- Trigger/body mismatch: the description routes broad work into a narrow body or
  hides the real use case.
- Prompt dump: the main `SKILL.md` loads long background, examples, or rubrics
  that should be references.
- Orphan references: required reference files exist but the body never says when
  to read them.
- Authority leak: a review, planning, or cleanup skill can edit, delete, publish,
  or resolve work without an explicit user request.
- Generic-package leak: a core/generic skill depends on project-specific paths,
  names, tools, or policies.
- Review/implementation blur: the skill rewrites artifacts when the user asked
  only for review.
