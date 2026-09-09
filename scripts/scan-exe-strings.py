import re
import sys

path = sys.argv[1]
data = open(path, "rb").read()
sys.stdout.reconfigure(encoding="utf-8")

for pat in [b"Xiata", b"luanem", b"github", b"YOUTUBE", b"chrome", b"Extensions", b"LocalAppData"]:
    idx = 0
    while True:
        idx = data.find(pat, idx)
        if idx == -1:
            break
        chunk = data[max(0, idx - 40) : idx + 120]
        text = chunk.decode("utf-8", "replace")
        print(f"[{pat.decode()}@{idx}] {text}")
        idx += 1

print("\n--- URL-like ---")
for m in re.finditer(rb"https://github\.com/[^\x00\r\n]{3,120}", data):
    print(m.group().decode("ascii", "replace"))
