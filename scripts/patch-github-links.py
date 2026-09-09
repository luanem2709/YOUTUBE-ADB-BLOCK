#!/usr/bin/env python3
"""Thay link GitHub cũ sang luanem2709 trong nội dung file."""
from __future__ import annotations

import sys
from pathlib import Path

REPLACEMENTS = [
    ("https://github.com/Xiata279/portfolio-thanhluan", "https://github.com/luanem2709/portfolio-thanhluan"),
    ("https://github.com/xiata279/portfolio-thanhluan", "https://github.com/luanem2709/portfolio-thanhluan"),
    ("https://github.com/Xiata279", "https://github.com/luanem2709"),
    ("https://github.com/xiata279", "https://github.com/luanem2709"),
    ("http://github.com/Xiata279", "https://github.com/luanem2709"),
    ("http://github.com/xiata279", "https://github.com/luanem2709"),
    ("[@Xiata279](https://github.com/Xiata279)", "[@luanem2709](https://github.com/luanem2709)"),
    ("https://xiata279.github.io/portfolio-thanhluan/", "https://luanem2709.github.io/portfolio-thanhluan/"),
    ("https://xiata279.github.io/portfolio-thanhluan", "https://luanem2709.github.io/portfolio-thanhluan"),
    ("- Xiata279", "- luanem2709"),
    ("Xiata279", "luanem2709"),
]

TEXT_EXT = {
    ".md", ".html", ".htm", ".js", ".json", ".css", ".ts", ".tsx", ".vue",
    ".py", ".cs", ".ps1", ".yml", ".yaml", ".xml", ".txt", ".jsx",
}

SKIP_DIRS = {".git", "node_modules", "dist", "build", "vendor", ".venv", "bin", "obj"}


def patch_text(text: str) -> str:
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    return text


def patch_file(path: Path) -> bool:
    try:
        original = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False
    updated = patch_text(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def patch_tree(root: Path) -> list[str]:
    changed: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT_EXT:
            continue
        if patch_file(path):
            changed.append(str(path.relative_to(root)))
    return changed


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python patch-github-links.py <repo-dir>")
        return 1
    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"Not found: {root}")
        return 1
    changed = patch_tree(root)
    print(f"Patched {len(changed)} file(s) in {root.name}")
    for item in changed:
        print(f"  - {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
