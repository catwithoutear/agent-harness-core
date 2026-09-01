---
name: glab-mr-discuss
description: "Use when posting GitLab MR discussions, inline diff notes, multi-line comments, or suggestion blocks through glab API."
---
# GitLab MR Discussion Commenter

Post inline diff notes, regular discussions, and suggestion blocks on GitLab merge requests.

## Prerequisites

Requires the `glab` skill — invoke it first for authentication and project context.

## Comment Type Selection

```
Is the target file changed in this MR?
├─ No → Regular Discussion (no position)
└─ Yes → Need to anchor to a specific line/lines?
         ├─ No → Regular Discussion
         └─ Yes → Proposing a code replacement?
                  ├─ Yes → Inline Diff Note + Suggestion Block
                  └─ No → Inline Diff Note (single-line or multi-line)
```

Before posting, ask yourself:
- **Scope**: Does this comment target a specific line range, or is it about the MR as a whole?
- **Action**: Should the author be able to apply the change with one click? If yes, use suggestion.
- **Visibility**: Must this appear in the diff view? If the file is unchanged, inline positioning is impossible.

## Comment Types

### 1. Regular Discussion Comment

No file/line positioning. Appears on the MR overview page.

```bash
glab api projects/:id/merge_requests/<MR>/discussions \
    --method POST \
    -H 'Content-Type: application/json' \
    --input /tmp/payload.json
```

Payload:
```json
{
  "body": "Your comment text here."
}
```

### 2. Inline Diff Note

Anchored to a specific line or line range in the MR diff. Creates a `DiffNote` (code-anchored), not a plain `DiscussionNote` (overview page only).

**Step 1 — Get diff refs.** Extract from `glab mr view <MR> --output=json`:

```bash
glab mr view <MR> --output=json | jq '{base: .diff_refs.base_sha, start: .diff_refs.start_sha, head: .diff_refs.head_sha}'
```

For authoritative refs (e.g., after rebase), use `GET /projects/:id/merge_requests/<MR>/versions` — the first entry is the latest version with `head_commit_sha`, `base_commit_sha`, `start_commit_sha`.

**Step 2 — Determine line numbers.** Use `git fetch origin <branch>` + `git show FETCH_HEAD:<path>` to find the exact line number in the head commit version. Never guess.

**Step 3 — Post.**

Single-line payload:
```json
{
  "body": "Comment text",
  "position": {
    "position_type": "text",
    "base_sha": "<base_sha>",
    "start_sha": "<start_sha>",
    "head_sha": "<head_sha>",
    "old_path": "<file_path>",
    "new_path": "<file_path>",
    "new_line": 42
  }
}
```

Multi-line payload (highlight a range instead of one line):
```json
{
  "body": "Comment on this range",
  "position": {
    "position_type": "text",
    "base_sha": "<base_sha>",
    "start_sha": "<start_sha>",
    "head_sha": "<head_sha>",
    "old_path": "<file_path>",
    "new_path": "<file_path>",
    "line_range": {
      "start": { "line_code": "<hash>_<old_line>_<new_line>", "type": "new" },
      "end":   { "line_code": "<hash>_<old_line>_<new_line>", "type": "new" }
    }
  }
}
```

Line code format: `<SHA1_of_filename>_<old_line_number>_<new_line_number>`.
Use `"type": "new"` for added lines, `"type": "old"` for removed lines.

**Line number rules (single-line):**
- Added line (green): use `new_line` only
- Removed line (red): use `old_line` only
- Unchanged context: include both `new_line` and `old_line`

### 3. Suggestion Block

Propose a code change that the author can apply with one click. Embedded in the `body` field of any discussion (inline or regular):

~~~markdown
```suggestion:-N+M
replacement code here
```
~~~

**Range offsets:**
- `-N` = include N lines above the anchored line (default 0, max 100)
- `+M` = include M lines below the anchored line (default 0, max 100)
- Total replaced range = 1 (anchored) + N + M lines

**Examples:**

Replace only the commented line:
~~~markdown
```suggestion:-0+0
fixed_code_here
```
~~~

Replace the commented line + 2 lines above + 1 line below (4 lines total):
~~~markdown
```suggestion:-2+1
line_above_2
line_above_1
commented_line_replaced
line_below_1
```
~~~

Multiple suggestion blocks in one comment are supported — each generates an independent "Apply suggestion" button.

## Common Pitfalls

- **NEVER** use `glab api -f position[...]` for inline notes. GitLab does not preserve nested position fields through form encoding — it creates a plain `DiscussionNote` instead of a code-anchored `DiffNote`. Always use `--input` with a JSON body and `Content-Type: application/json`.
- **NEVER** post position-based comments on files not in the MR diff. The API returns `line_code can't be blank`. Fall back to regular discussion (no `position` field).
- **NEVER** guess line numbers from the local branch. Line numbers refer to the head commit of the MR, which may differ from local after merges or rebases. Always `git fetch origin <branch>` + `git show FETCH_HEAD:<path>`.
- **NEVER** omit both `new_line` and `old_line` when `position` is set — GitLab returns an error. At least one must be present.
- **NEVER** use `position_type: "image"` for text files — the position fields differ (`x`, `y`, `width`, `height`) and will be rejected on text diffs.

## Posting Workflow

### Step 1: Prepare JSON Payload

Use `jq -n` for dynamic values, heredoc for static:

```bash
jq -n \
  --arg body "建议修改：\n```suggestion:-0+0\nfixed_code\n```" \
  --arg base "$BASE_SHA" \
  --arg start "$START_SHA" \
  --arg head "$HEAD_SHA" \
  --arg path "src/file.cpp" \
  --argjson newline 42 \
  '{
      body: $body,
      position: {
        position_type: "text",
        base_sha: $base,
        start_sha: $start,
        head_sha: $head,
        old_path: $path,
        new_path: $path,
        new_line: $newline
      }
    }' > /tmp/disc.json
```

For suggestion blocks inside `body`, use `\n` for newlines within `jq --arg`, or use a heredoc for literal newlines.

### Step 2: Post

```bash
glab api projects/:id/merge_requests/<MR>/discussions \
    --method POST \
    -H 'Content-Type: application/json' \
    --input /tmp/disc.json
```

### Step 3: Verify

```bash
glab api projects/:id/merge_requests/<MR>/discussions --output=json | jq '.[0].id'
```

A successful response returns the discussion ID. An HTTP 400 with `line_code` error means the file is not in the MR diff — fall back to regular discussion.

## Reply And Resolution Are Separate

Reply to an existing inline discussion in that discussion; do not replace it
with an MR-level summary note:

```bash
glab api \
  "projects/:id/merge_requests/<MR>/discussions/<discussion-id>/notes" \
  --method POST \
  -H 'Content-Type: application/json' \
  --input /tmp/reply.json
```

Payload:

```json
{"body":"Disposition, code/source evidence, changed revision, and validation."}
```

Resolving is a different state transition and needs separate authority:

```bash
glab api \
  "projects/:id/merge_requests/<MR>/discussions/<discussion-id>" \
  --method PUT \
  -H 'Content-Type: application/json' \
  --input /tmp/resolve.json
```

where `/tmp/resolve.json` is `{"resolved":true}`.

Verify both by reading the discussion back. Record `replied`, `modified`,
`verified`, and GitLab `resolved` separately. For a true finding, an author
normally replies after the change but leaves resolution to the reviewer. For a
false finding, reply in the original inline discussion with type, API, call
path, or build evidence; do not hide the disproof in a summary comment. Never
reply or resolve without explicit mutation authorization.

## Multi-Comment Batching

Prepare all payloads first, then post. Use parallel Bash calls for speed:

```bash
glab api projects/:id/merge_requests/<MR>/discussions --method POST -H 'Content-Type: application/json' --input /tmp/disc1.json
glab api projects/:id/merge_requests/<MR>/discussions --method POST -H 'Content-Type: application/json' --input /tmp/disc2.json
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `line_code can't be blank` | File not in MR diff | Use regular discussion (remove `position`) |
| `line_code must be valid` | Wrong line number or path | Verify with `git show FETCH_HEAD:<path>` |
| `400 Bad request` | Missing required position field | Ensure `base_sha`, `start_sha`, `head_sha`, `old_path`, `new_path` all present |
| `404 Not Found` | Wrong MR number or project | Verify with `glab mr view <MR>` |
| `405 Method Not Allowed` | Using `-f` instead of `--input` | Switch to JSON body + `Content-Type: application/json` |

## Tips

- Suggestion offsets are relative to the anchored line in the diff, not the file.
- GitLab auto-generates an "Apply suggestion" button for each suggestion block.
- Multiple suggestions in one comment are independent — author can apply each separately.
- For complex suggestions spanning many lines, prefer a single large `suggestion:-N+M` block over multiple small ones.
