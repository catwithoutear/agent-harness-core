# Session Bootstrap

Emit a short session entrypoint: read repository front door, resolve active
change if any, and point to `harness-change-doc` / `harness-change-validate`.

Active change resolution must be conservative:

- activate a change only from explicit signals, such as cwd under
  `.changes/<change>/` or an explicit environment/config value selected by the
  user or coordinator;
- treat dirty `.changes/<change>` paths from git status as candidates only;
- when explicit signals are absent or conflicting, emit `Active change:
  unresolved` and ask the agent to confirm the workspace before editing;
- never inject raw `--all-active` validator output into model context.

Validation commands in emitted context must use the canonical command form:
`harness-change-validate --repo-root <repo> --change <change>`.
