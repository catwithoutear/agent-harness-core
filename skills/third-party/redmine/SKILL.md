---
name: redmine
description: "Use when querying or updating Redmine issues, wiki pages, time entries, custom fields, relations, attachments, or project trackers."
---
# Redmine Management

Standalone skill for Redmine issue tracking system with advanced API access and token optimization.

## When to Use This Skill

Use this skill when:
- User mentions: Redmine, issue, ticket, bug, tracker, wiki, project management, 工单, 缺陷, 任务
- Working with issue tracking systems
- Need to query/filter issues by custom fields, dates, status, priority
- Working with Redmine wiki documentation
- Time tracking and reporting
- Batch processing Redmine data

**Common trigger phrases**:
- "查询issue", "redmine", "ticket", "bug报告", "wiki文档"
- "工单", "缺陷", "任务分配", "自定义字段"

**Key capabilities**:
- Advanced issue filtering (custom fields, date ranges, status, priority)
- Search across issues, wiki, documents
- Time entries and tracking
- Issue relations and dependencies
- Wiki page management (read, create, update, delete, list all pages)
- File upload/download

## Command Quick Reference

**Critical: Different subcommands use different parameter formats**

| Operation | Command Format | Notes |
|-----------|---------------|-------|
| **Wiki** | | |
| List all pages | `wiki-index <project>` | Positional arg |
| Get page | `wiki <project> <title>` | Positional args |
| Create page | `create-wiki --project <project> --title <title>` | Option flags |
| Update page | `update-wiki --project <project> --title <title>` | Option flags |
| **Issues** | | |
| List issues | `issues [--project <id>] [--status <status>]` | Options |
| Get issue | `issue <id>` | Positional arg |
| Create issue | `create-issue --project <id> --subject <text>` | Option flags |
| **Assignee Filters** | | |
| Assigned to | `--assigned-to <id|me>` | Filter by assignee (includes multi-assigned) |
| Just assigned to | `--just-assigned <id|me>` | Filter by ONLY this assignee (excludes multi-assigned) |
| **Time** | | |
| List entries | `time-entries [--user-id <id>] [--from-date <date>]` | Options |

## Core Principles

Before querying Redmine, ask yourself:

1. **Purpose**: What information do I need?
   - Count/summary only? → Use aggregation, don't fetch full objects
   - List browsing? → Extract key fields only
   - Full analysis? → Paginate and save to files

2. **Data volume**: How large will the result be?
   - <10 records → Request full objects
   - 10-100 records → Extract key fields
   - >100 records → Paginate, aggregate first, details later

3. **Performance**: Batch or interactive?
   - Batch → Script operations, save to files
   - Interactive → Fast response, limit fields

**Token optimization principles**:
- Principle 1: Filter at API level, not post-processing
- Principle 2: Extract only necessary fields (token = money)
- Principle 3: Use statistics first, details on-demand
- Principle 4: Paginate large datasets, never load all at once
- Principle 5: **Always include children,attachments,relations for issue queries** (complete data prevents follow-up requests)

## Prerequisites

**Required**: `.env` file with:
```bash
REDMINE_BASE_URL=https://your-server.com
REDMINE_API_KEY=your-key
```

**Test**: `~/.venv/bin/python {baseDir}/scripts/redmine_cli.py test`

## Time Zone Handling

**CRITICAL: All times in Redmine API are UTC**

### Key Points
- **User input**: Treat as local system time unless specified otherwise
- **API**: Uses UTC timestamps (ISO 8601 with `Z` suffix)
- **CLI**: Auto-converts local → UTC
- **Display**: Convert UTC back to local for user clarity

### Two Date Field Types

| Type | Fields | Format | Timezone |
|------|--------|--------|----------|
| **Timestamps** | `created_on`, `updated_on`, `closed_on` | `2026-01-20T06:37:41Z` | UTC, **convert** |
| **Dates** | `start_date`, `due_date` | `2026-01-20` | No timezone, **no convert** |

**Date shift example** (Beijing UTC+8):
```
UTC: 2025-12-04 16:57:02 → Local: 2025-12-05 00:57:02 (date changes!)
```

**CLI handles conversion automatically**:
```bash
redmine-cli time-entries --from-date 2025-01-12 --to-date 2025-01-18 --user-id 12345
```

---

## Query Decision Framework

**CRITICAL: Before ANY Redmine query, MUST answer these 3 questions**:

### 1. What do you need?
→ Use decision tree below (lines 85-123)
- Count only? → Aggregation query
- ID list? → Extract IDs only
- Summary? → Key fields only
- Full details? → Paginate and save to file

### 2. How many records?
→ **ALWAYS check `total_count` first**
- < 10 → Safe to fetch full objects
- 10-100 → Extract key fields
- \> 100 → **MUST paginate** with `--offset`

### 3. What's your token budget?
→ Choose appropriate jq filter:
- Budget: ~500 tokens → `.total_count` only
- Budget: ~1.5K tokens → IDs only
- Budget: ~7.5K tokens → Key fields (83% savings!)
- Budget: ~45K tokens → Full details (avoid if possible)

**Anti-patterns checklist** (review before querying):
- [ ] Am I fetching full objects when only counts needed?
- [ ] Am I filtering client-side instead of API-level?
- [ ] Am I requesting \>100 records (will fail)?
- [ ] Did I check `total_count` before fetching?

## Query Decision Tree

**Question: What do I need?**

### Need only counts/summary?
```bash
# Get total count (~500 tokens)
redmine-cli issues --limit 100 | jq '.total_count'

# Count by status (~500 tokens)
redmine-cli issues --limit 100 | jq '[.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length})'
```

### Need ID list only?
```bash
# Token usage: ~1.5K for 100 issues (97% reduction)
redmine-cli issues --limit 100 | jq '[.issues[].id]'
```

### Need key fields (summary)?
```bash
# Token usage: ~7.5K for 100 issues (83% reduction)
redmine-cli issues --limit 100 | jq '[.issues[] | {id, subject, status, priority}]'
```

### Need full details?
```bash
# Token usage: ~45K for 100 issues
redmine-cli issues --limit 100
# Then save to file and process selectively
```

**Decision path**:
```
What do you need?
├─ Count only → jq '.total_count' (~500 tokens)
├─ IDs only → jq '[.issues[].id]' (~1.5K tokens)
├─ Summary list → jq '[.issues[] | {id, subject, status}]' (~7.5K tokens)
└─ Full details → No jq filter (~45K tokens), use --limit 100 max
```

## Anti-Patterns (Critical)

### Token Waste
1. ❌ **Fetch full then filter**: `redmine-cli issues | jq 'select(.status=="Open")'`
   - ✅ Use API filter: `redmine-cli issues --status open`
   - **Why**: 100 issues = 45K tokens vs 7.5K (83% savings)

2. ❌ **Request >100 records**: `redmine-cli issues --limit 1000` (API rejects)
   - ✅ Paginate with `--offset` or check `total_count`
   - **Why**: API hard limit = 100, default = 25

3. ❌ **Client-side date filter**: `jq 'select(.updated_on > "2025-01-01")'`
   - ✅ Use API: `--updated-on ">=2025-01-01"`
   - **Why**: Reduces data transfer significantly

### Operational Errors
4. ❌ **Raw date operators**: Manual API with `?created-on=>date`
   - ✅ Use CLI: `--created-on ">=2025-01-01"` (auto-encodes)
   - **Why**: `>` requires URL encoding (`%3E`)

5. ❌ **Empty custom field query**: Keep trying values
   - ✅ Check "used as a filter" in Redmine field config
   - **Why**: Redmine requires explicit filter enablement

6. ❌ **Loop through issues**: `for id in $(cat ids); do redmine-cli issue $id; done`
   - ✅ Use `--include` or batch filters
   - **Why**: 100 requests vs 1 request, network overhead

## When to Load Reference Files

### **Must Load** (Always read before queries):
- **[references/context-optimization.md](references/context-optimization.md)** - Critical token optimization strategies
  - Load when: Any query involves >10 issues or you care about token efficiency
  - Contains: Pagination patterns, field extraction, batch processing

### **Load When** (Specific scenarios):
- **[references/examples.md#common-cli-operations](references/examples.md#common-cli-operations)** - Basic CLI commands
  - Load when: User asks "how to query/create/update issues" or needs CLI syntax
  - Contains: Issue queries, wiki operations, time tracking, relations

- **[references/examples.md#python-client-usage](references/examples.md#python-client-usage)** - Python API examples
  - Load when: Using Python client for programmatic access
  - Contains: Filtering, search, wiki index, custom fields

- **[references/examples.md#advanced-scenarios](references/examples.md#advanced-scenarios)** - Complex workflows
  - Load when: Handling >1000 records or batch operations
  - Contains: Large dataset handling, transaction safety, cross-project aggregation

- **[references/api-reference.md](references/api-reference.md)** - Complete API reference
  - Load when: You need advanced API details or Python client method signatures
  - Load when: Looking for specific endpoint parameters or response formats

- **[references/troubleshooting.md](references/troubleshooting.md)** - Troubleshooting guide
  - Load when: Encountering errors or unexpected behavior
  - Load when: Custom field queries return 0 results

### **Don't Load** (Unnecessary overhead):
- Any file not mentioned above for simple queries
- Multiple reference files simultaneously (load one at a time as needed)

**Loading trigger examples**:
```markdown
### User asks "how to create an issue" → Load [references/examples.md#common-cli-operations](references/examples.md#common-cli-operations)
### User says "我" (me) or "我的耗时" (my time entries) → Load [references/examples.md#common-cli-operations](references/examples.md#common-cli-operations) (Current User subsection)
### Need Python client code → Load [references/examples.md#python-client-usage](references/examples.md#python-client-usage)
### Processing 1000+ issues → Load [references/examples.md#large-dataset-handling-1000-records](references/examples.md#large-dataset-handling-1000-records)
### Batch update operations → Load [references/examples.md#batch-operations-with-transaction-safety](references/examples.md#batch-operations-with-transaction-safety)
### Creating child Test issues in a project -> Load [references/troubleshooting.md#http-422-required-custom-fields](references/troubleshooting.md#http-422-required-custom-fields)
### Custom field returns empty → Load [references/troubleshooting.md](references/troubleshooting.md)
### Need token optimization → Load [references/context-optimization.md](references/context-optimization.md)

## Creating Child Issues

The `create_issue()` method accepts `**kwargs` that map directly to Redmine API fields:
- `parent_issue_id=<number>` — creates a child issue
- `custom_fields=[{'id': N, 'value': '...'}]` — sets custom field values
- Any other API-supported field can be passed as kwargs

**Example: Creating a child Test issue in example project:**
```python
result = client.create_issue(
    project_id=1,
    subject='Test: Batch partial success handling',
    tracker_id=2,  # Test tracker
    parent_issue_id=12345,  # Parent task
    custom_fields=[
        {'id': 56, 'value': 'hotfix/task-12345'},  # 分支名称 (required)
        {'id': 127, 'value': '功能新增'},            # 测试任务类型 (required)
    ]
)
```

**Important:** Different trackers have different required custom fields. If you get HTTP 422 errors, see [Troubleshooting & Discovery Tips](#troubleshooting--discovery-tips) below.
```

## Troubleshooting & Discovery Tips

### Discovering Required Custom Fields

When creating issues returns **HTTP 422** ("不能为空字符"), the tracker has required custom fields:

```python
from redmine_client import RedmineClient
client = RedmineClient()

# Inspect an existing issue of the SAME tracker type
resp = client._request('GET', '/issues.json?project_id=1&tracker_id=2&limit=1')
for cf in resp['issues'][0].get('custom_fields', []):
    if cf.get('value'):
        print(f'id={cf["id"]} name={cf["name"]} value={cf["value"]}')
```

### Discovering Tracker IDs for a Project

Known **example project** trackers:
- Bug: 1, Feature: 2, Support: 3, Test: 5, Task: 6

For unknown projects, probe tracker IDs:
```python
for tid in range(1, 12):
    resp = client._request('GET', f'/issues.json?project_id=1&tracker_id={tid}&limit=1')
    for i in resp.get('issues', []):
        print(f'tracker {tid}: {i["tracker"]["name"]} (id={i["tracker"]["id"]})')
```

### Common Pitfalls

1. **HTTP 422 on create**: Missing required custom fields → Inspect existing issue of same tracker type
2. **HTTP 403 on `/custom_fields.json`**: Admin-only endpoint → Use per-issue discovery instead
3. **404 on `/trackers/<id>.json`**: Endpoint unavailable → Use issue query with `tracker_id` filter
4. **Empty custom field results**: Field not marked "used as a filter" in Redmine settings

For detailed troubleshooting, see **[references/troubleshooting.md](references/troubleshooting.md)**.

## Environment Variables

**Priority**: Command parameters > Environment variables > .env file

```bash
REDMINE_BASE_URL=https://your-server.com  # Required
REDMINE_API_KEY=your-key                   # Required
REDMINE_NO_SSL_VERIFY=true                  # Optional (disable SSL, not recommended)
REDMINE_TIMEOUT=30                         # Optional (request timeout in seconds)
```

## Error Handling

| Scenario | Solution |
|----------|----------|
| Connection timeout | `--no-ssl-verify` (testing) or check firewall |
| Permission denied | Verify API key and project membership |
| 404 Not found | Check identifier (case-sensitive) |
| Empty custom field query | Check "used as a filter" in Redmine settings |
| Rate limit | Built-in retry (3 attempts) |

## Best Practices

### DO
- Always use `--limit 100`
- Always use `--include children,attachments,relations` for issue queries
- Filter at API level
- Extract only necessary fields
- Use aggregation for statistics
- Save large datasets to files
- Use Textile for wiki

### DON'T
- Fetch all issues when you only need counts
- Use generic queries and filter locally
- Load full objects when key fields suffice
- Ignore pagination on large datasets
- Assume small result sets - check `total_count`
