# Session Bootstrap

Emit a short session entrypoint: read repository front door, resolve active
change if any, and point to `harness-change-doc` / `harness-change-validate`.

Active change resolution must be conservative:

- activate a change only from explicit signals, such as cwd under
  `.changes/<change>/` or an explicit environment/config value selected by the
  user or coordinator;
- emit `state_root`, `code_root`, `active_change`, and the resolution source
  when a change is selected;
- prefer
  `harness-change-doc --state-root <state-root> --code-root <code-root> resolve --change <change> --json`
  when both roots are known;
- if cwd is a linked worktree and the canonical `.changes/<change>` is absent
  or duplicated, emit `Active change: unresolved` and require an explicit
  `--state-root` before regulated writes;
- treat dirty `.changes/<change>` paths from git status as candidates only;
- when explicit signals are absent or conflicting, emit `Active change:
  unresolved` and ask the agent to confirm the workspace before editing;
- never inject raw `--all-active` validator output into model context.

Validation commands in emitted context must use the canonical command form:
`harness-change-validate --state-root <state-root> --change <change>`.
When implementation runs from a separate checkout, add `--code-root
<code-root>`. When `execution-map.md` is present, include a suggested
`--worktrees` validation pass.
