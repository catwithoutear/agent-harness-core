#!/usr/bin/env python3
"""
Redmine CLI Tool
Command-line interface for Redmine operations.
"""

import sys
import os
import json
import argparse
import logging
import requests
from datetime import datetime, timezone, timedelta

# Add scripts directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from redmine_client import RedmineClient, print_json

# Get local timezone from system
LOCAL_TZ = datetime.now(timezone.utc).astimezone().tzinfo


def convert_local_to_utc(date_str: str) -> str:
    """
    Convert local time date/datetime to UTC date/datetime.
    Automatically detects system timezone.

    Args:
        date_str: Date string in format YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
                  Assumed to be in local timezone

    Returns:
        UTC date string in format YYYY-MM-DD or YYYY-MM-DD HH:MM:SS

    Examples:
        # In Beijing (UTC+8):
        >>> convert_local_to_utc("2025-01-15")
        '2025-01-14'  # Local midnight = 16:00 previous day UTC
        >>> convert_local_to_utc("2025-01-15 08:00:00")
        '2025-01-15 00:00:00'  # Local 08:00 = 00:00 UTC (if UTC+8)
    """
    try:
        # Try parsing as datetime first
        if ' ' in date_str:
            # Format: YYYY-MM-DD HH:MM:SS
            local_dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            local_dt = local_dt.replace(tzinfo=LOCAL_TZ)
            utc_dt = local_dt.astimezone(timezone.utc)
            return utc_dt.strftime("%Y-%m-%d %H:%M:%S")
        else:
            # Format: YYYY-MM-DD (treat as midnight local time)
            local_dt = datetime.strptime(date_str, "%Y-%m-%d")
            local_dt = local_dt.replace(tzinfo=LOCAL_TZ)
            utc_dt = local_dt.astimezone(timezone.utc)
            return utc_dt.strftime("%Y-%m-%d")
    except ValueError as e:
        logger.warning(f"Failed to parse date '{date_str}': {e}. Returning as-is.")
        return date_str

# Configure CLI logging (only if not already configured)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.WARNING,
        format='%(levelname)s: %(message)s'
    )
logger = logging.getLogger(__name__)


def read_content(args):
    """
    Read content from file, text argument, or stdin.

    Args:
        args: Arguments object with 'file' and 'text' attributes

    Returns:
        Content string
    """
    if hasattr(args, 'file') and args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            return f.read()
    elif hasattr(args, 'text') and args.text:
        return args.text
    else:
        return sys.stdin.read()


def format_output(data: dict, output_format: str = 'json') -> str:
    """
    Format output data.

    Args:
        data: Data to format
        output_format: 'json' or 'pretty'

    Returns:
        Formatted string
    """
    if output_format == 'pretty':
        if 'issues' in data:
            for issue in data['issues']:
                print(f"#{issue['id']}: {issue['subject']}")
                print(f"  Status: {issue.get('status', {}).get('name', 'N/A')}")
                print(f"  Priority: {issue.get('priority', {}).get('name', 'N/A')}")
                if issue.get('assigned_to'):
                    print(f"  Assigned to: {issue['assigned_to'].get('name', 'N/A')}")
                print()
            return ""
        elif 'issue' in data:
            issue = data['issue']
            output = f"#{issue['id']}: {issue['subject']}\n"
            output += f"  Status: {issue.get('status', {}).get('name', 'N/A')}\n"
            output += f"  Priority: {issue.get('priority', {}).get('name', 'N/A')}\n"
            if issue.get('assigned_to'):
                output += f"  Assigned to: {issue['assigned_to'].get('name', 'N/A')}\n"
            output += f"\n{issue.get('description', '')}\n"
            return output
    return json.dumps(data, indent=2, ensure_ascii=False)


def cmd_get_issues(client, args):
    """Get issues with optional filters."""
    # Build custom fields dict from --custom-field parameters
    custom_fields = {}
    if args.custom_field:
        for cf in args.custom_field:
            # Format: field_id=value or field_id=value1,value2
            if '=' in cf:
                cf_id, cf_value = cf.split('=', 1)
                custom_fields[int(cf_id)] = cf_value

    # Build include list from --include parameters
    include = []
    if args.include:
        include = args.include.split(',')

    result = client.get_issues(
        status_id=args.status,
        project_id=args.project,
        assigned_to_id=args.assigned_to,
        priority_id=args.priority,
        tracker_id=args.tracker,
        author_id=args.author,
        fixed_version_id=args.fixed_version,
        created_on=args.created_on,
        updated_on=args.updated_on,
        due_date=args.due_date,
        custom_fields=custom_fields if custom_fields else None,
        just_assigned_to_id=getattr(args, 'just_assigned', None),
        limit=args.limit,
        offset=args.offset,
        sort=args.sort,
        query_filter=args.query,
        group_by=args.group_by,
        include=include if include else None
    )

    print_json(result)
    return result


def cmd_get_issue(client, args):
    """Get specific issue details."""
    # Build include list from --include parameter
    include = []
    if hasattr(args, 'include') and args.include:
        include = args.include.split(',')

    result = client.get_issue(
        issue_id=args.issue_id,
        include=include if include else None
    )
    print_json(result)
    return result


def cmd_create_issue(client, args):
    """Create a new issue."""
    result = client.create_issue(
        project_id=args.project,
        subject=args.subject,
        description=args.description,
        status_id=args.status_id,
        priority_id=args.priority_id,
        assigned_to_id=args.assigned_to_id,
        tracker_id=args.tracker_id
    )

    print_json(result)
    return result


def cmd_update_issue(client, args):
    """Update an existing issue."""
    # Build fields dict from provided arguments (using getattr for cleaner code)
    fields = {
        'project_id': getattr(args, 'project', None),
        'tracker_id': getattr(args, 'tracker_id', None),
        'status_id': getattr(args, 'status_id', None),
        'priority_id': getattr(args, 'priority_id', None),
        'subject': getattr(args, 'subject', None),
        'description': getattr(args, 'description', None),
        'category_id': getattr(args, 'category_id', None),
        'fixed_version_id': getattr(args, 'fixed_version_id', None),
        'assigned_to_id': getattr(args, 'assigned_to_id', None),
        'parent_issue_id': getattr(args, 'parent_issue_id', None),
        'estimated_hours': getattr(args, 'estimated_hours', None),
        'done_ratio': getattr(args, 'done_ratio', None),
        'notes': getattr(args, 'notes', None),
    }

    # Remove None values
    fields = {k: v for k, v in fields.items() if v is not None}

    # Handle private_notes (boolean flag)
    if getattr(args, 'private_notes', False):
        fields['private_notes'] = True

    # Handle custom fields
    if hasattr(args, 'custom_field') and args.custom_field:
        custom_fields = []
        for cf in args.custom_field:
            # Format: field_id=value or field_id=value1,value2
            if '=' in cf:
                cf_id, cf_value = cf.split('=', 1)
                custom_fields.append({'id': int(cf_id), 'value': cf_value})
        if custom_fields:
            fields['custom_fields'] = custom_fields

    result = client.update_issue(args.issue_id, **fields)

    print_json(result)
    return result


def cmd_get_wiki(client, args):
    """Get wiki page."""
    result = client.get_wiki_page(
        project_id=args.project,
        wiki_name=args.wiki_name,
        version=args.version
    )

    print_json(result)
    return result


def cmd_get_wiki_index(client, args):
    """Get wiki index (all wiki pages) for a project."""
    result = client.get_wiki_index(
        project_id=args.project
    )

    print_json(result)
    return result


def cmd_create_wiki(client, args):
    """Create wiki page."""
    text = read_content(args)

    result = client.create_wiki_page(
        project_id=args.project,
        title=args.title,
        text=text,
        parent_title=args.parent,
        comments=args.comments
    )

    print_json(result)
    return result


def cmd_update_wiki(client, args):
    """Update wiki page."""
    text = read_content(args)

    result = client.update_wiki_page(
        project_id=args.project,
        wiki_name=args.wiki_name,
        text=text,
        comments=args.comments
    )

    print_json(result)
    return result


def cmd_upload(client, args):
    """Upload file."""
    result = client.upload_file(
        file_path=args.file,
        description=args.description
    )

    print_json(result)
    return result


def cmd_download(client, args):
    """Download attachment."""
    file_path = client.download_file(
        attachment_id=args.attachment_id,
        save_path=args.save_path,
        filename=args.filename
    )

    print(f"✓ File downloaded to: {file_path}")
    return {"file_path": file_path}


def cmd_get_projects(client, args):
    """Get projects list."""
    result = client.get_projects(
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result





def cmd_search(client, args):
    """Search across Redmine."""
    result = client.search(
        query=args.query,
        scope=args.scope,
        include_issues=args.issues,
        include_wiki_pages=args.wiki,
        include_news=args.news,
        include_documents=args.documents,
        include_changesets=args.changesets,
        include_messages=args.messages,
        include_projects=args.projects,
        all_words=args.all_words,
        titles_only=args.titles_only,
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result


def cmd_time_entries(client, args):
    """Get time entries with automatic local→UTC timezone conversion."""
    # Convert local date to UTC for API query
    from_date = convert_local_to_utc(args.from_date) if args.from_date else None
    to_date = convert_local_to_utc(args.to_date) if args.to_date else None

    result = client.get_time_entries(
        project_id=args.project,
        user_id=args.user_id,
        spent_on_from=from_date,
        spent_on_to=to_date,
        issue_id=args.issue_id,
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result


def cmd_time_entry(client, args):
    """Get specific time entry."""
    result = client.get_time_entry(args.time_entry_id)
    print_json(result)
    return result


def cmd_relations(client, args):
    """Get issue relations."""
    result = client.get_issue_relations(args.issue_id)
    print_json(result)
    return result


def cmd_create_relation(client, args):
    """Create issue relation."""
    result = client.create_issue_relation(
        issue_id=args.issue_id,
        issue_to_id=args.issue_to_id,
        relation_type=args.relation_type,
        delay=args.delay
    )

    print_json(result)
    return result


def cmd_my_assigned(client, args):
    """Get issues assigned to user in recent days with timezone conversion."""
    # Calculate date from days ago (local time) and convert to UTC
    if args.days:
        date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
        date_utc = convert_local_to_utc(date)
    else:
        date_utc = None

    result = client.get_issues(
        assigned_to_id=args.user_id if args.user_id else 'me',
        created_on=f">={date_utc}" if args.days else None,
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result


def cmd_my_bugs(client, args):
    """Get bugs created by user in recent days with timezone conversion."""
    # Calculate date from days ago (local time) and convert to UTC
    if args.days:
        date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
        date_utc = convert_local_to_utc(date)
    else:
        date_utc = None

    result = client.get_issues(
        author_id=args.user_id,
        tracker_id='bug',
        created_on=f">={date_utc}" if args.days else None,
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result


def cmd_version_tasks(client, args):
    """Get tasks assigned to user for specific version."""
    result = client.get_issues(
        fixed_version_id=args.version,
        assigned_to_id=args.user_id if args.user_id else 'me',
        tracker_id='task' if args.tracker == 'task' else None,
        limit=args.limit,
        offset=args.offset
    )

    print_json(result)
    return result

def cmd_test(client, args):
    """Test connection."""
    user = client.get_current_user()
    print(f"✓ Connection successful!")
    print(f"  User: {user['user']['login']}")
    print(f"  ID: {user['user']['id']}")
    print(f"  Name: {user['user'].get('firstname', '')} {user['user'].get('lastname', '')}")
    return user


def cmd_me(client, args):
    """Get current user information (the user associated with the API key)."""
    user = client.get_current_user()
    print_json(user)
    return user


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Redmine CLI - Command-line interface for Redmine operations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test connection
  redmine-cli test

  # Get all open issues
  redmine-cli issues --status open

  # Get issues assigned to me
  redmine-cli issues --assigned-to me

  # Get specific issue
  redmine-cli issue 12345

  # Get issue with relations
  redmine-cli issue 12345 --include relations

  # Get issue with full details
  redmine-cli issue 12345 --include journals,attachments,relations,watchers

  # Get wiki page
  redmine-cli wiki myproject WikiPageName

  # Upload file
  redmine-cli upload /path/to/file.pdf --description "Report"

  # Create issue
  redmine-cli create-issue --project myproject --subject "Fix bug" --assigned-to 5

  # Update issue
  redmine-cli update-issue 12345 --status-id 2 --priority-id 4
  redmine-cli update-issue 12345 --assigned-to-id 10 --done-ratio 50
  redmine-cli update-issue 12345 --notes "Updated status after testing"
        """
    )

    # Global options
    parser.add_argument(
        "--url",
        help="Redmine base URL (default: REDMINE_BASE_URL env var)"
    )
    parser.add_argument(
        "--api-key",
        help="Redmine API key (default: REDMINE_API_KEY env var)"
    )
    parser.add_argument(
        "--no-ssl-verify",
        action="store_true",
        help="Disable SSL certificate verification"
    )
    parser.add_argument(
        "--output-format",
        choices=['json', 'pretty'],
        default='json',
        help="Output format (default: json)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose output"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Test command
    parser_test = subparsers.add_parser("test", help="Test connection to Redmine")

    # Current user command
    parser_me = subparsers.add_parser("me", help="Get current user information (user associated with API key)")

    # Issues command
    parser_issues = subparsers.add_parser("issues", help="Get list of issues")
    parser_issues.add_argument("--status", help="Filter by status (open, closed, or ID)")
    parser_issues.add_argument("--project", help="Filter by project ID")
    parser_issues.add_argument("--assigned-to", help="Filter by assignee ID or 'me'")
    parser_issues.add_argument("--just-assigned", help="Filter by ONLY this assignee (excludes multi-assigned)")
    parser_issues.add_argument("--priority", help="Filter by priority ID (>=3 for high)")
    parser_issues.add_argument("--tracker", help="Filter by tracker (bug, feature, task, etc.)")
    parser_issues.add_argument("--author", type=int, help="Filter by author user ID")
    parser_issues.add_argument("--fixed-version", help="Filter by target version ID")
    parser_issues.add_argument("--created-on", help="Filter by creation date (>=date, <=date, ><date|date)")
    parser_issues.add_argument("--updated-on", help="Filter by update date (>=date, <=date, ><date|date)")
    parser_issues.add_argument("--due-date", help="Filter by due date (>=date, <=date, t, w, t+N)")
    parser_issues.add_argument("--custom-field", action="append", help="Custom field filter (format: id=value)")
    parser_issues.add_argument("--query", help="Text search filter")
    parser_issues.add_argument("--limit", type=int, default=25, help="Max results (default: 25)")
    parser_issues.add_argument("--offset", type=int, default=0, help="Pagination offset")
    parser_issues.add_argument("--sort", help="Sort order (e.g., 'id:desc', 'priority:asc')")
    parser_issues.add_argument("--group-by", help="Group by field (status, priority, assigned_to, etc.)")
    parser_issues.add_argument("--include", help="Include associated data (children,attachments,relations,changesets,journals,watchers). Comma-separated.")

    # Issue command
    parser_issue = subparsers.add_parser("issue", help="Get specific issue")
    parser_issue.add_argument("issue_id", type=int, help="Issue ID")
    parser_issue.add_argument("--include", help="Include associated data (children,attachments,relations,changesets,journals,watchers,allowed_statuses). Comma-separated.")

    # Create issue command
    parser_create = subparsers.add_parser("create-issue", help="Create new issue")
    parser_create.add_argument("--project", required=True, help="Project ID")
    parser_create.add_argument("--subject", required=True, help="Issue subject")
    parser_create.add_argument("--description", help="Issue description")
    parser_create.add_argument("--status-id", type=int, help="Status ID")
    parser_create.add_argument("--priority-id", type=int, help="Priority ID")
    parser_create.add_argument("--assigned-to-id", type=int, help="Assignee user ID")
    parser_create.add_argument("--tracker-id", type=int, help="Tracker ID")

    # Update issue command
    parser_update = subparsers.add_parser("update-issue", help="Update existing issue")
    parser_update.add_argument("issue_id", type=int, help="Issue ID to update")
    parser_update.add_argument("--project", help="Project ID")
    parser_update.add_argument("--tracker-id", type=int, help="Tracker ID")
    parser_update.add_argument("--status-id", type=int, help="Status ID")
    parser_update.add_argument("--priority-id", type=int, help="Priority ID")
    parser_update.add_argument("--subject", help="Issue subject")
    parser_update.add_argument("--description", help="Issue description")
    parser_update.add_argument("--category-id", type=int, help="Category ID")
    parser_update.add_argument("--fixed-version-id", help="Target version ID")
    parser_update.add_argument("--assigned-to-id", type=int, help="Assignee user ID")
    parser_update.add_argument("--parent-issue-id", type=int, help="Parent issue ID")
    parser_update.add_argument("--estimated-hours", type=float, help="Estimated hours")
    parser_update.add_argument("--done-ratio", type=int, help="Percentage done (0-100)")
    parser_update.add_argument("--notes", help="Update comments/notes")
    parser_update.add_argument("--private-notes", action="store_true", help="Make notes private")
    parser_update.add_argument("--custom-field", action="append", help="Custom field (format: id=value)")

    # Wiki commands
    parser_wiki = subparsers.add_parser("wiki", help="Get wiki page")
    parser_wiki.add_argument("project", help="Project identifier")
    parser_wiki.add_argument("wiki_name", help="Wiki page name")
    parser_wiki.add_argument("--version", type=int, help="Specific version")

    parser_wiki_index = subparsers.add_parser("wiki-index", help="Get all wiki pages for a project")
    parser_wiki_index.add_argument("project", help="Project identifier")

    parser_create_wiki = subparsers.add_parser("create-wiki", help="Create wiki page")
    parser_create_wiki.add_argument("--project", required=True, help="Project identifier")
    parser_create_wiki.add_argument("--title", required=True, help="Page title")
    parser_create_wiki.add_argument("--text", help="Page content")
    parser_create_wiki.add_argument("--file", help="Read content from file")
    parser_create_wiki.add_argument("--parent", help="Parent page title")
    parser_create_wiki.add_argument("--comments", help="Version comments")

    parser_update_wiki = subparsers.add_parser("update-wiki", help="Update wiki page")
    parser_update_wiki.add_argument("--project", required=True, help="Project identifier")
    parser_update_wiki.add_argument("--wiki-name", required=True, help="Wiki page name")
    parser_update_wiki.add_argument("--text", help="Updated content")
    parser_update_wiki.add_argument("--file", help="Read content from file")
    parser_update_wiki.add_argument("--comments", help="Version comments")

    # Upload command
    parser_upload = subparsers.add_parser("upload", help="Upload file")
    parser_upload.add_argument("file", help="Path to file")
    parser_upload.add_argument("--description", help="File description")

    # Download command
    parser_download = subparsers.add_parser("download", help="Download attachment")
    parser_download.add_argument("attachment_id", type=int, help="Attachment ID")
    parser_download.add_argument("save_path", help="Directory to save file")
    parser_download.add_argument("--filename", help="Custom filename")


    # Search command
    parser_search = subparsers.add_parser("search", help="Search across Redmine")
    parser_search.add_argument("query", help="Search query string")
    parser_search.add_argument("--scope", choices=['all', 'my_project', 'subprojects'], default='all', help="Search scope")
    parser_search.add_argument("--issues", action="store_true", default=True, help="Include issues (default: True)")
    parser_search.add_argument("--no-issues", action="store_false", dest='issues', help="Exclude issues")
    parser_search.add_argument("--wiki", action="store_true", help="Include wiki pages")
    parser_search.add_argument("--news", action="store_true", help="Include news")
    parser_search.add_argument("--documents", action="store_true", help="Include documents")
    parser_search.add_argument("--changesets", action="store_true", help="Include changesets")
    parser_search.add_argument("--messages", action="store_true", help="Include messages")
    parser_search.add_argument("--projects", action="store_true", help="Include projects")
    parser_search.add_argument("--all-words", action="store_true", help="Match all words")
    parser_search.add_argument("--titles-only", action="store_true", help="Search only in titles")
    parser_search.add_argument("--limit", type=int, default=25, help="Max results")
    parser_search.add_argument("--offset", type=int, default=0, help="Pagination offset")

    # Time entries commands
    parser_time_entries = subparsers.add_parser("time-entries", help="Get time entries")
    parser_time_entries.add_argument("--project", help="Filter by project ID")
    parser_time_entries.add_argument("--user-id", type=int, help="Filter by user ID")
    parser_time_entries.add_argument("--from-date", help="Start date (YYYY-MM-DD)")
    parser_time_entries.add_argument("--to-date", help="End date (YYYY-MM-DD)")
    parser_time_entries.add_argument("--issue-id", type=int, help="Filter by issue ID")
    parser_time_entries.add_argument("--limit", type=int, default=100, help="Max results")
    parser_time_entries.add_argument("--offset", type=int, default=0, help="Pagination offset")

    parser_time_entry = subparsers.add_parser("time-entry", help="Get specific time entry")
    parser_time_entry.add_argument("time_entry_id", type=int, help="Time entry ID")

    # Relations commands
    parser_relations = subparsers.add_parser("relations", help="Get issue relations")
    parser_relations.add_argument("issue_id", type=int, help="Issue ID")

    parser_create_relation = subparsers.add_parser("create-relation", help="Create issue relation")
    parser_create_relation.add_argument("issue_id", type=int, help="Source issue ID")
    parser_create_relation.add_argument("issue_to_id", type=int, help="Target issue ID")
    parser_create_relation.add_argument("--type", dest='relation_type', default='relates',
                                      choices=['relates', 'duplicates', 'duplicated', 'blocks',
                                              'blocked', 'precedes', 'follows', 'copied_to', 'copied_from'],
                                      help="Relation type (default: relates)")
    parser_create_relation.add_argument("--delay", type=int, help="Delay for precedes/follows (days)")

    # Shortcut commands
    parser_my_assigned = subparsers.add_parser("my-assigned", help="Get issues assigned to me")
    parser_my_assigned.add_argument("--user-id", type=int, help="User ID (default: current user)")
    parser_my_assigned.add_argument("--days", type=int, help="Filter by days ago")
    parser_my_assigned.add_argument("--limit", type=int, default=100, help="Max results")
    parser_my_assigned.add_argument("--offset", type=int, default=0, help="Pagination offset")

    parser_my_bugs = subparsers.add_parser("my-bugs", help="Get bugs created by me")
    parser_my_bugs.add_argument("--user-id", type=int, required=True, help="User ID")
    parser_my_bugs.add_argument("--days", type=int, help="Filter by days ago")
    parser_my_bugs.add_argument("--limit", type=int, default=100, help="Max results")
    parser_my_bugs.add_argument("--offset", type=int, default=0, help="Pagination offset")

    parser_version_tasks = subparsers.add_parser("version-tasks", help="Get tasks for a version")
    parser_version_tasks.add_argument("--version", required=True, help="Version ID or name")
    parser_version_tasks.add_argument("--user-id", type=int, help="User ID (default: current user)")
    parser_version_tasks.add_argument("--tracker", default='task', help="Tracker type (default: task)")
    parser_version_tasks.add_argument("--limit", type=int, default=100, help="Max results")
    parser_version_tasks.add_argument("--offset", type=int, default=0, help="Pagination offset")

    # Projects command
    parser_projects = subparsers.add_parser("projects", help="Get projects list")
    parser_projects.add_argument("--limit", type=int, default=100, help="Max results")
    parser_projects.add_argument("--offset", type=int, default=0, help="Pagination offset")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    # Configure logging based on verbose flag
    if args.verbose:
        logging.getLogger().setLevel(logging.INFO)
        logger.setLevel(logging.INFO)

    # Create client
    try:
        client = RedmineClient(
            base_url=args.url,
            api_key=args.api_key,
            verify_ssl=not args.no_ssl_verify if hasattr(args, 'no_ssl_verify') else True
        )
        if args.verbose:
            logger.info(f"Connected to Redmine at {client.base_url}")
    except ValueError as e:
        print(f"Configuration Error: {e}", file=sys.stderr)
        return 1

    # Execute command
    command_map = {
        "test": cmd_test,
        "me": cmd_me,
        "issues": cmd_get_issues,
        "issue": cmd_get_issue,
        "create-issue": cmd_create_issue,
        "update-issue": cmd_update_issue,
        "wiki": cmd_get_wiki,
        "wiki-index": cmd_get_wiki_index,
        "create-wiki": cmd_create_wiki,
        "update-wiki": cmd_update_wiki,
        "upload": cmd_upload,
        "download": cmd_download,
        "projects": cmd_get_projects,
        "search": cmd_search,
        "time-entries": cmd_time_entries,
        "time-entry": cmd_time_entry,
        "relations": cmd_relations,
        "create-relation": cmd_create_relation,
        "my-assigned": cmd_my_assigned,
        "my-bugs": cmd_my_bugs,
        "version-tasks": cmd_version_tasks,
    }

    cmd_func = command_map.get(args.command)
    if cmd_func:
        try:
            if args.verbose:
                logger.info(f"Executing command: {args.command}")
            result = cmd_func(client, args)

            # Format output based on preference
            if args.output_format == 'pretty' and args.command not in ['test', 'upload', 'download']:
                formatted = format_output(result, 'pretty')
                if formatted:
                    print(formatted)

            return 0
        except requests.exceptions.Timeout as e:
            print(f"Error: Request timed out. The server may be slow or unreachable.", file=sys.stderr)
            if args.verbose:
                print(f"Details: {e}", file=sys.stderr)
            return 1
        except requests.exceptions.ConnectionError as e:
            print(f"Error: Failed to connect to Redmine server.", file=sys.stderr)
            if args.verbose:
                print(f"Details: {e}", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            if args.verbose:
                import traceback
                traceback.print_exc()
            return 1
    else:
        print(f"Unknown command: {args.command}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
