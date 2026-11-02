#!/usr/bin/env bash
# RC1 17C disposable acceptance harness (Linux + Docker).
# Builds the exact production image from the current HEAD and proves it
# in two isolated Compose projects (rc117ca / rc117cb) with disposable
# volumes and loopback-only web binds. All data is fixture data; no real
# provider, charge, message or post occurs. Secrets exist only in
# scratch/rc117c env files (mode 0600) and are never written to evidence.
set -euo pipefail
cd "$(dirname "$0")/../.."
ACTION="${1:?usage: run.sh build|inspect|stack-a|restart-a|stack-b|down|all}"
node tests/rc1-17c/journey.mjs "$ACTION"
