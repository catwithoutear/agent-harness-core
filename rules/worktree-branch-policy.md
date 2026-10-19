# Worktree And Branch Policy

Development of this repository happens on task branches in linked worktrees. The
default branch is the integration line and the control plane, not a place to
commit work.

## Default Branch

`main` is the only long-lived branch. Never edit it directly.

Allowed on `main`:

- reading and searching source
- triage and investigation
- `git fetch`, `git pull --ff-only`, tag inspection
- merging an approved pull request, branch creation, worktree management
- documentation-only work you intend to keep in the main checkout

Forbidden on `main`:

- staging or committing a change
- applying a stash
- pushing a commit that did not arrive through a pull request

## Branches

Name branches with the Conventional Commit type of the change, followed by a
short kebab-case topic that names the work:

```text
feat/<topic>      new capability
fix/<topic>       corrected behavior
docs/<topic>      documentation or policy text
test/<topic>      test-only change
refactor/<topic>  behavior-preserving restructure
chore/<topic>     tooling, dependencies, maintenance
```

Pick the prefix that matches the commit type you expect to use, so the branch and
its commits read as one statement: `docs/worktree-policy` carries
`docs(policy): ...`.

- One branch per task. Do not mix unrelated work in one branch.
- Base a new branch on an up-to-date `origin/main`.
- When a task depends on unmerged work, base it explicitly on that branch instead
  of duplicating the change.
- Do not force-push a shared branch.
- Branches created before this policy use the `codex/` prefix. Leave them as they
  are; do not rename merged or in-flight branches.

## Worktrees

Linked worktrees live under the repository-local `.worktree/` directory, and the
path mirrors the branch name:

```text
.worktree/<type>/<topic>
```

Create one with:

```bash
git fetch origin
git worktree add .worktree/<type>/<topic> -b <type>/<topic> origin/main
```

- One worktree per task branch.
- Do not reuse a dirty worktree for a different task.
- Do not run two unrelated tasks in the same worktree.
- Run the verification commands below inside the task worktree.

When the work cannot land as one reviewable patch, stack branches in order
(`a1 -> a2 -> a3`) and base each on its predecessor rather than on `main`.

## Integration

- Sync with `origin/main` before requesting merge and resolve conflicts on the
  task branch. Never resolve them by pushing to `main`.
- Merge only through a pull request, and only after the verification below
  passes.
- After merge, delete the branch and remove its worktree:

```bash
git worktree remove .worktree/<type>/<topic>
git branch -d <type>/<topic>
git worktree prune
```

## Verification

Run these before requesting merge:

```bash
npm test
node bin/harness.js manifest --json
node bin/harness-project.js --target . --clients codex \
  --content rules,templates,skills,subagents,hooks --verify --json
git diff --check
```

A change to a source asset is not ready when the manifest check reports errors or
the projection check reports drift. Refresh the projection with the documented
install command instead of hand-editing `.rules/`, `.agents/`, or `.codex/`.

## Guardrails

- Do not implement a new task directly in the main checkout when a linked
  worktree should be used.
- Do not leave a finished worktree behind. Stale worktrees hide drift and
  mislead later sessions; prune them when the branch is merged or abandoned.
- Do not treat a green verification run as review coverage. Review the diff in
  the scope the task claims.
