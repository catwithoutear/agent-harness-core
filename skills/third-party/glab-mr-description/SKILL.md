---
name: glab-mr-description
description: Use when drafting, simplifying, or updating a GitLab MR description from its changes, actual test evidence, shared-library impact, and stacked MR relationships.
---

# GitLab MR Description

Write a concise description of the current MR for its reviewers. Use this for
the MR description, not review discussions or inline comments.

## Gather Evidence

1. Identify the repository, source and target branches, and current head. For
   an existing MR, confirm its identity and read its current description and
   diff. For a draft without an MR, use the intended branch range.
2. Read the relevant changes and their affected callers before describing
   behavior or shared-library impact. For a stacked MR, describe only this
   layer's changes against its immediate target, not the whole stack.
3. Read actual test results for the described revision. Identify the tested
   environment or Hudson job, scenarios, outcome, and any coverage limits.
   A successful build-only job is not test evidence. Do not carry forward a
   test success from another revision as proof of this head.
4. When the MR is stacked, verify its layer number and adjacent MR links from
   branch targets and the recorded stack. Commit order alone does not prove
   the relationships. Omit nonexistent neighbors; distinguish an unknown
   relationship from an absent one and flag missing facts in the draft.

Read target-repository instructions and MR templates for applicable additional
requirements. Explicit user instructions take precedence; surface a material
conflict rather than silently replacing the agreed format.

## Description Format

Use the following Chinese headings for a Chinese request. Adapt the language
when explicitly requested, preserving the same section meanings. Include only
applicable sections, in this order:

| Section | Content | When to include |
|---|---|---|
| `变更` | What this MR changes and the resulting behavior. | Always. |
| `公共层影响` | Effects of this MR's shared-library changes on callers, compatibility, or other consumers. | Only when the MR changes shared-library code. |
| `验证` | Tests actually executed, such as testing after deployment to a real environment or Hudson test runs; give scenarios and observed results. | Always; if none ran, state `未执行实际测试。` |
| `层级关系` | Current layer number, predecessor MR, and successor MR. | Only for stacked branches; omit absent neighbors. |

For `公共层影响`, explain the effect rather than repeat the file list. If a
shared-library change preserves caller behavior, say so with the relevant
evidence. Do not omit this section merely because the change is compatible.

For `验证`, exclude compilation success: compilation is a prerequisite gate.
Do not present planned tests, deployment alone without tested behavior, source
inspection, style checks, or a generic green CI status as completed tests.
Record failures and pending results honestly; a test that ran and failed is
still an actual result. Link the relevant Hudson test job or test record when
available and include material coverage limits beside the result.

- Write concise, clear, natural sentences that reviewers can understand on the
  first reading. Do not coin terms or abbreviations. Use established project
  or common technical terms only where needed; otherwise use ordinary wording.
- Never include skill names, skill invocation or execution details, or
  `.changes` paths, tasks, reviews, or workflow records in the MR description.
  These are preparation material only.

Keep internal review procedures, debugging history, and unrelated work out of
the description. Use `technical-doc-refinement` when available for a prose
cleanup pass, preserving this format and the factual limits of the evidence.
Before returning or publishing the description, reread it against both rules,
including after any cleanup pass.

Minimal shape:

```markdown
## 变更

- <当前 MR 的变动及行为变化>

## 验证

- <实际测试的环境或 Hudson 任务、场景及结果>
```

When applicable, insert `## 公共层影响` after `变更`, and append:

```markdown
## 层级关系

- 当前：第 <N> 层。
- 前置 MR：<链接>
- 后置 MR：<链接>
```

Remove absent optional sections and neighbor rows entirely. Do not leave
empty headings, placeholders, or `无`/`不适用` filler in the finished text.

## Draft Or Update

- A drafting or rewriting request produces Markdown only. It does not grant
  permission to publish the description or change branch/stack state.
- For authorized GitLab reads or updates, use the `glab` skill for connection
  and command handling. Recheck MR identity and head before writing; if the
  head changed, refresh the description and validation claims first. Preserve
  required repository metadata and user-authored content outside the rewrite
  scope. Pass multiline Markdown through a file or structured payload, then
  read back the exact description to verify it was stored correctly.
- Return the draft, or the MR link and verified update result. Keep any
  evidence gaps explicit; do not claim the MR was updated after drafting only.
