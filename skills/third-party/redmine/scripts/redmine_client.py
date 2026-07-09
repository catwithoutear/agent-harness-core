#!/usr/bin/env python3
"""
Redmine REST API Client
A standalone Python client for Redmine operations without MCP dependency.
"""

import os
import sys
import json
import requests
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from urllib.parse import urljoin


def _load_env_file():
    """
    Automatically load .env file if it exists.
    This function attempts to load environment variables from .env file
    located in the skill directory or its parent directories.
    """
    # Try to load .env using python-dotenv if available
    try:
        from dotenv import load_dotenv

        # Find the .env file (start from script location and go up)
        script_dir = Path(__file__).parent.parent  # scripts/ -> skill root/
        env_file = script_dir / '.env'

        if env_file.exists():
            load_dotenv(env_file)
            return True
    except ImportError:
        # If python-dotenv is not available, try manual loading
        script_dir = Path(__file__).parent.parent
        env_file = script_dir / '.env'

        if env_file.exists():
            # Manual .env parsing
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    # Skip comments and empty lines
                    if not line or line.startswith('#'):
                        continue
                    # Parse KEY=VALUE
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        # Remove quotes if present
                        if value.startswith('"') and value.endswith('"'):
                            value = value[1:-1]
                        elif value.startswith("'") and value.endswith("'"):
                            value = value[1:-1]
                        # Only set if not already in environment
                        if key not in os.environ:
                            os.environ[key] = value
            return True

    return False


# Auto-load .env file on module import
_load_env_file()

# Configure logging (only if not already configured)
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.WARNING,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
logger = logging.getLogger(__name__)


class RedmineClient:
    """
    Redmine REST API client for issue tracking, wiki management, and file operations.

    Supports context manager usage for proper resource cleanup:

        with RedmineClient() as client:
            issues = client.get_issues()
    """

    # Class-level retry configuration
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0  # seconds
    TIMEOUT = int(os.getenv("REDMINE_TIMEOUT", "30"))

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        verify_ssl: Optional[bool] = None,
        timeout: Optional[int] = None,
        max_retries: Optional[int] = None
    ):
        """
        Initialize Redmine client.

        Args:
            base_url: Redmine base URL (e.g., https://redmine.example.com)
            api_key: Redmine API key
            verify_ssl: Whether to verify SSL certificates (default: true unless env var set)
            timeout: Request timeout in seconds (default: REDMINE_TIMEOUT env var or 30)
            max_retries: Maximum number of retry attempts (default: 3)
        """
        self.base_url = base_url or os.getenv("REDMINE_BASE_URL", "")
        self.api_key = api_key or os.getenv("REDMINE_API_KEY", "")

        # Handle SSL verification (more readable logic)
        if verify_ssl is not None:
            self.verify_ssl = verify_ssl
        else:
            no_ssl_verify = os.getenv("REDMINE_NO_SSL_VERIFY", "").lower() == "true"
            self.verify_ssl = not no_ssl_verify

        self.timeout = timeout if timeout is not None else self.TIMEOUT
        self.max_retries = max_retries if max_retries is not None else self.MAX_RETRIES

        if not self.base_url or not self.api_key:
            raise ValueError(
                "REDMINE_BASE_URL and REDMINE_API_KEY must be set as environment variables "
                "or passed as parameters"
            )

        # Normalize base_url: ensure it ends with exactly one slash
        self.base_url = self.base_url.rstrip('/') + '/'

        self.session = requests.Session()
        self.session.headers.update({
            "X-Redmine-API-Key": self.api_key,
            "Content-Type": "application/json"
        })

        logger.debug(f"RedmineClient initialized: {self.base_url}")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, _exc_type, _exc_val, _exc_tb):
        """Context manager exit - close session."""
        self.session.close()
        return False

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None,
        files: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request to Redmine API with retry logic.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            path: API path (e.g., /issues.json)
            params: Query parameters
            data: Request body data
            files: Files to upload

        Returns:
            Response data as dictionary

        Raises:
            Exception: If request fails after all retries
        """
        # Build URL using urljoin for proper path combination
        url = urljoin(self.base_url, path.lstrip('/'))
        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    params=params,
                    json=data,
                    files=files,
                    verify=self.verify_ssl,
                    timeout=self.timeout
                )

                response.raise_for_status()
                # Handle empty response (e.g., 204 No Content for PUT/DELETE)
                if not response.content:
                    return {"success": True}
                return response.json()

            except requests.exceptions.Timeout as e:
                last_exception = e
                logger.warning(f"Request timeout on attempt {attempt + 1}/{self.max_retries + 1}: {method} {url}")
                if attempt < self.max_retries:
                    time.sleep(self.RETRY_DELAY * (attempt + 1))

            except requests.exceptions.ConnectionError as e:
                last_exception = e
                logger.warning(f"Connection error on attempt {attempt + 1}/{self.max_retries + 1}: {method} {url}")
                if attempt < self.max_retries:
                    time.sleep(self.RETRY_DELAY * (attempt + 1))

            except requests.exceptions.HTTPError as e:
                # Don't retry HTTP errors (4xx, 5xx) - these are not transient
                error_msg = self._build_error_message(method, url, e)
                logger.error(error_msg)
                raise Exception(error_msg) from e

            except requests.exceptions.RequestException as e:
                last_exception = e
                logger.warning(f"Request error on attempt {attempt + 1}/{self.max_retries + 1}: {method} {url}")
                if attempt < self.max_retries:
                    time.sleep(self.RETRY_DELAY * (attempt + 1))

        # All retries exhausted
        error_msg = f"API request failed after {self.max_retries + 1} attempts: {method} {url}"
        if last_exception:
            error_msg += f"\nLast error: {str(last_exception)}"
        raise Exception(error_msg)

    def _build_error_message(self, method: str, url: str, error: requests.exceptions.HTTPError) -> str:
        """Build detailed error message from HTTP error."""
        error_msg = f"HTTP {error.response.status_code}: {method} {url}"
        try:
            error_data = error.response.json()
            if "errors" in error_data:
                error_msg += f"\nErrors: {error_data['errors']}"
        except (ValueError, KeyError):
            if hasattr(error.response, 'text'):
                error_msg += f"\nResponse: {error.response.text}"
        return error_msg

    # ==================== Issue Operations ====================

    def get_issues(
        self,
        status_id: Optional[str] = None,
        project_id: Optional[str] = None,
        assigned_to_id: Optional[str] = None,
        priority_id: Optional[str] = None,
        tracker_id: Optional[str] = None,
        author_id: Optional[int] = None,
        fixed_version_id: Optional[str] = None,
        created_on: Optional[str] = None,
        updated_on: Optional[str] = None,
        due_date: Optional[str] = None,
        custom_fields: Optional[Dict[int, str]] = None,
        just_assigned_to_id: Optional[str] = None,
        limit: int = 25,
        offset: int = 0,
        sort: Optional[str] = None,
        query_filter: Optional[str] = None,
        group_by: Optional[str] = None,
        include: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get list of issues with optional filters.

        Args:
            status_id: Filter by status (open, closed, or specific status ID)
            project_id: Filter by project ID
            assigned_to_id: Filter by assignee ID ('me' for current user)
            priority_id: Filter by priority ID (>=3 for high priority)
            tracker_id: Filter by tracker ID (bug, feature, support, etc.)
            author_id: Filter by author user ID
            fixed_version_id: Filter by target version ID
            created_on: Filter by creation date (>=date, <=date, ><date|date)
            updated_on: Filter by update date (>=date, <=date, ><date|date)
            due_date: Filter by due date (>=date, <=date, t, w, t+N, >t-N)
            custom_fields: Dictionary of custom field filters {field_id: value}
            just_assigned_to_id: Filter by ONLY assigned to this user ID (excludes multi-assigned, use 'me' for current user)
            limit: Max number of results (default: 25, max: 100)
            offset: Pagination offset
            sort: Sort field and order (e.g., 'id:desc', 'priority:asc')
            query_filter: Text search filter (e.g., '~search_term')
            group_by: Group results by field (status, priority, assigned_to, etc.)
            include: Include associated data (journals, attachments, relations, etc.)

        Returns:
            Dictionary with issues list and metadata
        """
        params = {
            "limit": limit,
            "offset": offset,
            **{k: v for k, v in [
                ("status_id", status_id),
                ("project_id", project_id),
                ("assigned_to_id", assigned_to_id),
                ("priority_id", priority_id),
                ("tracker_id", tracker_id),
                ("author_id", author_id),
                ("fixed_version_id", fixed_version_id),
                ("created_on", created_on),
                ("updated_on", updated_on),
                ("due_date", due_date),
                ("just_assigned_to_id", just_assigned_to_id),
                ("sort", sort),
                ("subject", query_filter),
                ("group_by", group_by)
            ] if v is not None}
        }

        # Add custom fields
        if custom_fields:
            for cf_id, cf_value in custom_fields.items():
                params[f"cf_{cf_id}"] = cf_value

        # Add include parameter
        if include:
            params["include"] = ",".join(include)

        return self._request("GET", "/issues.json", params=params)

    def get_issue(
        self,
        issue_id: int,
        include: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get details of a specific issue.

        Args:
            issue_id: Issue ID
            include: Include associated data. Possible values:
                - children: Child issues/subtasks
                - attachments: File attachments
                - relations: Related issues
                - changesets: Associated code commits
                - journals: Issue history/comments
                - watchers: Users watching this issue
                - allowed_statuses: Valid status transitions for this issue

        Returns:
            Issue details dictionary
        """
        params = {}
        if include:
            params["include"] = ",".join(include)

        return self._request("GET", f"/issues/{issue_id}.json", params=params)

    def create_issue(
        self,
        project_id: Union[str, int],
        subject: str,
        description: Optional[str] = None,
        status_id: Optional[int] = None,
        priority_id: Optional[int] = None,
        assigned_to_id: Optional[int] = None,
        tracker_id: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Create a new issue.

        Args:
            project_id: Project ID
            subject: Issue subject/title
            description: Issue description
            status_id: Status ID
            priority_id: Priority ID
            assigned_to_id: Assignee user ID
            tracker_id: Tracker ID
            **kwargs: Additional issue fields

        Returns:
            Created issue details
        """
        issue_data = {
            "project_id": project_id,
            "subject": subject,
            **{k: v for k, v in [
                ("description", description),
                ("status_id", status_id),
                ("priority_id", priority_id),
                ("assigned_to_id", assigned_to_id),
                ("tracker_id", tracker_id)
            ] if v is not None},
            **kwargs
        }

        return self._request("POST", "/issues.json", data={"issue": issue_data})

    def update_issue(
        self,
        issue_id: int,
        **fields
    ) -> Dict[str, Any]:
        """
        Update an existing issue.

        Args:
            issue_id: Issue ID
            **fields: Fields to update (subject, description, status_id, etc.)

        Returns:
            Updated issue details
        """
        data = {"issue": fields}
        return self._request("PUT", f"/issues/{issue_id}.json", data=data)

    # ==================== Wiki Operations ====================

    def get_wiki_page(
        self,
        project_id: str,
        wiki_name: str,
        version: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get a wiki page.

        Args:
            project_id: Project identifier
            wiki_name: Wiki page name
            version: Optional version number

        Returns:
            Wiki page details including title, text, author, version
        """
        params = {}
        if version:
            params["version"] = version

        return self._request(
            "GET",
            f"/projects/{project_id}/wiki/{wiki_name}.json",
            params=params
        )

    def create_wiki_page(
        self,
        project_id: str,
        title: str,
        text: str,
        parent_title: Optional[str] = None,
        comments: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new wiki page.

        Args:
            project_id: Project identifier
            title: Wiki page title
            text: Wiki page content (supports Textile format)
            parent_title: Optional parent page title
            comments: Optional comments for the version

        Returns:
            Created wiki page details
        """
        data = {
            "wiki_page": {
                "title": title,
                "text": text
            }
        }

        if parent_title:
            data["wiki_page"]["parent_title"] = parent_title
        if comments:
            data["wiki_page"]["comments"] = comments

        return self._request(
            "POST",
            f"/projects/{project_id}/wiki.json",
            data=data
        )

    def update_wiki_page(
        self,
        project_id: str,
        wiki_name: str,
        text: str,
        comments: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update an existing wiki page.

        Args:
            project_id: Project identifier
            wiki_name: Wiki page name
            text: Updated wiki page content
            comments: Optional comments for the version

        Returns:
            Updated wiki page details
        """
        data = {
            "wiki_page": {
                "text": text
            }
        }

        if comments:
            data["wiki_page"]["comments"] = comments

        return self._request(
            "PUT",
            f"/projects/{project_id}/wiki/{wiki_name}.json",
            data=data
        )

    def delete_wiki_page(
        self,
        project_id: str,
        wiki_name: str
    ) -> Dict[str, Any]:
        """
        Delete a wiki page.

        Args:
            project_id: Project identifier
            wiki_name: Wiki page name

        Returns:
            Deletion status
        """
        return self._request(
            "DELETE",
            f"/projects/{project_id}/wiki/{wiki_name}.json"
        )

    def get_wiki_index(
        self,
        project_id: str
    ) -> Dict[str, Any]:
        """
        Get wiki index (all wiki pages) for a project.

        Args:
            project_id: Project identifier

        Returns:
            Dictionary with list of wiki pages including title, version,
            author, and updated_on timestamp

        Example response:
        {
            "wiki_pages": [
                {
                    "title": "GettingStarted",
                    "version": 5,
                    "created_on": "2018-04-12T03:27:26Z",
                    "updated_on": "2025-01-15T10:30:00Z",
                    "author": {"id": 1, "name": "User"}
                },
                ...
            ]
        }
        """
        return self._request(
            "GET",
            f"/projects/{project_id}/wiki/index.json"
        )

    # ==================== File Operations ====================

    def upload_file(
        self,
        file_path: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload a file and get attachment token.

        Args:
            file_path: Path to file to upload
            description: Optional file description

        Returns:
            Dictionary with upload token
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        data = {}
        if description:
            data["description"] = description

        with open(path, "rb") as file_handle:
            files = {"file": (path.name, file_handle)}

            try:
                result = self.session.post(
                    urljoin(self.base_url, "uploads.json"),
                    headers={"X-Redmine-API-Key": self.api_key},
                    data=data,
                    files=files,
                    verify=self.verify_ssl,
                    timeout=self.timeout
                )
                result.raise_for_status()
                return result.json()
            except requests.exceptions.RequestException as e:
                error_msg = f"Failed to upload file {file_path}: {str(e)}"
                if hasattr(e, 'response') and e.response is not None:
                    error_msg += f"\nResponse: {e.response.text}"
                raise Exception(error_msg) from e

    def download_file(
        self,
        attachment_id: int,
        save_path: Union[str, Path],
        filename: Optional[str] = None
    ) -> str:
        """
        Download an attachment.

        Args:
            attachment_id: Attachment ID
            save_path: Directory to save file to
            filename: Optional filename (auto-detected from attachment if not provided)

        Returns:
            Path to downloaded file
        """
        attachment_info = self._request("GET", f"/attachments/{attachment_id}.json")

        content_url = attachment_info["attachment"]["content_url"]
        if not filename:
            filename = attachment_info["attachment"].get("filename", f"attachment_{attachment_id}")

        save_path = Path(save_path) if isinstance(save_path, str) else save_path
        save_path.mkdir(parents=True, exist_ok=True)

        file_path = save_path / (filename or f"attachment_{attachment_id}")

        response = self.session.get(
            urljoin(self.base_url, content_url.lstrip('/')),
            headers={"X-Redmine-API-Key": self.api_key},
            verify=self.verify_ssl,
            timeout=self.timeout,
            stream=True
        )
        response.raise_for_status()

        with open(file_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        return str(file_path)

    # ==================== Project Operations ====================

    def get_projects(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get list of projects.

        Args:
            limit: Max number of results
            offset: Pagination offset

        Returns:
            Projects list
        """
        return self._request(
            "GET",
            "/projects.json",
            params={"limit": limit, "offset": offset}
        )

    def get_project(self, project_id: str) -> Dict[str, Any]:
        """
        Get project details.

        Args:
            project_id: Project identifier

        Returns:
            Project details
        """
        return self._request("GET", f"/projects/{project_id}.json")

    # ==================== User Operations ====================

    def get_users(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get list of users.

        Args:
            limit: Max number of results
            offset: Pagination offset

        Returns:
            Users list
        """
        return self._request(
            "GET",
            "/users.json",
            params={"limit": limit, "offset": offset}
        )

    def get_current_user(self) -> Dict[str, Any]:
        """
        Get current user information.

        Returns:
            Current user details
        """
        return self._request("GET", "/users/current.json")




    # ==================== Time Entries ====================

    def get_time_entries(
        self,
        project_id: Optional[str] = None,
        user_id: Optional[int] = None,
        spent_on_from: Optional[str] = None,
        spent_on_to: Optional[str] = None,
        issue_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get time entries with optional filters.

        Args:
            project_id: Filter by project ID (numeric or string identifier)
            user_id: Filter by user ID
            spent_on_from: Start date (e.g., '2019-01-01')
            spent_on_to: End date (e.g., '2019-01-31')
            issue_id: Filter by issue ID
            limit: Max number of results (default: 100)
            offset: Pagination offset

        Returns:
            Dictionary with time entries list and metadata
        """
        params = {
            "limit": limit,
            "offset": offset,
            **{k: v for k, v in [
                ("project_id", project_id),
                ("user_id", user_id),
                ("issue_id", issue_id)
            ] if v is not None}
        }

        # Add date range parameters
        if spent_on_from:
            params["from"] = spent_on_from
        if spent_on_to:
            params["to"] = spent_on_to

        return self._request("GET", "/time_entries.json", params=params)

    def get_time_entry(self, time_entry_id: int) -> Dict[str, Any]:
        """
        Get details of a specific time entry.

        Args:
            time_entry_id: Time entry ID

        Returns:
            Time entry details
        """
        return self._request("GET", f"/time_entries/{time_entry_id}.json")

    def create_time_entry(
        self,
        hours: float,
        issue_id: Optional[int] = None,
        project_id: Optional[Union[str, int]] = None,
        spent_on: Optional[str] = None,
        activity_id: Optional[int] = None,
        comments: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new time entry.

        Args:
            hours: Number of hours spent (required)
            issue_id: Issue ID (one of issue_id or project_id is required)
            project_id: Project ID (one of issue_id or project_id is required)
            spent_on: Date time was spent (default: today, format: YYYY-MM-DD)
            activity_id: Time activity ID (required unless default activity is set)
            comments: Short description (max 255 characters)
            user_id: User ID to log time on behalf of

        Returns:
            Created time entry details
        """
        if not issue_id and not project_id:
            raise ValueError("Either issue_id or project_id must be specified")

        time_entry_data = {
            "hours": hours,
            **{k: v for k, v in [
                ("issue_id", issue_id),
                ("project_id", project_id),
                ("spent_on", spent_on),
                ("activity_id", activity_id),
                ("comments", comments),
                ("user_id", user_id)
            ] if v is not None}
        }

        return self._request("POST", "/time_entries.json", data={"time_entry": time_entry_data})

    def update_time_entry(
        self,
        time_entry_id: int,
        **fields
    ) -> Dict[str, Any]:
        """
        Update an existing time entry.

        Args:
            time_entry_id: Time entry ID
            **fields: Fields to update (hours, spent_on, activity_id, comments, etc.)

        Returns:
            Status (204 No Content on success)
        """
        data = {"time_entry": fields}
        return self._request("PUT", f"/time_entries/{time_entry_id}.json", data=data)

    def delete_time_entry(self, time_entry_id: int) -> Dict[str, Any]:
        """
        Delete a time entry.

        Args:
            time_entry_id: Time entry ID

        Returns:
            Status (204 No Content on success)
        """
        return self._request("DELETE", f"/time_entries/{time_entry_id}.json")

    # ==================== Search ====================

    def search(
        self,
        query: str,
        scope: str = "all",
        include_issues: bool = True,
        include_wiki_pages: bool = False,
        include_news: bool = False,
        include_documents: bool = False,
        include_changesets: bool = False,
        include_messages: bool = False,
        include_projects: bool = False,
        all_words: bool = False,
        titles_only: bool = False,
        limit: int = 25,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Full-text search across Redmine.

        Args:
            query: Search query string (supports multiple words separated by space)
            scope: Search scope - 'all', 'my_project', 'subprojects'
            include_issues: Include issues in search (default: True)
            include_wiki_pages: Include wiki pages in search
            include_news: Include news in search
            include_documents: Include documents in search
            include_changesets: Include changesets in search
            include_messages: Include messages in search
            include_projects: Include projects in search
            all_words: Match all words instead of any word
            titles_only: Search only in titles
            limit: Max number of results (default: 25)
            offset: Pagination offset

        Returns:
            Dictionary with search results
        """
        params = {
            "q": query,
            "scope": scope,
            "limit": limit,
            "offset": offset,
            **{k: ("1" if v else "0") for k, v in [
                ("issues", include_issues),
                ("wiki_pages", include_wiki_pages),
                ("news", include_news),
                ("documents", include_documents),
                ("changesets", include_changesets),
                ("messages", include_messages),
                ("projects", include_projects),
                ("all_words", all_words),
                ("titles_only", titles_only)
            ]}
        }

        return self._request("GET", "/search.json", params=params)

    # ==================== Issue Relations ====================

    def get_issue_relations(self, issue_id: int) -> Dict[str, Any]:
        """
        Get relations for a specific issue.

        Args:
            issue_id: Issue ID

        Returns:
            Dictionary with relations list
        """
        return self._request("GET", f"/issues/{issue_id}/relations.json")

    def get_issue_relation(self, relation_id: int) -> Dict[str, Any]:
        """
        Get details of a specific relation.

        Args:
            relation_id: Relation ID

        Returns:
            Relation details
        """
        return self._request("GET", f"/relations/{relation_id}.json")

    def create_issue_relation(
        self,
        issue_id: int,
        issue_to_id: int,
        relation_type: str = "relates",
        delay: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a relation between two issues.

        Args:
            issue_id: Source issue ID
            issue_to_id: Target issue ID
            relation_type: Relation type (relates, duplicates, duplicated, blocks,
                           blocked, precedes, follows, copied_to, copied_from)
            delay: Delay for precedes/follows relations (in days)

        Returns:
            Created relation details
        """
        valid_types = ["relates", "duplicates", "duplicated", "blocks",
                      "blocked", "precedes", "follows", "copied_to", "copied_from"]
        if relation_type not in valid_types:
            raise ValueError(f"Invalid relation_type: {relation_type}. "
                          f"Valid types: {', '.join(valid_types)}")

        relation_data = {
            "issue_to_id": issue_to_id,
            "relation_type": relation_type
        }

        if delay is not None:
            relation_data["delay"] = delay

        return self._request("POST", f"/issues/{issue_id}/relations.json",
                           data={"relation": relation_data})

    def delete_issue_relation(self, relation_id: int) -> Dict[str, Any]:
        """
        Delete a relation.

        Args:
            relation_id: Relation ID

        Returns:
            Status (204 No Content on success)
        """
        return self._request("DELETE", f"/relations/{relation_id}.json")


def print_json(data: Dict[str, Any], indent: int = 2):
    """Pretty print JSON data."""
    print(json.dumps(data, indent=indent, ensure_ascii=False))


if __name__ == "__main__":
    # Quick test
    import argparse

    parser = argparse.ArgumentParser(description="Redmine API Client")
    parser.add_argument("--test", action="store_true", help="Test connection")
    args = parser.parse_args()

    if args.test:
        try:
            client = RedmineClient()
            user = client.get_current_user()
            print("✓ Connection successful!")
            print(f"Logged in as: {user['user']['login']}")
        except Exception as e:
            print(f"✗ Connection failed: {e}")
            sys.exit(1)
