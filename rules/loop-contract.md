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

## Continuous Convergence

For execution requests, continue authorized work until the overall objective
satisfies its acceptance criteria; no workflow keyword or fixed phrase is
required. Explicit plan-only, review-only, budget, and staged-stop requests
remain boundaries. A phase, slice, review, or command is not overall completion.

If the objective is incomplete, take the smallest safe in-scope next action and
repeat correction, review, and verification without asking the user to say
"continue". Findings, failed checks, `NOT_READY`, incomplete work, missing
evidence, and ordinary technical uncertainty feed the next iteration. A handoff
or context-compaction checkpoint must preserve the exact next action and does
not terminate convergence.

Finish only when every applicable acceptance criterion passes. Pause dependent
work with `NEEDS_USER_DECISION` when an owner-controlled decision cannot be resolved from
accepted requirements and current evidence. `READY_WITH_NOTES` is completion
only when the acceptance criteria explicitly allow every residual note.

An external blocker that persists after reasonable safe attempts may require a
partial handoff. Record the missing input/capability and exact next action; do
not retry indefinitely or call the objective complete. This loop grants no new
write, publish, deploy, or background scheduling authority.

The loop is generic. Project overlays add project-specific evidence, rules, and
validation commands through their own front door and memory.
