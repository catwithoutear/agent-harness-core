---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation]
description: "Detailed design problem, goals, non-goals, and boundaries."
---
# Problem, Goals, and Boundaries

## Goal

- Make linked-worktree development safe for regulated `.changes` workflows by
  resolving the canonical state root before any regulated write.
- Give large tasks split across multiple worktrees a single durable execution
  map that binds slices to branches, worktrees, owners, dependencies, status,
  and evidence.
- Preserve existing single-root behavior and existing `--repo-root` usage.
- Provide a small V1 implementation surface that can be validated mechanically.

## Non-goals

- Do not implement `branch-local-state` or per-worktree forked `.changes`
  semantics in V1.
- Do not infer the active slice from dirty git status.
- Do not prescribe target-repository branch names, worktree directory names, or
  build commands.
- Do not replace `stacked-branch-workflow`; reuse its branch-stack concepts
  when topology is `stacked`.
- Do not add a separate planning framework outside the existing `.changes`
  contract.

## Boundary Conditions

- V1 mode is `shared-state`: one canonical `.changes/<change>` owns durable
  state, and code worktrees are execution roots only.
- Existing commands using `--repo-root <repo>` continue to work. New clearer
  root options are aliases or additions, not breaking replacements.
- Regulated write commands fail fast when the state root is unresolved or
  conflicts with linked-worktree evidence.
- Non-explicit root inference must check for duplicate `.changes/<change>`
  candidates before selecting the current linked worktree as the state root.
- Read-only status commands may report candidates and unresolved state, but must
  not silently write into a candidate root.
- A task slice can be assigned only when the referenced `tasks/slice-*.md` file
  exists in the canonical change workspace.
- The execution map is optional for ordinary single-root work and required only
  when a change uses explicit worktree assignments.
- Public JS and Python change-tool behavior must stay in V1 parity for root
  flags, execution-map policy, and validator checks.

## Source Artifacts

| Source | Anchor | Decision or fact | Used by |
|---|---|---|---|
| `README.md` | Task Summary | Single canonical `.changes/<change>` owns durable task state. | root resolution, execution map |
| `requirements.md` | Accepted Requirements | Workflow must distinguish code root from canonical state root. | root resolution |
| `requirements.md` | Non-Goals For V1 | `branch-local-state` is out of V1 scope. | command scope |
| `design.md` | Workflow Review Result | Draft was `NOT_READY` until ownership, root resolution, state transitions, and topology were specified. | all implementation-design files |
| `reviews/draft-r01.md` | Findings | Five review findings define the convergence checklist. | design decisions |
| `reviews/subagent-design-r01.md` | Findings | Delegated review reopened duplicate-root precedence, validator CLI contract, Python parity, worktree path semantics, planned status, and stacked dependency checks. | follow-up design |
| `lib/change/doc-tool.js` | `runChangeDoc`, `changeDir` | Current JS doc tool resolves `--repo-root` directly to `.changes/<task>`. | root-resolution module |
| `lib/change/validator.js` | `runChangeValidate` | Current JS validator resolves `--repo-root` directly to schema and `.changes`. | validator changes |
| `lib/change/js-policy.js` | `ARTIFACTS` | Artifact registry lacks `execution-map`. | policy/schema change |
| `schemas/change-workspace.schema.json` | `layout.allowed_files_by_mode` | Structured workspaces only allow known top-level files. | schema update |
| `lib/change/harness_change_doc.py` | `build_parser`, `change_dir` | Python doc tool mirrors command behavior for some change-tool paths. | parity decision |
| `lib/change/harness_change_validate.py` | `main` | Python validator has independent root and schema resolution. | parity decision |
| `commands/harness/workflow.md` | Required Behavior | Active change resolution currently does not resolve separate state/code roots. | prompt update |
| `hooks/intents/session-bootstrap.md` | Active change resolution | Hooks already warn against dirty-status activation. | hook update |
| `skills/change/change-planner/SKILL.md` | Slice Rules | Slices preserve dependency ordering and validation targets. | task-slice contract |
| `skills/workflow/stacked-branch-workflow/SKILL.md` | Stack Invariants | Branch stack rules should remain the authority for stacked topology. | topology contract |

## Rejected Alternatives

| Alternative | Why rejected | Tradeoff kept |
|---|---|---|
| Keep guidance only in skills and prompts. | The original failure is a tooling and state-root ambiguity; documentation alone cannot prevent writes to the wrong worktree. | Skills still explain when and why to use the tools. |
| Store assignment fields only in every task slice. | Coordinators would need to scan all slices and resolve drift manually. | Task slices keep evidence and slice-local implementation details. |
| Store all evidence only in `execution-map.md`. | The map would become a process log and duplicate task-slice review/validation content. | The map stores only a last-evidence pointer. |
| Support `branch-local-state` in V1. | It needs migration, sync, and merge semantics that are separate from preventing accidental duplicate state. | The design reserves the term and rejects silent local state creation. |
| Auto-select another worktree's `.changes` root when exactly one candidate exists. | Silent cross-root writes are surprising and hard to audit. | Read-only resolve output can list candidates and tell the agent what explicit root to use. |
| Defer Python behavior after shipping JS-only commands. | Existing Python change tools already expose overlapping public commands; silent drift would make workflow instructions client-dependent. | V1 implementation must either pass parity tests or explicitly fail in both docs and tests before merge; the selected design is full parity. |
