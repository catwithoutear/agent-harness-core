"""
OpenCode 适配器。
"""

from __future__ import annotations

import os
from typing import Optional

from .base import AgentAdapter, Skill, exists


class OpenCodeAdapter(AgentAdapter):
    agent_name = "opencode"

    def skill_roots(self) -> list[str]:
        home = os.path.expanduser("~")
        roots = [
            os.path.join(home, ".config/opencode/skills"),
            os.path.join(home, ".opencode/skills"),
            os.path.join(home, ".agents/skills"),
        ]
        return [r for r in roots if exists(r)]

    def log_paths(self, deep: bool = False) -> list[str]:
        return []

    def history_file_paths(self) -> list[str]:
        return []

    def config_paths(self) -> list[str]:
        return []

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        return (None, None, "unknown")

    def get_disabled_skills(self, roots: list[str]) -> set[str]:
        return set()

    def keep_priority(self, skill: Skill) -> int:
        return 1

    def scope_for_root(self, root: str) -> str:
        r = root.replace(os.path.expanduser("~"), "~")
        if "/.agents/skills" in r:
            return "opencode-shared"
        return "opencode"
