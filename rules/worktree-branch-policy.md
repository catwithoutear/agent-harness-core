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
PROJECTION_TARGET="$(mktemp -d)"
node bin/harness-project.js --target "$PROJECTION_TARGET" --clients codex \
  --content rules,templates,skills,subagents,hooks --conflict overwrite --json
node bin/harness-project.js --target "$PROJECTION_TARGET" --clients codex \
  --content rules,templates,skills,subagents,hooks --verify --json
rm -rf "$PROJECTION_TARGET"
STATE_ROOT="$(git rev-parse --path-format=absolute --git-common-dir)/.."
node bin/harness-change-validate.js --state-root "$STATE_ROOT" --change <change-id> \
  --schema "$PWD/schemas/change-workspace.schema.json"
git diff --check
```

A clean checkout has no projection to verify, so the projection check
materializes a target first. A linked worktree has no unambiguous state root, so
local validation names the canonical shared state root and the change being
handed off. `--all-active` is a clean-checkout/CI check only: it scans every
active workspace under the state root, which includes unrelated local workspaces
whose evidence may already be red. The same verification jobs run in CI on every
pull request (`.github/workflows/verify.yml`, jobs `test`, `manifest`,
`projection`, and `change-schema`); the local sequence adds `git diff --check`
and validates the handed-off change explicitly. A source change is not ready
when the manifest check reports errors. The CI projection job proves generation
is reproducible; local `--verify` against an installed projection still reports
drift. Refresh a projection with the documented install command instead of
hand-editing `.rules/`, `.agents/`, or `.codex/`.

The `.changes` workspace is ignored by the machine-global gitignore. CI
validation covers tracked workspaces only; force-add (`git add -f`) only the
workspace you intend to ship, never a tree with known-red evidence. Unignoring
the tree is an owner decision and is not applied here.

## Branch Protection Runbook

`bin/harness-branch-protection.js` reads the required check names from
`.github/workflows/verify.yml`, so the workflow job names stay the single source
of truth. It needs an authenticated `gh` with admin rights on the repository
(`gh auth login`, then `gh auth status`).

```bash
node bin/harness-branch-protection.js              # dry run: print the plan
node bin/harness-branch-protection.js --dry-run    # same, stated explicitly
node bin/harness-branch-protection.js --apply      # owner action
node bin/harness-branch-protection.js --check      # read-only drift check
```

- `--repo owner/name` defaults to the `origin` remote; pass it explicitly when
  `origin` is missing or is not GitHub.
- Required checks come from the workflow. The applied baseline enforces the same
  rules for administrators (`enforce_admins`) and configures no bypass actors.
- The dry run prints the repository, branch, required checks, and every `gh api`
  request it would make. It changes no remote state.
- Classic protection is the default. `--apply` reads the current protection
  first and replaces the complete settings object. It aborts when existing
  approvals, restrictions, or other stronger settings would be weakened; pass
  `--force` only after reviewing exactly what will be dropped.
- `--mode ruleset` manages the named ruleset instead. `--apply` updates the
  existing ruleset by name, or creates it when absent, so a repeated run is
  idempotent.
- `--check` exits 0 when live protection matches the workflow jobs and the
  applied baseline settings, 1 on drift (including an unprotected branch), and 2
  on errors. Stale required contexts are drift because they block every pull
  request. A stronger setting that `--apply` will not erase without `--force`
  also reports as drift: either accept the drift or replace it explicitly.

CI protects against accidental omissions. It cannot protect its own definition:
a pull request that edits `.github/`, `tests/`, `schemas/`, or `bin/` must still
be reviewed by the owner before merge.

## Guardrails

- Do not implement a new task directly in the main checkout when a linked
  worktree should be used.
- Do not leave a finished worktree behind. Stale worktrees hide drift and
  mislead later sessions; prune them when the branch is merged or abandoned.
- Do not treat a green verification run as review coverage. Review the diff in
  the scope the task claims.
