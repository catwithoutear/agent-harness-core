# Context Optimization Guide for Redmine API

This guide provides comprehensive strategies for optimizing Redmine API usage to minimize token consumption and maximize efficiency when working with AI assistants.

## Table of Contents

1. [Understanding Token Consumption](#understanding-token-consumption)
2. [Pagination Best Practices](#pagination-best-practices)
3. [Field Extraction Strategies](#field-extraction-strategies)
4. [Query Optimization Patterns](#query-optimization-patterns)
5. [Batch Processing Guidelines](#batch-processing-guidelines)
6. [Common jq Filter Library](#common-jq-filter-library)
7. [Real-World Scenarios](#real-world-scenarios)

---

## Understanding Token Consumption

### Token Estimation Formula

```
Base tokens per issue:
  - Full object: ~300 tokens (≈2KB)
  - Key fields: ~50 tokens (≈300 bytes)
  - ID only: ~10 tokens (≈60 bytes)

Total tokens = issue_count × tokens_per_issue × 1.5 (JSON overhead + system prompt)
```

### Examples

| Query Type | Issue Count | Tokens | Notes |
|------------|-------------|---------|--------|
| Full objects | 100 | ~45K | Default behavior |
| Key fields | 100 | ~7.5K | 83% reduction |
| ID only | 100 | ~1.5K | 97% reduction |
| Full objects | 1,000 | ~450K | Too large for most contexts |
| Key fields | 1,000 | ~75K | Manageable |
| ID only | 1,000 | ~15K | Very efficient |

### Impact of Field Selection

```bash
# Measure actual token usage (estimate by file size)
redmine-cli issues --limit 100 > full.json
echo "Full objects: $(wc -c < full.json) bytes"

redmine-cli issues --limit 100 | jq '[.issues[] | {id, subject}]' > minimal.json
echo "Minimal fields: $(wc -c < minimal.json) bytes"
```

---

## Pagination Best Practices

### Principle: Always Use Maximum Limit

Redmine API limits results to 100 per request. Always use `--limit 100` for efficiency.

```bash
# GOOD: Maximum efficiency
redmine-cli issues --limit 100

# BAD: Wasted API calls
redmine-cli issues --limit 10
redmine-cli issues --offset 10 --limit 10
redmine-cli issues --offset 20 --limit 10
# Better: 3 calls vs 1 call
```

### Calculate Total Pages

```bash
# Get total count and calculate pages
TOTAL=$(redmine-cli issues --limit 1 | jq '.total_count')
PAGES=$((($TOTAL + 99) / 100))
echo "Total: $TOTAL issues, Pages: $PAGES"
```

### Pagination Pattern

```bash
# Get total count and pages
TOTAL=$(redmine-cli issues --limit 1 | jq '.total_count')
PAGES=$((($TOTAL + 99) / 100))

for page in $(seq 0 $((PAGES - 1))); do
  OFFSET=$((page * 100))
  echo "Page $((page + 1))/$PAGES (offset: $OFFSET)..."
  redmine-cli issues --offset $OFFSET --limit 100 > /tmp/page_$page.json
done

echo "Complete: $PAGES pages saved"
```

### Streaming Pagination

```bash
# Process issues without storing all in memory
TOTAL=$(redmine-cli issues --limit 1 | jq '.total_count')
PAGES=$((($TOTAL + 99) / 100))

for page in $(seq 0 $((PAGES - 1))); do
  OFFSET=$((page * 100))
  redmine-cli issues --offset $OFFSET --limit 100 | jq -c '.issues[]' | while read issue; do
    ID=$(echo "$issue" | jq -r '.id')
    SUBJECT=$(echo "$issue" | jq -r '.subject')
    echo "Processing #$ID: $SUBJECT"
  done
done
```

---

## Field Extraction Strategies

### Strategy 1: Extract Only IDs (Most Efficient)

**Use case:** When you need to identify issues but don't need their details

```bash
# Token usage: ~1.5K for 100 issues (97% reduction)
redmine-cli issues --limit 100 | jq '[.issues[].id]'
```

**Example workflow:**
```bash
# Step 1: Get issue IDs
IDS=$(redmine-cli issues --limit 100 | jq -r '.[].id')

# Step 2: Process selectively
for id in $IDS; do
  echo "Checking issue #$id..."
  # Get details only when needed
  redmine-cli issue $id | jq '.status.name'
done
```

### Strategy 2: Extract Key Fields

**Use case:** When you need specific information for display or filtering

```bash
# Token usage: ~7.5K for 100 issues (83% reduction)
redmine-cli issues --limit 100 | \
  jq '[.issues[] | {id, subject, status: .status.name, priority: .priority.name}]'
```

**Example key field combinations:**

```bash
# For task lists
redmine-cli issues --limit 100 | \
  jq '[.issues[] | {id, subject, status, priority, due_date}]'

# For assignment overview
redmine-cli issues --limit 100 | \
  jq '[.issues[] | {id, subject, assigned_to: .assigned_to.name, status}]'

# For custom field queries
redmine-cli issues --limit 100 | \
  jq '[.issues[] | {id, subject, custom_fields: [.custom_fields[] | select(.id==56 or .id==106)]}]'
```

### Strategy 3: Extract Metadata Only

**Use case:** When you only need counts or summary information

```bash
# Token usage: ~500 tokens for metadata (99% reduction)
redmine-cli issues --limit 100 | jq '{total_count, limit, offset}'
```

### Strategy 4: Grouped Aggregation

**Use case:** When you need statistics, not individual records

```bash
# Count by status (very efficient)
redmine-cli issues --limit 100 | \
  jq '[.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length})'

# Count by priority
redmine-cli issues --limit 100 | \
  jq '[.issues[] | .priority.name] | group_by(.) | map({priority: .[0], count: length})'

# Count by assignee
redmine-cli issues --limit 100 | \
  jq '[.issues[] | .assigned_to.name] | group_by(.) | map({assignee: .[0], count: length})'
```

### Strategy 5: Conditional Extraction

**Use case:** When you need to filter locally after API query

```bash
# Extract only high-priority issues
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.priority.id >= 3) | {id, subject, priority}]'

# Extract only open issues
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.status.name == "Open")]'

# Extract issues with specific custom field value
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.custom_fields[]? | select(.id==56 and .value=="master"))]'
```

---

## Query Optimization Patterns

### Pattern 1: Statistics First, Details Later

**Problem:** Fetching all issues to get counts is wasteful

```bash
# BAD: Fetch all issues to count
ALL_ISSUES=$(redmine-cli issues --limit 100)
COUNT=$(echo "$ALL_ISSUES" | jq '.issues | length')

# GOOD: Get count directly
COUNT=$(redmine-cli issues --limit 1 | jq '.total_count')
```

### Pattern 2: Filter at API Level, Not Locally

**Problem:** Fetching all issues and filtering locally

```bash
# BAD: Fetch all, filter locally
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.status.name == "Open")]'

# GOOD: Let API filter
redmine-cli issues --status open --limit 100
```

### Pattern 3: Incremental Queries with Time Windows

**Problem:** Re-fetching all issues on every query

**Solution:** Track last sync time and fetch only updates

```bash
# Track last sync time
SYNC_FILE="/tmp/redmine_last_sync"

# Read last sync time
if [ -f "$SYNC_FILE" ]; then
  LAST_SYNC=$(cat "$SYNC_FILE")
else
  LAST_SYNC="2025-01-01T00:00:00Z"
fi

# Fetch only updated issues
UPDATED=$(redmine-cli issues --updated-on ">=$LAST_SYNC" --limit 100)

if [ "$(echo "$UPDATED" | jq '.issues | length')" -gt 0 ]; then
  echo "Found $(echo "$UPDATED" | jq '.issues | length') updated issues"
  # Process updates...

  # Update sync time to now
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$SYNC_FILE"
fi
```

### Pattern 4: Use Specific Filters for Common Queries

**Problem:** Using generic queries and filtering locally

```bash
# BAD: Generic query
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.tracker.name == "Bug")]'

# GOOD: Specific filter
redmine-cli issues --tracker bug --limit 100

# BAD: Generic query
redmine-cli issues --limit 100 | \
  jq '[.issues[] | select(.assigned_to.id == 10)]'

# GOOD: Specific filter
redmine-cli issues --assigned-to 10 --limit 100
```

### Pattern 5: Use Grouping for Summaries

**Problem:** Fetching all issues to calculate statistics

```bash
# BAD: Fetch all to calculate stats
redmine-cli issues --limit 100 | \
  jq '[.issues[] | .status.name] | unique' | wc -l

# GOOD: Use API grouping
redmine-cli issues --group-by status --limit 100 | \
  jq '.issues | group_by(.status.name) | map({status: .[0].status.name, count: length})'
```

---

## Batch Processing Guidelines

### Guideline 1: Save Large Datasets to Files

**Problem:** Loading large datasets into AI context

**Solution:** Save to files, process selectively

```bash
# Export to file
redmine-cli issues --limit 1000 > /tmp/all_issues.json
echo "Exported 1000 issues to /tmp/all_issues.json"

# AI only reads metadata
METADATA=$(jq '{total_count, limit, offset}' /tmp/all_issues.json)
echo "Metadata: $METADATA"
```

### Guideline 2: Use Streaming for Processing

**Problem:** Loading entire dataset into memory

**Solution:** Stream records one at a time

```bash
# Process issues one by one
redmine-cli issues --limit 100 | jq -c '.issues[]' | while read issue; do
  ID=$(echo "$issue" | jq -r '.id')
  SUBJECT=$(echo "$issue" | jq -r '.subject')

  # Process individual issue
  echo "Processing #$ID: $SUBJECT"
done
```

### Guideline 3: Batch Updates

**Problem:** Updating issues one by one is slow

**Solution:** Script multiple updates

```bash
# Update multiple issues with same status
for issue_id in $(cat issue_ids.txt); do
  echo "Updating issue #$issue_id..."
  redmine-cli update-issue $issue_id --status-id 2
done
```

---

## Common jq Filter Library

### Basic Filters

```bash
# Extract IDs only
jq '[.issues[].id]'

# Extract subjects only
jq '[.issues[].subject]'

# Extract key fields
jq '[.issues[] | {id, subject, status, priority}]'

# Count issues
jq '.issues | length'

# Get total count
jq '.total_count'
```

### Filtering

```bash
# Filter by status
jq '[.issues[] | select(.status.name == "Open")]'

# Filter by priority
jq '[.issues[] | select(.priority.id >= 3)]'

# Filter by date
jq '[.issues[] | select(.created_on | startswith("2025-01"))]'

# Multiple conditions (AND)
jq '[.issues[] | select(.status.name == "Open" and .priority.id >= 3)]'

# Multiple conditions (OR)
jq '[.issues[] | select(.status.name == "Open" or .status.name == "In Progress")]'

# Negation
jq '[.issues[] | select(.status.name != "Closed")]'
```

### Grouping and Aggregation

```bash
# Count by status
jq '[.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length})'

# Count by priority
jq '[.issues[] | .priority.name] | group_by(.) | map({priority: .[0], count: length})'

# Count by assignee
jq '[.issues[] | .assigned_to.name] | group_by(.) | map({assignee: .[0], count: length})'

# Count by project
jq '[.issues[] | .project.name] | group_by(.) | map({project: .[0], count: length})'

# Sum hours (for time entries)
jq '[.time_entries[].hours] | add'

# Average priority
jq '[.issues[].priority.id] | add / length'
```

### Custom Field Filters

```bash
# Filter by custom field ID
jq '[.issues[] | select(.custom_fields[]? | select(.id == 56 and .value == "master"))]'

# Filter by multiple custom fields
jq '[.issues[] | select(
  (.custom_fields[]? | select(.id == 56 and .value == "master")) and
  (.custom_fields[]? | select(.id == 106 and .value == "john"))
)]'

# Extract custom field value
jq '.issues[] | {id, subject, branch: (.custom_fields[]? | select(.id==56) | .value)}'

# Filter by empty custom field
jq '[.issues[] | select(.custom_fields[]? | select(.id==90 and (.value=="" or .value==null)))]'
```

### Text Processing

```bash
# Search in subject
jq '[.issues[] | select(.subject | test("API", "i"))]'

# Search in description
jq '[.issues[] | select(.description | test("urgent", "i"))]'

# Format as table
jq -r '.issues[] | "\(.id) | \(.subject) | \(.status.name) | \(.priority.name)"'

# Format as markdown list
jq -r '.issues[] | "- #\(.id): \(.subject) (\(.status.name))"'
```

### Advanced Patterns

```bash
# Sort by priority
jq 'sort_by(.priority.id)'

# Reverse sort
jq 'reverse | sort_by(.priority.id)'

# Limit results
jq '.issues[:10]'

# Unique values
jq '[.issues[].status.name] | unique'

# Top N by priority
jq 'sort_by(.priority.id) | reverse | .[:5]'

# Flatten custom fields
jq '[.issues[] | {id, subject, cf_values: [.custom_fields[].value]}]'
```

---

## Real-World Scenarios

### Scenario 1: Daily Standup Preparation

**Goal:** Get my open issues for standup

```bash
# Optimized approach
redmine-cli issues --assigned-to me --status open --limit 100 | \
  jq '[.issues[] | {id, subject, priority: .priority.name, due_date}] |
     sort_by(.priority.id) | reverse'
```

**Token savings:** ~83% (key fields vs full objects)

### Scenario 2: Weekly Status Report

**Goal:** Generate weekly statistics

```bash
# Get counts by status
STATUS_COUNTS=$(redmine-cli issues --limit 100 | \
  jq '[.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length})')

# Get counts by priority
PRIORITY_COUNTS=$(redmine-cli issues --limit 100 | \
  jq '[.issues[] | .priority.name] | group_by(.) | map({priority: .[0], count: length})')

# Display report
cat << REPORTEOF
## Weekly Status Report

### By Status
$(echo "$STATUS_COUNTS" | jq -r '.[] | "- \(.status): \(.count)"')

### By Priority
$(echo "$PRIORITY_COUNTS" | jq -r '.[] | "- \(.priority): \(.count)"')
REPORTEOF
```

**Token savings:** ~99% (aggregation vs full objects)

### Scenario 3: Bug Triage

**Goal:** Get all bugs, categorize by priority

```bash
# Get bugs with priority info
redmine-cli issues --tracker bug --limit 100 | \
  jq '[.issues[] | {id, subject, priority: .priority.name, status: .status.name}] |
     group_by(.priority.name) |
     map({priority: .[0].priority, count: length, issues: map({id, subject, status})})'
```

**Token savings:** ~75% (key fields vs full objects)

### Scenario 4: Sprint Planning

**Goal:** Get all tasks for version, group by assignee

```bash
# Get version tasks with assignees
redmine-cli issues --fixed-version v2.2.0 --tracker task --limit 100 | \
  jq '[.issues[] | {id, subject, assignee: .assigned_to.name}] |
     group_by(.assignee) |
     map({assignee: .[0].assignee, count: length, tasks: map({id, subject})})'
```

**Token savings:** ~80% (key fields vs full objects)

### Scenario 5: Code Review Queue

**Goal:** Get issues ready for review (custom field)

```bash
# Filter by custom field locally (API may not support it)
redmine-cli issues --limit 100 | \
  jq '[.issues[] |
    select(.custom_fields[]? | select(.id==90 and .value=="ready")) |
    {id, subject, branch: (.custom_fields[]? | select(.id==56) | .value)}]'
```

**Token savings:** ~90% (filtered + key fields vs full objects)

### Scenario 6: Large Dataset Export

**Goal:** Export all issues to file without loading into context

```bash
# Write opening bracket
echo '{"issues": [' > /tmp/all_issues.json

TOTAL=$(redmine-cli issues --limit 1 | jq '.total_count')
PAGES=$((($TOTAL + 99) / 100))

FIRST=true
for page in $(seq 0 $((PAGES - 1))); do
  OFFSET=$((page * 100))

  if [ "$FIRST" = true ]; then
    redmine-cli issues --offset $OFFSET --limit 100 | jq '.issues[]' >> /tmp/all_issues.json
    FIRST=false
  else
    echo ',' >> /tmp/all_issues.json
    redmine-cli issues --offset $OFFSET --limit 100 | jq '.issues[]' >> /tmp/all_issues.json
  fi

  echo "Exported page $((page + 1))/$PAGES..."
done

# Write closing bracket
echo ']}' >> /tmp/all_issues.json

echo "Exported $TOTAL issues to /tmp/all_issues.json"
```

**Token savings:** 100% (no issues loaded into AI context)

### Scenario 7: Time Entry Analysis

**Goal:** Get time spent by user this month

```bash
# Filter by date range, group by user
redmine-cli time-entries --from-date 2025-01-01 --to-date 2025-01-31 --limit 1000 | \
  jq '[.time_entries[] | {user: .user.name, hours}] |
     group_by(.user) |
     map({user: .[0].user, total_hours: map(.hours) | add})'
```

**Token savings:** ~95% (aggregation vs full details)

### Scenario 8: Custom Field Analysis

**Goal:** Analyze distribution of custom field values

```bash
# Count by custom field value
redmine-cli issues --limit 100 | \
  jq '[.issues[] |
      (.custom_fields[]? | select(.id==56)) | .value] |
     group_by(.) |
     map({value: .[0], count: length})'
```

**Token savings:** ~98% (values only vs full objects)

---

## Best Practices Summary

### DO

1. Always use pagination with --limit 100
2. Filter at API level when possible
3. Extract only necessary fields to reduce tokens
4. Use aggregation for statistics instead of full details
5. Save large datasets to files
6. Track sync timestamps for incremental queries
7. Group results for summaries
8. Use specific filters (tracker, status, assignee)
9. Process streams instead of loading all data
10. Cache metadata to avoid repeated queries

### DON'T

1. Don't fetch all issues when you only need counts
2. Don't use generic queries and filter locally
3. Don't load full objects when key fields suffice
4. Don't ignore pagination for large datasets
5. Don't re-query without checking last sync time
6. Don't store large datasets in AI context
7. Don't fetch unnecessary associations (journals, attachments)
8. Don't process issues one-by-one when batch is possible
9. Don't use text search when specific filters exist
10. Don't assume small result sets - always paginate

---

## Performance Benchmarks

### Query Type Comparison

| Query Type | Time (100 issues) | Tokens | API Calls | Recommendation |
|------------|-------------------|---------|------------|----------------|
| Full objects | ~2s | ~45K | 1 | Only for detailed analysis |
| Key fields | ~1.5s | ~7.5K | 1 | For lists and summaries |
| ID only | ~1s | ~1.5K | 1 | For identification |
| Paginated full | ~20s | ~450K | 10 | Export to file only |
| Aggregated | ~1s | ~500 | 1 | For statistics |

### Real-World Example: Monthly Report

**Naive approach:**
```bash
# Fetch all issues (10 pages)
ALL_ISSUES=""
for page in {0..9}; do
  ALL_ISSUES+=$(redmine-cli issues --offset $((page*100)) --limit 100)
done

# Process in AI context (~450K tokens)
echo "$ALL_ISSUES" | jq '...'
```

**Optimized approach:**
```bash
# Get statistics directly (~500 tokens)
STATS=$(redmine-cli issues --limit 100 | jq '{
  by_status: [.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length}),
  by_priority: [.issues[] | .priority.name] | group_by(.) | map({priority: .[0], count: length}),
  total: .total_count
}')

echo "$STATS"
```

**Results:**
- Time: 1s vs 20s (95% faster)
- Tokens: 500 vs 450K (99.9% reduction)
- API calls: 1 vs 10 (90% fewer)

---

## Quick Reference

### Token Estimation

```bash
# Estimate token count by file size
wc -c file.json | awk '{print $1 / 4}'  # Approximate tokens
```

### jq Quick Templates

```bash
# Count by status
jq '[.issues[] | .status.name] | group_by(.) | map({status: .[0], count: length})'

# Extract IDs
jq '[.issues[].id]'

# Key fields
jq '[.issues[] | {id, subject, status, priority}]'

# Filter
jq '[.issues[] | select(.status.name == "Open")]'
```

### Pagination Script

```bash
TOTAL=$(redmine-cli issues --limit 1 | jq '.total_count')
PAGES=$((($TOTAL + 99) / 100))

for page in $(seq 0 $((PAGES - 1))); do
  redmine-cli issues --offset $((page * 100)) --limit 100
done
```

---

## Additional Resources

- [jq Manual](https://stedolan.github.io/jq/manual/)
- [jq Tutorial](https://jqplay.org/)
- [Redmine REST API](https://www.redmine.org/projects/redmine/wiki/Rest_api)
- [Redmine Issue Query Reference](https://www.freelancingdigest.com/articles/redmine-query-reference/)
