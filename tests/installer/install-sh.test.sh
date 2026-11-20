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
  *"logs renegade-web"*) [[ -n "${FAKE_SETUP_TOKEN:-}" ]] && echo "Renegade CMS setup token (expires in 15 minutes; use once): $FAKE_SETUP_TOKEN"; exit 0 ;;
  port*) [[ -n "${FAKE_PUBLISHED:-}" ]] && echo "$FAKE_PUBLISHED"; exit 0 ;;
  *) exit 0 ;;
esac
EOF

cat > "$work/bin/node" <<'EOF'
#!/usr/bin/env bash
# Stub for the bundled-ffmpeg installer script only; anything else is
# delegated to the real node binary.
case "$*" in
  *install-bundled-ffmpeg.mjs*)
    echo "$*" >> "$FAKE_NODE_LOG"
    case "${FAKE_NODE_MODE:-success}" in
      checksum)
        echo "Audio engine install failed [FFMPEG_BUNDLE_CHECKSUM_MISMATCH]: pinned checksum mismatch" >&2
        exit 1
        ;;
      unavailable)
        echo "Audio engine install failed [FFMPEG_BUNDLE_DOWNLOAD_FAILED]: could not download" >&2
        exit 1
        ;;
      *) exit 0 ;;
    esac
    ;;
  *) exec /usr/bin/node "$@" ;;
esac
EOF

cat > "$work/bin/ss" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAKE_PORT_LISTENING:-}" == "1" ]]; then
  echo "LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:*"
fi
exit 0
EOF
chmod +x "$work/bin/docker" "$work/bin/ss" "$work/bin/node"

run_install() {
  # $@ passed through to install.sh; env controls the stubs.
  (cd "$work/site" && PATH="$work/bin:/usr/bin:/bin" BUILD_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    FAKE_DOCKER_LOG="$work/docker.log" FAKE_NODE_LOG="$work/node.log" ./install.sh "$@")
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

# 8. Audio engine: fetch attempted when the bundled binary is absent.
rm -rf "$work/site/vendor"
rm -f "$work/docker.log" "$work/node.log"
out="$(run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "audio engine fetch attempted when vendor binary absent" "[[ $rc -eq 0 ]] && grep -q 'install-bundled-ffmpeg.mjs' '$work/node.log'"

# 9. Audio engine: skipped when a present binary passes the version sanity check.
mkdir -p "$work/site/vendor/ffmpeg"
cat > "$work/site/vendor/ffmpeg/ffmpeg" <<'EOF'
#!/usr/bin/env bash
echo "ffmpeg version 7.0.2"
exit 0
EOF
chmod +x "$work/site/vendor/ffmpeg/ffmpeg"
rm -f "$work/node.log"
out="$(run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "audio engine fetch skipped when present and valid" "[[ $rc -eq 0 ]] && [[ \"$out\" == *'already present'* ]] && [[ ! -s '$work/node.log' ]]"
rm -rf "$work/site/vendor"

# 10. Audio engine: a checksum mismatch fails the install closed.
rm -f "$work/node.log"
out="$(FAKE_NODE_MODE=checksum run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "audio engine checksum mismatch fails closed" "[[ $rc -ne 0 ]] && [[ \"$out\" == *'did not match its pinned checksum'* ]]"

# 11. Audio engine: an unavailable download warns and the install continues.
rm -f "$work/node.log"
out="$(FAKE_NODE_MODE=unavailable run_install --non-interactive 2>&1)" && rc=0 || rc=$?
check "audio engine unavailable warns and continues" "[[ $rc -eq 0 ]] && [[ \"$out\" == *'Capability Center'* ]]"

# 12. UXI-04 claim handoff: when the web log announces a token, the
# installer's primary instruction is the fragment claim link; the log
# grep remains, labelled as the fallback only.
rm -f "$work/docker.log" "$work/site/.env.production"
out="$(FAKE_PORT_LISTENING= FAKE_SETUP_TOKEN=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ run_install "${fresh_args[@]}" 2>&1)" && rc=0 || rc=$?
check "claim link is the primary handoff when a token is announced" "[[ $rc -eq 0 ]] && [[ \"$out\" == *'Claim your installation (primary handoff'* ]] && [[ \"$out\" == *'https://uxi.example.test/setup#claim=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'* ]]"
check "log grep is demoted to a labelled fallback" "[[ \"$out\" == *'Fallback (only if the link does not work)'* ]]"

# 13. UXI-04 claim handoff: with no announced token the installer never
# fabricates a claim link; it prints the retrieval path and the template.
rm -f "$work/docker.log" "$work/site/.env.production"
out="$(FAKE_PORT_LISTENING= FAKE_SETUP_TOKEN= run_install "${fresh_args[@]}" 2>&1)" && rc=0 || rc=$?
check "no fabricated claim link when no token is announced" "[[ $rc -eq 0 ]] && [[ \"$out\" == *'Retrieve the one-time bootstrap token'* ]] && [[ \"$out\" != *'setup#claim=abcdef'* ]]"

echo
if [[ $failures -eq 0 ]]; then echo "install.sh harness: ALL PASS"; else echo "install.sh harness: $failures FAILURE(S)"; exit 1; fi
