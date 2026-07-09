# Active Change Guard

Warn when multiple or zero active change workspaces make validation output
ambiguous. Resolve one active workspace before surfacing raw validator output.

The guard should track `state_root`, `code_root`, and `active_change`
separately. If explicit `--state-root` and legacy `--repo-root` disagree, or a
linked worktree has an absent or duplicated `.changes/<change>`, keep the active
change unresolved and point the agent to `harness-change-doc resolve --json`.

Git status is not an activation signal. Dirty `.changes/<change>` paths can
suggest candidate workspaces, but the guard must keep the active change
unresolved until cwd, environment/config, or an explicit coordinator decision
selects one.

When `execution-map.md` is present, validate it with `--worktrees` before using
assignment state in a prompt. The `Worktree` column is a local execution coordinate,
not portable proof of branch state or merge readiness. Do not describe
per-branch local state as V1 behavior.
