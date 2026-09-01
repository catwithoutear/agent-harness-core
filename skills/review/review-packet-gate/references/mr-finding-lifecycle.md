# MR Finding Lifecycle And Retrospective

Use this reference after an inline MR finding has enough evidence for
disposition. It governs evidence and state; project-specific skills decide
project style and source semantics, while an MR discussion skill performs any
authorized reply or resolve operation.

## Classification

Each finding has exactly one current classification:

- `defect`: behavior, correctness, safety, compatibility, or reliability is
  wrong or at risk;
- `project-style`: the finding matches an evidenced project/company direction;
- `false`: the premise is disproved or does not apply to this code.

`defect` and `project-style` require the fix disposition and, when the comment
asks for similar repair, a complete-task-diff scan. `false` requires source
evidence such as a type definition, API contract, call path, build relation, or
runtime fact suitable for answering the original inline discussion.

## Independent State Fields

Do not collapse these states into “done”:

| State | Owner/evidence |
|---|---|
| `replied` | A response exists in the original discussion. |
| `modified` | A named commit/diff contains the intended change. |
| `verified` | Declared validation actually ran against the intended revision. |
| `reviewer_resolved` | GitLab reports the discussion resolved by the authorized reviewer/owner. |

Replying is not modifying; modifying is not validating; validating is not
reviewer resolution. For a true finding, the author normally replies with the
change and evidence but does not resolve the discussion on the reviewer's
behalf. A summary MR comment never substitutes for the original inline reply.

## Similar-Issue Scan Evidence

When requested, record:

- accepted task base/head or immutable Review Packet target;
- full changed-file scope and semantic search predicate;
- hit locations;
- modified hits;
- unmodified hits and reason.

An omitted file or a textual-only search keeps the finding open unless the
project lens proves that scope sufficient.

## Retrospective Trigger

Lightly screen every dispositioned finding. Run the detailed retrospective if
any condition holds:

- P0/P1 or clear runtime risk;
- missed by self-review, a current skill, or automation;
- requested complete-task similar scan;
- project style, public format, lifecycle, concurrency, cancellation,
  serialization, error contract, dependency, or resource ownership;
- recurrence across MRs;
- a previously undocumented analysis method;
- a false finding whose disproof method is reusable.

Spelling, one-off naming, and obvious local edits may stop after disposition.

## Retrospective Record

For a detailed retrospective record:

1. surface symptom and reviewer premise;
2. type definitions, call paths, state transitions, build edges, or runtime
   contracts needed to decide it;
3. classification and why;
4. why self-review/skill/automation missed it;
5. reusable reasoning, scope, prerequisites, counterexamples, and automation
   potential;
6. recommended existing owner.

Classify the candidate as one of:

- `Project Rule`
- `Review Heuristic`
- `Code Analysis Method`
- `Workflow Guard`
- `Local Decision`
- `Rejected Candidate`

Use one current promotion state:

- `LOCAL_ONLY`
- `CANDIDATE`
- `READY_TO_PROMOTE`
- `REJECTED`

The candidate record includes source MR/finding, finding disposition, surface
problem, reviewer reasoning, source/project evidence, candidate type, scope,
prerequisites, counterexamples, cross-MR evidence, automation feasibility,
recommended owner, and state. One MR defaults to at most `CANDIDATE`; an
existing formal rule or automated check may justify promotion only when that
authority is recorded.

Promotion into a skill follows `skill-authoring-governance`. Cross-MR reviewer
comment aggregation may provide candidate evidence, but cannot silently mutate
a project or generic skill.
