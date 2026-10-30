#!/usr/bin/env bash
# Builds the runner image for linux/arm64 and runs it on localhost:8080.
# Functional test only: local Docker is NOT the isolation boundary.
set -euo pipefail
cd "$(dirname "$0")/.."

node runner/build.mjs
docker build --platform linux/arm64 -t mvm-runner runner/
docker rm -f mvm-runner >/dev/null 2>&1 || true
# --init reaps zombie processes (fork-bomb leftovers still count against the nproc cap)
docker run -d --rm --init --cap-add SYS_ADMIN --security-opt seccomp=unconfined --platform linux/arm64 --name mvm-runner -p 8080:8080 mvm-runner >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then
    echo "runner up on http://localhost:8080  (stop: docker stop mvm-runner)"
    exit 0
  fi
  sleep 0.5
done
echo "runner did not become healthy; logs:" >&2
docker logs mvm-runner >&2
exit 1
