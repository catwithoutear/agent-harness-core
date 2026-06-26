#!/usr/bin/env python3
"""End-to-end tests for the multi-agent skill cleaner."""

import json
import sys
import os
import tempfile

_scripts = os.path.join(os.path.dirname(__file__), "scripts")
sys.path.insert(0, os.path.dirname(_scripts))
sys.path.insert(0, _scripts)

from adapters.base import (
    parse_frontmatter,
    normalize_words,
    fnv1a,
    jaccard,
    word_set,
    token_cost,
    walk_skill_files,
    realpath_deduped_roots,
)
from skill_cleaner_core import (
    get_all_adapters,
    discover_skills,
    scan_usage,
    analyze_duplicates,
    similarity_between,
    preferred_keep_skill,
    is_likely_copy,
    render_report,
)


def test_parse_frontmatter():
    """Test basic and edge-case frontmatter parsing."""
    # Simple case
    content = "---\nname: test-skill\ndescription: A test skill\n---\n# Body\ncontent here"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        result = parse_frontmatter(path)
        assert result is not None, "Should parse valid frontmatter"
        assert result["name"] == "test-skill", f"Expected 'test-skill', got {result['name']}"
        assert result["description"] == "A test skill"
        assert "Body" in result["body"]
    finally:
        os.unlink(path)
    print("✓ parse_frontmatter: basic")

    # Multi-line description (pipe block)
    content = "---\nname: multi-line\ndescription: |\n  This is a\n  multi-line description\n---\nBody"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        result = parse_frontmatter(path)
        assert result is not None
        assert "multi-line" in (result["description"] or "")
    finally:
        os.unlink(path)
    print("✓ parse_frontmatter: multi-line pipe")

    # No frontmatter
    content = "Just a regular file"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        result = parse_frontmatter(path)
        assert result is None, "No frontmatter should return None"
    finally:
        os.unlink(path)
    print("✓ parse_frontmatter: no frontmatter returns None")


def test_normalize_words():
    assert normalize_words("Hello-World!") == "hello world"
    assert normalize_words("  Test  123  ") == "test 123"
    assert normalize_words("Don't Stop") == "don t stop"
    print("✓ normalize_words")


def test_fnv1a():
    assert fnv1a("") == "811c9dc5"  # 空字符串的 hash
    assert fnv1a("hello world") != ""  # 非空
    assert len(fnv1a("test")) == 8  # 固定长度
    print("✓ fnv1a")


def test_jaccard():
    a = {"a", "b", "c"}
    b = {"a", "b", "d"}
    assert abs(jaccard(a, b) - 0.5) < 0.001
    assert jaccard(set(), set()) == 1.0
    print("✓ jaccard")


def test_token_cost():
    # UTF-8 4 chars/byte rule
    cost = token_cost("hello", 4)
    assert cost > 0
    print("✓ token_cost")


def test_realpath_deduped_roots():
    roots = realpath_deduped_roots(["/tmp", "/tmp"])
    # /tmp 可能不在
    print(f"✓ realpath_deduped_roots (got {len(roots)} unique)")


def test_discover_skills():
    adapters = get_all_adapters()
    skills, errors = discover_skills(adapters)
    assert len(skills) > 0, "Should discover skills from the environment"

    # Check each skill has required fields
    for s in skills[:10]:
        assert s.name, f"Skill needs a name: {s}"
        assert s.path, f"Skill needs a path: {s}"
        assert s.agent, f"Skill needs an agent: {s}"

    # No realpath duplicates
    real_paths = [s.real_path for s in skills]
    assert len(real_paths) == len(set(real_paths)), "Should have no duplicate real_paths"

    print(f"✓ discover_skills: {len(skills)} skills from {len(set(s.agent for s in skills))} agents")


def test_analyze_duplicates():
    adapters = get_all_adapters()
    skills, _ = discover_skills(adapters)
    by_name, by_body = analyze_duplicates(skills)

    if by_name:
        name, group = by_name[0]
        keep = preferred_keep_skill(group)
        assert keep in group
        for s in group:
            score = similarity_between(keep, s) if s.real_path != keep.real_path else {"body": 1.0, "description": 1.0}
            assert 0 <= score["body"] <= 1
            assert 0 <= score["description"] <= 1
        print(f"✓ analyze_duplicates: {len(by_name)} name groups, {len(by_body)} body groups")
    else:
        print("✓ analyze_duplicates: no duplicates found (expected in clean env)")


def test_is_likely_copy():
    assert is_likely_copy(0.95, 0.5) is True   # body >= 0.95
    assert is_likely_copy(0.85, 0.85) is True  # body >= 0.85 and desc >= 0.85
    assert is_likely_copy(0.80, 0.90) is False  # body < 0.85
    print("✓ is_likely_copy")


def test_scan_usage():
    adapters = get_all_adapters()
    skills, _ = discover_skills(adapters)
    usage = scan_usage(skills, adapters, months=6, deep=True, max_log_mb=50)
    assert isinstance(usage, dict)
    for skill_name in list(usage.keys())[:5]:
        u = usage[skill_name]
        assert hasattr(u, "dollar")
        assert hasattr(u, "file_read")
        assert hasattr(u, "text")
    print(f"✓ scan_usage: scanned {len(usage)} skills")


def test_render_report():
    adapters = get_all_adapters()
    skills, _ = discover_skills(adapters)
    usage = scan_usage(skills, adapters, months=1, deep=False, max_log_mb=10)

    report = render_report(
        skills=skills,
        usage=usage,
        log_files=[],
        months=3,
        adapters=adapters,
        context_window=1000000,
        budget_percent=2,
    )

    assert "# Skill Cleaner Report" in report
    assert "agents:" in report
    assert "## Skill Budget" in report
    assert "## Duplicates By Name" in report
    assert "## Duplicates By Body Hash" in report
    assert "## Unused Candidates" in report
    assert "## Root Summary" in report
    print("✓ render_report: all sections present")


def test_json_output():
    """Verify JSON output from the CLI entry point is valid."""
    import subprocess
    result = subprocess.run(
        [sys.executable, "scripts/skill-cleaner.py", "--months", "1", "--no-logs", "--json", "--max-log-mb", "5"],
        capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__))
    )
    assert result.returncode == 0, f"CLI failed: {result.stderr[:500]}"
    data = json.loads(result.stdout)
    assert "skills" in data
    assert len(data["skills"]) > 0
    assert "usage" in data
    assert "budget" in data
    assert "duplicates_by_name" in data
    assert "duplicate_delete_suggestions" in data
    assert "roots" in data
    print(f"✓ JSON output: {len(data['skills'])} skills, valid JSON")


def test_agent_filter():
    """Test --agent filtering from CLI."""
    import subprocess
    for agent in ("codex", "hermes", "opencode", "omp"):
        r = subprocess.run(
            [
                sys.executable,
                "scripts/skill-cleaner.py",
                "--months",
                "1",
                "--no-logs",
                "--json",
                "--agent",
                agent,
                "--max-log-mb",
                "5",
            ],
            capture_output=True,
            text=True,
            cwd=os.path.join(os.path.dirname(__file__)),
        )
        assert r.returncode == 0, f"{agent} failed: {r.stderr[:500]}"
        data = json.loads(r.stdout)
        agents = set(s["agent"] for s in data["skills"])
        assert agents <= {agent}, f"Expected only {agent}, got {agents}"
        if agent in ("codex", "opencode", "omp"):
            assert data["skills"], f"{agent} should discover at least shared/system skills in this environment"

    print("✓ agent filter: codex/hermes/opencode/omp")


def test_extra_root():
    """Test --root participates in discovery."""
    import subprocess

    with tempfile.TemporaryDirectory() as tmp:
        skill_dir = os.path.join(tmp, "demo-skill")
        os.makedirs(skill_dir)
        with open(os.path.join(skill_dir, "SKILL.md"), "w", encoding="utf-8") as f:
            f.write("---\nname: demo-skill\ndescription: Demo skill\n---\n# Demo\n")

        r = subprocess.run(
            [
                sys.executable,
                "scripts/skill-cleaner.py",
                "--no-logs",
                "--json",
                "--root",
                tmp,
            ],
            capture_output=True,
            text=True,
            cwd=os.path.join(os.path.dirname(__file__)),
        )
        assert r.returncode == 0, f"CLI failed: {r.stderr[:500]}"
        data = json.loads(r.stdout)
        assert any(s["name"] == "demo-skill" and s["agent"] == "extra" for s in data["skills"])

    print("✓ extra root")


def test_markdown_cli_output():
    """Test that CLI markdown output doesn't crash and has expected content."""
    import subprocess
    r = subprocess.run(
        [sys.executable, "scripts/skill-cleaner.py", "--months", "1", "--no-logs"],
        capture_output=True, text=True, cwd=os.path.join(os.path.dirname(__file__)),
        timeout=30,
    )
    assert r.returncode == 0, f"Failed: {r.stderr[:500]}"
    assert "Skill Cleaner Report" in r.stdout
    assert "skills:" in r.stdout
    print(f"✓ CLI markdown output: {len(r.stdout)} chars")


if __name__ == "__main__":
    tests = [
        test_parse_frontmatter,
        test_normalize_words,
        test_fnv1a,
        test_jaccard,
        test_token_cost,
        test_realpath_deduped_roots,
        test_is_likely_copy,
        test_discover_skills,
        test_analyze_duplicates,
        test_scan_usage,
        test_render_report,
        test_json_output,
        test_agent_filter,
        test_extra_root,
        test_markdown_cli_output,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"✗ {test.__name__}: {e}")
            failed += 1

    print(f"\n{'=' * 40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
    sys.exit(0)
