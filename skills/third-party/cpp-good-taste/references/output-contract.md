# Output Format

> **When to load this file**: Load when you have completed the taste axes walkthrough and are ready to produce the review output. Do NOT load for preliminary inspection — focus on the code and taste axes first.
>
> **Do NOT load** this file if the review scope is a single function or trivial change — produce a condensed verdict instead.

---

## Review Output Template

Use this structure for full taste reviews:

```md
## Taste Verdict

Rating: Good Taste / Acceptable / Works But Awkward / Bad Shape

One-sentence judgment:
...

## What This Code Is Trying To Be

Describe the apparent design intent.

## Main Taste Problems

### 1. [Problem name]

Evidence:
- ...

Why it matters:
- ...

Better shape:
- ...

### 2. [Problem name]

Evidence:
- ...

Why it matters:
- ...

Better shape:
- ...

## Good Parts Worth Keeping

- ...

## Suggested Refactor Direction

Describe the target design shape before showing code.

## Minimal Change Path

1. ...
2. ...
3. ...

## Risk If Left As-Is

- ...

## Questions For The Author

Ask only questions that cannot be answered by reading the codebase.
```

---

## Diff-Level Additions

If reviewing a diff, also add:

```md
## Diff-Level Taste Summary

- New abstraction introduced:
- Existing abstraction stressed:
- Special cases added:
- Ownership/lifetime changes:
- Error model changes:
- Dependency direction changes:
```

---

## Final Summary

End every review with:

```md
## Final Taste Summary

Verdict:
...

Best design aspect:
...

Worst design pressure:
...

One refactor with highest leverage:
...

What to avoid:
...
```

---

## Condensed Review (small scope)

For single-function reviews or diffs under ~50 lines, produce a compact output:

```md
## Quick Taste

Rating: Good Taste / Acceptable / Works But Awkward / Bad Shape

Core concern:
...

What to watch for:
- ...
```
