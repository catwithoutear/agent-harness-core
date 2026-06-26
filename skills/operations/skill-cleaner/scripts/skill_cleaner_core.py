"""Core engine: skill discovery, dedupe, budget analysis, usage scan, report rendering."""

from __future__ import annotations

import math
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Optional

# 确保 scripts/ 在 path 上以支持绝对导入
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from adapters.base import (
    Budget,
    Skill,
    Usage,
    AgentAdapter,
    exists,
    parse_frontmatter,
    walk_skill_files,
    walk_recent_files,
    realpath_deduped_roots,
    token_cost,
    normalize_words,
    word_set,
    fnv1a,
    jaccard,
)
from adapters.hermes import HermesAdapter
from adapters.opencode import OpenCodeAdapter
from adapters.omp import OmpAdapter
from adapters.codex import CodexAdapter


class ExtraRootAdapter(AgentAdapter):
    agent_name = "extra"

    def __init__(self, roots: list[str]):
        self._roots = [str(Path(os.path.expanduser(root))) for root in roots]

    def skill_roots(self) -> list[str]:
        return [root for root in self._roots if exists(root)]

    def log_paths(self, deep: bool = False) -> list[str]:
        return []

    def history_file_paths(self) -> list[str]:
        return []

    def config_paths(self) -> list[str]:
        return []

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        return (None, None, "unknown")

    def keep_priority(self, skill: Skill) -> int:
        return 9

    def scope_for_root(self, root: str) -> str:
        return "extra-root"


def get_all_adapters() -> list[AgentAdapter]:
    """返回所有已知适配器实例。"""
    return [
        CodexAdapter(),
        HermesAdapter(),
        OpenCodeAdapter(),
        OmpAdapter(),
    ]


def filter_adapters(
    adapters: list[AgentAdapter], agent_names: list[str] | None
) -> list[AgentAdapter]:
    if not agent_names:
        return adapters
    names = {a.lower() for a in agent_names}
    filtered = [a for a in adapters if a.agent_name.lower() in names]
    missing = names - {a.agent_name.lower() for a in filtered}
    if missing:
        known = ", ".join(sorted(a.agent_name for a in adapters))
        raise SystemExit(f"unknown --agent value(s): {', '.join(sorted(missing))}; known: {known}")
    return filtered


# ── 1. Skill 发现 ──────────────────────────────────


def discover_skills(
    adapters: list[AgentAdapter],
) -> tuple[list[Skill], list[tuple[AgentAdapter, str]]]:
    """扫描所有适配器的 skill 根，去重后返回 Skill 列表 + 错误日志。"""
    skills: list[Skill] = []
    errors: list[tuple[AgentAdapter, str]] = []
    seen_real_paths: set[str] = set()

    for adapter in adapters:
        roots = adapter.skill_roots()
        if not roots:
            continue
        deduped = realpath_deduped_roots(roots)
        disabled = adapter.get_disabled_skills(roots)

        for root in deduped:
            for file_path in walk_skill_files(root, max_depth=10):
                try:
                    real_path = str(Path(file_path).resolve())
                except Exception:
                    real_path = file_path

                if real_path in seen_real_paths:
                    continue
                seen_real_paths.add(real_path)

                parsed = parse_frontmatter(file_path)
                if parsed is None:
                    continue

                base_name = parsed["name"] or Path(file_path).parent.name
                plugin_prefix = None
                if isinstance(adapter, CodexAdapter):
                    plugin_prefix = adapter.plugin_prefix_for(file_path)

                name = f"{plugin_prefix}:{base_name}" if plugin_prefix else base_name
                description = parsed["description"] or ""

                scope = adapter.scope_for_root(root)

                skill = Skill(
                    name=name,
                    base_name=base_name,
                    description=description,
                    path=file_path,
                    real_path=real_path,
                    root=root,
                    real_root=str(Path(root).resolve()),
                    agent=adapter.agent_name,
                    scope=scope,
                    enabled=real_path not in disabled,
                )
                skills.append(skill)

    return skills, errors


# ── 2. 重复检测 ──────────────────────────────────


def analyze_duplicates(
    skills: list[Skill],
) -> tuple[list[tuple[str, list[Skill]]], list[tuple[str, list[Skill]]]]:
    """返回 (by_name_groups, by_body_groups) 两个分组。"""
    # 按 base_name（小写）分组
    by_name: dict[str, list[Skill]] = defaultdict(list)
    for s in skills:
        if s.enabled:
            by_name[s.base_name.lower()].append(s)

    name_groups = [(n, lst) for n, lst in by_name.items() if len(lst) > 1]

    # 按 body_hash 分组（排除空 hash）
    by_body: dict[str, list[Skill]] = defaultdict(list)
    for s in skills:
        if s.enabled and s.body_hash and s.body_hash != "811c9dc5":
            by_body[s.body_hash].append(s)

    body_groups = [(h, lst) for h, lst in by_body.items() if len(lst) > 1]

    return name_groups, body_groups


def is_likely_copy(body_sim: float, desc_sim: float) -> bool:
    return body_sim >= 0.95 or (body_sim >= 0.85 and desc_sim >= 0.85)


def similarity_between(a: Skill, b: Skill) -> dict[str, float]:
    desc_sim = jaccard(word_set(a.description), word_set(b.description))
    body_sim = 1.0 if a.body_hash == b.body_hash else jaccard(word_set(a.body_key), word_set(b.body_key))
    return {
        "description": desc_sim,
        "body": body_sim,
        "overall": body_sim * 0.8 + desc_sim * 0.2,
    }


def preferred_keep_skill(list_: list[Skill]) -> Skill:
    """按 keep_priority 排序，低优先权优先保留。"""
    # 需要获取各适配器实例
    adapters_by_name = {a.agent_name: a for a in get_all_adapters()}

    def sort_key(s: Skill):
        adapter = adapters_by_name.get(s.agent)
        prio = adapter.keep_priority(s) if adapter else 10
        return (prio, len(s.real_path), s.real_path)

    return sorted(list_, key=sort_key)[0]


# ── 3. 预算分析 ──────────────────────────────────


def analyze_budget(
    skills: list[Skill],
    context_window: int,
    budget_percent: float,
    chars_per_token: int = 4,
) -> Budget:
    """模拟 Codex 风格的 budget 算法。"""
    enabled = [s for s in skills if s.enabled]

    def full_line_cost(s: Skill) -> int:
        return token_cost(f"- {s.name}: {s.description} (file: {s.path})\n", chars_per_token)

    def min_line_cost(s: Skill) -> int:
        return token_cost(f"- {s.name}: (file: {s.path})\n", chars_per_token)

    budget_tokens = math.floor(context_window * (budget_percent / 100))

    # 排序：按 scope 优先级（system -> plugin -> repo -> extra）
    def order_key(s: Skill):
        if ".system" in s.path:
            return 0
        if s.scope in ("codex-plugin", "codex"):
            return 1
        if s.scope == "repo":
            return 2
        return 3

    ordered = sorted(enabled, key=lambda s: (order_key(s), s.name, s.path))

    rendered_line_chars = sum(s.line_chars for s in ordered)
    full_tokens = sum(full_line_cost(s) for s in ordered)

    if full_tokens <= budget_tokens:
        minimum_tokens = sum(min_line_cost(s) for s in ordered)
        return Budget(
            model="custom",
            context_tokens=context_window,
            context_source="user-provided",
            budget_percent=budget_percent,
            budget_tokens=budget_tokens,
            rendered_line_chars=rendered_line_chars,
            unbudgeted_full_tokens=full_tokens,
            minimum_tokens=minimum_tokens,
            budgeted_tokens=full_tokens,
            included_skills=len(ordered),
            omitted_skills=0,
            truncated_description_chars=0,
            truncated_description_count=0,
            remaining_budget_tokens=budget_tokens - full_tokens,
            budgeted_budget_used_ratio=full_tokens / budget_tokens if budget_tokens > 0 else 0,
            unbudgeted_budget_used_ratio=full_tokens / budget_tokens if budget_tokens > 0 else 0,
            budgeted_context_used_ratio=full_tokens / context_window if context_window > 0 else 0,
            chars_per_token=chars_per_token,
        )

    minimum_tokens = sum(min_line_cost(s) for s in ordered)

    if minimum_tokens <= budget_tokens:
        # 渐进截断 description
        remaining = budget_tokens - minimum_tokens
        desc_lengths = [len(s.description) for s in ordered]
        allocated = [0] * len(ordered)
        current_extra = [0] * len(ordered)

        while True:
            changed = False
            for idx, s in enumerate(ordered):
                if allocated[idx] >= desc_lengths[idx]:
                    continue
                # 计算增加一个字符的边际 token 成本
                min_rendered = f"- {s.name}: (file: {s.path})\n"
                min_bytes = len(min_rendered.encode("utf-8"))
                prefix_bytes = len(s.description[: allocated[idx] + 1].encode("utf-8"))
                new_rendered_bytes = min_bytes + prefix_bytes + 1
                new_cost = math.ceil(new_rendered_bytes / chars_per_token)
                old_prefix_bytes = len(s.description[: allocated[idx]].encode("utf-8"))
                old_rendered_bytes = min_bytes + old_prefix_bytes + 1
                old_cost = math.ceil(old_rendered_bytes / chars_per_token)
                delta = new_cost - old_cost

                if delta <= remaining:
                    allocated[idx] += 1
                    current_extra[idx] = new_cost - min_line_cost(s)
                    remaining -= delta
                    changed = True
            if not changed:
                break

        budgeted_tokens = budget_tokens - remaining
        truncated_chars = sum(
            max(0, desc_lengths[i] - allocated[i]) for i in range(len(ordered))
        )
        truncated_count = sum(
            1 for i in range(len(ordered)) if allocated[i] < desc_lengths[i]
        )

        return Budget(
            model="custom",
            context_tokens=context_window,
            context_source="user-provided",
            budget_percent=budget_percent,
            budget_tokens=budget_tokens,
            rendered_line_chars=rendered_line_chars,
            unbudgeted_full_tokens=full_tokens,
            minimum_tokens=minimum_tokens,
            budgeted_tokens=budget_tokens,
            included_skills=len(ordered),
            omitted_skills=0,
            truncated_description_chars=truncated_chars,
            truncated_description_count=truncated_count,
            remaining_budget_tokens=remaining,
            budgeted_budget_used_ratio=budget_tokens / budget_tokens if budget_tokens > 0 else 0,
            unbudgeted_budget_used_ratio=full_tokens / budget_tokens if budget_tokens > 0 else 0,
            budgeted_context_used_ratio=budget_tokens / context_window if context_window > 0 else 0,
            chars_per_token=chars_per_token,
        )

    # 连 minimum line 都装不下，直接省略部分 skill
    b_tokens = 0
    included = 0
    omitted = 0
    truncated_chars = 0
    truncated_count = 0
    for s in ordered:
        cost = min_line_cost(s)
        if b_tokens + cost <= budget_tokens:
            b_tokens += cost
            included += 1
        else:
            omitted += 1
            if s.description:
                truncated_chars += len(s.description)
                truncated_count += 1

    return Budget(
        model="custom",
        context_tokens=context_window,
        context_source="user-provided",
        budget_percent=budget_percent,
        budget_tokens=budget_tokens,
        rendered_line_chars=rendered_line_chars,
        unbudgeted_full_tokens=full_tokens,
        minimum_tokens=minimum_tokens,
        budgeted_tokens=b_tokens,
        included_skills=included,
        omitted_skills=omitted,
        truncated_description_chars=truncated_chars,
        truncated_description_count=truncated_count,
        remaining_budget_tokens=budget_tokens - b_tokens,
        budgeted_budget_used_ratio=b_tokens / budget_tokens if budget_tokens > 0 else 0,
        unbudgeted_budget_used_ratio=full_tokens / budget_tokens if budget_tokens > 0 else 0,
        budgeted_context_used_ratio=b_tokens / context_window if context_window > 0 else 0,
        chars_per_token=chars_per_token,
    )


# ── 4. 使用量扫描 ──────────────────────────────────


def scan_usage(
    skills: list[Skill],
    adapters: list[AgentAdapter],
    months: int = 3,
    deep: bool = False,
    max_log_mb: int = 300,
) -> dict[str, Usage]:
    """跨所有 agent 扫描日志文件的使用情况。"""
    cutoff_ms = (time.time() - months * 31 * 24 * 60 * 60) * 1000
    max_log_bytes = max_log_mb * 1024 * 1024

    # 构建 skill 名称到小写别名的映射
    name_aliases: dict[str, set[str]] = {}
    for s in skills:
        aliases = {s.name.lower(), s.base_name.lower()}
        parts = s.name.split(":")
        if len(parts) > 1:
            aliases.add(parts[-1].lower())
        name_aliases[s.name] = aliases

    all_lower_names: set[str] = set()
    for aliases in name_aliases.values():
        all_lower_names.update(aliases)

    usage: dict[str, Usage] = {s.name: Usage() for s in skills}

    # 收集所有日志文件
    log_files: set[str] = set()
    for adapter in adapters:
        for log_dir in adapter.log_paths(deep):
            for f in walk_recent_files(
                log_dir,
                lambda name: name.endswith(".jsonl") or name.endswith(".json") or name.endswith(".log"),
                max_depth=8,
                cutoff_ms=cutoff_ms,
            ):
                log_files.add(f)
        for h in adapter.history_file_paths():
            if exists(h):
                log_files.add(h)

    consumed_bytes = 0
    for log_file in sorted(log_files):
        if consumed_bytes >= max_log_bytes:
            break
        try:
            stat = os.stat(log_file)
            if stat.st_size > 150 * 1024 * 1024:
                continue
            if consumed_bytes + stat.st_size > max_log_bytes:
                break
            consumed_bytes += stat.st_size
            text = Path(log_file).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        # 匹配 $skill_name
        for m in re.finditer(r"\$([A-Za-z][A-Za-z0-9_.:-]{1,80})", text):
            name = m.group(1).lower()
            if name in all_lower_names:
                for skill_name, aliases in name_aliases.items():
                    if name in aliases:
                        usage[skill_name].dollar += 1

        # 匹配 skills/<name>/SKILL.md 路径
        for m in re.finditer(
            r"(?:^|[/\"'`\\\\])(?:\.agents/)?skills/([^/\"'`\\\\\s]+)/SKILL\.md",
            text,
        ):
            name = m.group(1).lower()
            if name in all_lower_names:
                for skill_name, aliases in name_aliases.items():
                    if name in aliases:
                        usage[skill_name].file_read += 1

        # 匹配 use $skill_name / load $skill_name
        for m in re.finditer(
            r"\b(?:use|using|load|read)\s+`?\$?([A-Za-z][A-Za-z0-9_.:-]{1,80})`?",
            text,
            re.IGNORECASE,
        ):
            name = m.group(1).lower()
            if name in all_lower_names:
                for skill_name, aliases in name_aliases.items():
                    if name in aliases:
                        usage[skill_name].text += 1

    return usage


# ── 5. 描述优化建议 ──────────────────────────────────


def suggest_description(skill: Skill) -> str:
    """生成精简描述建议。"""
    source = normalize_words(f"{skill.base_name} {skill.description}")
    cues: list[str] = []
    add = lambda label, pattern: (
        cues.append(label) if pattern.search(source) and label not in cues else None
    )
    add("GitHub", re.compile(r"\b(github|issue|pr|ci)\b|pull request"))
    add("search", re.compile(r"\b(search|archive|crawl|sync|history)\b"))
    add("deploy", re.compile(r"\b(deploy|ops|server|ssh|vm)\b"))
    add("debug", re.compile(r"\b(debug|trace|inspect|profile|diagnos)\b"))
    add("docs", re.compile(r"\b(doc|docs|markdown|write|review)\b"))
    add("Slack", re.compile(r"\bslack\b"))
    add("Discord", re.compile(r"\bdiscord\b"))
    add("Gmail", re.compile(r"\bgmail|email\b"))
    add("Cloudflare", re.compile(r"\b(cloudflare|worker|wrangler)\b|durable object"))
    add("release", re.compile(r"\b(release|publish|ship|notar)\b"))
    add("deploy", re.compile(r"\b(deploy|ops|server|ssh|vm)\b"))

    verbs = ", ".join(cues[:5]) if cues else skill.base_name.replace("-", " ")
    action = short_action(source)
    return f"{verbs}: {action}."


def short_action(source: str) -> str:
    if re.search(r"\btriage|review\b", source):
        return "triage, review, proof"
    if re.search(r"\bdebug|diagnos|inspect\b", source):
        return "debug, inspect, fix"
    if re.search(r"\bsearch|sync|archive\b", source):
        return "search, sync, summarize"
    if re.search(r"\bdeploy|release|publish|ship\b", source):
        return "deploy, release, verify"
    if re.search(r"\bcreate|scaffold|build\b", source):
        return "create, build, validate"
    return "audit, clean, verify"


# ── 6. 报告渲染 ──────────────────────────────────


def render_report(
    skills: list[Skill],
    usage: dict[str, Usage],
    log_files: list[str],
    months: int,
    adapters: list[AgentAdapter],
    context_window: int | None = None,
    budget_percent: float = 2,
    include_all: bool = False,
) -> str:
    """生成 Markdown 报告。"""
    enabled = [s for s in skills if s.enabled or include_all]
    by_name, by_body = analyze_duplicates(enabled)

    # 描述候选（>110 字符）
    long_descs = sorted(
        [s for s in enabled if s.desc_chars >= 110 or s.line_chars >= 180],
        key=lambda s: -s.desc_chars,
    )[:30]

    # 未使用候选：排除 codex/codex-plugin scope（原版逻辑）
    unused = sorted(
        [
            s
            for s in enabled
            if s.scope not in ("codex", "codex-plugin")
            and s.name in usage
            and usage[s.name].total == 0
        ],
        key=lambda s: (s.scope, s.name),
    )[:80]

    total_desc_chars = sum(s.desc_chars for s in enabled)
    total_line_chars = sum(s.line_chars for s in enabled)

    lines: list[str] = []
    lines.append("# Skill Cleaner Report")
    lines.append("")
    lines.append(f"generated: {time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())}")
    lines.append(f"months: {months}")
    lines.append(f"skills: {len(skills)} discovered, {len(enabled)} considered")

    # 按 agent 统计
    agent_counts = defaultdict(int)
    for s in enabled:
        agent_counts[s.agent] += 1
    agents_str = ", ".join(f"{a}({c})" for a, c in sorted(agent_counts.items()))
    lines.append(f"agents: {agents_str}")

    lines.append(f"description_chars: {total_desc_chars:,}")
    lines.append(f"rendered_line_chars: {total_line_chars:,}")
    lines.append(f"log_files_scanned: {len(log_files)}")
    lines.append("")

    # Budget
    lines.append("## Skill Budget")
    lines.append("")
    if context_window:
        budget = analyze_budget(enabled, context_window, budget_percent)
        lines.append(f"context_tokens: {budget.context_tokens:,}")
        lines.append(f"context_source: {budget.context_source}")
        lines.append(f"{budget.budget_percent:.0f}%_budget_tokens: {budget.budget_tokens:,}")
        lines.append(f"unbudgeted_full_tokens: {budget.unbudgeted_full_tokens:,}")
        lines.append(f"minimum_no_description_tokens: {budget.minimum_tokens:,}")
        lines.append(f"budgeted_tokens_used: {budget.budgeted_tokens:,}")
        lines.append(f"used_of_{budget.budget_percent:.0f}%_budget: {budget.budgeted_budget_used_ratio:.1%}")
        lines.append(f"unbudgeted_used_of_{budget.budget_percent:.0f}%_budget: {budget.unbudgeted_budget_used_ratio:.1%}")
        lines.append(f"used_of_context: {budget.budgeted_context_used_ratio:.1%}")
        lines.append(f"remaining_{budget.budget_percent:.0f}%_budget_tokens: {budget.remaining_budget_tokens:,}")
        lines.append(f"included_skills_after_budget: {budget.included_skills}")
        lines.append(f"omitted_skills_after_budget: {budget.omitted_skills}")
        if budget.truncated_description_chars > 0:
            lines.append(f"truncated_description_chars: {budget.truncated_description_chars:,}")
            lines.append(f"truncated_description_count: {budget.truncated_description_count}")
    else:
        lines.append("(no context_window provided — skip budget analysis)")
    lines.append("")

    # Description Candidates
    lines.append("## Description Candidates")
    lines.append("")
    if long_descs:
        for s in long_descs:
            lines.append(f"- {s.name}")
            lines.append(f"  agent: {s.agent}, scope: {s.scope}")
            lines.append(f"  path: {s.path}")
            lines.append(f"  chars: description={s.desc_chars}, rendered_line={s.line_chars}")
            lines.append(f"  current: {s.description}")
            lines.append(f"  suggested: {suggest_description(s)}")
    else:
        lines.append("- none")
    lines.append("")

    # Duplicates By Name
    lines.append("## Duplicates By Name")
    lines.append("")
    for name, group in by_name[:40]:
        keep = preferred_keep_skill(group)
        lines.append(f"- {name}")
        lines.append(f"  keep-default: {keep.agent}:{keep.scope}: {keep.path}")
        for s in group:
            score = similarity_between(keep, s) if s.real_path != keep.real_path else {"body": 1.0, "description": 1.0}
            lines.append(
                f"  - {s.agent}:{s.scope}: {s.path} "
                f"(body={score['body']:.0%}, description={score['description']:.0%})"
            )
    if not by_name:
        lines.append("- none")
    lines.append("")

    # Duplicate Delete Suggestions
    lines.append("## Duplicate Delete Suggestions")
    lines.append("")
    delete_any = False
    for name, group in by_name[:80]:
        keep = preferred_keep_skill(group)
        candidates = []
        for s in group:
            if s.real_path == keep.real_path:
                continue
            score = similarity_between(keep, s)
            if is_likely_copy(score["body"], score["description"]):
                candidates.append((s, score))
        if not candidates:
            continue
        delete_any = True
        candidates.sort(key=lambda x: (-x[1]["body"], -x[1]["description"]))
        lines.append(f"- {name}")
        lines.append(f"  keep: {keep.agent}:{keep.scope}: {keep.path}")
        for s, sc in candidates:
            lines.append(
                f"  delete: {s.agent}:{s.scope}: {s.path} "
                f"(similarity body={sc['body']:.0%}, description={sc['description']:.0%})"
            )
    if not delete_any:
        lines.append("- none")
    lines.append("")

    # Duplicates By Body Hash
    lines.append("## Duplicates By Body Hash")
    lines.append("")
    for hash_val, group in by_body[:30]:
        names = ", ".join(s.name for s in group)
        lines.append(f"- {names}")
        for s in group:
            lines.append(f"  - {s.agent}:{s.scope}: {s.path}")
    if not by_body:
        lines.append("- none")
    lines.append("")

    # Unused Candidates
    lines.append("## Unused Candidates")
    lines.append("")
    if unused:
        # 按 agent 分组
        by_agent = defaultdict(list)
        for s in unused:
            by_agent[s.agent].append(s)
        for agent_name in sorted(by_agent.keys()):
            lines.append(f"### {agent_name}")
            for s in by_agent[agent_name]:
                u = usage.get(s.name, Usage())
                lines.append(
                    f"- {s.name}: {s.scope}; usage=$"
                    f"{u.dollar}, reads={u.file_read}, text={u.text}; {s.path}"
                )
    else:
        lines.append("- none")
    lines.append("")

    # Root Summary
    lines.append("## Root Summary")
    lines.append("")
    roots: dict[str, list[Skill]] = defaultdict(list)
    for s in skills:
        roots[s.root].append(s)
    for root, lst in sorted(roots.items(), key=lambda x: -len(x[1])):
        disabled = sum(1 for s in lst if not s.enabled)
        line = f"- {root}: {len(lst)} skills"
        if disabled:
            line += f", {disabled} disabled"
        lines.append(line)

    return "\n".join(lines)


def format_report(
    skills: list[Skill],
    usage: dict[str, Usage],
    log_files: list[str],
    months: int,
    adapters: list[AgentAdapter],
    context_window: int | None = None,
    budget_percent: float = 2,
    include_all: bool = False,
    output_json: bool = False,
) -> str:
    if output_json:
        import json

        enabled = [s for s in skills if s.enabled] if not include_all else list(skills)
        by_name, by_body = analyze_duplicates(enabled)
        budget = analyze_budget(enabled, context_window, budget_percent) if context_window else None
        delete_suggestions = []
        for name, group in by_name:
            keep = preferred_keep_skill(group)
            for s in group:
                if s.real_path == keep.real_path:
                    continue
                score = similarity_between(keep, s)
                if is_likely_copy(score["body"], score["description"]):
                    delete_suggestions.append(
                        {
                            "name": name,
                            "keep": keep.path,
                            "delete": s.path,
                            "body_similarity": score["body"],
                            "description_similarity": score["description"],
                        }
                    )
        roots: dict[str, int] = defaultdict(int)
        for s in skills:
            roots[s.root] += 1

        return json.dumps(
            {
                "skills": [
                    {
                        "name": s.name,
                        "base_name": s.base_name,
                        "agent": s.agent,
                        "scope": s.scope,
                        "path": s.path,
                        "enabled": s.enabled,
                        "desc_chars": s.desc_chars,
                        "line_chars": s.line_chars,
                        "body_hash": s.body_hash,
                    }
                    for s in skills
                ],
                "usage": {k: {"dollar": v.dollar, "file_read": v.file_read, "text": v.text} for k, v in usage.items()},
                "log_files": log_files,
                "context_window": context_window,
                "budget_percent": budget_percent,
                "budget": None if budget is None else {
                    "context_tokens": budget.context_tokens,
                    "budget_tokens": budget.budget_tokens,
                    "unbudgeted_full_tokens": budget.unbudgeted_full_tokens,
                    "minimum_tokens": budget.minimum_tokens,
                    "budgeted_tokens": budget.budgeted_tokens,
                    "included_skills": budget.included_skills,
                    "omitted_skills": budget.omitted_skills,
                    "truncated_description_chars": budget.truncated_description_chars,
                    "truncated_description_count": budget.truncated_description_count,
                    "remaining_budget_tokens": budget.remaining_budget_tokens,
                },
                "duplicates_by_name": [
                    {
                        "name": name,
                        "paths": [s.path for s in group],
                    }
                    for name, group in by_name
                ],
                "duplicates_by_body_hash": [
                    {
                        "body_hash": body_hash,
                        "paths": [s.path for s in group],
                    }
                    for body_hash, group in by_body
                ],
                "duplicate_delete_suggestions": delete_suggestions,
                "roots": [{"root": root, "skills": count} for root, count in sorted(roots.items())],
            },
            indent=2,
        )
    else:
        return render_report(
            skills=skills,
            usage=usage,
            log_files=log_files,
            months=months,
            adapters=adapters,
            context_window=context_window,
            budget_percent=budget_percent,
            include_all=include_all,
        )
