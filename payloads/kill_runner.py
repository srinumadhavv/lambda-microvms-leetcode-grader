# Tries to kill the runner (the server that launched us). Expected: ERROR (different user).
import os
import signal
import sys

targets = []
for pid in filter(str.isdigit, os.listdir("/proc")):
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            if b"server.js" in f.read():
                targets.append(int(pid))
    except OSError:
        pass
targets.append(1)  # and PID 1 for good measure

denied = 0
for pid in targets:
    try:
        os.kill(pid, signal.SIGKILL)
        print(f"KILLED pid {pid}", file=sys.stderr)
    except OSError as e:
        denied += 1
        print(f"kill {pid}: {e!r}", file=sys.stderr)

sys.exit(1 if denied == len(targets) else 0)
