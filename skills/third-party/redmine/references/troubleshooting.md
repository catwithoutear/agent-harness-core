# Troubleshooting Guide

This guide covers common issues and solutions when using the Redmine skill.

## Connection Errors

### Cannot connect to Redmine server

**Symptom:** Connection timeout or refused

**Solutions:**
```bash
# Test connection
python {baseDir}/scripts/redmine_cli.py test

# Check environment variables
echo $REDMINE_BASE_URL
echo $REDMINE_API_KEY

# Disable SSL verify (only for testing!)
python {baseDir}/scripts/redmine_cli.py test --no-ssl-verify

# Increase timeout
export REDMINE_TIMEOUT=60
```

**Common causes:**
- Incorrect `REDMINE_BASE_URL` (must not have trailing slash)
- Wrong `REDMINE_API_KEY`
- Firewall or network restrictions
- SSL certificate issues

## Permission Errors

### Access denied (403)

**Solutions:**
- Verify API key has necessary permissions
- Check project access rights
- Ensure user account is active

### Unauthorized (401)

**Solutions:**
- Verify API key is correct
- Check if API key has expired
- Ensure key is properly set in `.env` or environment

## Not Found Errors

### Resource not found (404)

**For issues:**
```bash
# Check if issue exists
python {baseDir}/scripts/redmine_cli.py issue <id>
```

**For projects:**
```bash
# List all projects to find correct identifier
python {baseDir}/scripts/redmine_cli.py projects | jq '.projects[] | {id, name, identifier}'
```

**For wiki pages:**
- Verify project identifier (case-sensitive)
- Check wiki page name (case-sensitive)
- Confirm page exists in project

## Rate Limiting

**Symptom:** Too many requests (429) or slow responses

**Solutions:**
- Redmine may limit API requests per user
- Implement retry logic for bulk operations (built-in to client)
- Use appropriate pagination (limit/offset)
- Add delays between bulk operations

```python
from redmine_client import RedmineClient
import time

client = RedmineClient(max_retries=5)

# Add delay between operations
for issue_data in bulk_issues:
    client.create_issue(**issue_data)
    time.sleep(1)
```

## File Operations

### Upload fails

**Symptom:** File upload fails with error

**Solutions:**
- Check file exists and is readable
- Verify file size is within Redmine limits
- Ensure proper file permissions
- Check disk space

```bash
# Test with small file
python {baseDir}/scripts/redmine_cli.py upload /path/to/small.txt

# Check file size
ls -lh /path/to/file.pdf
```

### Download fails

**Symptom:** File download incomplete or fails

**Solutions:**
- Check attachment ID is valid
- Verify write permissions for save directory
- Ensure sufficient disk space

```bash
# Test download
python {baseDir}/scripts/redmine_cli.py download <id> /tmp/
```

## Wiki Content

### Textile formatting issues

**Common mistakes:**
- Using Markdown syntax instead of Textile
- Incorrect heading levels
- Missing text escapes for special characters

**Textile quick reference:**
```textile
h1. Heading 1
h2. Heading 2

*Bold text*
_Italic text_

* Unordered list
# Ordered list

pre. Code block

[[InternalLink]]
[ExternalURL]
```

See [references/examples.md](references/examples.md) for more Textile examples.

## Environment Setup

### .env file not loading

**Symptom:** Environment variables not found

**Solutions:**
```bash
# Verify .env file exists
ls -la {baseDir}/.env

# Check file permissions
cat {baseDir}/.env

# Test loading
python -c "import sys; sys.path.append('{baseDir}/scripts'); from redmine_client import RedmineClient; c = RedmineClient()"
```

**Manual export (alternative):**
```bash
export REDMINE_BASE_URL="https://redmine.example.com"
export REDMINE_API_KEY="your-key"
```

### Module import errors

**Symptom:** Module not found

**Solutions:**
```bash
# Install requests
pip install requests

# Optional: Install python-dotenv for better .env support
pip install python-dotenv

# Verify installation
python -c "import requests; print(requests.__version__)"
```

## JSON Processing

### jq command not found

**Install jq:**
```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq

# Test
echo '{"test": "value"}' | jq '.'
```

### Unexpected JSON structure

**Debug JSON output:**
```bash
# Pretty print full response
python {baseDir}/scripts/redmine_cli.py issues | jq '.'

# Check structure
python {baseDir}/scripts/redmine_cli.py issues | jq 'keys'

# Sample first item
python {baseDir}/scripts/redmine_cli.py issues | jq '.issues[0]'
```

## HTTP 422: Required Custom Fields

**Symptom:** Issue creation returns HTTP 422 with Chinese error messages

```
HTTP 422: POST /issues.json
Errors: ['分支名称 不能为空字符', '测试任务类型 不能为空字符']
```

**Root cause:** The tracker has required custom fields that were not set.

**Solutions:**

### Step 1: Discover Required Custom Fields

Inspect an existing issue of the **SAME tracker type** to discover required fields:

```python
from redmine_client import RedmineClient
client = RedmineClient()

# Find an existing Test issue and examine its custom fields
resp = client._request('GET', '/issues.json?project_id=1&tracker_id=2&limit=1')
for issue in resp.get('issues', []):
    print(f"\nIssue #{issue['id']} custom fields:")
    for cf in issue.get('custom_fields', []):
        # Show all fields, even empty ones, to see what's available
        value = cf.get('value', '(empty)')
        print(f'  id={cf["id"]:3} name="{cf["name"]}" value="{value}"')
```

**Key insight:** Fields with empty values in existing issues might still be required for NEW issues. Check field names against error messages.

### Step 2: Provide Required Fields

Example for **Example test tracker (id=2)** - these fields are REQUIRED:

```python
client.create_issue(
    project_id=1,
    subject='Test: Feature validation',
    tracker_id=2,
    parent_issue_id=12345,  # Optional: creates child issue
    custom_fields=[
        {'id': 56, 'value': 'hotfix/task-12345'},  # 分支名称 (Branch name) - REQUIRED
        {'id': 127, 'value': '功能新增'},            # 测试任务类型 (Test task type) - REQUIRED
    ]
)
```

**Known values for field 127 (测试任务类型):**
- `'功能新增'` (Feature addition) - confirmed
- Other values: inspect existing Test issues to discover

### Why `/custom_fields.json` Doesn't Work

Attempting to query `/custom_fields.json` returns **HTTP 403** because it's an admin-only endpoint. Always use per-issue discovery instead
```

## Finding Unknown Tracker IDs

**Symptom:** Don't know the tracker ID number for a project.

### Known Example Project (id=1) Trackers

| Tracker ID | Name |
|-----------|------|
| 1 | Bug |
| 2 | Feature |
| 3 | Support |
| 5 | Test |
| 6 | Task |

### Discovery Method for Unknown Projects

Probe tracker IDs by querying for one issue per tracker:

```python
from redmine_client import RedmineClient
client = RedmineClient()

project_id = 13  # Change to your project ID

print(f"Discovering trackers for project {project_id}...\n")
for tid in range(1, 12):  # Try tracker IDs 1-11
    try:
        resp = client._request('GET', f'/issues.json?project_id={project_id}&tracker_id={tid}&limit=1')
        issues = resp.get('issues', [])
        if issues:
            tracker_name = issues[0]['tracker']['name']
            print(f'Tracker {tid}: {tracker_name}')
    except Exception as e:
        # Silently skip non-existent trackers
        pass
```

**Why `/trackers/<id>.json` doesn't work:** This endpoint returns **HTTP 404** — individual tracker endpoints are not available. Use issue queries with `tracker_id` filter instead.

### Alternative: Inspect Any Existing Issue

If you have an issue ID from the project:

```python
resp = client._request('GET', '/issues/<issue_id>.json')
print(f"Tracker: {resp['issue']['tracker']['name']} (id={resp['issue']['tracker']['id']})")
```

## Custom Field Queries Return Empty

**Symptom:** Filtering by custom field returns 0 results, but issues with that field exist.

**Root cause:** Custom field is not marked as "used as a filter" in Redmine field configuration.

**Solutions:**
1. Admin must enable "used as a filter" in Redmine field settings
2. Use alternative filtering (status, assignee, project) and filter locally with jq
3. Request full issue list and post-process:

```bash
# Fetch all issues and filter by custom field locally
python {baseDir}/scripts/redmine_cli.py issues --limit 100 | \
  jq '.issues[] | select(.custom_fields[] | select(.id == 56 and .value == "hotfix/task-12345"))'
```

## Performance Issues

### Slow responses

**Solutions:**
- Use filtering (status, project) to reduce result size
- Set appropriate limit (don't fetch all issues at once)
- Use pagination for large datasets
- Enable verbose mode to diagnose bottlenecks

```bash
# Good: Filter and limit
python {baseDir}/scripts/redmine_cli.py issues \
  --status open \
  --assigned-to me \
  --limit 25

# Avoid: Fetch everything
python {baseDir}/scripts/redmine_cli.py issues --limit 100
```

### Memory issues with large datasets

**Solutions:**
- Process data in chunks
- Use streaming for downloads
- Filter at API level, not post-processing

```python
from redmine_client import RedmineClient

client = RedmineClient()

# Process in pages
offset = 0
limit = 100
while True:
    result = client.get_issues(limit=limit, offset=offset)
    issues = result['issues']

    if not issues:
        break

    for issue in issues:
        # Process issue
        print(f"#{issue['id']}: {issue['subject']}")

    offset += limit
```

## Getting Help

If issues persist:

1. Check logs with `--verbose` flag
2. Test connection: `redmine-cli test`
3. Verify API key permissions in Redmine
4. Check Redmine server logs
5. Review [references/api-reference.md](references/api-reference.md) for API details
6. See [references/examples.md](references/examples.md) for working examples
