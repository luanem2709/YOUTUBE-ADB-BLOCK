#!/usr/bin/env python3
"""Don repo nham + hoan tat buoc can quyen admin luanem2709."""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"


def token() -> str:
    p = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        text=True,
        capture_output=True,
        check=True,
    )
    for line in p.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise RuntimeError("Khong lay duoc token.")


def api(method: str, path: str, tok: str, body: dict | None = None) -> tuple[int, str]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {tok}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    tok = token()
    code, raw = api("GET", "/user", tok)
    login = json.loads(raw)["login"]
    print("Login:", login)

    # Xoa repo nham Xiata279/luanem2709 neu dang login Xiata279
    if login.lower() == "xiata279":
        code, msg = api("DELETE", "/repos/Xiata279/luanem2709", tok)
        print("Xoa Xiata279/luanem2709 (repo nham):", code, msg[:120] if msg else "")

    if login.lower() != "luanem2709":
        print("\nChua login luanem2709. Chay lai script sau khi:")
        print("  git credential reject (protocol=https host=github.com)")
        print("  git push  -> dang nhap bang luanem2709 + PAT")
        print("\nHoac chay: scripts/push-profile-readme.ps1")
        return 2

    code, msg = api("POST", "/user/repos", tok, {
        "name": "luanem2709",
        "description": "Profile README - Nguyen Thanh Luan",
        "homepage": "https://luanem2709.github.io/portfolio-thanhluan/",
        "private": False,
        "auto_init": False,
    })
    print("Tao luanem2709/luanem2709:", code)

    for path, label in [
        ("/repos/luanem2709/portfolio-thanhluan/pages", "Pages portfolio"),
        ("/repos/luanem2709/J2EE-PhatTrienUngDung", "J2EE default branch"),
        ("/repos/luanem2709/Xiata279", "Archive Xiata279"),
    ]:
        if "pages" in path:
            body = {"source": {"branch": "master", "path": "/"}}
            c, m = api("POST", path, tok, body)
            if c not in (200, 201):
                c, m = api("PUT", path, tok, body)
        elif "J2EE" in path:
            c, m = api("PATCH", path, tok, {"default_branch": "main"})
        else:
            c, m = api("PATCH", path, tok, {
                "archived": True,
                "description": "Da chuyen sang https://github.com/luanem2709 (archived)",
            })
        print(label, ":", c)

    print("\nXong buoc admin. Chay push-profile-readme.ps1 de push README profile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
