# Writing Patterns

Use this reference only when the target text sounds generated, promotional, or
over-polished. Preserve meaning and required technical terms.

## Remove These Patterns

- Inflated significance: "pivotal", "crucial", "underscores",
  "serves as a testament".
- Abstract scenery: "landscape", "tapestry", "ecosystem" when a concrete noun
  exists.
- Promotional tone: "robust", "seamless", "cutting-edge", "game-changing".
- Empty transitions: "Additionally", "Furthermore", "It is worth noting".
- Vague attribution: "experts say", "industry reports suggest" without source.
- Present-participle padding: clauses starting with "ensuring", "highlighting",
  "showcasing", or "reflecting" when they add no fact.
- Negative parallelism: "not only X but also Y" when a direct sentence works.
- Chatbot residue: "Great question", "Here is", "I hope this helps", or "let
  me know" in content that should stand alone.
- Decorative formatting: emojis, mechanical bold labels, or heading warm-ups
  that repeat the heading.

## Prefer These Moves

- Use concrete subject + direct verb.
- Name the exact behavior, field, module, or failure mode.
- Keep one claim per sentence when precision matters.
- Use short sentences to reset dense technical paragraphs.
- Keep uncertainty visible: "the source does not show..." is better than
  guessing.
- Preserve required history in changelogs, release notes, migration guides, and
  incident reports; remove only fake contrast and inflated significance.

## Do Not Import From Humanizer

- Do not add personal opinions to technical docs.
- Do not remove precise technical compounds merely because they look polished.
- Do not change project-required heading style, legal wording, quoted text, code
  identifiers, or API names.
- Do not make docs casual when the audience needs exact implementation or
  operational instructions.

## Examples

| Before | After |
|---|---|
| This robust mechanism significantly enhances reliability. | The retry record is written before dispatch, so a restart can resume the job. |
| It is worth noting that the system currently supports multiple modes. | The system supports batch and streaming modes. |
| This change leverages existing infrastructure to ensure seamless operation. | This change reuses the existing queue worker; no new scheduler is added. |
