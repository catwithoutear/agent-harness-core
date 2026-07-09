# Redmine Skill

A standalone skill for managing Redmine issues, wiki pages, projects, and file operations without requiring MCP server dependency.

## Features

- ✅ **Issue Tracking**: List, filter, create, and update issues
- ✅ **Wiki Management**: Read, create, and update wiki pages with Textile support
- ✅ **File Operations**: Upload and download attachments
- ✅ **Project Management**: Access project information
- ✅ **User Operations**: Query user information
- ✅ **CLI Tool**: Command-line interface for quick operations
- ✅ **Python Client**: Full-featured Python API for complex workflows

## Quick Start

### 1. Install Dependencies

```bash
pip install requests
```

### 2. Configure Credentials

**Option A: Using .env file (Recommended)**

```bash
# Copy the example template
cp {baseDir}/.env.example {baseDir}/.env

# Edit with your credentials
nano {baseDir}/.env
```

Edit `.env` file:
```
REDMINE_BASE_URL=https://your-redmine-server.com
REDMINE_API_KEY=your-api-key-here
```

**Option B: Using environment variables**

```bash
export REDMINE_BASE_URL="https://your-redmine-server.com"
export REDMINE_API_KEY="your-api-key-here"
```

Get your API key from: Redmine → My Account → API Access Key

### 3. Test Connection

```bash
python {baseDir}/scripts/redmine_cli.py test
```

## Usage Examples

### Command Line

```bash
# Get my assigned issues
python {baseDir}/scripts/redmine_cli.py issues --assigned-to me

# Get specific issue
python {baseDir}/scripts/redmine_cli.py issue 12345

# Get wiki page
python {baseDir}/scripts/redmine_cli.py wiki myproject WikiPage

# Upload file
python {baseDir}/scripts/redmine_cli.py upload document.pdf
```

### Python Script

```python
import sys
sys.path.append('{baseDir}/scripts')

from redmine_client import RedmineClient

client = RedmineClient()

# Get issues
issues = client.get_issues(status_id='open', assigned_to_id='me')

# Create issue
issue = client.create_issue(
    project_id='myproject',
    subject='New feature',
    description='Implement awesome feature'
)
```

## File Structure

```
redmine/
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore rules
├── SKILL.md           # Main skill documentation
├── README.md          # This file
├── references/        # Reference documentation
│   ├── api-reference.md           # Complete API reference
│   ├── context-optimization.md    # Token optimization strategies
│   ├── examples.md                # Practical examples
│   └── troubleshooting.md         # Troubleshooting guide
└── scripts/
    ├── __init__.py
    ├── redmine_client.py  # Python client API (auto-loads .env)
    ├── redmine_cli.py     # Command-line tool
    └── test_redmine_skill.py # Validation tests
```

## Environment Configuration

The skill automatically loads environment variables from `.env` file when you run Python scripts. This means you don't need to manually export variables every time.

**Priority order:**
1. Command-line parameters (highest priority)
2. Environment variables (set with `export`)
3. `.env` file (lowest priority, auto-loaded)

**Creating .env file:**
```bash
cp {baseDir}/.env.example {baseDir}/.env
nano {baseDir}/.env
```

**Note:** The `.env` file is automatically git-ignored to protect your credentials. Never commit your actual `.env` file to version control.

## Documentation

- **[SKILL.md](SKILL.md)** - Main documentation with quick start guide
- **[references/examples.md](references/examples.md)** - Practical usage examples
- **[references/api-reference.md](references/api-reference.md)** - Complete API reference
- **[references/context-optimization.md](references/context-optimization.md)** - Token optimization strategies
- **[references/troubleshooting.md](references/troubleshooting.md)** - Troubleshooting guide

## Comparison with MCP Tools

This skill provides the same functionality as Redmine MCP tools but runs standalone:

| Feature | MCP Tool | This Skill |
|---------|----------|------------|
| Query issues | `redmine_request /issues.json` | CLI: `issues` or Python: `get_issues()` |
| Get issue | `redmine_request /issues/{id}.json` | CLI: `issue {id}` or Python: `get_issue()` |
| Wiki operations | `redmine_request /projects/{id}/wiki/{name}.json` | CLI: `wiki` or Python: `get_wiki_page()` |
| Upload file | `redmine_upload` | CLI: `upload` or Python: `upload_file()` |
| Download file | `redmine_download` | CLI: `download` or Python: `download_file()` |

## Benefits Over MCP

1. **No MCP Server Required**: Works standalone with just Python
2. **Full Python API**: Complete programmatic access
3. **CLI Tool**: Quick command-line operations
4. **Offline Documentation**: All docs included locally
5. **Easy Extending**: Modify scripts as needed
6. **No Dependencies**: Only requires `requests` library

## Common Workflows

### Daily Task Check

```bash
python {baseDir}/scripts/redmine_cli.py issues \
  --assigned-to me \
  --status open \
  --sort "priority:desc"
```

### Search Issues

```bash
python {baseDir}/scripts/redmine_cli.py issues \
  --query "~bug" \
  --limit 100
```

### Create Issue with Attachment

```python
from redmine_client import RedmineClient

client = RedmineClient()

# Upload file first
upload = client.upload_file('screenshot.png', 'Error screenshot')

# Create issue with attachment
issue = client.create_issue(
    project_id='myproject',
    subject='Bug found',
    description='See attached screenshot',
    uploads=[{
        'token': upload['upload']['token'],
        'filename': 'screenshot.png'
    }]
)
```

### Document in Wiki

```bash
cat > doc.textile << 'EOF'
h1. Feature Documentation

This feature allows users to...

h2. Usage

pre.
npm install feature
npm start
EOF

python {baseDir}/scripts/redmine_cli.py create-wiki \
  --project myproject \
  --title "FeatureDocumentation" \
  --file doc.textile
```

## Advanced Usage

See [examples.md](examples.md) for:
- Batch operations
- Custom reports
- Integration with other tools
- Complex queries and filtering
- Automated workflows

## Troubleshooting

### Connection Errors

```bash
# Test connection
python {baseDir}/scripts/redmine_cli.py test

# Disable SSL verify (for testing only)
python {baseDir}/scripts/redmine_cli.py test --no-ssl-verify
```

### Permission Issues

- Verify API key has necessary permissions
- Check project access rights
- Ensure user account is active

### Not Found Errors

- Verify project identifier
- Check wiki page name (case-sensitive)
- Confirm issue exists

## Requirements

**Required:**
- Python 3.6+
- requests library: `pip install requests`

**Optional (recommended):**
- python-dotenv: `pip install python-dotenv` (Better .env file handling)

Note: The skill includes a built-in .env parser that works without python-dotenv, but installing it provides better support for edge cases.

## License

This skill is provided as-is for use with Claude Code.

## Support

For issues or questions, please check:
- [SKILL.md](SKILL.md) - Main documentation
- [references/api-reference.md](references/api-reference.md) - API reference
- [references/examples.md](references/examples.md) - Usage examples
- [references/troubleshooting.md](references/troubleshooting.md) - Troubleshooting guide
