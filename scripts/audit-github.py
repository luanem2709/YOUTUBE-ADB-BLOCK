import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER = "luanem2709"
PATTERNS = ("xiata279", "thanhluan279", "iqbal-rashed", "cursoragent")
HEADERS = {"User-Agent": "funnygame-audit"}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    repos = get_json(
        f"https://api.github.com/users/{USER}/repos?per_page=100&sort=updated"
    )
    print(f"=== REPOS ({len(repos)}) ===")
    repo_rows = []
    code_hits = []
    readme_hits = []

    for r in repos:
        name = r["name"]
        full = r["full_name"]
        row = {
            "name": name,
            "full_name": full,
            "default_branch": r["default_branch"],
            "updated": (r.get("pushed_at") or "")[:10],
            "archived": r.get("archived", False),
            "fork": r.get("fork", False),
            "private": r.get("private", False),
            "description": r.get("description") or "",
            "html_url": r["html_url"],
        }
        repo_rows.append(row)
        print(
            f"- {name} | {row['updated']} | branch={row['default_branch']} "
            f"| fork={row['fork']} | archived={row['archived']}"
        )

        for pat in PATTERNS:
            q = urllib.parse.quote(f"{pat} in:file repo:{full}")
            try:
                data = get_json(f"https://api.github.com/search/code?q={q}")
                for item in data.get("items", []):
                    code_hits.append((full, item["path"], pat))
            except urllib.error.HTTPError:
                pass
            time.sleep(0.25)

        branch = urllib.parse.quote(r["default_branch"], safe="")
        for fname in ("README.md", "readme.md", "package.json", "manifest.json"):
            raw_url = f"https://raw.githubusercontent.com/{full}/{branch}/{urllib.parse.quote(fname)}"
            try:
                req = urllib.request.Request(raw_url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=20) as resp:
                    text = resp.read().decode("utf-8", "replace")
                for pat in PATTERNS:
                    if pat.lower() in text.lower():
                        readme_hits.append((full, fname, pat))
                # old account links
                for old in ("github.com/Xiata279", "github.com/xiata279",
                            "github.com/ThanhLuan279", "github.com/thanhluan279"):
                    if old.lower() in text.lower():
                        readme_hits.append((full, fname, old))
            except urllib.error.HTTPError:
                pass

    print("\n=== CODE SEARCH HITS ===")
    if code_hits:
        for hit in sorted(set(code_hits)):
            print(f"  {hit[0]} :: {hit[1]} ({hit[2]})")
    else:
        print("  (none)")

    print("\n=== README/KEY FILE HITS ===")
    if readme_hits:
        for hit in sorted(set(readme_hits)):
            print(f"  {hit[0]} :: {hit[1]} ({hit[2]})")
    else:
        print("  (none)")

    # repo metadata old links
    print("\n=== REPO METADATA ISSUES ===")
    meta_issues = []
    for row in repo_rows:
        blob = (row["description"] + " " + row["html_url"]).lower()
        for pat in PATTERNS:
            if pat in blob:
                meta_issues.append((row["full_name"], "description/url", pat))
        if row["fork"]:
            meta_issues.append((row["full_name"], "fork", "fork from upstream"))
    if meta_issues:
        for i in meta_issues:
            print(f"  {i[0]} :: {i[1]} :: {i[2]}")
    else:
        print("  (none)")

    out = {
        "repos": repo_rows,
        "code_hits": [{"repo": a, "path": b, "pattern": c} for a, b, c in code_hits],
        "readme_hits": [{"repo": a, "file": b, "pattern": c} for a, b, c in readme_hits],
    }
    with open("scripts/audit-github-result.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\nSaved scripts/audit-github-result.json")


if __name__ == "__main__":
    main()
