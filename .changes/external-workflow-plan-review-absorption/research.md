---
artifact: research
status: draft
tags: [research, workflow, external-workflow]
description: "Research notes from external workflow and planning skills."
---

# Research Notes

## Source Snapshot

- Repository: `https://github.com/gitkraken/vscode-gitlens`
- Packed output: `/tmp/vscode-gitlens-analysis.xml`
- Snapshot date: 2026-07-09
- Scope read: `.claude/skills/`, `.github/agents/`, `AGENTS.md`, and current
  harness source skill inventory.

The snapshot path is transient evidence. The durable design below records the
portable lessons, not GitLens-specific commands or file paths.

## Candidate Lessons

| Source skill | Portable lesson | Harness route |
|---|---|---|
| `dev-scope` | A task should be scoped into source claims, disputed or unverifiable claims, outcome expectations, code landscape, constraints, and confidence before approach design. | Extend `.changes` requirements guidance and `design-doc-refiner`; do not copy issue-specific GitHub commands. |
| `deep-planning` | Approach selection should define success, inspect code, question existing patterns, use external research when warranted, compare alternatives, and recommend one path. | Extend `architecture-scout` and `design-doc-refiner` with an approach-selection pass. |
| `challenge-plan` | Planning artifacts should be attacked through assumptions, source-verified claims, pre-mortem scenarios, severity, alternatives, and verdict. | Already routed into `grill-with-docs`; keep as the first absorbed slice. |
| `deep-review` | Review should combine correctness findings with goal alignment, completeness across consumers, and validation-gap findings before a merge/readiness verdict. | Extend `review-packet-gate`, `reviewer`, and/or `planning-reviewer` contracts. |
| `review` impact audit | Changed symbols should be traced to importers, call sites, overrides, protocol pairs, and adjacent consumers instead of reviewing diff hunks only. | Extend review packet requirements for implementation reviews. |
| `investigate` | Bug investigation should state hypotheses, trace evidence, source attribution, alternatives ruled out, impact, and confirmation-before-fix. | Current `diagnose` already overlaps; consider a small source-attribution and alternatives-ruled-out enhancement. |
| `triage` / `prioritize` / `update-issues` | Issue pipelines benefit from evidence packs, confidence gates, human approval for external state changes, and dry-run before mutation. | Defer as tracker-agnostic workflow design; keep GitHub-specific automation out of core defaults. |

## Explicit Exclusions

| Source skill family | Reason |
|---|---|
| `ux-review`, `live-exercise`, `live-inspect`, `live-pair`, `live-perf` | Frontend/UI/runtime interaction scope is excluded by user direction for this draft. |
| `a11y-audit`, `a11y-flow-audit`, `a11y-remediate` | Accessibility and UI compliance flows are excluded for this draft. |
| `modern-css` | CSS and design-token flows are excluded for this draft. |
| `add-command`, `add-webview`, `add-icon`, `add-test` | GitLens/VS Code implementation templates are product-specific and not core harness workflow. |
| `commit`, `audit-commits`, `create-issue`, `update-issues` as-is | Useful safety patterns, but GitHub/CHANGELOG/project conventions must not be imported directly. |
