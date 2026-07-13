#!/usr/bin/env python3
"""Audit the GitRunner process boundary after a Codex patch.

The source hook expected a single Claude file_path. This Codex adapter scans
the relevant source tree after each patch so multi-file patches stay covered.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src"
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
PROCESS_USE = re.compile(r"\bexecFile\b|\bchild_process\b|\bspawn\s*\(")


def is_allowed(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    name = path.name
    return (
        relative.startswith("src/main/git/")
        or relative.startswith("scripts/")
        or ".test." in name
        or ".spec." in name
        or "/tests/" in relative
        or "/test/" in relative
        or "/__tests__/" in relative
    )


def main() -> None:
    findings: list[str] = []
    if SOURCE.exists():
        for path in sorted(SOURCE.rglob("*")):
            if path.suffix not in SOURCE_SUFFIXES or not path.is_file() or is_allowed(path):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            for line_number, line in enumerate(text.splitlines(), start=1):
                if PROCESS_USE.search(line):
                    findings.append(f"{path.relative_to(ROOT)}:{line_number}")

    if findings:
        locations = ", ".join(findings[:8])
        message = (
            "GitWarden GitRunner audit found process spawning outside src/main/git/ in "
            f"{locations}. Route Git execution through GitRunner with spawn(args, shell: false)."
        )
        print(json.dumps({"continue": False, "stopReason": message, "systemMessage": message}))


if __name__ == "__main__":
    main()
