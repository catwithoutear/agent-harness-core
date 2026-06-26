"""OMP adapter."""

from __future__ import annotations

import os
from typing import Optional

from .base import AgentAdapter, Skill, exists


class OmpAdapter(AgentAdapter):
    agent_name = "omp"

    def skill_roots(self) -> list[str]:
        home = os.path.expanduser("~")
        roots = [
            os.path.join(home, ".omp/skills"),
            os.path.join(home, ".config/omp/skills"),
            os.path.join(home, ".agents/skills"),
        ]
        return [r for r in roots if exists(r)]

    def log_paths(self, deep: bool = False) -> list[str]:
        home = os.path.expanduser("~")
        paths = [os.path.join(home, ".omp/sessions")]
        if deep:
            paths.append(os.path.join(home, ".omp/logs"))
        return [p for p in paths if exists(p)]

    def history_file_paths(self) -> list[str]:
        home = os.path.expanduser("~")
        h = os.path.join(home, ".omp/history.jsonl")
        return [h] if exists(h) else []

    def config_paths(self) -> list[str]:
        home = os.path.expanduser("~")
        return [
            os.path.join(home, ".omp/config.json"),
            os.path.join(home, ".config/omp/config.json"),
        ]

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        return (None, None, "unknown")

    def get_disabled_skills(self, roots: list[str]) -> set[str]:
        return set()

    def keep_priority(self, skill: Skill) -> int:
        return 4

    def scope_for_root(self, root: str) -> str:
        r = root.replace(os.path.expanduser("~"), "~")
        if "/.agents/skills" in r:
            return "omp-shared"
        return "omp"
