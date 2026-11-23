# RC1 17C — Docker investigation on Harbor's VM (2026-11-02)

Question: can the production image be built and run on this VM?
Answer: **No — established by direct experiment, in three independent
layers.** Every non-image part of 17C was executed instead (see
RESULT.md); the image proof itself is reproduced step-for-step in
NEXT.md for a Docker-capable host.

## Environment

- Sandbox runs inside a user namespace: `/proc/self/uid_map` is
  `0 → 131072, width 65536`. Effective capabilities include
  SYS_ADMIN/SETUID/CHOWN but **not CAP_NET_ADMIN** (bit 12 of CapEff
  clear). PID 1 is systemd; the agent runs as root; `sudo -n` works.
- No docker/podman/buildah/nerdctl on PATH initially; no docker
  socket. Kernel 7.0.0-39-generic, Ubuntu 24.04.5 LTS.

## Installation (succeeded, with a mirror workaround)

- Stock `apt-get update` hangs on `mirror.cogentco.com` (the 17A/17B
  warning). Workaround used throughout: azure-only sources in
  `/tmp/rc117c/azure.sources` (`azure.archive.ubuntu.com`, noble +
  noble-updates + noble-security) with an empty sourceparts dir.
- One stale `apt-get update` (PID 39378) from the first attempt held
  `/var/lib/apt/lists/lock` and ignored SIGTERM; it and its method
  children had to be SIGKILLed before further apt work.
- `apt-get install -y docker.io` then succeeded in 68s: docker.io
  29.1.3-0ubuntu3~24.04.2, containerd 2.2.1, plus `docker-buildx`
  0.30.1, `rootlesskit`, `slirp4netns`, `fuse-overlayfs`, `uidmap`.
  Service auto-start is denied by policy-rc.d (exit 101).

## Daemon start attempts

1. **Standard daemon** (`systemctl start docker`): FAILED.
   `failed to register "bridge" driver: failed to create NAT chain
DOCKER: iptables ... Could not fetch rule set generation id:
Permission denied (you must be root)` — the sandbox namespace has
   no CAP_NET_ADMIN.
2. **RootlessKit**: FAILED twice. With subuid `root:100000:65536`:
   `newuidmap: write to uid_map failed: Operation not permitted`
   (range outside the parent namespace's 65536-wide map). With
   `root:1:65535` the UID map passed but network setup failed:
   `nsenter: reassociate to namespace 'ns/user' failed: Operation
not permitted` creating tap0.
3. **Direct daemon, networking disabled** — SUCCEEDED as a daemon:
   `dockerd --iptables=false --ip6tables=false --bridge=none
--storage-driver=fuse-overlayfs` (overlay2 failed: nested overlay
   mount `invalid argument`). `docker info`: server 29.1.3, driver
   fuse-overlayfs. Usable modes: build/run with `--network=host` or
   `--network none` only; bridge networks (what Compose creates)
   remain impossible without CAP_NET_ADMIN.

## Registry access (the decisive failure)

- Host tools reach Docker Hub fine through the sandbox egress proxy
  (`http://hatch-egress-proxy:3128`): `curl https://registry-1.docker.io/v2/`
  returns 401 with CONNECT 200.
- **Every Go TLS client stalls**: `docker pull hello-world` and
  `docker manifest inspect hello-world` both fail with
  `Get "https://registry-1.docker.io/v2/": net/http: TLS handshake
timeout`, despite the proxy variables being present in the
  daemon's own environment (`/proc/<dockerd>/environ` verified).
- Not cured by `GODEBUG=http2client=0`, `GODEBUG=tlsmaxversion=1.2`,
  or `GODEBUG=tlsmlkem=0` (each tried; same timeout).
- Consequence: two real build attempts of the production Dockerfile
  (`docker build --network=host --target runner|media-heavy
--build-arg BUILD_SHA=43e9e77…`) both failed at base-image
  resolution: `failed to resolve source metadata for
docker.io/library/node:24-alpine: … TLS handshake timeout`.
  A further known sandbox-only obstacle waits behind this one even
  if pulls were hand-assembled: the Dockerfile's esbuild stage uses
  `ADD --checksum` of a remote tarball, which BuildKit fetches with
  its own Go HTTP client.
- While the investigation was being written up, **the VM was
  replaced** (fresh boot): docker, containerd, and PostgreSQL
  installations under `/etc` and system paths were wiped; only `~`
  survived (repo, commits, node_modules intact — the documented
  replacement behavior). Docker on this VM is therefore not only
  blocked but non-durable.

## Conclusion

The production image cannot be built or booted in this sandbox:
no CAP_NET_ADMIN for bridge networking, Go TLS egress to registries
stalls through the proxy, and the platform is ephemeral. This is
17C's first reproducible blocker. The complete reproduction for a
Docker-capable host is in NEXT.md; the committed harness
(`tests/rc1-17c/`) runs it end-to-end there.
