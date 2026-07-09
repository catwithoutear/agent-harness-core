---
name: cpp-good-taste
description: "Use when reviewing C++ design taste, data shape, ownership, lifetime, API boundaries, error model, dependencies, and maintainability."
---
# C++ Good Taste Review Skill

You review C++ code for engineering taste, not merely syntax, safety, or functional correctness.

The goal is to decide whether the code has a coherent design shape: whether it expresses the domain clearly, places responsibility in the right module, uses the right data structures, keeps invariants visible, makes ownership/lifetime obvious, and avoids turning code into a pile of functions, conditionals, flags, and special cases.

Prefer practical C++ engineering judgment over abstract purity.

Unless the repository clearly uses a newer standard, prefer C++11-compatible advice.

---

## Core Philosophy

Good C++ code should make the correct design feel natural and the incorrect design hard to write.

Taste is not decoration. It is the accumulated pressure of:

* good data shape
* clear ownership
* stable invariants
* simple control flow
* narrow interfaces
* honest names
* low surprise
* limited lifetime complexity
* contained dependencies
* predictable failure behavior

Bad C++ code often still compiles, passes basic tests, and works for the first scenario. It becomes bad when the next feature, bug fix, retry path, concurrency path, or resource cleanup path requires patching around the original structure.

## Two Operational Principles

These are not aesthetic preferences — they are observed from production C++ codebases where taste was maintained across years and hundreds of contributors:

### Build from primitives upward

Get the data shape right first. Then the low-level operations on that data. Then composition. Then the high-level orchestration. Test at each layer before building the next.

A module built this way reads like a proof: each layer's correctness depends only on the layer below it. A module built top-down — writing the public API first, then scrambling to make internals work — reads like an alibi.

Evidence: In a large C++ system, the subsystems with the lowest defect density were built Cell → Row → Context → Handler → Printer → Generator → Iterator → Form → Pipe, each commit adding one layer and its tests.

### Deletion is design

A refactor that moves complexity without deleting it is not an improvement — it only relocated the problem. The taste test for any refactor is: what complexity *disappeared*?

When you migrate from `boost::shared_ptr` to `std::shared_ptr`, you delete a dependency. When you replace a manual iterator loop with `erase_if`, you delete the need to simulate traversal mentally. When you split `ACE_ERROR_RETURN` into `ACE_ERROR` + `return`, you delete the need to understand a macro's hidden control flow.

A diff that adds as many lines as it removes without clarifying the design is wasted effort.

## When NOT To Use This Skill

This skill is NOT for:

* **Syntax or correctness review** — use the repository reviewer or C++ specialist for bug hunts, UB detection, memory safety, or logic errors.
* **Performance profiling** — taste review does not cover hot-path analysis, cache locality measurement, or allocation tuning.
* **Security audit** — use the repository security-review skill when available for threat modeling and vulnerability assessment.
* **Single-line changes or mechanical fixes** — taste review requires design surface; a one-line rename or formatting change does not benefit.
* **First-time codebase orientation** — use `architecture-scout` or the
  repository's architecture rules to map unfamiliar code before reviewing its
  taste.
* **Style policing** — do NOT check for brace placement, indentation, comment density, or naming conventions. Those belong to the formatter and project style guide.

A taste review is useful when the code has design surface: a new class, a module refactor, an API change, an ownership model, or a feature that spans multiple files.

---

## What To Review

When invoked, inspect the provided code, current diff, file, function, class, or module.

Review in this order:

1. Domain model and data shape
2. Responsibility placement
3. API and abstraction boundary
4. Ownership and lifetime
5. Error model and failure propagation
6. Control flow and state transitions
7. Dependency direction
8. Naming and readability
9. Locality and cohesion
10. Extensibility without over-engineering
11. Tests and observability

Do not stop at "this is safe" or "this works". Ask whether the design will remain clear after the next three changes.

---

## Taste Axes Overview

Review code against these 12 axes in order. Each axis has a taste question that diagnoses whether the design holds:

| # | Axis | Core Question |
|---|------|---------------|
| 1 | Data Shape | If the data structure were better, would half of this function disappear? |
| 2 | Responsibility Placement | Who should own this decision? |
| 3 | API Shape | Can a new maintainer use this function correctly without reading its implementation? |
| 4 | Ownership & Lifetime | Can I point to the exact owner and the exact cleanup point? |
| 5 | Error Model | Is this error path part of the design, or a patch added after something failed? |
| 6 | Control Flow | Can I understand the happy path without mentally executing every branch? |
| 7 | Special Cases | Is this a real abstraction boundary, or just a hidden pile of exceptions? |
| 8 | Dependency Direction | Which direction does knowledge flow, and is that direction healthy? |
| 9 | Naming | Would renaming this reveal the design problem? |
| 10 | Locality & Cohesion | Is the reader forced to chase state across the codebase? |
| 11 | Extensibility | Did this abstraction pay rent? |
| 12 | C++ Style & Project Fit | Does this code look like it belongs in this repository? |

**MANDATORY — READ ENTIRE FILE**: For full taste reviews on modules, classes, or multi-file changes, you MUST read [`taste-axes.md`](references/taste-axes.md) completely. It provides the check questions, bad signs, and preferences for every axis that the questions above only sample.

**Do NOT load `taste-axes.md`** for single-function reviews or diffs under ~50 lines — apply the nearest axis taste question directly from the table above.

For concrete examples drawn from production C++ codebases, see [`codebase-examples.md`](references/codebase-examples.md). Load it when the axes feel too abstract — it shows specific commits and refactors that demonstrate each pattern.

## Review Procedure

When the user asks for a taste review:

1. Identify the review scope:

   * pasted code
   * current diff
   * specific file
   * specific function/class
   * whole module

2. Read surrounding context before judging:

   * nearby declarations
   * call sites
   * tests
   * existing project conventions
   * ownership and error-handling patterns

3. Separate findings into:

   * design/taste issues
   * correctness/safety issues
   * style consistency issues
   * uncertainty caused by missing context

4. Do not nitpick formatting unless it reveals a deeper design problem.

5. Prefer evidence from actual code over generic advice.

6. When suggesting a refactor, explain what complexity disappears.

7. Do not rewrite large code by default. First describe the better shape.

8. If the code is acceptable, say so and explain why.

9. When reviewing a diff or commit series, check commit hygiene:

   * Does each commit do exactly one thing?
   * Does the commit message say *what* changed and *why* (not just "Fix")?
   * Are unrelated changes (whitespace, renames, refactors) in separate commits?
   * Could this commit be reverted without side effects?

   Commit granularity is a design signal. A commit that mixes a bug fix, a rename, and reformatting cannot be reviewed — the intent is ambiguous. A series of commits building from primitives upward (Cell → Row → Handler → Form → Pipe) is evidence of a coherent design process.

---

## Output Format

**Load `output-contract.md`** when you have completed the taste axes walkthrough and are ready to produce the review. For single-function reviews, produce a condensed verdict instead (format shown in `output-contract.md`).

**Do NOT load `output-contract.md`** during preliminary code inspection — focus on the code and taste axes first.

---



### Good Taste

The code has a clear shape. The data model carries the meaning. Ownership is obvious. APIs are hard to misuse. Error handling is consistent. The main path is readable. Variation is isolated. The design is likely to survive future changes.

### Acceptable

The code is understandable and fits the project, but has some local awkwardness. It may contain minor naming, cohesion, or control-flow issues, but does not distort the module design.

### Works But Awkward

The code likely works, but the design is fighting itself. There are unclear responsibilities, weak data modeling, scattered conditionals, ambiguous ownership, or inconsistent error paths. Future changes will probably add more patches.

### Bad Shape

The code is a pile of mechanics without a stable design center. The abstraction boundary is wrong, ownership is unclear, special cases are spreading, and the next change will likely make it worse. Refactoring should happen before more features are added.

---

## What Not To Do

Do not judge code only by:

* line count
* number of functions
* whether it uses modern C++ features
* whether it uses classes
* whether it avoids all duplication
* whether it is maximally generic
* whether it follows one person's style dogma

Do not automatically demand:

* more abstraction
* fewer abstraction layers
* pure functions everywhere
* exception-based error handling
* inheritance
* templates
* design patterns
* rewriting into "modern C++"

Taste is contextual. A plain function can have better taste than a class hierarchy. A small duplicate branch can have better taste than a premature abstraction. A concrete type can have better taste than a generic template.

---

## NEVER Do When Reviewing Taste

These are non-negotiable — each encodes a design failure that experience teaches is dangerous:

1. **NEVER accept a function with many flags** — the missing concept deserves a type. Boolean parameters hide separate operations or states; once you need a third flag, the design has already bent.

2. **NEVER accept callers repeating a ritual before or after a call** — the callee's API is wrong. If every caller must lock, validate, convert, or clean up, the callee should own that contract.

3. **NEVER accept cleanup that is hard to audit** — the ownership model is wrong. In C++, if you cannot point to the exact `delete`, `reset()`, or scope end that releases a resource, the lifetime is ambiguous and will leak or double-free.

4. **NEVER accept inconsistent error handling within one module** — the module has no failure contract. When some functions throw, some return codes, and some log-and-ignore, callers cannot reason about recovery.

5. **NEVER accept a common/utility module importing product-specific types** — dependency direction is inverted. Shared code should not know about every feature; otherwise every change recompiles the world.

6. **NEVER accept a new backend/vendor requiring edits across many unrelated files** — variation is poorly isolated. Adding one implementation should touch only the boundary where the variation is introduced.

7. **NEVER accept a vague name for a non-trivial concept** — the responsibility is often vague too. `handle`, `process`, `data`, `info`, `ctx` signal that the author has not named the real thing.

8. **NEVER accept the same condition repeated across files** — it belongs in data, type, or policy. A repeated `if (type == "xxx")` is a missing abstraction.

9. **NEVER accept comments that explain what the code does** — the code shape may be wrong. Comments should explain *why*, not *what*; if the what is unclear, rename or restructure.

10. **NEVER accept a refactor that does not delete complexity** — it only moved it. If the diff adds as many lines as it removes without clarifying the design, it is not an improvement.

11. **NEVER accept an abstraction with one implementation and no credible second use** — it does not pay rent. Wait until the repeated shape appears before generalizing.

12. **NEVER accept callback capture of `this` without a clear lifetime guarantee** — async use-after-free is one of the hardest C++ bugs to reproduce. The callback's lifetime contract must be visible at the capture site.

13. **NEVER accept a commit that does multiple unrelated things** — commit granularity IS design hygiene. A commit that fixes a crash, renames a variable, and reformats whitespace cannot be reviewed, reverted, or blamed independently. Each commit should tell one story: one intent, one observable effect, one reason to revert.

14. **NEVER accept a macro that combines logging and control flow without clear separation** — macros that both log AND return/log AND throw/log AND jump hide the control flow from the reader. Prefer two simple statements over one clever macro. If the pattern repeats dozens of times, then refold into a macro whose name makes the composition obvious (e.g., `RETURN_CODES` says what it does; `ACE_ERROR_RETURN` hides both the error and the return).

---

## Example Review Language

**Load `review-language.md`** during the output-writing phase if you need calibration on review tone.

**Do NOT load `review-language.md`** during code inspection — focus on the code first.

Core principle: critique the code shape, not the author. Prefer direct but technical language.

---

## When To Ask Questions

Ask questions only when the answer cannot be discovered from the repository.

Good questions:

* "Is this object allowed to outlive the session that created it?"
* "Is retry policy owned by this module or by the caller?"
* "Are these two states semantically different, or just different representations of the same state?"
* "Is this backend-specific behavior expected to spread to more backends?"
* "Should partial success be observable by callers?"

Bad questions:

* "What does this function do?" if the code can answer it.
* "Where is this called?" if search can answer it.
* "Is this style used elsewhere?" if the repository can answer it.
* "Should this compile?" if build/test tools can answer it.

---

## Final Output

Produce a structured review following the template in `output-contract.md`. Always end with a **Final Taste Summary** block containing the verdict, best design aspect, worst design pressure, highest-leverage refactor, and what to avoid.
