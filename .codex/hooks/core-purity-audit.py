#!/usr/bin/env python3
"""Audit the complete pure-core surface after a Codex patch.

Codex apply_patch events can modify more than one file and do not guarantee a
single file path in the hook payload, so scan src/core rather than trusting an
opaque event field. PostToolUse cannot roll back a patch; a violation stops the
remaining turn and explains the required recovery.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "src" / "core"
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
PATTERNS = (
    re.compile(r"child_process|node:child_process|node:fs|['\"]fs(?:/promises)?['\"]|['\"]electron['\"]"),
    re.compile(r"\bwindow\.|\bdocument\."),
)


def main() -> None:
    findings: list[str] = []
    if CORE.exists():
        for path in sorted(CORE.rglob("*")):
            if path.suffix not in SOURCE_SUFFIXES or not path.is_file():
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            for line_number, line in enumerate(text.splitlines(), start=1):
                if any(pattern.search(line) for pattern in PATTERNS):
                    findings.append(f"{path.relative_to(ROOT)}:{line_number}")

    if findings:
        locations = ", ".join(findings[:8])
        message = (
            "GitWarden core-purity audit found a forbidden import or DOM use in "
            f"{locations}. Move impure work to src/main/ and inject an interface."
        )
        print(json.dumps({"continue": False, "stopReason": message, "systemMessage": message}))


if __name__ == "__main__":
    main()
