#!/usr/bin/env python3
"""Skill Cleaner CLI.

Audits skills across Codex, Hermes, OpenCode, OMP, and explicit extra roots.
"""

from __future__ import annotations

import argparse
import os
import sys

# 确保模块可导入
_script_dir = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_script_dir)
if _parent not in sys.path:
    sys.path.insert(0, _parent)


def main():
    parser = argparse.ArgumentParser(
        description="Skill Cleaner — audit skills across multiple agents"
    )
    parser.add_argument(
        "--months",
        type=int,
        default=3,
        help="How many months of log history to scan (default: 3)",
    )
    parser.add_argument(
        "--no-logs",
        action="store_true",
        help="Skip log scanning entirely",
    )
    parser.add_argument(
        "--deep-logs",
        action="store_true",
        help="Also scan archived sessions and non-standard log paths",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of markdown report",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gpt-5.5",
        help="Model name for budget calculation (default: gpt-5.5)",
    )
    parser.add_argument(
        "--budget-percent",
        type=float,
        default=2.0,
        help="Percentage of context window allocated to skills (default: 2)",
    )
    parser.add_argument(
        "--context-tokens",
        type=int,
        default=None,
        help="Override context window size (default: auto-detect or 272000)",
    )
    parser.add_argument(
        "--root",
        type=str,
        action="append",
        default=[],
        help="Additional skill root directory (can be specified multiple times)",
    )
    parser.add_argument(
        "--agent",
        type=str,
        action="append",
        default=[],
        help="Agent(s) to scan (codex, hermes, opencode, omp). Repeatable. Default: all",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include disabled skills in the report",
    )
    parser.add_argument(
        "--max-log-mb",
        type=int,
        default=300,
        help="Maximum log file volume in MB (default: 300)",
    )

    args = parser.parse_args()

    # 延迟导入 — 确保路径设置好了
    from skill_cleaner_core import (
        get_all_adapters,
        filter_adapters,
        ExtraRootAdapter,
        discover_skills,
        scan_usage,
        format_report,
    )

    adapters = get_all_adapters()
    if args.agent:
        adapters = filter_adapters(adapters, args.agent)

    if args.root:
        adapters.append(ExtraRootAdapter(args.root))

    skills, errors = discover_skills(adapters)

    # 扫描日志 unless --no-logs
    log_files: list[str] = []
    usage = {}
    if not args.no_logs:
        usage = scan_usage(
            skills=skills,
            adapters=adapters,
            months=args.months,
            deep=args.deep_logs,
            max_log_mb=args.max_log_mb,
        )

    # 确定 context_window
    context_window = args.context_tokens
    if context_window is None:
        for adapter in adapters:
            ctx, _, _ = adapter.get_context_window()
            if ctx:
                context_window = ctx
                break
        if context_window is None:
            context_window = 272_000  # 原生 fallback

    output = format_report(
        skills=skills,
        usage=usage,
        log_files=log_files,
        months=args.months,
        adapters=adapters,
        context_window=context_window,
        budget_percent=args.budget_percent,
        include_all=args.all,
        output_json=args.json,
    )

    print(output)


if __name__ == "__main__":
    main()
