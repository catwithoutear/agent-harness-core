# Taste Axes — Detailed Review Criteria

> **When to load this file**: MANDATORY — read this entire file when performing a full taste review on a module, class, or multi-file change.
>
> **Do NOT load this file** for single-function reviews or diffs under ~50 lines — use the taste axis overview in SKILL.md and apply the nearest axis taste question directly.

---

## 1. Data Shape Before Code Shape

Good code starts with the right data structure.

Check:

* Are the central concepts represented explicitly?
* Are invalid states hard to represent?
* Are boolean flags hiding real states?
* Are several loosely related parameters actually one concept?
* Are maps, vectors, pairs, tuples, or raw structs being used where a named type would clarify intent?
* Is the code compensating for a poor data shape with conditionals?

Bad signs:

* Many `bool` parameters
* Parallel vectors
* Magic integers or stringly-typed states
* Repeated conversions between similar representations
* Branches that exist only because the data model is vague
* `std::pair` or `std::tuple` escaping across module boundaries
* A struct with many fields but no invariant or clear semantic role

Prefer:

* named domain types
* explicit state enums
* small value objects
* clear ownership-bearing types
* structures that make downstream code simpler

Taste question:

> If the data structure were better, would half of this function disappear?

**Codebase evidence**: The `json_spirit::Cell` type defines 18 value types in a union, not as stringly-typed data scattered across the codebase. Every downstream operation (printing, serialization, comparison) becomes a simple switch on `type`. If the data model were weaker — e.g., `std::map<string, string>` — every downstream function would need its own parsing and validation. See also: `references/codebase-examples.md`, Pattern 1.

---

## 2. Responsibility Placement

Good code puts behavior near the data and policy near the owner of the decision.

Check:

* Is this function doing work that belongs to another class/module?
* Is orchestration mixed with low-level mechanics?
* Is a utility function becoming a dumping ground?
* Does the caller know too much about the callee's internals?
* Is a class merely a namespace for unrelated functions?
* Is business logic hidden inside glue code?

Bad signs:

* `utils`, `common`, `helper`, or `manager` accumulating unrelated logic
* Callers assembling internal state for another object
* A function that validates, transforms, persists, logs, retries, and reports
* Logic duplicated because the proper owner does not expose the right operation

Prefer:

* modules with a clear reason to exist
* operations attached to the owner of the invariant
* thin orchestration layers
* low-level code that does not know high-level policy
* high-level code that does not micromanage low-level representation

Taste question:

> Who should own this decision?

---

## 3. API Shape

A good API makes correct usage obvious.

Check:

* Does the function name say what semantic operation is performed?
* Are parameters ordered naturally?
* Are output parameters avoidable?
* Are ownership and lifetime expectations visible from the signature?
* Does the API expose implementation details?
* Does the caller need to perform a ritual before or after calling it?
* Can the API be misused easily?

Bad signs:

* Long parameter lists
* Multiple nullable/raw pointer parameters
* Boolean mode flags
* Output parameters for multi-step mutation
* Function names like `process`, `handle`, `doWork`, `sync`, `updateInfo`
* Required call sequences not encoded in types
* APIs that return partially initialized objects

Prefer:

* small semantic operations
* named request/result types
* explicit ownership transfer
* clear success/failure result
* idempotent operations where appropriate
* APIs that return complete objects or explicit status

Taste question:

> Can a new maintainer use this function correctly without reading its implementation?

**Codebase evidence**: `pextract(obj)("/field", var)` was replaced by `extract(obj)("field", var)` for single-level field access across dozens of files. The key insight: `pextract` uses JSON Pointer (RFC 6901) syntax — essential for nested paths like `"/users/0/name"`, but overkill for a flat field name. The `/` prefix in `"/field"` carried zero structural information. `pextract` is NOT being replaced wholesale — it remains the correct tool for multi-segment paths. This was about choosing the right API for the access pattern. See also: `references/codebase-examples.md`, Pattern 2.

---

## 4. Ownership and Lifetime

In C++, taste is heavily tied to lifetime clarity.

Check:

* Who owns this object?
* Who may mutate it?
* Who observes it?
* Can the pointer/reference outlive the pointee?
* Is cleanup deterministic?
* Is ownership transfer explicit?
* Are callbacks capturing objects safely?
* Are async operations extending lifetime correctly?

Bad signs:

* Raw owning pointers
* Ambiguous references stored beyond the call
* `shared_ptr` used because ownership is unclear
* `shared_ptr` cycles
* Objects initialized in one function and cleaned up elsewhere
* Manual cleanup paths scattered across branches
* Callback captures of `this` without clear lifetime guarantee
* Resource handles copied accidentally

Prefer:

* RAII
* value semantics where cheap and clear
* `unique_ptr` for single ownership
* `shared_ptr` only for actual shared lifetime
* non-owning raw pointers/references only when lifetime is locally obvious
* scope-bound guards for cleanup
* narrow mutation windows

Taste question:

> Can I point to the exact owner and the exact cleanup point?

**Codebase evidence**: Cross-module migration from `ACE_Refcounted_Auto_Ptr<T>` to `std::shared_ptr<T>` / `std::unique_ptr<T>` (500+ commits). The old type had custom refcounting semantics; the new types have well-known, standard semantics. Choosing `unique_ptr` vs. `shared_ptr` forces the author to decide: single owner or shared lifetime? The old type sidestepped that decision. See also: `references/codebase-examples.md`, Pattern 2 and Pattern 7.

---

## 5. Error Model
---

## 5. Error Model

Good code has one coherent failure story.

Check:

* Are errors represented consistently?
* Are recoverable and unrecoverable errors distinguished?
* Does the function preserve useful diagnostic context?
* Are retries, fallbacks, and partial success states explicit?
* Are errors logged at the right layer?
* Is there double logging?
* Are error codes converted too early or too late?

Bad signs:

* Mixing return codes, exceptions, booleans, nulls, and logs without a rule
* Swallowing errors and returning default values
* Logging and returning the same error at every layer
* Losing the original cause during conversion
* Treating all failures as the same failure
* Retry loops hidden inside low-level functions without policy context

Prefer:

* a consistent project-local result type or error convention
* explicit error categories
* context added at module boundaries
* logging at ownership/policy boundaries
* low-level functions returning facts, high-level functions deciding policy
* fail-fast for violated invariants
* graceful handling only for expected environmental failures

Taste question:

> Is this error path part of the design, or a patch added after something failed?

---

## 6. Control Flow

Good control flow is boring.

Check:

* Is the main path visible?
* Are edge cases isolated?
* Are state transitions explicit?
* Is nesting hiding the important path?
* Are loops doing multiple conceptual passes at once?
* Is the function mixing discovery, decision, and execution?

Bad signs:

* Deep `if/else`
* Branches that differ only slightly
* Accumulating flags across a long function
* `continue` / `break` / mutation interactions that require simulation
* One loop that validates, transforms, filters, persists, and logs
* State encoded by several independent booleans

Prefer:

* early return for invalid preconditions
* clear main path
* extracted decision functions
* explicit state enums
* small loops with one purpose
* tables or strategy objects for stable variation
* comments that explain why, not what

Taste question:

> Can I understand the happy path without mentally executing every branch?

**Codebase evidence**: `erase_if(container, pred)` replaced manual iterator loops across multiple subsystems. The old pattern (`for (auto it = ...) { if (cond) it = c.erase(it); else ++it; }`) required the reader to simulate three intertwined concerns: iteration, condition, and mutation. `erase_if` separates them: the lambda says WHAT matches, the function says WHAT to do. The reader's mental model shrinks from 3 concerns to 1. See also: `references/codebase-examples.md`, Pattern 2.

---

## 7. Special Cases

Good design absorbs variation without scattering special cases.

Check:

* Is this branch a real domain distinction?
* Is this condition repeated elsewhere?
* Is a special case leaking across layers?
* Should the difference be represented in data, type, strategy, or policy?
* Is compatibility code isolated?

Bad signs:

* `if (type == "xxx")` repeated across files
* Feature-specific patches inside generic code
* Special handling for one backend/provider/product in common logic
* Temporal hacks such as "for now", "temporary", "compatible with old"
* Configuration flags that change semantics in surprising ways

Prefer:

* one place that translates external differences into internal uniformity
* explicit strategies for real variation
* compatibility adapters at boundaries
* domain-specific types rather than string checks
* deleting obsolete branches aggressively

Taste question:

> Is this a real abstraction boundary, or just a hidden pile of exceptions?

---

## 8. Dependency Direction

Good code depends inward toward stable concepts, not outward toward incidental mechanisms.

Check:

* Does domain logic depend on transport, storage, UI, CLI, or vendor SDK details?
* Are low-level utilities importing high-level modules?
* Is a common module becoming aware of every product feature?
* Can this code be tested without booting the world?
* Are headers pulling in more dependencies than needed?

Bad signs:

* Circular dependencies
* Header includes that expose implementation details
* Common code importing product-specific code
* Business logic coupled to logging, JSON, HTTP, database, or SDK types
* Large rebuild impact from small changes

Prefer:

* dependency inversion only where it reduces real coupling
* narrow interfaces at module boundaries
* forward declarations where appropriate
* implementation details hidden in `.cpp`
* adapters around vendor or platform APIs
* stable domain types crossing boundaries

Taste question:

> Which direction does knowledge flow, and is that direction healthy?

---

## 9. Naming

Good names reduce the amount of code you need to read.

Check:

* Does the name express domain meaning rather than implementation mechanics?
* Does the name distinguish policy from operation?
* Are names consistent with nearby code?
* Are abbreviations local and obvious?
* Do names hide side effects?

Bad signs:

* `data`, `info`, `ctx`, `obj`, `tmp`, `ret`, `res` used for non-trivial concepts
* `handle`, `process`, `manage`, `do`, `run` without domain specificity
* Names that say "get" but mutate/cache/load
* Names that encode stale implementation details
* Similar concepts with different names
* Different concepts with similar names

Prefer:

* names that encode role and invariant
* verbs for operations
* nouns for values/resources
* project-local terminology
* consistency over cleverness
* short names only for short scopes

Taste question:

> Would renaming this reveal the design problem?

**Codebase evidence**: RAII wrapper naming convention: `Auto_Iconv`, `Auto_Socket`, `defer_unlink`. The prefix tells you the resource is managed AND what the management strategy is — you don't need to read the destructor. Compare to names like `IconvWrapper` or `SocketHandle` — these tell you the type but not the ownership. See also: `references/codebase-examples.md`, Pattern 7.

---

## 10. Locality and Cohesion

Good code keeps related facts close.

Check:

* Are invariants declared near the code that preserves them?
* Are setup and cleanup separated too far?
* Are related branches spread across files?
* Does understanding this function require opening five unrelated modules?
* Are comments compensating for distant knowledge?

Bad signs:

* Initialization in one place, mutation in another, validation elsewhere
* Flags passed through many layers before use
* Configuration read globally in low-level code
* Cross-module hidden contracts
* Tests that need excessive mocking because behavior is scattered

Prefer:

* local invariants
* narrow scopes
* minimal mutable state
* cohesive classes
* small adapters
* explicit data flow
* high-level flows that read like the domain operation

Taste question:

> Is the reader forced to chase state across the codebase?

---

## 11. Extensibility Without Over-Engineering

Good code is easy to change in the direction the system actually changes.

Check:

* Is the abstraction justified by known variation?
* Is the code generic where it should be specific?
* Is it specific where variation is already present?
* Does this design add concepts without removing complexity?
* Would the next likely feature fit cleanly?

Bad signs:

* Interfaces with one implementation and no credible second use
* Template/generalized code for a single concrete case
* Inheritance used for configuration
* Abstract factories hiding simple construction
* Strategy patterns for variation that does not exist
* Copy-paste branches because no abstraction exists where variation is real

Prefer:

* concrete code first
* abstraction after repeated shape appears
* small seams at known change points
* explicit duplication until the abstraction is obvious
* deletion-friendly designs

Taste question:

> Did this abstraction pay rent?

**Codebase evidence**: `MBC_Writer_Factory` (a virtual factory with one implementation) was replaced by a plain function `create_mbc_writer()`. `Backup_Set_Info_var` (a typedef for `shared_ptr<Backup_Set_Info>`) was deleted — it added a name without adding meaning. Each removal made the codebase smaller without losing capability. See also: `references/codebase-examples.md`, Pattern 8.

---

## 12. C++ Style and Project Fit

Good taste respects the surrounding codebase.

Check:

* Does the code match project naming, ownership, error, logging, and threading conventions?
* Does it use modern C++ only where the project supports it?
* Are headers clean and stable?
* Are templates kept where they provide real value?
* Are macros avoided unless they solve a real cross-cutting constraint?

For projects using C++11:

* Do not suggest C++17/C++20 features unless explicitly allowed.
* Prefer simple RAII, value types, `unique_ptr`, small helper structs, and clear functions.
* Avoid clever template metaprogramming.
* Prefer readable code over maximally generic code.

Style preferences when no project rule overrides them:

* Use `snake_case` for functions.
* Use `Class_Snake_Case` for classes if consistent with the project.
* Sort headers by layers: same directory, project headers, third-party headers, standard library headers.
* Keep functions small enough to reason about, but do not split solely to hit a line-count target.
* Prefer explicit names over abbreviations in non-local scopes.

Taste question:

> Does this code look like it belongs in this repository?

## Appendix: Codebase-Earned Patterns

The axes above are abstract. For concrete examples drawn from production C++ codebases (specific commits, specific refactors, specific outcomes), see [`codebase-examples.md`](codebase-examples.md).

**Load `codebase-examples.md`** when:
- You need to calibrate your judgment against real code, not just principles
- The axes feel too abstract and you need to see what good taste looks like in practice
- You are mentoring and want examples of how to recognize the patterns

**Do NOT load `codebase-examples.md`** for quick single-function reviews — the examples span modules and design decisions.
