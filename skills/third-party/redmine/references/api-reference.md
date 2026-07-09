# Redmine API Reference

Complete reference for Redmine REST API and Python client methods.

## API Endpoint Reference

### Issues API

#### GET /issues.json
List issues with optional filters.

**Query Parameters:**
- `status_id` - Status filter (`open`, `closed`, `*` for all, or specific ID)
- `project_id` - Project ID filter
- `assigned_to_id` - Assignee filter (`me` or user ID)
- `priority_id` - Priority filter (supports `>=3` syntax)
- `tracker_id` - Tracker filter
- `subject~` - Subject text search (contains)
- `limit` - Results per page (default: 25, max: 100)
- `offset` - Pagination offset
- `sort` - Sort field and order (`id:desc`, `priority:asc`, etc.)
- `include` - Include associations (`journals`, `watchers`, `relations`, etc.)
- `cf_X` - Custom field filter (X is custom field ID)

**Example:**
```bash
GET /issues.json?status_id=open&assigned_to_id=me&priority_id=>=3&limit=50&sort=priority:desc
```

#### GET /issues/{id}.json
Get specific issue details.

**Includes optional:**
- `journals` - Issue history/comments
- `watchers` - Watchers list
- `relations` - Related issues
- `attachments` - Attachments
- `children` - Child issues
- `changesets` - Associated changesets
- `relations` - Issue relations

**Example:**
```bash
GET /issues/12345.json?include=journals,watchers,attachments
```

#### POST /issues.json
Create new issue.

**Required fields:**
- `issue.project_id` - Project ID
- `issue.subject` - Issue subject
- `issue.tracker_id` - Tracker ID (often required)

**Optional fields:**
- `issue.description` - Issue description
- `issue.status_id` - Status ID
- `issue.priority_id` - Priority ID
- `issue.assigned_to_id` - Assignee user ID
- `issue.category_id` - Category ID
- `issue.fixed_version_id` - Target version
- `issue.parent_issue_id` - Parent issue ID
- `issue.start_date` - Start date (YYYY-MM-DD)
- `issue.due_date` - Due date (YYYY-MM-DD)
- `issue.estimated_hours` - Estimated hours
- `issue.done_ratio` - Progress percentage (0-100)
- `issue.custom_fields` - Array of custom fields
- `issue.watcher_user_ids` - Array of watcher user IDs
- `issue.uploads` - Array of upload tokens

**Example payload:**
```json
{
  "issue": {
    "project_id": "myproject",
    "subject": "Fix login bug",
    "description": "Users cannot login after password reset",
    "tracker_id": 1,
    "status_id": 1,
    "priority_id": 5,
    "assigned_to_id": 10,
    "custom_fields": [
      {"id": 1, "value": "Custom value"}
    ],
    "uploads": [
      {"token": "upload_token", "filename": "screenshot.png"}
    ]
  }
}
```

#### PUT /issues/{id}.json
Update existing issue.

**Fields:** Same as POST, all optional.

**Example:**
```json
{
  "issue": {
    "status_id": 2,
    "done_ratio": 50,
    "notes": "Work in progress"
  }
}
```

#### DELETE /issues/{id}.json
Delete issue.

### Wiki API

#### GET /projects/{project_id}/wiki/{wiki_name}.json
Get wiki page.

**Query Parameters:**
- `version` - Specific version number

**Response:**
```json
{
  "wiki_page": {
    "title": "PageTitle",
    "text": "Page content in Textile",
    "version": 5,
    "author": {"id": 1, "name": "User"},
    "comments": "Version comment",
    "created_on": "2018-04-12T03:27:26Z",
    "updated_on": "2025-01-15T10:30:00Z",
    "parent": {"title": "ParentPage"}
  }
}
```

#### POST /projects/{project_id}/wiki.json
Create new wiki page.

**Required:**
- `wiki_page.title` - Page title
- `wiki_page.text` - Page content

**Optional:**
- `wiki_page.parent_title` - Parent page title
- `wiki_page.comments` - Version comments

#### PUT /projects/{project_id}/wiki/{wiki_name}.json
Update wiki page.

**Required:**
- `wiki_page.text` - New content

**Optional:**
- `wiki_page.comments` - Version comments

#### DELETE /projects/{project_id}/wiki/{wiki_name}.json
Delete wiki page.

#### GET /projects/{project_id}/wiki/index.json
Get wiki index (all wiki pages) for a project.

**Response:**
```json
{
  "wiki_pages": [
    {
      "title": "GettingStarted",
      "version": 5,
      "created_on": "2018-04-12T03:27:26Z",
      "updated_on": "2025-01-15T10:30:00Z",
      "author": {
        "id": 1,
        "name": "User Name"
      }
    }
  ]
}
```

**Use cases:**
- List all wiki pages in a project
- Search for wiki pages by keyword filtering the response
- Identify recently updated wiki pages
- Browse wiki structure

### Projects API

#### GET /projects.json
List all projects.

**Query Parameters:**
- `limit` - Max results
- `offset` - Pagination offset
- `include` - Include `trackers`, `issue_categories`, `enabled_modules`

#### GET /projects/{id}.json
Get project details.

### Users API

#### GET /users.json
List users.

#### GET /users/current.json
Get current user info.

#### GET /users/{id}.json
Get user details.

### Uploads API

#### POST /uploads.json
Upload file.

**Request:** multipart/form-data with `file` field

**Response:**
```json
{
  "upload": {
    "token": "upload_token_value",
    "filename": "file.pdf"
  }
}
```

Use this token when creating/updating issues with `uploads` field.

### Attachments API

#### GET /attachments/{id}.json
Get attachment metadata.

#### GET /attachments/download/{id}/{filename}
Download attachment file.

## Textile Wiki Format Reference

Redmine wiki uses Textile markup. Common syntax:

### Headings
```textile
h1. Level 1
h2. Level 2
h3. Level 3
h4. Level 4
h5. Level 5
h6. Level 6
```

### Text Formatting
```textile
*Bold*
_Italic_
-Deleted-
+Underline+
^Superscript^
~Subscript~
{{Code (monospaced)}}
```

### Links
```textile
"Link text":URL
[[WikiPage]] - Internal wiki link
[[WikiPage|Link text]] - Internal wiki with custom text
[wiki:Project:WikiPage] - Cross-project wiki link
```

### Images
```textile
!image_url!
!>image_url! - Right-aligned
!<image_url! - Left-aligned
!{width: 200px}image_url! - With style
```

### Lists
```textile
* Unordered item
* Another item
** Nested item
** Another nested

# Ordered item
# Another item
## Nested ordered

Definition list:
- term := definition
```

### Tables
```textile
|_. Header 1 |_. Header 2 |
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |

|2. | Span two columns |
|/2. | Span two rows |
| Normal cell |
```

### Code Blocks
```textile
<pre>
Fixed width text
Preserves spacing
</pre>

bc.. (block code continues until next paragraph)
Code here
p.
```

### Macros
```textile
{{collapse(View details...)
Hidden content
}}

{{thumbnail(image.png)}}
{{include(WikiPage)}}
{{toc}} - Table of contents
{{child_pages}}
```

### Escaping
```textile
==Not *formatted*==
```

## Python Client API Reference

### RedmineClient Class

#### Constructor
```python
RedmineClient(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    verify_ssl: bool = True
)
```

**Environment Variables:**
- `REDMINE_BASE_URL` - Redmine server URL
- `REDMINE_API_KEY` - API authentication key

#### Issue Methods

##### get_issues()
```python
get_issues(
    status_id: Optional[str] = None,
    project_id: Optional[str] = None,
    assigned_to_id: Optional[str] = None,
    priority_id: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
    sort: Optional[str] = None,
    query_filter: Optional[str] = None
) -> Dict[str, Any]
```

**Returns:** Dictionary with `issues` list

##### get_issue()
```python
get_issue(issue_id: int) -> Dict[str, Any]
```

**Returns:** Issue details dictionary

##### create_issue()
```python
create_issue(
    project_id: Union[str, int],
    subject: str,
    description: Optional[str] = None,
    status_id: Optional[int] = None,
    priority_id: Optional[int] = None,
    assigned_to_id: Optional[int] = None,
    tracker_id: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]
```

**Returns:** Created issue details

**Common kwargs:**
- `custom_fields` - List of `{"id": X, "value": "Y"}`
- `uploads` - List of `{"token": "...", "filename": "..."}`
- `parent_issue_id` - Parent issue
- `start_date`, `due_date` - Dates as strings
- `estimated_hours` - Number
- `done_ratio` - 0-100

##### update_issue()
```python
update_issue(
    issue_id: int,
    **fields
) -> Dict[str, Any]
```

Accepts any issue field as keyword argument.

#### Wiki Methods

##### get_wiki_page()
```python
get_wiki_page(
    project_id: str,
    wiki_name: str,
    version: Optional[int] = None
) -> Dict[str, Any]
```

##### create_wiki_page()
```python
create_wiki_page(
    project_id: str,
    title: str,
    text: str,
    parent_title: Optional[str] = None,
    comments: Optional[str] = None
) -> Dict[str, Any]
```

##### update_wiki_page()
```python
update_wiki_page(
    project_id: str,
    wiki_name: str,
    text: str,
    comments: Optional[str] = None
) -> Dict[str, Any]
```

##### delete_wiki_page()
```python
delete_wiki_page(
    project_id: str,
    wiki_name: str
) -> Dict[str, Any]
```

##### get_wiki_index()
```python
get_wiki_index(
    project_id: str
) -> Dict[str, Any]
```

Get all wiki pages for a project.

**Returns:** Dictionary with list of wiki pages including title, version, author, and timestamps

**Example:**
```python
wiki_index = client.get_wiki_index(project_id='myproject')
for page in wiki_index['wiki_pages']:
    print(f"{page['title']} (v{page['version']})")
```

#### File Methods

##### upload_file()
```python
upload_file(
    file_path: str,
    description: Optional[str] = None
) -> Dict[str, Any]
```

**Returns:** Dictionary with upload token

##### download_file()
```python
download_file(
    attachment_id: int,
    save_path: str,
    filename: Optional[str] = None
) -> str
```

**Returns:** Path to downloaded file

#### Project Methods

##### get_projects()
```python
get_projects(
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]
```

##### get_project()
```python
get_project(project_id: str) -> Dict[str, Any]
```

#### User Methods

##### get_users()
```python
get_users(
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]
```

##### get_current_user()
```python
get_current_user() -> Dict[str, Any]
```

## Error Handling

All methods may raise exceptions:

**ValueError:** Missing or invalid configuration
```python
try:
    client = RedmineClient()
except ValueError as e:
    print(f"Configuration error: {e}")
```

**requests.exceptions.RequestException:** API request failures
```python
try:
    issue = client.get_issue(12345)
except requests.exceptions.RequestException as e:
    print(f"API error: {e}")
```

**FileNotFoundError:** File not found for upload
```python
try:
    client.upload_file('/path/to/file.pdf')
except FileNotFoundError as e:
    print(f"File error: {e}")
```

## Rate Limiting

Redmine may enforce rate limits. Implement retry logic:

```python
import time
from requests.exceptions import RequestException

def call_with_retry(client, func, *args, max_retries=3, **kwargs):
    """Call Redmine API with retry on rate limit."""
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except RequestException as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt  # Exponential backoff
                print(f"Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
```

## Performance Tips

1. **Use pagination** for large datasets
2. **Filter early** with query parameters
3. **Batch operations** where possible
4. **Cache results** for repeated queries
5. **Use include** parameter to avoid extra requests
6. **Limit fields** when you don't need full details

## Redmine Version Compatibility

This client works with Redmine REST API available in:
- Redmine 3.x+
- Redmine 4.x
- Redmine 5.x

Some advanced features may require specific Redmine versions. Check Redmine's API documentation for version-specific capabilities.
