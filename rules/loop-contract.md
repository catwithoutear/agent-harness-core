---
title: Loop Contract
---

# Loop Contract

Use a small evidence loop for non-trivial agent work:

1. Observe the current state.
2. Build a context packet from verified sources.
3. Choose a fast, compact, or design path.
4. On the design path, challenge the proposal, then review the solution design.
5. After solution-design review, assess whether `implementation-design` is
   required; review the pack before task slicing when it is.
6. Derive bounded tasks from accepted upstream artifacts and review the task set.
7. Implement the current slice.
8. Review against the packet and plan.
9. Verify with commands or source evidence.
10. Persist the useful result or hand off the remaining work.

If a downstream discovery changes the accepted solution, return to solution
design and revisit dependent implementation design and tasks.

The loop is generic. Project overlays add project-specific evidence, rules, and
validation commands through their own front door and memory.
