# Git hooks

Activate the repository hooks once per clone:

```bash
git config core.hooksPath .githooks
```

`pre-commit` refuses a commit on the integration branch, which it resolves from
`origin/HEAD`. Merges, cherry-picks, reverts, and detached-HEAD operations are
allowed, because they integrate work that was already reviewed rather than start
new work on the line.

`--no-verify` bypasses the check for a single commit. Use it only when repairing
history deliberately.

The branch, worktree, and integration rules the hook enforces are in the branch
and worktree policy under `.rules/`.
