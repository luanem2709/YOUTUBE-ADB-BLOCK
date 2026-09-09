#!/usr/bin/env python3
"""Thiết lập GitHub luanem2709 — ưu tiên git push, API khi có quyền admin."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATCH_SCRIPT = ROOT / "scripts" / "patch-github-links.py"
WORK = ROOT / "scripts" / ".github-setup-work"
API = "https://api.github.com"
PAGES_WORKFLOW = """name: Deploy GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
"""


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    print("$", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=True)


def rm_tree(path: Path):
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def try_api(method: str, path: str, token: str, body: dict | None = None) -> tuple[bool, str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return True, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return False, e.read().decode("utf-8", "replace")


def git_token() -> str:
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        text=True,
        capture_output=True,
        check=True,
    )
    for line in proc.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise RuntimeError("Khong lay duoc GitHub token.")


def clone(url: str, dest: Path):
    rm_tree(dest)
    cp = run(["git", "clone", "--depth", "1", url, str(dest)], check=False)
    if cp.returncode != 0:
        rm_tree(dest)
        cp = run(["git", "clone", url, str(dest)], check=False)
    if cp.returncode != 0:
        raise RuntimeError(f"Clone that bai: {url}\n{cp.stderr}")


def step_profile_readme_file():
    print("\n=== 1. Profile README (file nhap) ===")
    src = WORK / "xiata-src"
    clone("https://github.com/luanem2709/Xiata279.git", src)
    out_dir = WORK / "profile-readme"
    rm_tree(out_dir)
    out_dir.mkdir(parents=True)
    shutil.copy2(src / "README.md", out_dir / "README.md")
    run([sys.executable, str(PATCH_SCRIPT), str(out_dir)], check=False)
    readme = out_dir / "README.md"
    text = readme.read_text(encoding="utf-8")
    extra = (
        "\n\n---\n\n> Profile chinh: [github.com/luanem2709](https://github.com/luanem2709)"
        " · Portfolio: [luanem2709.github.io/portfolio-thanhluan]"
        "(https://luanem2709.github.io/portfolio-thanhluan/)\n"
    )
    if "Profile chinh" not in text:
        readme.write_text(text + extra, encoding="utf-8")
    out = ROOT / "scripts" / "profile-readme-luanem2709.md"
    shutil.copy2(readme, out)
    print("Da luu:", out)
    return False


def step_profile_push(token: str, login: str) -> bool:
    if login.lower() != "luanem2709":
        step_profile_readme_file()
        print("Can dang nhap luanem2709 de push profile repo.")
        return False
    step_profile_readme_file()
    readme = ROOT / "scripts" / "profile-readme-luanem2709.md"
    repo_dir = WORK / "luanem2709-profile"
    rm_tree(repo_dir)
    repo_dir.mkdir()
    shutil.copy2(readme, repo_dir / "README.md")
    ok, _ = try_api("POST", "/user/repos", token, {
        "name": "luanem2709",
        "description": "Profile README - Nguyen Thanh Luan",
        "homepage": "https://luanem2709.github.io/portfolio-thanhluan/",
        "private": False,
        "auto_init": False,
    })
    run(["git", "init", "-b", "main"], cwd=repo_dir)
    run(["git", "add", "README.md"], cwd=repo_dir)
    run(["git", "commit", "-m", "Tao profile README chinh cho luanem2709"], cwd=repo_dir)
    run(["git", "remote", "add", "origin", "https://github.com/luanem2709/luanem2709.git"], cwd=repo_dir)
    cp = run(["git", "push", "-u", "origin", "main", "--force"], cwd=repo_dir, check=False)
    if cp.returncode != 0:
        print(cp.stderr)
        return False
    print("Profile README da push.")
    return True


def step_pages_git():
    print("\n=== 2. GitHub Pages (workflow) ===")
    repo = WORK / "portfolio"
    clone("https://github.com/luanem2709/portfolio-thanhluan.git", repo)
    wf_dir = repo / ".github" / "workflows"
    wf_dir.mkdir(parents=True, exist_ok=True)
    wf = wf_dir / "deploy-pages.yml"
    wf.write_text(PAGES_WORKFLOW, encoding="utf-8")
    run(["git", "checkout", "master"], cwd=repo, check=False)
    run(["git", "add", str(wf)], cwd=repo)
    cp = run(["git", "commit", "-m", "Them workflow deploy GitHub Pages"], cwd=repo, check=False)
    if cp.returncode != 0 and "nothing to commit" not in (cp.stdout + cp.stderr).lower():
        print(cp.stderr)
    cp = run(["git", "push", "origin", "master"], cwd=repo, check=False)
    if cp.returncode != 0:
        print(cp.stderr)
        raise RuntimeError("Push workflow Pages that bai.")
    print("Da push workflow Pages. Bat Pages source = GitHub Actions trong Settings neu chua co.")


def step_pages_api(token: str):
    body = {"source": {"branch": "master", "path": "/"}}
    ok, msg = try_api("POST", "/repos/luanem2709/portfolio-thanhluan/pages", token, body)
    if ok:
        print("Pages API: da bat (master/root)")
        return
    ok, msg = try_api("PUT", "/repos/luanem2709/portfolio-thanhluan/pages", token, body)
    if ok:
        print("Pages API: da cap nhat")
        return
    print("Pages API khong co quyen admin, dung workflow git:", msg[:120])


def step_j2ee(token: str):
    print("\n=== 3. J2EE default branch ===")
    repo = WORK / "j2ee"
    clone("https://github.com/luanem2709/J2EE-PhatTrienUngDung.git", repo)
    cp = run(["git", "push", "origin", "Buổi-3:main"], cwd=repo, check=False)
    if cp.returncode != 0 and "already exists" not in (cp.stderr + cp.stdout).lower():
        print(cp.stderr)
        raise RuntimeError("Push nhanh main that bai.")
    print("Da push nhanh main tu Buoi-3.")
    ok, msg = try_api("PATCH", "/repos/luanem2709/J2EE-PhatTrienUngDung", token, {"default_branch": "main"})
    if ok:
        print("Default branch -> main")
    else:
        print("Khong doi duoc default branch qua API (can admin luanem2709).")
        print("Hay vao Settings > Branches > doi default sang main.")


def step_archive(token: str):
    print("\n=== 4. Archive Xiata279 ===")
    repo = WORK / "xiata-archive"
    clone("https://github.com/luanem2709/Xiata279.git", repo)
    (repo / "README.md").write_text(
        "# Da chuyen sang tai khoan chinh\n\n"
        "Tai khoan GitHub da chuyen sang **[luanem2709](https://github.com/luanem2709)**.\n\n"
        "- Profile: https://github.com/luanem2709\n"
        "- Portfolio: https://luanem2709.github.io/portfolio-thanhluan/\n\n"
        "Repo nay da duoc archive de giu lich su cu.\n",
        encoding="utf-8",
    )
    run(["git", "add", "README.md"], cwd=repo)
    run(["git", "commit", "-m", "Chuyen huong sang luanem2709 truoc khi archive"], cwd=repo)
    run(["git", "push", "origin", "main"], cwd=repo)
    print("Da push README chuyen huong.")
    ok, msg = try_api("PATCH", "/repos/luanem2709/Xiata279", token, {
        "archived": True,
        "description": "Da chuyen sang https://github.com/luanem2709 (archived)",
    })
    if ok:
        print("Xiata279 da archive.")
    else:
        print("Khong archive duoc qua API (can admin luanem2709). Archive thu cong trong Settings.")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    WORK.mkdir(parents=True, exist_ok=True)
    token = git_token()
    ok, raw = try_api("GET", "/user", token)
    login = json.loads(raw)["login"] if ok else "unknown"
    print("Authenticated as:", login)

    profile_ok = step_profile_push(token, login)
    step_pages_api(token)
    step_pages_git()
    step_j2ee(token)
    step_archive(token)

    print("\n=== Tom tat ===")
    print("Profile README file:", ROOT / "scripts" / "profile-readme-luanem2709.md")
    if not profile_ok:
        print("- Profile repo: CAN dang nhap luanem2709 de tao/push luanem2709/luanem2709")
    return 0 if profile_ok else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("LOI:", exc, file=sys.stderr)
        raise SystemExit(1)
