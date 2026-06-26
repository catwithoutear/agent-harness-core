"""
Hermes Agent 适配器。
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from .base import (
    AgentAdapter,
    Skill,
    expand_home,
    exists,
    parse_frontmatter,
    walk_skill_files,
    walk_recent_files,
)


class HermesAdapter(AgentAdapter):
    agent_name = "hermes"

    def skill_roots(self) -> list[str]:
        home = os.path.expanduser("~")
        roots = [os.path.join(home, ".hermes/skills")]
        # 检查 config.yaml 中的 external_dirs
        config_path = os.path.join(home, ".hermes/config.yaml")
        if exists(config_path):
            try:
                import yaml
                with open(config_path) as f:
                    cfg = yaml.safe_load(f)
                ext = (cfg or {}).get("skills", {}).get("external_dirs", [])
                for d in (ext or []):
                    p = expand_home(d)
                    if exists(p):
                        roots.append(p)
            except Exception:
                pass
        return roots

    def log_paths(self, deep: bool = False) -> list[str]:
        home = os.path.expanduser("~")
        paths = [os.path.join(home, ".hermes/sessions")]
        if deep:
            candidates = [
                os.path.join(home, ".hermes/archived_sessions"),
                os.path.join(home, ".hermes/logs"),
            ]
            for p in candidates:
                if exists(p):
                    paths.append(p)
        return paths

    def history_file_paths(self) -> list[str]:
        return []

    def config_paths(self) -> list[str]:
        return [os.path.join(os.path.expanduser("~"), ".hermes/config.yaml")]

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        """从 hermes config.yaml 读取 model.context_length。"""
        config = os.path.join(os.path.expanduser("~"), ".hermes/config.yaml")
        if exists(config):
            try:
                import yaml
                with open(config) as f:
                    cfg = yaml.safe_load(f)
                ctx = (cfg or {}).get("model", {}).get("context_length")
                if ctx and isinstance(ctx, (int, float)) and ctx > 0:
                    return (int(ctx), None, config)
            except Exception:
                pass
        return (None, None, "unknown")

    def get_disabled_skills(self, roots: list[str]) -> set[str]:
        """Hermes 目前不直接支持 skill 级别的禁用。"""
        return set()

    def keep_priority(self, skill: Skill) -> int:
        """低 = 更优先保留。Hermes 技能排在 agent-scripts 和 repo 之后。"""
        return 3

    def scope_for_root(self, root: str) -> str:
        r = root.replace(os.path.expanduser("~"), "~")
        if ".hermes/skills" in r:
            return "hermes"
        return "hermes-extra"

    def scan_usage_in_log(self, log_text: str, skill_names: set[str]) -> dict[str, int]:
        """扫描 Hermes 日志中 skill 使用证据。"""
        import re
        counts: dict[str, int] = {}
        # 匹配 skill_view(name='...') 调用
        for m in re.finditer(r"skill_view\(\s*name\s*=\s*['\"]([^'\"]+)['\"]", log_text):
            name = m.group(1).lower()
            if name in skill_names:
                counts[name] = counts.get(name, 0) + 1
        # 匹配 $skill_name
        for m in re.finditer(r"\$([A-Za-z][A-Za-z0-9_.:-]{1,80})", log_text):
            name = m.group(1).lower()
            if name in skill_names:
                counts[f"$:{name}"] = counts.get(f"$:{name}", 0) + 1
        return counts
