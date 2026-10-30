# Forks until the kernel says no. Expected: ERROR/KILLED (nproc cap = 64 processes).
import os
import sys
import time

children = 0
try:
    while True:
        pid = os.fork()
        if pid == 0:
            time.sleep(0.5)  # child only holds a process slot, then exits
            os._exit(0)
        children += 1
except OSError as e:
    print(f"fork refused after {children} children: {e!r}", file=sys.stderr)
    sys.exit(1)
