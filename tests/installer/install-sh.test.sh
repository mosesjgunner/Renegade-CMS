#!/usr/bin/env bash
# UXI-03 harness for install.sh. Docker and ss are stubbed so the installer's
# decision logic (port ownership, rerun identity, prebuilt path) is exercised
# without a Docker daemon. This proves script behavior only — it is NOT a
# container deployment proof.
#
# Usage: bash tests/installer/install-sh.test.sh
set -u

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
# The installer's disk preflight measures its own directory; keep the fixture
# on a real filesystem (some environments mount a tiny tmpfs on /tmp).
work="$(mktemp -d "$repo_root/tests/installer/.harness.XXXXXX")"
trap 'rm -rf "$work"' EXIT
failures=0

mkdir -p "$work/bin" "$work/site"
cp "$repo_root/install.sh" "$repo_root/compose.production.yaml" "$repo_root/compose.network.yaml" "$work/site/"
chmod +x "$work/site/install.sh"

cat > "$work/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  info) exit 0 ;;
  *"compose version"*) echo "v2.39.0"; exit 0 ;;
  *"ps -q"*) [[ -n "${FAKE_WEB_CONTAINER:-}" ]] && echo "$FAKE_WEB_CONTAINER"; exit 0 ;;
  port*) [[ -n "${FAKE_PUBLISHED:-}" ]] && echo "$FAKE_PUBLISHED"; exit 0 ;;
  *) exit 0 ;;
esac
EOF

cat > "$work/bin/ss" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAKE_PORT_LISTENING:-}" == "1" ]]; then
  echo "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*"
fi
exit 0
EOF
chmod +x "$work/bin/docker" "$work/bin/ss"

run_install() {
  # $@ passed through to install.sh; env controls the stubs.
  (cd "$work/site" && PATH="$work/bin:/usr/bin:/bin" BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    FAKE_DOCKER_LOG="$work/docker.log" ./install.sh "$@")
}

check() {
  local name="$1" condition="$2"
  if eval "$condition"; then
    echo "PASS: $name"
  else
    echo "FAIL: $name"
    failures=$((failures + 1))
  fi
}

fresh_args=(--non-interactive --instance uxi-test --app-url https://uxi.example.test --profile Lean)

# 1. Fresh install, port free: builds from source and writes config.
rm -f "$work/docker.log" "$work/site/.env.production"
out="$(FAKE_PORT_LISTENING= run_install "${fresh_args[@]}" 2>&1)" && rc=0 || rc=$?
check "fresh install succeeds" "[[ $rc -eq 0 ]]"
check "fresh install builds from source" "grep -q 'up --build' '$work/docker.log'"
check "config records per-instance image" "grep -qx 'RENEGADE_IMAGE=renegade-cms-uxi-test' '$work/site/.env.production'"

# 2. Fresh install, foreign listener on the port: refused.
rm -f "$work/docker.log" "$work/site/.env.production"
out="$(FAKE_PORT_LISTENING=1 run_install "${fresh_args[@]}" 2>&1)" && rc=0 || rc=$?
check "fresh install refuses foreign listener" "[[ $rc -ne 0 ]] && [[ \"$out\" == *'already in use by another process'* ]]"

# Prepare an existing installation for rerun cases.
rm -f "$work/docker.log" "$work/site/.env.production"
FAKE_PORT_LISTENING= run_install "${fresh_args[@]}" >/dev/null 2>&1

# 3. Rerun while THIS installation's web container holds the port: proceeds.
rm -f "$work/docker.log"
out="$(FAKE_PORT_LISTENING=1 FAKE_WEB_CONTAINER=abc123 FAKE_PUBLISHED=127.0.0.1:3000 run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "rerun against own running deployment succeeds" "[[ $rc -eq 0 ]] && [[ \"$out\" == *\"held by this installation's running web service\"* ]]"

# 4. Rerun while a foreign process holds the port: refused with guidance.
rm -f "$work/docker.log"
out="$(FAKE_PORT_LISTENING=1 FAKE_WEB_CONTAINER= run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "rerun refuses foreign listener" "[[ $rc -ne 0 ]] && [[ \"$out\" == *'already in use by another process'* ]]"

# 5. Rerun with a mismatched instance: refused (identity preserved).
out="$(run_install --non-interactive --instance other-name 2>&1)" && rc=0 || rc=$?
check "rerun refuses instance mismatch" "[[ $rc -ne 0 ]] && [[ \"$out\" == *'does not match this installation'* ]]"

# 6. Rerun with --image: refused (image is persisted identity).
out="$(run_install --non-interactive --image registry.example.test/renegade:1.0.0 2>&1)" && rc=0 || rc=$?
check "rerun refuses --image change" "[[ $rc -ne 0 ]] && [[ \"$out\" == *'--image cannot change an existing installation'* ]]"

# 7. Fresh install with --image: pulls, never builds, records the image.
rm -f "$work/docker.log" "$work/site/.env.production"
out="$(FAKE_PORT_LISTENING= run_install "${fresh_args[@]}" --image registry.example.test/renegade:1.0.0 2>&1)" && rc=0 || rc=$?
check "prebuilt install succeeds" "[[ $rc -eq 0 ]]"
check "prebuilt install pulls" "grep -q ' pull' '$work/docker.log'"
check "prebuilt install never builds" "! grep -q 'up --build' '$work/docker.log'"
check "config records supplied image" "grep -qx 'RENEGADE_IMAGE=registry.example.test/renegade:1.0.0' '$work/site/.env.production'"

echo
if [[ $failures -eq 0 ]]; then echo "install.sh harness: ALL PASS"; else echo "install.sh harness: $failures FAILURE(S)"; exit 1; fi
