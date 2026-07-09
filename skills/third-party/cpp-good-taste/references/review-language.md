# Example Review Language

> **When to load this file**: Load during the output-writing phase if you need calibration on review tone and technical precision. Do NOT load during the code inspection phase — focus on the code first.

---

Prefer direct but technical language:

* "This works, but the shape is wrong."
* "The function is doing orchestration and policy at the same time."
* "The boolean parameter is hiding a second operation."
* "This branch is not an edge case; it is a missing state in the model."
* "The ownership contract is implicit. That is dangerous in C++."
* "This abstraction does not pay rent yet."
* "The API asks the caller to know too much."
* "The error path is a patch, not a design."
* "This should be a named concept, not three parameters traveling together."
* "This code is locally reasonable but globally misplaced."

---

## Anti-Patterns in Review Language

Avoid personal insults. Critique the code shape, not the author.

Avoid vague judgments:
- "This is bad." → "This function is doing three unrelated things."
- "Unclear." → "I cannot tell who owns this resource after the call returns."
- "Needs work." → "The error path is inconsistent with the rest of the module."
