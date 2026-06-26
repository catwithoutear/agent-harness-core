"""
Codex CLI 适配器（原版 skill-cleaner 的主要目标 agent）。
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from .base import AgentAdapter, Skill, exists, expand_home


class CodexAdapter(AgentAdapter):
    agent_name = "codex"

    def skill_roots(self) -> list[str]:
        home = os.path.expanduser("~")
        roots = [
            os.path.join(home, ".codex/skills"),
            os.path.join(home, ".codex/plugins/cache"),
        ]
        # Projects/**/.agents/skills/
        projects = os.path.join(home, "Projects")
        if exists(projects):
            for entry in os.listdir(projects):
                skill_root = os.path.join(projects, entry, ".agents/skills")
                if exists(skill_root):
                    roots.append(skill_root)
        return roots

    def log_paths(self, deep: bool = False) -> list[str]:
        home = os.path.expanduser("~")
        paths = [os.path.join(home, ".codex/sessions")]
        if deep:
            archived = os.path.join(home, ".codex/archived_sessions")
            if exists(archived):
                paths.append(archived)
            for extra in [".openclaw", ".clawd"]:
                p = os.path.join(home, extra)
                if exists(p):
                    paths.append(p)
        return [p for p in paths if exists(p)]

    def history_file_paths(self) -> list[str]:
        home = os.path.expanduser("~")
        h = os.path.join(home, ".codex/history.jsonl")
        return [h] if exists(h) else []

    def config_paths(self) -> list[str]:
        home = os.path.expanduser("~")
        return [os.path.join(home, ".codex/config.toml")]

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        """尝试读取 ~/.codex/models_cache.json。"""
        cache = os.path.join(os.path.expanduser("~"), ".codex/models_cache.json")
        if exists(cache):
            try:
                import json
                data = json.loads(Path(cache).read_text())
                # 递归查找第一个有 context_window 的记录
                def find(data, depth=0):
                    if depth > 10:
                        return None
                    if isinstance(data, dict):
                        ctx = data.get("context_window")
                        if ctx and isinstance(ctx, (int, float)) and ctx > 0:
                            ep = data.get("effective_context_window_percent")
                            return (int(ctx), float(ep) if ep and float(ep) > 0 else None)
                        for v in data.values():
                            r = find(v, depth + 1)
                            if r:
                                return r
                    elif isinstance(data, list):
                        for item in data:
                            r = find(item, depth + 1)
                            if r:
                                return r
                    return None
                result = find(data)
                if result:
                    return (result[0], result[1], cache)
            except Exception:
                pass
        return (272_000, 95.0, "fallback:gpt-5.5")

    def get_disabled_skills(self, roots: list[str]) -> set[str]:
        """解析 codex config.toml 中被禁用的 skill path 和 plugin。"""
        disabled_paths: set[str] = set()
        config = os.path.join(os.path.expanduser("~"), ".codex/config.toml")
        if not exists(config):
            return disabled_paths
        try:
            text = Path(config).read_text()
            lines = text.split("\n")
        except Exception:
            return disabled_paths

        i = 0
        while i < len(lines):
            line = lines[i]
            # [[skills.config]] 块
            if re.match(r"^\[\[skills\.config\]\]", line):
                current_path = ""
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("["):
                    m = re.match(r'^path\s*=\s*"([^"]+)"', lines[i])
                    if m:
                        current_path = expand_home(m.group(1))
                    if re.match(r"^enabled\s*=\s*false", lines[i]) and current_path:
                        disabled_paths.add(current_path)
                    i += 1
                continue
            i += 1
        return disabled_paths

    def keep_priority(self, skill: Skill) -> int:
        """低 = 更优先保留。Codex 内置 > Codex 直接 > 插件 > agent-scripts > repo。"""
        p = skill.path.replace(os.path.expanduser("~"), "~")
        if "/.codex/skills/.system/" in p:
            return 0
        if "/.codex/skills/" in p and "/agent-scripts/" not in p:
            return 1
        if "/.codex/plugins/cache/" in p and "/plugin-install-" not in p:
            return 2
        if "/.codex/plugins/cache/" in p:
            return 3
        if "/Projects/agent-scripts/skills/" in p:
            return 4
        if "/.agents/skills/" in p:
            return 5
        return 6

    def plugin_prefix_for(self, file_path: str) -> Optional[str]:
        parts = file_path.split(os.sep)
        try:
            cache_idx = parts.index("cache")
        except ValueError:
            return None
        skills_idx = -1
        for i in range(len(parts) - 1, -1, -1):
            if parts[i] == "skills":
                skills_idx = i
                break
        if skills_idx > cache_idx + 1:
            maybe_plugin = parts[cache_idx + 2]
            if maybe_plugin and maybe_plugin != "plugin-install-VGdwGs":
                return maybe_plugin
            return parts[cache_idx + 3] if cache_idx + 3 < len(parts) else None
        return None

    def scope_for_root(self, root: str) -> str:
        r = root.replace(os.path.expanduser("~"), "~")
        if "/.codex/plugins/cache" in r:
            return "codex-plugin"
        if "/.codex/skills" in r:
            return "codex"
        if "/Projects/agent-scripts/skills" in r:
            return "agent-scripts"
        if "/.agents/skills" in r:
            return "repo"
        return "codex-extra"

    def scan_usage_in_log(self, log_text: str, skill_names: set[str]) -> dict[str, int]:
        import re
        counts: dict[str, int] = {}
        for m in re.finditer(r"\$([A-Za-z][A-Za-z0-9_.:-]{1,80})", log_text):
            name = m.group(1).lower()
            if name in skill_names:
                counts[f"$:{name}"] = counts.get(f"$:{name}", 0) + 1
        for m in re.finditer(r"(?:^|[/\"'`\\\\])(?:\.agents/)?skills/([^/\"'`\\\\\s]+)/SKILL\.md", log_text):
            name = m.group(1).lower()
            if name in skill_names:
                counts[f"read:{name}"] = counts.get(f"read:{name}", 0) + 1
        for m in re.finditer(r"\b(?:use|using|load|read)\s+`?\$?([A-Za-z][A-Za-z0-9_.:-]{1,80})`?", log_text, re.IGNORECASE):
            name = m.group(1).lower()
            if name in skill_names:
                counts[f"text:{name}"] = counts.get(f"text:{name}", 0) + 1
        return counts
