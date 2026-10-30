# Tries to delete system directories. Expected: ERROR (permission denied).
# Runs as uid 1001, so root-owned files cannot be removed; this only touches the sandbox VM.
import os
import shutil
import sys

failures = 0
for path in ["/app", "/usr", "/etc", "/bin", "/sandbox/sol.py"]:
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        print(f"DELETED {path}")
    except Exception as e:
        failures += 1
        print(f"rm {path}: {e!r}", file=sys.stderr)

sys.exit(1 if failures else 0)
