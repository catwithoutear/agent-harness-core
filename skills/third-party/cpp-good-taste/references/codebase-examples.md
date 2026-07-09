# Codebase-Earned Taste Patterns

> **When to load this file**: Load when you need concrete examples of good/bad taste from production C++ codebases. These patterns are not theoretical — each is backed by specific commits in a 126-module C++ backup platform maintained across years.
>
> **Do NOT load** for single-function reviews — the examples here span modules and design decisions. Use the taste axes in `taste-axes.md` for local reviews.

---

## Pattern 1: Build from Primitives Upward

**Observation**: The `json_spirit::form` module was built across 24 commits (Refs #137168) in strict bottom-up order:

```
Cell → Row → smart pointers → Context → Handler → Printer →
Generator → Iterator → Form → Pipe → concrete printers (yajl, void) →
tests → more printers (csv, uof, xml) → replay → Field_Selector → i18n
```

Each layer depends only on the layer below. Each commit adds one layer and its tests. When a design problem was found (e.g., "the Handler is doing too much"), the fix was to extract a new layer (Handler::Pipe), not to patch the existing one.

**Taste signal**: The commit history reads like a dependency graph. There are no "fixup!" or "actually..." commits — the design was correct from the bottom up.

**Counter-example**: A module where the public API was written first, then internals were scrambled to make it work. The commit history shows repeated patches to the same functions as edge cases were discovered.

---

## Pattern 2: Delete Complexity (Don't Move It)

**Observation**: Cross-module migration from ACE to std, tracked across 710 non-merge commits (2 years):

| Before | After | What got deleted |
|---|---|---|
| `ACE_Refcounted_Auto_Ptr<T>` | `std::shared_ptr<T>` / `std::unique_ptr<T>` | ACE dependency, custom refcounting semantics |
| `boost::shared_ptr<T>` | `std::shared_ptr<T>` | boost dependency |
| `boost::scoped_array<T>` | `std::unique_ptr<T[]>` | boost dependency |
| `ACE_Guard<ACE_RW_Mutex>` | `scrt::lock_guard` | ACE dependency, macro magic |
| Manual `for (auto it = ...)` loop | `erase_if(container, pred)` | Iterator state management, 5+ lines of boilerplate |
| `boost::replace_all(s, "%", "")` | `erase(s, '%')` | boost dependency; erase expresses single-char removal better |
| `pextract(val)("/field", x)` for flat access | `extract(val)("field", x)` | Redundant `/` prefix when path has one segment; `pextract` still correct for nested paths |

**Taste signal**: Each migration makes the codebase *smaller* in cognitive load. The diff deletes more than it adds. The replacement expresses intent more precisely than the original.

**Counter-example**: A refactor that "modernizes" code by wrapping old APIs in new abstractions without removing the old ones. Two ways to do the same thing = worse than one.

---

## Pattern 3: Unfold Macros, Then Refold When Stable

**Observation**: `ACE_ERROR_RETURN` was a single macro that logged AND returned:

```cpp
// Before: one complex thing
ACE_ERROR_RETURN((LM_ERROR, "Failed.\n"), -1);

// During migration: unfolded to two simple things
ACE_ERROR((LM_ERROR, "Failed.\n"));
return -1;
```

After the pattern repeated in dozens of places with a new need (returning error codes instead of scalars), it was refolded:

```cpp
// After: refolded with clear composition
RETURN_CODES(codes, cache::error::SERVER_IO);
```

The name `RETURN_CODES` tells you what it does. The name `ACE_ERROR_RETURN` hides both the error AND the return — you have to read the macro definition to understand control flow.

**Taste signal**: The first N times you see a pattern, unfold it. When the pattern is stable and has a clear name, refold it. Never fold prematurely "for DRY."

**Counter-example**: A macro written to avoid typing 3 lines once. It gets used in 3 places, each with slightly different needs, and accumulates boolean flags and `##__VA_ARGS__` hacks. Now it's harder to understand than the 3 lines it replaced.

---

## Pattern 4: Validate at Boundaries, Fail Fast

**Observation**: In the dedup storage subsystem, every boundary has validation:

```cpp
// Before mmap (silent data loss on page eviction):
mmap(..., fd, offset);

// After pread (explicit error on read failure):
pread(fd, buf, size, offset);
```

Other examples from the same subsystem:
- Check chunk headers before freeing space (validate before destroying)
- Save connection state before async operations (save before you lose it)
- Deactivate async threads when client disconnects (clean up, don't leak)
- Only free large chunks — small ones cause fragmentation (performance IS correctness)

**Taste signal**: The code asks "what could go wrong?" at every boundary and handles it explicitly. There are no silent fallbacks, no swallowed errors, no "this can't happen" without a CHECK.

---

## Pattern 5: Name for Intent, Not Mechanics

**Observation**: Function and type names that reduce the need to read implementations:

| Name | What it tells you |
|---|---|
| `Auto_Iconv` | It's RAII (Auto) and wraps iconv |
| `Auto_Socket` / `Auto_Socket_Ex` | RAII socket wrapper |
| `defer_unlink` | It will unlink, but later (deferred) |
| `Exponential_Backoff_Iterator` | Three words, fully specified behavior |
| `visit_cluster_hosts` | Visit (one-time callback traversal), not Get/List/Fetch |
| `erase_if(container, pred)` | What it does (erase) and when (if pred holds) |
| `move_back(container)` | Move the back element out |
| `make_unique<T>(args...)` | Creates a unique_ptr<T> |

**Taste anti-pattern**: `handle`, `process`, `doWork`, `data`, `info`, `ctx`, `manager` — these tell you nothing about what happens or who owns the result.

---

## Pattern 6: One Commit, One Intent

**Observation**: A series of commits fixing GCC 14 `-Wnrvo` warnings across 20 modules:

```
Fix gcc 14 -Wnrvo for scrt
Fix gcc 14 -Wnrvo for oracle
Fix gcc 14 -Wnrvo for dedup
Fix gcc 14 -Wnrvo for mysql and pg
Fix gcc 14 -Wnrvo for utils
... (one commit per module)
```

Each commit is independently reviewable, reversible, and self-contained. If one module's fix causes a regression, you revert that one commit, not the entire series.

Compare to a single commit: "Fix gcc 14 warnings" touching 20 files. Which byte fixed which warning? Impossible to tell from the diff.

**Taste signal**: The commit history is a design document. Each entry answers: what changed, why, and what's the blast radius if it's wrong.

---

## Pattern 7: RAII Naming as Documentation

**Observation**: A naming convention for RAII types that makes resource management obvious at the call site:

```cpp
Auto_Iconv cd;           // Opens on construction, closes on destruction
Auto_Socket sock(fd);     // Owns the fd, closes on destruction
defer_unlink(path);       // Unlinks path on destruction
```

The prefix `Auto_` or `defer_` tells the reader: "this object owns a resource and will release it." You don't need to trace the function to find the cleanup — the type name IS the documentation.

---

## Pattern 8: Abstractions Must Pay Rent

**Observation**: Abstractions that were removed because they had no credible second use:

| Removed | Why |
|---|---|
| `MBC_Writer_Factory` (virtual factory) | One implementation → replaced by a function |
| `Backup_Set_Info_var` (typedef) | Just an alias for `shared_ptr<Backup_Set_Info>` |
| `Catalog_Lister` (interface) | Only ever had `File_Catalog_Lister` → inlined |
| `make_source_entry()` (helper) | Just called `make_shared` → call `make_shared` directly |
| `BACKUP_SET_MGR_Export` (DLL macro) | Dead code → deleted |

**Taste signal**: When you can replace a class/interface/factory with a function and nothing breaks, the abstraction was not paying rent. Delete it.

**Taste question** (axis 11): "Did this abstraction pay rent?" — if the answer is "it might, someday," the answer is "no."
