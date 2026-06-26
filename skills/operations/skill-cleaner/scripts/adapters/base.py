"""
AgentAdapter 基类 — 所有 agent 适配器需实现的接口。
"""

from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Skill:
    name: str
    base_name: str
    description: str
    path: str
    real_path: str
    root: str
    real_root: str
    agent: str
    scope: str
    enabled: bool = True
    desc_chars: int = 0
    line_chars: int = 0
    line_bytes: int = 0
    body_hash: str = ""
    body_key: str = ""
    desc_key: str = ""

    def __post_init__(self):
        self.desc_chars = len(self.description)
        rendered = self._render_line()
        self.line_chars = len(rendered)
        self.line_bytes = len(rendered.encode("utf-8"))
        self.body_key = normalize_words(self._read_body())
        self.body_hash = fnv1a(self.body_key)
        self.desc_key = normalize_words(self.description)

    def _read_body(self) -> str:
        try:
            text = Path(self.path).read_text(encoding="utf-8", errors="replace")
            lines = text.split("\n")
            if lines and lines[0].strip() == "---":
                end = -1
                for i in range(1, len(lines)):
                    if lines[i].strip() == "---":
                        end = i
                        break
                if end >= 0:
                    return "\n".join(lines[end + 1 :])
            return text
        except Exception:
            return ""

    def _render_line(self) -> str:
        if self.description:
            return f"- {self.name}: {self.description} (file: {self.path})"
        return f"- {self.name}: (file: {self.path})"


@dataclass
class Usage:
    dollar: int = 0
    file_read: int = 0
    text: int = 0

    @property
    def total(self) -> int:
        return self.dollar + self.file_read + self.text


@dataclass
class Budget:
    model: str
    context_tokens: int
    context_source: str
    budget_percent: float
    budget_tokens: int
    rendered_line_chars: int
    unbudgeted_full_tokens: int
    minimum_tokens: int
    budgeted_tokens: int
    included_skills: int
    omitted_skills: int
    truncated_description_chars: int
    truncated_description_count: int
    remaining_budget_tokens: int
    budgeted_budget_used_ratio: float
    unbudgeted_budget_used_ratio: float
    budgeted_context_used_ratio: float
    chars_per_token: int = 4


class AgentAdapter:
    """每个 agent 适配器继承此类并覆盖方法。"""

    agent_name: str = "base"

    def skill_roots(self) -> list[str]:
        """返回此 agent 的所有 skill 根目录（绝对路径）。"""
        raise NotImplementedError

    def log_paths(self, deep: bool = False) -> list[str]:
        """返回日志/会话目录列表。"""
        raise NotImplementedError

    def history_file_paths(self) -> list[str]:
        """返回 history.jsonl 等单个文件。"""
        return []

    def config_paths(self) -> list[str]:
        """返回配置文件路径。"""
        return []

    def get_context_window(self) -> tuple[Optional[int], Optional[float], str]:
        """返回 (context_tokens, effective_percent, source_description)。"""
        return (None, None, "unknown")

    def get_disabled_skills(self, roots: list[str]) -> set[str]:
        """返回已禁用的 skill 路径集合。"""
        return set()

    def keep_priority(self, skill: Skill) -> int:
        """删除优先级排序值（低 = 更优先保留）。"""
        return 10

    def scope_for_root(self, root: str) -> str:
        """为根目录确定 scope 名称。"""
        return "extra"

    def __repr__(self) -> str:
        return f"<{self.agent_name}>"


# ── 工具函数 ──────────────────────────────────


def expand_home(input_path: str) -> str:
    return os.path.expanduser(input_path)


def exists(input_path: str) -> bool:
    return os.path.exists(input_path)


def normalize_words(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[`\"'’().,;:!?/\\[\]{}_\-]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def word_set(text: str) -> set[str]:
    return {w for w in normalize_words(text).split(" ") if len(w) >= 2}


def fnv1a(data: str) -> str:
    h = 0x811C9DC5
    for ch in data.encode("utf-8"):
        h ^= ch
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, "08x")


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    intersection = len(a & b)
    return intersection / (len(a) + len(b) - intersection)


def token_cost(text: str, chars_per_token: int = 4) -> int:
    import math
    return math.ceil(len(text.encode("utf-8")) / chars_per_token)


def parse_frontmatter(file_path: str) -> Optional[dict]:
    """解析 SKILL.md 的 YAML frontmatter，返回 {name, description, body}。"""
    try:
        text = Path(file_path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    fm_lines: list[str] = []
    end = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
        fm_lines.append(lines[i])
    if end < 0:
        return None

    name: Optional[str] = None
    description: Optional[str] = None
    for i, line in enumerate(fm_lines):
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not m:
            continue
        key = m.group(1)
        raw = m.group(2).strip()
        if key == "name":
            name = _sanitize_single_line(_parse_yaml_scalar(raw))
        elif key == "description":
            if raw in ("|", ">"):
                block: list[str] = []
                for j in range(i + 1, len(fm_lines)):
                    if re.match(r"^[A-Za-z0-9_-]+:\s*", fm_lines[j]):
                        break
                    block.append(re.sub(r"^\s{2}", "", fm_lines[j]))
                description = _sanitize_single_line(" ".join(block))
            else:
                description = _sanitize_single_line(_parse_yaml_scalar(raw))

    body = "\n".join(lines[end + 1 :])
    return {
        "name": name,
        "description": description or "",
        "body": body,
    }


def _sanitize_single_line(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\r", "").replace("\n", " ").replace("\t", " ")).strip()


def _parse_yaml_scalar(raw: str) -> str:
    value = raw.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    return value


def walk_skill_files(root: str, max_depth: int = 10) -> list[str]:
    """在 root 下递归查找所有 SKILL.md 文件（跳过 node_modules/.git）。"""
    results: list[str] = []
    seen_real = set()
    root_path = Path(root)
    if not root_path.exists():
        return results

    def _walk(dir_path: Path, depth: int):
        if depth > max_depth:
            return
        try:
            real = str(dir_path.resolve())
        except Exception:
            return
        if real in seen_real:
            return
        seen_real.add(real)

        try:
            entries = sorted(dir_path.iterdir(), key=lambda p: p.name)
        except PermissionError:
            return

        for entry in entries:
            if entry.name in ("node_modules", ".git"):
                continue
            if entry.is_dir() or entry.is_symlink():
                try:
                    if entry.is_dir() or (entry.is_symlink() and entry.resolve().is_dir()):
                        _walk(entry, depth + 1)
                except Exception:
                    continue
            elif entry.is_file() and entry.name == "SKILL.md":
                results.append(str(entry.resolve()))

    _walk(root_path, 0)
    return results


def walk_recent_files(root: str, predicate, max_depth: int = 8, cutoff_ms: float = 0):
    """walk 最近修改的文件（类似原版 walkRecentFiles）。mtime >= cutoff_ms。"""
    results: list[str] = []
    root_path = Path(root)
    if not root_path.exists():
        return results

    def _walk(dir_path: Path, depth: int):
        if depth > max_depth:
            return
        try:
            entries = sorted(dir_path.iterdir(), key=lambda p: p.name)
        except PermissionError:
            return
        for entry in entries:
            try:
                stat = entry.stat()
            except Exception:
                continue
            if entry.is_dir():
                if depth > 0 and stat.st_mtime_ns / 1e6 < cutoff_ms:
                    continue
                _walk(entry, depth + 1)
            elif entry.is_file() and predicate(entry.name) and stat.st_mtime_ns / 1e6 >= cutoff_ms:
                results.append(str(entry.resolve()))

    _walk(root_path, 0)
    return results


def realpath_deduped_roots(roots: list[str]) -> list[str]:
    """归一化 realpath 去重后返回最短路径表示。"""
    by_real: dict[str, str] = {}
    for r in roots:
        if not exists(r):
            continue
        real = str(Path(r).resolve())
        current = by_real.get(real)
        if current is None or len(r) < len(current):
            by_real[real] = r
    return sorted(by_real.values())
