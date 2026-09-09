import sys

lines = sys.stdin.read().splitlines()
clean = []
for line in lines:
    if "Co-authored-by: Cursor" in line:
        continue
    if line.strip() == "EOF":
        continue
    clean.append(line)

while clean and not clean[-1].strip():
    clean.pop()

if clean:
    sys.stdout.write("\n".join(clean) + "\n")
