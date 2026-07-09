---
name: glab
description: "Use when interacting with GitLab resources through glab, including merge requests, issues, CI pipelines, repos, and API operations."
---
# GitLab CLI (glab) Skill

Provides guidance for using `glab`, the official GitLab CLI, to perform GitLab operations from the terminal.

## When to Use This Skill

Invoke when the user needs to:
- Create, review, or manage merge requests
- Work with GitLab issues
- Monitor or trigger CI/CD pipelines
- Clone or manage repositories
- Perform any GitLab operation from the command line

## Prerequisites

Verify glab installation and version before executing commands:
```bash
# Check glab version (1.80.0+ recommended for full feature support)
glab --version

# Verify glab is properly authenticated
glab auth status
```

If not installed or version is outdated, inform the user and provide platform-specific installation guidance.

### Version Compatibility Notes

| glab Version | Features Available |
|-------------|-------------------|
| 1.88.0+ | Full feature support including `--output json`, CI artifact download, Docker credential helper, DPoP |
| 1.85.0+ | JSON output support, advanced MR filtering |
| 1.80.0+ | Core features, basic MR/issue/pipeline management |
| < 1.80.0 | Legacy mode - text output only, limited filtering |

## Authentication Quick Start

| glab Version | Features Available |
|-------------|-------------------|
| 1.88.0+ | Full feature support including `--output json`, CI artifact download, Docker credential helper, DPoP |
| 1.85.0+ | JSON output support, advanced MR filtering |
| 1.80.0+ | Core features, basic MR/issue/pipeline management |
| < 1.80.0 | Legacy mode - text output only, limited filtering |


Verify glab installation before executing commands:
```bash
glab --version
```

If not installed, inform the user and provide platform-specific installation guidance.

## Authentication Quick Start

Most glab operations require authentication:

```bash
# Interactive authentication
glab auth login

# Check authentication status
glab auth status

# For self-hosted GitLab
glab auth login --hostname gitlab.example.org

# Using environment variables
export GITLAB_TOKEN=your-token
export GITLAB_HOST=gitlab.example.org  # for self-hosted

# Configure Docker credential helper (glab 1.88.0+)
glab auth configure-docker

# Generate DPoP proof JWT (1.88.0+, EXPERIMENTAL)
glab auth dpop-gen
```


## Core Workflows

### Creating a Merge Request

```bash
# 1. Ensure branch is pushed
git push -u origin feature-branch

# 2. Create MR with manual title/description
glab mr create --title "Add feature" --description "Implements X"

# 3. Auto-fill title/description from commits (glab 1.85.0+)
glab mr create --fill

# 4. Auto-fill with commit bodies for multiple commits (1.85.0+)
glab mr create --fill --fill-commit-body

# 5. With reviewers and labels
glab mr create --title "Fix bug" --reviewer=alice,bob --label="bug,urgent"

# 6. Create as draft
glab mr create --title "WIP: New feature" --draft

# 7. Create MR for an issue
glab mr create --related-issue 123

# 8. Skip confirmation prompt
glab mr create --title "Quick fix" --yes
```

### Reviewing Merge Requests

#### Basic Workflow

```bash
# 1. List MRs awaiting your review
glab mr list --reviewer=@me

# 2. List with JSON output for parsing (glab 1.85.0+)
glab mr list --reviewer=@me --output=json

# 3. View MR details with comments
glab mr view <mr-number> --comments

# 4. View MR details with JSON output
glab mr view <mr-number> --output=json

# 5. Open MR in browser
glab mr view <mr-number> --web

# 6. Checkout MR locally to test
glab mr checkout <mr-number>

# 7. After testing, approve
glab mr approve <mr-number>

# 8. Add review comments
glab mr note <mr-number> -m "Please update tests"
```

#### Posting Inline MR Review Notes Reliably

`glab mr note` only creates top-level MR comments. For code-anchored review notes on a
specific diff line, use `glab api` against the MR discussions endpoint with a real JSON
body.

```bash
# Build the diff-note payload as JSON
jq -n \
  --arg body "This path stops retrying after the first failure." \
  --arg base "$BASE_SHA" \
  --arg start "$START_SHA" \
  --arg head "$HEAD_SHA" \
  --arg path "common/host_monitor/monitor_info_collect.cpp" \
  '{
      body: $body,
      position: {
        position_type: "text",
        base_sha: $base,
        start_sha: $start,
        head_sha: $head,
        old_path: $path,
        new_path: $path,
        new_line: 104
      }
    }' > /tmp/mr-discussion.json

# Post as a true DiffNote
glab api projects/:id/merge_requests/<mr-number>/discussions \
  --method POST \
  -H 'Content-Type: application/json' \
  --input /tmp/mr-discussion.json
```

**Important:**
- Do **not** rely on `glab api -f position[...]` for inline notes. Nested `position`
  fields are not preserved correctly there, and GitLab may create a plain
  `DiscussionNote` instead of a code-anchored `DiffNote`.
- If the MR is on a self-hosted GitLab, combine both `GITLAB_HOST` and `-R owner/repo`
  or use the explicit project API path shown above.

#### Reliable MR Review Workflow (Self-Hosted GitLab)

For production automation or consistent results, use this robust pattern:

```bash
# Step 1: Configure environment
export GITLAB_HOST=gitlab.example.com  # or your GitLab host
export GL_HOST=gitlab.example.com      # alternative
REPO="group/project"                 # your repo path

# Step 2: List MRs with JSON output for parsing (1.85.0+)
glab mr list -R $REPO --reviewer=@me --output=json | jq -r '.[] | "\(.iid): \(.title)"'

# Step 3: Get detailed MR information with JSON
glab mr view <mr-number> -R $REPO --output=json

# Step 4: Get diff for code review
glab mr diff <mr-number> -R $REPO

# Step 5: View MR with comments for review
glab mr view <mr-number> -R $REPO --comments

# Step 6: Checkout for local testing
glab mr checkout <mr-number> -R $REPO
```

#### Automation-Safe Commands

When building automation (scripts, CI/CD, scheduled jobs), always use:

```bash
# Explicit repository and host - NEVER rely on auto-detection
export GITLAB_HOST=gitlab.example.com
REPO="owner/repo"

# List MRs (text output)
glab mr list -R $REPO --reviewer=@me

# View MR
glab mr view <mr-number> -R $REPO

# Get MR diff
glab mr diff <mr-number> -R $REPO

# Get MR changes (files only)
glab mr diff <mr-number> -R $REPO --name-only
```

**Key Success Factors:**
1. **Always use `-R owner/repo`** - Don't rely on git remote detection
2. **Set `GITLAB_HOST` or `GL_HOST`** - Critical for self-hosted instances
3. **Parse text output** - glab outputs text format, use awk/grep for parsing
4. **Combine both patterns**: `GL_HOST=host glab cmd -R repo`

### Monitoring CI/CD

```bash
# View pipeline status on current branch
glab ci status

# View pipeline status on specific branch
glab ci status --branch=feature-branch

# List all pipelines
glab ci list

# List pipelines with JSON output
glab ci list --output=json

# View specific pipeline details
glab ci view

# View logs if failed
glab ci trace

# Trace a specific job
glab ci trace <job-id>

# Retry failed pipeline
glab ci retry

# Retry a specific job
glab ci retry <job-id>

# Run a new pipeline
glab ci run

# Run pipeline on specific branch
glab ci run --branch=feature-branch

# Lint CI config before pushing
glab ci lint

# Lint with specific GitLab host
glab ci lint --hostname=gitlab.example.org

# Download artifacts from last pipeline (glab 1.88.0+, uses `job` command)
glab job artifact <ref> <job-name>
# Get pipeline as JSON
glab ci get --output=json
```

## Common Patterns

### Working Outside Repository Context

When not in a Git repository, specify the repository:
```bash
glab mr list -R owner/repo
glab issue list -R owner/repo
```

### Self-Hosted GitLab

Set hostname via environment variable:
```bash
export GITLAB_HOST=gitlab.example.org
glab repo clone owner/repo
```

### Automation and Scripting

Use `--output=json` for reliable parsing in scripts (glab 1.85.0+):

```bash
# List MRs with JSON output
glab mr list --reviewer=@me --output=json | jq '.[] | {iid, title, author}'

# View MR details with JSON
glab mr view <mr-number> --output=json | jq '.title, .state'

# List pipelines with JSON
glab ci list --output=json | jq '.[] | {id, status}'

# API with JSON output (default)
glab api projects/:id/merge_requests

# API with newline-delimited JSON for large datasets
glab api issues --paginate --output=ndjson
```

For legacy glab versions (< 1.85.0), use text parsing:

```bash
# Text output parsing (legacy)
glab mr list --per-page 100 | awk '/^![0-9]+/ {print $1}'
```

### Using the API Command

The `glab api` command provides direct GitLab API access:

```bash
# Basic API call
glab api projects/:id/merge_requests

# API with JSON output (default)
glab api projects/:id/issues

# API with newline-delimited JSON for large datasets (glab 1.88.0+)
glab api issues --paginate --output=ndjson

# IMPORTANT: Pagination uses query parameters in URL, NOT flags
glab api "projects/:id/jobs?per_page=100"

# Auto-fetch all pages
glab api --paginate "projects/:id/pipelines/123/jobs?per_page=100"

# POST with data
glab api --method POST projects/:id/issues --field title="Bug" --field description="Details"

# Inline MR diff discussion: use JSON body + Content-Type
glab api projects/:id/merge_requests/123/discussions \
  --method POST \
  -H 'Content-Type: application/json' \
  --input /tmp/mr-discussion.json

# GraphQL query
glab api graphql -f query="query { currentUser { username } }"

# GraphQL with pagination (requires specific query structure)
glab api graphql --paginate -f query='
query($endCursor: String) {
  project(fullPath: "owner/repo") {
    issues(first: 2, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
    }
  }
}'
```

## Best Practices

1. **Verify authentication** before executing commands: `glab auth status`
2. **Use `--help`** to explore command options: `glab <command> --help`
3. **Link MRs to issues** using "Closes #123" in MR description
4. **Lint CI config** before pushing: `glab ci lint`
5. **Check repository context** when commands fail: `git remote -v`
6. **Use JSON body for inline diff notes**: post MR discussions with `--input` and
   `Content-Type: application/json`, not `-f position[...]`

## Common Commands Quick Reference

**Merge Requests:**
- `glab mr list --assignee=@me` - Your assigned MRs
- `glab mr list --reviewer=@me` - MRs for you to review
- `glab mr list --output=json` - List MRs with JSON output (1.85.0+)
- `glab mr create` - Create new MR
- `glab mr create --fill` - Create MR auto-filled from commits (1.85.0+)
- `glab mr checkout <number>` - Test MR locally
- `glab mr view <number> --comments` - View MR with comments
- `glab mr view <number> --output=json` - View MR as JSON (1.85.0+)
- `glab mr approve <number>` - Approve MR
- `glab mr merge <number>` - Merge approved MR
- `glab mr rebase <number>` - Rebase MR source branch
- `glab mr update <number>` - Update MR attributes

**Issues:**
- `glab issue list` - List all issues
- `glab issue list --output=json` - List issues with JSON (1.85.0+)
- `glab issue create` - Create new issue
- `glab issue close <number>` - Close issue
- `glab issue view <number> --web` - View issue in browser

**CI/CD:**
- `glab ci status` - Check pipeline status
- `glab ci list` - List all pipelines
- `glab ci view` - View pipeline details
- `glab ci trace` - View job logs
- `glab ci lint` - Validate .gitlab-ci.yml
- `glab ci retry` - Retry failed pipeline
- `glab ci run` - Run new pipeline
- `glab job artifact <ref> <job>` - Download artifacts (1.88.0+, replaces deprecated `ci artifact`)
- `glab ci get --output=json` - Get pipeline JSON (1.88.0+)

**Repository:**
- `glab repo clone owner/repo` - Clone repository
- `glab repo view` - View repo details
- `glab repo fork` - Fork repository

**Authentication:**
- `glab auth login` - Authenticate with GitLab
- `glab auth status` - Check authentication status
- `glab auth configure-docker` - Configure Docker credential helper (1.88.0+)
- `glab auth dpop-gen` - Generate DPoP proof JWT (1.88.0+, EXPERIMENTAL)

**API:**
- `glab api <endpoint>` - Make API call
- `glab api --paginate <endpoint>` - Auto-fetch all pages
- `glab api --output=ndjson <endpoint>` - Output newline-delimited JSON (1.88.0+)
- `glab api graphql -f query=<query>` - Execute GraphQL query (1.88.0+)

## Progressive Disclosure

For detailed command documentation, refer to:

- **references/commands-detailed.md** - Comprehensive command reference with all flags and options
- **references/quick-reference.md** - Condensed command cheat sheet
- **references/troubleshooting.md** - Detailed error scenarios and solutions

For detailed command documentation, refer to:

- `glab repo view` - View repo details
- `glab repo fork` - Fork repository

For detailed command documentation, refer to:
- **references/commands-detailed.md** - Comprehensive command reference with all flags and options
- **references/quick-reference.md** - Condensed command cheat sheet
- **references/troubleshooting.md** - Detailed error scenarios and solutions

Load these references when:
- User needs specific flag or option details
- Troubleshooting authentication or connection issues
- Working with advanced features (API, schedules, variables, etc.)

## Common Issues Quick Fixes

**"command not found: glab"** - Install glab or verify PATH

**"401 Unauthorized"** - Run `glab auth login`

**"404 Project Not Found"** - Verify repository name and access permissions

**"not a git repository"** - Navigate to repo or use `-R owner/repo` flag

**"source branch already has a merge request"** - Use `glab mr list` to find existing MR

For detailed troubleshooting, load **references/troubleshooting.md**.

## Notes

- glab auto-detects repository context from Git remote
- Most commands have `--web` flag to open in browser
- Use `--per-page 100` for scripting and automation
- Multiple GitLab accounts can be authenticated simultaneously
- Commands respect Git configuration and current repository context

## Self-Hosted GitLab Best Practices

When working with self-hosted GitLab instances (e.g., gitlab.example.com), follow these patterns to ensure reliable command execution:

### Environment Variable Configuration

```bash
# Set GitLab host for all glab commands in the session
export GITLAB_HOST=gitlab.example.com
# Alternative: GL_HOST also works
export GL_HOST=gitlab.example.com

# Verify authentication for the specific host
glab auth status
```

### Explicit Repository Specification

Always use `-R owner/repo` flag for reliable command execution, especially in scripts or automation:

```bash
# Recommended: Always specify repository explicitly
glab mr list -R group/project --reviewer=@me

# For self-hosted GitLab, combine with host variable
GITLAB_HOST=gitlab.example.com glab mr view <mr-number> -R group/project

# Alternative using GL_HOST
GL_HOST=gitlab.example.com glab mr list -R owner/repo --per-page 100
```

### MR Operations Checklist

When reviewing MRs, use this reliable sequence:

```bash
# 1. Set environment
export GITLAB_HOST=gitlab.example.com

# 2. List MRs with explicit repo
glab mr list -R owner/repo --reviewer=@me --per-page 100

# 3. View specific MR details
glab mr view <mr-number> -R owner/repo

# 4. Checkout MR locally
glab mr checkout <mr-number> -R owner/repo

# 5. Get MR diff for review
glab mr diff <mr-number> -R owner/repo
```

### Common Failure Patterns and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `404 Project Not Found` | Wrong host or missing -R flag | Use `-R owner/repo` and set `GITLAB_HOST` |
| `401 Unauthorized` | Wrong host authentication | Run `glab auth login --hostname <host>` |
| `Could not resolve host` | GitLab host not set | Export `GITLAB_HOST` or use `-h hostname` |
| Command hangs | Network/SSL issues | Check VPN connection and SSL certificates |

### Automation Scripts Template

For reliable automation, always use this pattern:

```bash
#!/bin/bash
set -e

# Configure GitLab host
export GITLAB_HOST=gitlab.example.com
REPO="group/project"

# Function to safely execute glab commands
glab_safe() {
    glab "$@" -R "$REPO"
}

# Get MRs for review (use --output=json for reliable parsing)
MR_LIST=$(glab_safe mr list --reviewer=@me --per-page 100 --output=json)

# Process each MR (using .iid field for MR number)
echo "$MR_LIST" | jq -r '.[].iid' | while read -r mr_number; do
MR_LIST=$(glab_safe mr list --reviewer=@me --per-page 100)

# Process each MR
echo "$MR_LIST" | jq -r '.[].number' | while read -r mr_number; do
    echo "Processing MR !${mr_number}..."
    glab_safe mr view "$mr_number"
done
```
