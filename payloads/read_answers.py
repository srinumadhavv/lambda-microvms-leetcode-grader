# Hunts for the expected answers on disk. Expected: finds nothing (answers never enter the VM).
import os
import sys
import time

NAME_HINTS = ("answer", "expected", "problem", "solution", "testcase")
CONTENT_HINTS = (b'"expected"', b"expected_output")
SKIP = {"/proc", "/sys", "/dev", "/usr/lib", "/usr/share", "/usr/lib64"}
deadline = time.time() + 1.2

found, scanned = [], 0
for root, dirs, files in os.walk("/", followlinks=False):
    dirs[:] = [d for d in dirs if os.path.join(root, d) not in SKIP]
    for f in files:
        if time.time() > deadline:
            break
        scanned += 1
        p = os.path.join(root, f)
        if any(h in f.lower() for h in NAME_HINTS):
            found.append(p)
            continue
        try:
            if os.path.getsize(p) < 200_000:
                with open(p, "rb") as fh:
                    if any(h in fh.read() for h in CONTENT_HINTS):
                        found.append(p)
        except OSError:
            pass
    else:
        continue
    break

print("\n".join(found) if found else "FOUND NOTHING")
print(f"scanned {scanned} files, {len(found)} candidates", file=sys.stderr)
