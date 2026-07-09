#!/usr/bin/env python3
"""
Test script for Redmine skill.
Validates that all components are working correctly.
"""

import sys
import os
from pathlib import Path

# Add scripts directory to path
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

def test_imports():
    """Test that all modules can be imported."""
    print("Testing imports...")

    try:
        from redmine_client import RedmineClient
        print("  ✓ redmine_client imported")
    except ImportError as e:
        print(f"  ✗ redmine_client import failed: {e}")
        return False

    try:
        import redmine_cli
        print("  ✓ redmine_cli imported")
    except ImportError as e:
        print(f"  ✗ redmine_cli import failed: {e}")
        return False

    return True


def test_client_instantiation():
    """Test client can be instantiated (without connection)."""
    print("\nTesting client instantiation...")

    try:
        from redmine_client import RedmineClient

        # This will fail without credentials, but we can catch it
        try:
            client = RedmineClient()
            print("  ✓ Client instantiated with env vars")
            return True, True  # Instantiated and configured
        except ValueError as e:
            if "REDMINE_BASE_URL" in str(e) or "REDMINE_API_KEY" in str(e):
                print("  ⚠ Client requires REDMINE_BASE_URL and REDMINE_API_KEY")
                return True, False  # Can instantiate but not configured
            raise

    except Exception as e:
        print(f"  ✗ Client instantiation failed: {e}")
        return False, False


def test_cli_exists():
    """Test that CLI script exists and is executable."""
    print("\nTesting CLI script...")

    cli_path = script_dir / "redmine_cli.py"

    if cli_path.exists():
        print(f"  ✓ CLI script exists: {cli_path}")

        # Check if it's readable
        if os.access(cli_path, os.R_OK):
            print("  ✓ CLI script is readable")
            return True
        else:
            print("  ✗ CLI script is not readable")
            return False
    else:
        print(f"  ✗ CLI script not found: {cli_path}")
        return False


def test_documentation():
    """Test that documentation files exist."""
    print("\nTesting documentation...")

    skill_dir = script_dir.parent
    docs = ['SKILL.md', 'README.md']
    reference_docs = ['references/api-reference.md', 'references/context-optimization.md',
                      'references/examples.md', 'references/troubleshooting.md']

    all_exist = True
    for doc in docs:
        doc_path = skill_dir / doc
        if doc_path.exists():
            size = doc_path.stat().st_size
            print(f"  ✓ {doc} exists ({size} bytes)")
        else:
            print(f"  ✗ {doc} not found")
            all_exist = False

    for doc in reference_docs:
        doc_path = skill_dir / doc
        if doc_path.exists():
            size = doc_path.stat().st_size
            print(f"  ✓ {doc} exists ({size} bytes)")
        else:
            print(f"  ✗ {doc} not found")
            all_exist = False

    return all_exist


def test_cli_features():
    """Test that CLI has expected features."""
    print("\nTesting CLI features...")

    try:
        import redmine_cli

        features = [
            'read_content',
            'format_output',
            'main'
        ]

        all_exist = True
        for feature in features:
            if hasattr(redmine_cli, feature):
                print(f"  ✓ {feature}")
            else:
                print(f"  ✗ {feature} not found")
                all_exist = False

        return all_exist

    except Exception as e:
        print(f"  ✗ Error checking CLI features: {e}")
        return False


def test_api_methods():
    print("\nTesting API methods...")

    try:
        from redmine_client import RedmineClient

        methods = [
            'get_issues', 'get_issue', 'create_issue', 'update_issue',
            'get_wiki_page', 'create_wiki_page', 'update_wiki_page', 'delete_wiki_page',
            'upload_file', 'download_file',
            'get_projects', 'get_project',
            'get_users', 'get_current_user'
        ]

        all_exist = True
        for method in methods:
            if hasattr(RedmineClient, method):
                print(f"  ✓ {method}")
            else:
                print(f"  ✗ {method} not found")
                all_exist = False

        # Test context manager support
        print("\n  Testing context manager support...")
        if hasattr(RedmineClient, '__enter__') and hasattr(RedmineClient, '__exit__'):
            print("  ✓ Context manager methods present")
        else:
            print("  ✗ Context manager methods not found")
            all_exist = False

        # Test new retry configuration
        print("\n  Testing retry configuration...")
        if hasattr(RedmineClient, 'MAX_RETRIES'):
            print(f"  ✓ MAX_RETRIES = {RedmineClient.MAX_RETRIES}")
        else:
            print("  ✗ MAX_RETRIES not found")
            all_exist = False

        if hasattr(RedmineClient, 'TIMEOUT'):
            print(f"  ✓ TIMEOUT = {RedmineClient.TIMEOUT}")
        else:
            print("  ✗ TIMEOUT not found")
            all_exist = False

        return all_exist

    except Exception as e:
        print(f"  ✗ Error checking methods: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Redmine Skill Test Suite")
    print("=" * 60)

    results = []

    # Run tests
    results.append(("Imports", test_imports()))
    results.append(("Client", test_client_instantiation()[0]))
    results.append(("CLI", test_cli_exists()))
    results.append(("Documentation", test_documentation()))
    results.append(("CLI Features", test_cli_features()))
    results.append(("API Methods", test_api_methods()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{name:20s} {status}")

    print("=" * 60)
    print(f"Result: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed!")
        print("\nTo use this skill:")
        print("1. Set environment variables:")
        print("   export REDMINE_BASE_URL='https://your-redmine.com'")
        print("   export REDMINE_API_KEY='your-api-key'")
        print("2. Test connection:")
        print("   python {baseDir}/scripts/redmine_cli.py test")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please check the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
