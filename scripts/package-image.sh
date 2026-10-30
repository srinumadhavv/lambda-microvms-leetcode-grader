#!/usr/bin/env bash
# Builds the runner bundle and zips Dockerfile + dist/ into grader-image.zip (repo root).
set -euo pipefail
cd "$(dirname "$0")/.."

node runner/build.mjs
rm -f grader-image.zip
(cd runner && zip -rq ../grader-image.zip Dockerfile dist)
echo "created grader-image.zip:"
unzip -l grader-image.zip
