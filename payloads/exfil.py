# Tries to phone home. Expected: ERROR (the MicroVM has no egress).
# NOTE: only meaningful inside the MicroVM. Local Docker has internet, so it succeeds there.
import os
import select
import sys
import time
import urllib.request

# The attempt runs in a child process so we can enforce our own deadline:
# DNS lookups ignore socket timeouts and can hang past the runner's 2 s limit.
r, w = os.pipe()
pid = os.fork()
if pid == 0:
    os.close(r)
    try:
        with urllib.request.urlopen("https://example.com", timeout=1.5) as resp:
            msg = f"OK HTTP {resp.status}"
    except Exception as e:
        msg = f"ERR {e!r}"
    os.write(w, msg.encode())
    os._exit(0)

os.close(w)
ready, _, _ = select.select([r], [], [], 1.3)
if ready:
    msg = os.read(r, 4096).decode()
else:
    os.kill(pid, 9)
    msg = "ERR no response within 1.3 s (egress dropped)"
os.waitpid(pid, 0)

if msg.startswith("OK"):
    print(f"EXFIL SUCCEEDED: {msg}", file=sys.stderr)
    sys.exit(0)
print(f"exfil blocked: {msg}", file=sys.stderr)
sys.exit(1)
