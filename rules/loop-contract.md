---
title: Loop Contract
---

# Loop Contract

Use a small evidence loop for non-trivial agent work:

1. Observe the current state.
2. Build a context packet from verified sources.
3. Plan the next bounded slice.
4. Implement the slice.
5. Review against the packet and plan.
6. Verify with commands or source evidence.
7. Persist the useful result or hand off the remaining work.

The loop is generic. Project overlays add project-specific evidence, rules, and
validation commands through their own front door and memory.
