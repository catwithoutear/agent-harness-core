# Redmine Examples - Real-World Use Cases

This document provides comprehensive, practical examples for common Redmine operations using the standalone Python client.

**When to load this file:**
- You need implementation examples for common workflows
- User asks for "examples" or specific use cases
- You're implementing a specific Redmine operation pattern
- Need bash/Python code snippets for reference

**Do not load for:**
- Basic queries (SKILL.md has quick reference)
- API endpoint details (see references/api-reference.md)
- Token optimization (see references/context-optimization.md)

## Table of Contents

1. [Issue Management Examples](#issue-management-examples)
2. [Wiki Documentation Examples](#wiki-documentation-examples)
3. [Project Management Examples](#project-management-examples)
4. [Custom Field Queries](#custom-field-queries)
5. [Time Tracking](#time-tracking)
6. [File Operations Examples](#file-operations-examples)
7. [Integration Examples](#integration-examples)
8. [Issue Relations](#issue-relations)
9. [Advanced Query Examples](#advanced-query-examples)
10. [Tips and Tricks](#tips-and-tricks)

---

## Issue Management Examples

### Daily workflow: Check my tasks

```bash
# Get all open issues assigned to me, sorted by priority
python {baseDir}/scripts/redmine_cli.py issues \
  --assigned-to me \
  --status open \
  --sort "priority:desc,id:desc" \
  --limit 100 | jq '.issues[] | {
    id,
    subject,
    priority: .priority.name,
    status: .status.name,
    project: .project.name
  }'
```

### Search and filter issues

```bash
# Find all bug reports
python {baseDir}/scripts/redmine_cli.py issues \
  --query "~bug" \
  --limit 100

# Get high priority issues in a project
python {baseDir}/scripts/redmine_cli.py issues \
  --project example-project \
  --priority ">=3" \
  --status open

# Issues reported by specific user
python {baseDir}/scripts/redmine_cli.py issues | \
  jq '.issues[] | select(.author.id == 25)'
```

### Batch operations with Python

```python
#!/usr/bin/env python3
"""Batch update issues based on criteria."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient

client = RedmineClient()

# Get all low-priority open bugs
result = client.get_issues(
    status_id='open',
    project_id='example-project',
    query_filter='~bug',
    limit=100
)

for issue in result['issues']:
    # Check if priority is low
    if issue['priority']['id'] < 3:
        print(f"Updating issue #{issue['id']}: {issue['subject']}")

        # Update priority
        client.update_issue(
            issue['id'],
            priority_id=4,  # Increase priority
            notes=f"Auto-updated priority based on bug tag"
        )
```

## Wiki Documentation Examples

### Create comprehensive documentation

```bash
# Create main documentation page
cat > getting_started.textile << 'EOF'
h1. Getting Started

h2. Installation

Download the package from the releases page.

h2. Quick Start

<pre>
npm install my-package
npm start
</pre>

h2. Configuration

Create a @config.json@ file:

<pre>
{
  "apiKey": "your-key",
  "endpoint": "https://api.example.com"
}
</pre>

h2. Next Steps

* [[UserGuide]] - Detailed user documentation
* [[ApiReference]] - API reference
* [[Troubleshooting]] - Common issues
EOF

python {baseDir}/scripts/redmine_cli.py create-wiki \
  --project example-project \
  --title "GettingStarted" \
  --file getting_started.textile
```

### Migrate documentation from Markdown

```python
#!/usr/bin/env python3
"""Convert Markdown to Textile and create wiki pages."""

import sys
import os
import re
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient

def md_to_textile(md_content):
    """Simple Markdown to Textile conversion."""
    textile = md_content

    # Headers
    textile = re.sub(r'^### (.+)$', r'h3. \1', textile, flags=re.MULTILINE)
    textile = re.sub(r'^## (.+)$', r'h2. \1', textile, flags=re.MULTILINE)
    textile = re.sub(r'^# (.+)$', r'h1. \1', textile, flags=re.MULTILINE)

    # Code blocks
    textile = re.sub(r'```(\w+)?\n(.*?)```', r'pre.\2\n', textile, flags=re.DOTALL)

    # Inline code
    textile = re.sub(r'`([^`]+)`', r'@\1@', textile)

    # Bold
    textile = re.sub(r'\*\*(.+?)\*\*', r'*\1*', textile)

    # Italic
    textile = re.sub(r'\*(.+?)\*', r'_\1_', textile)

    return textile

# Read markdown file
with open('README.md', 'r') as f:
    md_content = f.read()

# Convert and create wiki
client = RedmineClient()
textile_content = md_to_textile(md_content)

client.create_wiki_page(
    project_id='example-project',
    title='Readme',
    text=textile_content,
    comments='Migrated from README.md'
)
```

### Update multiple wiki pages

```python
#!/usr/bin/env python3
"""Update wiki pages from local files."""

import sys
import os
from pathlib import Path
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient

client = RedmineClient()
project_id = 'example-project'

# Iterate through textile files
wiki_dir = Path('docs/wiki')
for file_path in wiki_dir.glob('*.textile'):
    wiki_name = file_path.stem  # filename without extension

    with open(file_path, 'r') as f:
        content = f.read()

    print(f"Updating wiki: {wiki_name}")

    try:
        client.update_wiki_page(
            project_id=project_id,
            wiki_name=wiki_name,
            text=content,
            comments=f"Updated from {file_path.name}"
        )
    except Exception as e:
        # If doesn't exist, create it
        if '404' in str(e):
            print(f"  Creating new page...")
            client.create_wiki_page(
                project_id=project_id,
                title=wiki_name,
                text=content,
                comments=f"Created from {file_path.name}"
            )
```

## Project Management Examples

### Generate project status report

```python
#!/usr/bin/env python3
"""Generate a project status report."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient
from collections import Counter

client = RedmineClient()
project_id = 'example-project'

# Get all issues
result = client.get_issues(project_id=project_id, limit=1000)
issues = result['issues']

# Statistics
total = len(issues)
by_status = Counter(i['status']['name'] for i in issues)
by_priority = Counter(i['priority']['name'] for i in issues)
open_issues = [i for i in issues if i['status']['id'] < 3]  # Assuming open < 3

print(f"""
Project Status Report: {project_id}
{'=' * 50}

Total Issues: {total}

By Status:
""")

for status, count in by_status.most_common():
    bar = '█' * (count * 50 // total)
    print(f"  {status:20s} {count:4d} {bar}")

print(f"\nBy Priority:")
for priority, count in by_priority.most_common():
    bar = '█' * (count * 50 // total)
    print(f"  {priority:20s} {count:4d} {bar}")

if open_issues:
    print(f"\nTop 5 Open Issues (by priority):")
    sorted_issues = sorted(open_issues, key=lambda x: -x['priority']['id'])[:5]
    for issue in sorted_issues:
        print(f"  #{issue['id']} [{issue['priority']['name']}]: {issue['subject']}")
```

### Create release checklist

```python
#!/usr/bin/env python3
"""Create release checklist from issues."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient

client = RedmineClient()
version = 'v2.5.0'

# Get all closed issues for this version
result = client.get_issues(
    project_id='example-project',
    status_id='closed',
    limit=500
)

issues = [i for i in result['issues'] if f"({version})" in i.get('fixed_version', {}).get('name', '')]

# Generate wiki content
wiki_text = f"""h1. Release Notes: {version}

h2. Features

"""
features = [i for i in issues if i['tracker']['name'] == 'Feature']
for issue in features:
    wiki_text += f"* #{issue['id']}: {issue['subject']}\n"

wiki_text += "\nh2. Bug Fixes\n\n"
bugs = [i for i in issues if i['tracker']['name'] == 'Bug']
for issue in bugs:
    wiki_text += f"* #{issue['id']}: {issue['subject']}\n"

wiki_text += f"\nh2. Statistics\n\n\n* Total issues: {len(issues)}\n"
wiki_text += f"* Features: {len(features)}\n"
wiki_text += f"* Bug fixes: {len(bugs)}\n"

# Create wiki page
client.create_wiki_page(
    project_id='example-project',
    title=f'ReleaseNotes{version.replace(".", "")}',
    text=wiki_text,
    comments=f'Automatic release notes for {version}'
)

print(f"Created release notes with {len(issues)} issues")
```

## File Operations Examples

### Attach files to issues

```python
#!/usr/bin/env python3
"""Upload screenshots and attach to issue."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient
from pathlib import Path

client = RedmineClient()
issue_id = 12345

# Upload multiple screenshots
screenshots_dir = Path('screenshots')
uploads = []

for file_path in screenshots_dir.glob('*.png'):
    print(f"Uploading {file_path.name}...")

    result = client.upload_file(
        file_path=str(file_path),
        description=f"Screenshot: {file_path.stem}"
    )

    uploads.append({
        'token': result['upload']['token'],
        'filename': file_path.name,
        'content_type': 'image/png'
    })

# Attach uploads to issue
client.update_issue(
    issue_id=issue_id,
    uploads=uploads,
    notes=f"Attached {len(uploads)} screenshots"
)

print(f"Attached {len(uploads)} files to issue #{issue_id}")
```

### Backup wiki pages

```python
#!/usr/bin/env python3
"""Backup all wiki pages from a project."""

import sys
import os
import json
from pathlib import Path
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient

client = RedmineClient()
project_id = 'example-project'
backup_dir = Path('backups/wiki')
backup_dir.mkdir(parents=True, exist_ok=True)

# Get project info to find wiki pages
project = client.get_project(project_id)

# List of wiki pages to backup (you'd need to know these or get from index)
wiki_pages = ['GettingStarted', 'UserGuide', 'ApiReference', 'Faq']

for wiki_name in wiki_pages:
    print(f"Backing up {wiki_name}...")

    try:
        page = client.get_wiki_page(project_id, wiki_name)

        # Save as JSON
        metadata_file = backup_dir / f"{wiki_name}.json"
        with open(metadata_file, 'w') as f:
            json.dump(page, f, indent=2)

        # Save content separately
        content_file = backup_dir / f"{wiki_name}.textile"
        with open(content_file, 'w') as f:
            f.write(page['wiki_page']['text'])

        print(f"  ✓ Saved {wiki_name} (version {page['wiki_page']['version']})")

    except Exception as e:
        print(f"  ✗ Error: {e}")

print(f"\nBackup complete: {backup_dir}")
```

## Integration Examples

### Sync GitHub issues to Redmine

```python
#!/usr/bin/env python3
"""Sync GitHub issues to Redmine."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient
import subprocess
import json

# Get GitHub issues
gh_result = subprocess.run(
    ['gh', 'issue', 'list', '--json', 'number,title,body,state'],
    capture_output=True,
    text=True
)
github_issues = json.loads(gh_result.stdout)

# Sync to Redmine
client = RedmineClient()

for gh_issue in github_issues:
    if gh_issue['state'] == 'OPEN':
        # Check if already exists
        subject = f"[GH-{gh_issue['number']}] {gh_issue['title']}"
        result = client.get_issues(query_filter=f"~{subject}", limit=1)

        if not result['issues']:
            print(f"Creating: {subject}")

            client.create_issue(
                project_id='example-project',
                subject=subject,
                description=gh_issue['body'] + f"\n\nGitHub: {gh_issue['html_url']}",
                status_id=1  # New
            )
```

### Create issue from command output

```bash
#!/bin/bash
# Create Redmine issue from test failure output

TEST_OUTPUT=$(pytest --tb=short 2>&1)

if [ $? -ne 0 ]; then
  echo "Tests failed! Creating Redmine issue..."

  # Escape and format for JSON
  ESCAPED_OUTPUT=$(echo "$TEST_OUTPUT" | jq -Rs .)

  # Use Python client to create issue
  python3 - <<PYTHON
import sys
sys.path.append('{baseDir}/scripts')
from redmine_client import RedmineClient

client = RedmineClient()

result = client.create_issue(
    project_id='example-project',
    subject='Test failure in CI pipeline',
    description=$ESCAPED_OUTPUT,
    priority_id=2,
    status_id=1
)

print(f"Created issue #{result['issue']['id']}")
PYTHON

fi
```

## Advanced Query Examples

### Complex issue filtering

```python
#!/usr/bin/env python3
"""Advanced issue queries and analysis."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient
from datetime import datetime, timedelta

client = RedmineClient()

# Get all issues (pagination)
all_issues = []
offset = 0
limit = 100

while True:
    result = client.get_issues(limit=limit, offset=offset)

    if not result['issues']:
        break

    all_issues.extend(result['issues'])

    if len(result['issues']) < limit:
        break

    offset += limit

print(f"Total issues: {len(all_issues)}")

# Filter: Stale issues (no update in 30 days)
cutoff_date = datetime.now() - timedelta(days=30)
stale_issues = []

for issue in all_issues:
    updated_on = datetime.fromisoformat(issue['updated_on'].replace('Z', '+00:00'))

    if updated_on < cutoff_date and issue['status']['id'] < 3:  # Not closed
        stale_issues.append(issue)

print(f"\nStale issues ({len(stale_issues)}):")
for issue in stale_issues[:10]:  # Show first 10
    days_old = (datetime.now(datetime.now().tzinfo) - datetime.fromisoformat(issue['updated_on'].replace('Z', '+00:00'))).days
    print(f"  #{issue['id']} ({days_old} days): {issue['subject']}")

# Filter: Long-running issues
long_running = []
for issue in all_issues:
    created = datetime.fromisoformat(issue['created_on'].replace('Z', '+00:00'))
    days_open = (datetime.now(datetime.now().tzinfo) - created).days

    if days_open > 90 and issue['status']['id'] < 3:
        long_running.append((issue, days_open))

print(f"\nLong-running issues (>90 days, {len(long_running)}):")
for issue, days in sorted(long_running, key=lambda x: -x[1])[:5]:
    print(f"  #{issue['id']} ({days} days): {issue['subject']}")
```

### Generate custom reports

```python
#!/usr/bin/env python3
"""Generate custom workload report."""

import sys
import os
sys.path.append(os.path.expanduser('{baseDir}/scripts'))

from redmine_client import RedmineClient
from collections import defaultdict

client = RedmineClient()

# Get all issues
result = client.get_issues(limit=1000)
issues = result['issues']

# Group by assignee
by_assignee = defaultdict(lambda: {'total': 0, 'by_status': defaultdict(int),
                                     'by_priority': defaultdict(int)})

for issue in issues:
    assignee = issue.get('assigned_to', {})
    assignee_name = assignee.get('name', 'Unassigned')

    by_assignee[assignee_name]['total'] += 1
    by_assignee[assignee_name]['by_status'][issue['status']['name']] += 1
    by_assignee[assignee_name]['by_priority'][issue['priority']['name']] += 1

# Print report
print("Workload Report")
print("=" * 60)

for assignee, data in sorted(by_assignee.items(), key=lambda x: -x[1]['total']):
    print(f"\n{assignee}:")
    print(f"  Total: {data['total']}")

    print("  By Status:")
    for status, count in sorted(data['by_status'].items(), key=lambda x: -x[1]):
        print(f"    {status}: {count}")

    print("  By Priority:")
    for priority, count in sorted(data['by_priority'].items(), key=lambda x: -x[1]):
        print(f"    {priority}: {count}")
```

## Tips and Tricks

1. **Use jq for JSON parsing**: All CLI tools output JSON, pipe to `jq` for formatting
2. **Save common queries**: Create shell scripts with frequently used queries
3. **Set up aliases**: Add to `.bashrc` for quick access
4. **Use Python for complex operations**: The client API is more flexible than CLI
5. **Handle pagination**: Always check if you need to paginate for large result sets
6. **Cache results**: For repeated queries, save output to file for faster access
7. **Test with --dry-run**: Create test operations before running bulk updates

---

## Common CLI Operations

### Issue Queries

```bash
# Issues (with default includes for complete data)
redmine-cli issues --status open --assigned-to me --limit 100 --include children,attachments,relations
redmine-cli issues --tracker bug --priority ">=3" --limit 100 --include children,attachments,relations
redmine-cli issues --custom-field 106="john" --limit 100 --include children,attachments,relations
redmine-cli issues --created-on ">=2025-01-01" --limit 100 --include children,attachments,relations
redmine-cli issues --due-date "t" --limit 100  # Today

# Single issue (always include related data)
redmine-cli issue 12345 --include children,attachments,relations
redmine-cli issue 12345 --include journals,watchers,children  # With change history and watchers

# Minimal issue (for ID lists or counting)
redmine-cli issues --limit 100 | jq '[.issues[].id]'  # No include needed
redmine-cli issues --limit 100 | jq '.total_count'       # No include needed
```

### Wiki Operations

```bash
# Wiki
redmine-cli wiki example-project WikiPageName
redmine-cli wiki-index example-project
redmine-cli create-wiki --project example-project --title APIDocs --file content.textile
```

### Time Tracking

```bash
# Time entries
redmine-cli time-entries --from-date 2025-01-01 --to-date 2025-01-31 --limit 100
```

### Issue Relations

```bash
# Relations
redmine-cli relations 12345
redmine-cli create-relation 12345 12346 --type blocks
```

### Current User

**Query workflow for "me" (当前用户) queries**:

When user says "我" (me), "我的" (my), they refer to **the current API key user**.

**Step 1**: Get current user ID
```bash
redmine-cli me | jq '.user.id'
```

**Step 2**: Use the user ID for subsequent queries
```bash
# My time entries (replace <USER_ID> with actual ID from step 1)
redmine-cli time-entries --user-id <USER_ID> --from-date 2025-01-12 --to-date 2025-01-18

# Issues created by me
redmine-cli issues --author-id <USER_ID> --limit 100

# Issues assigned to me (special: use 'me' directly)
redmine-cli issues --assigned-to me --limit 100
```

**Complete example**: "列举我上周redmine耗时记录"
```bash
# 1. Get current user ID
USER_ID=$(redmine-cli me | jq -r '.user.id')
echo "Querying for user ID: $USER_ID"

# 2. Calculate date range (last 7 days)
FROM_DATE=$(date -d '7 days ago' +%Y-%m-%d)
TO_DATE=$(date +%Y-%m-%d)

# 3. Query time entries
redmine-cli time-entries --user-id $USER_ID --from-date $FROM_DATE --to-date $TO_DATE
```

---

## Python Client Usage

```python
import sys
sys.path.append('{baseDir}/scripts')
from redmine_client import RedmineClient

# With context manager (auto-closes session)
with RedmineClient() as client:
    # Advanced filtering (with includes for complete data)
    issues = client.get_issues(
        status_id='open',
        project_id='example-project',
        tracker_id='bug',
        created_on='>=2025-01-01',
        custom_fields={56: 'master', 106: 'john,mary'},
        limit=100,
        include=['children', 'attachments', 'relations']  # Always include related data
    )

    # Search
    results = client.search(
        query='urgent bug',
        include_issues=True,
        include_wiki_pages=True,
        limit=50
    )

    # Get wiki index (all wiki pages) for a project
    wiki_index = client.get_wiki_index(project_id='example-project')
    # Filter for pages containing specific keywords
    for page in wiki_index['wiki_pages']:
        if 'API' in page['title']:
            print(f"Found: {page['title']}")

    # Create issue with custom fields
    issue = client.create_issue(
        project_id='example-project',
        subject='New feature',
        custom_fields=[
            {'id': 56, 'value': 'develop'},
            {'id': 106, 'value': ['john', 'mary']}
        ]
    )
```

---

## Advanced Scenarios

### Large Dataset Handling (>1000 records)

When `total_count > 1000`, fetching all data will consume excessive tokens and may hit API limits.

**Strategy**: Split by date ranges, paginate, and merge intermediate results.

**Step-by-step workflow**:

1. **Check total count first**:
   ```bash
   redmine-cli issues --limit 100 | jq '.total_count'
   ```

2. **If > 1000, split by date ranges**:
   ```bash
   # Get all 2024 issues in monthly batches
   for month in {01..12}; do
     redmine-cli issues \
       --created-on ">=2024-$month-01" \
       --created-on "<=2024-$month-31" \
       --limit 100 \
       | jq '.issues' > "batch_2024_$month.json"
   done
   ```

3. **Process each batch**:
   ```bash
   # Extract key fields from each batch
   for file in batch_*.json; do
     jq '[.[] | {id, subject, status, priority}]' "$file" > "filtered_$file"
   done
   ```

4. **Merge results**:
   ```bash
   jq -s 'map(.[]) | group_by(.status) | map({status: .[0].status, count: length})' filtered_*.json
   ```

**Token savings example**:
- Naive approach: 5000 issues × 450 tokens = 2.25M tokens
- Batched approach: 12 months × 100 issues × 450 tokens = 540K tokens (76% savings)

### Batch Operations with Transaction Safety

When updating multiple issues or creating bulk records, use Python client for better error handling and rollback.

**Prerequisites**: Load [references/context-optimization.md#batch-processing](context-optimization.md#batch-processing)

**Safe batch update pattern**:

```python
import sys
sys.path.append('{baseDir}/scripts')
from redmine_client import RedmineClient

def safe_batch_updates(issue_ids, update_func):
    """Update issues with transaction-like safety."""
    updated = []
    failed = []

    with RedmineClient() as client:
        for issue_id in issue_ids:
            try:
                # Fetch current state
                issue = client.get_issue(issue_id)

                # Apply update
                result = update_func(issue)
                updated.append(issue_id)

                print(f"✓ Updated issue {issue_id}")
            except Exception as e:
                failed.append((issue_id, str(e)))
                print(f"✗ Failed issue {issue_id}: {e}")

    # Report results
    print(f"\nUpdated: {len(updated)}/{len(issue_ids)}")
    if failed:
        print(f"Failed: {len(failed)}")
        for issue_id, error in failed:
            print(f"  - Issue {issue_id}: {error}")

# Usage: Update priority for multiple issues
def update_priority(issue):
    return issue.update(priority_id=3)  # Urgent

# Get issue IDs from filtered list
issue_ids = redmine-cli issues --status "New" --limit 100 | jq '[.issues[].id]'

safe_batch_updates(issue_ids, update_priority)
```

**Critical patterns**:
- Always fetch current state before updating
- Log successes and failures separately
- Implement rollback if needed (revert failed updates)
- Use context manager (`with RedmineClient()`) for session management

### Cross-Project Aggregation

When querying across multiple projects:

```bash
# Get issue counts by project
for project in project_a project_b project_c; do
  redmine-cli issues --project-id "$project" --limit 100 | \
    jq --arg proj "$project" \
      '{project: $proj, total: .total_count, open: [.issues[] | select(.status.name == "Open")] | length}'
done | jq -s 'from_entries'

# Result:
# {
#   "project_a": {"total": 234, "open": 45},
#   "project_b": {"total": 567, "open": 123},
#   "project_c": {"total": 89, "open": 12}
# }
```

### Wiki Index Operations

**Get all wiki pages for a project** (token-efficient):

```bash
# Get wiki index only (lightweight)
redmine-cli wiki-index example-project | jq '[.wiki_pages[].title]'

# Filter for specific topics
redmine-cli wiki-index example-project | \
  jq '[.wiki_pages[] | select(.title | contains("API")) | {title, version}]'
```

**Batch wiki backup**:

```bash
# Save all wiki pages to individual files
redmine-cli wiki-index example-project | \
  jq -r '.wiki_pages[].title' | \
  while read title; do
    redmine-cli wiki example-project "$title" > "wiki_${title}.json"
  done
```

**Load references for advanced wiki operations**:
- Textile syntax: Load [api-reference.md#wiki-formatting](api-reference.md#wiki-formatting)
- Wiki management: See other sections in this file
