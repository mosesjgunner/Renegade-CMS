# RC2 Performance Baseline (founded by RC2-H-06, Nov 14, 2026)

This is the project's **first** performance baseline. No prior measurements exist (RC2-A-02, Nov 11, 2026: performance "completely unmeasured"), so every number below is a founding measurement — not an improvement or a regression against anything.

## The three footprint numbers — do not flatten them

Per Matthew's footprint history (his account of his ChatGPT conversations, filed Nov 13, 2026):

1. **Lean was designed for a 1 GB-class VPS** — a design/stress-test target from Aug 2026. Before this pass it had **never been measured**.
2. **Standard's installer listed 2 GB** (Sept 2026) — an installer requirement, not a measurement.
3. **The 6–8 GB figures are Matthew's own server capacity** — not a product minimum, never cite them as one.

Matthew's position (Nov 13, 2026): the practical floor is the 2 GB class; the 1 GB fixture was a stress test, not a deployment recommendation. This pass measures both legs and records the results beside the targets.

## Environment and reliability limits (read before quoting any number)

- Hardware: Harbor's sandbox VM — ~7.9 GB RAM, 4 vCPUs visible, **~1.5 shared CPUs effective** with host throttling; the VM is replaced without warning (one replacement occurred mid-H-05; none occurred during these legs).
- All legs ran **solo and sequential**: one server at a time, no concurrent build, no concurrent test suite.
- Data volume: the RC2-A-04 standard world as seeded in the rig (2 sites, 6 content rows, 10 members, 6 staff users, 2 media assets, 4 orders). This is a small world; absolute latencies are a floor, not a production-scale claim. Rankings between routes and profiles are the decision-grade output.
- Timings are server-response times over loopback from a Node harness (`tests/rc2-h06/bench.mjs`), 1 cold + 20 warm sequential samples per route. Browser-side metrics (LCP/INP) were not instrumented in this pass.
- Memory constraint is real: each leg ran in a systemd scope with `MemoryMax` set to the leg's cap and `MemorySwapMax=0`. RSS was sampled from `/proc/<pid>/status` every 200 ms across each leg.

## Footprint legs — the headline result

| Leg                    | Cap (cgroup) | Idle RSS | Peak RSS under bench load | Settled RSS | Verdict                                                                                      |
| ---------------------- | ------------ | -------- | ------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| Lean (modules gated)   | 1 GB         | 251 MB   | **666 MB**                | ~322 MB     | **FITS** — full route matrix answered, no cgroup kill, headroom ~334 MB at peak              |
| Standard (all modules) | 2 GB         | 386 MB   | **929 MB**                | ~320–390 MB | Fits with wide margin at this data volume; peak is driven by the schedule-health N+1 (below) |

PostgreSQL adds ~123 MB RSS across its processes on this box (shared by both legs; on a real 1 GB VPS the database is part of the same budget — Lean peak 666 MB + PG ~123 MB ≈ 789 MB, still inside 1 GB for this workload, with the OS and page cache uncounted).

**Reading:** Lean at 1 GB is now _measured_, not assumed — for the standard-world workload. This does not convert 1 GB into a recommendation (Matthew's 2 GB-class floor stands); it converts an unverified design target into a verified one for this data volume.

## Response times (ms, loopback, 1 cold + 20 warm)

### Standard (all modules)

| Route                                   | Status | Bytes  | Cold    | p50       | p95         | Mean  |
| --------------------------------------- | ------ | ------ | ------- | --------- | ----------- | ----- |
| Public home `/` (site A)                | 200    | 23,324 | 628.8   | 82.8      | 276.8       | 87.0  |
| Public article                          | 200    | 25,234 | 219.3   | 137.4     | 175.1       | 140.5 |
| Admin shell `/admin`                    | 200    | 46,747 | 127.7   | 60.3      | 137.2       | 68.8  |
| Admin API `/api/admin/schedule-health`  | 200    | 235    | 1,233.4 | **700.3** | **1,051.0** | 709.3 |
| REST list `/api/social-queue-items`     | 200    | 870    | 33.2    | 9.0       | 23.3        | 9.9   |
| Editor data `/api/content/<id>?depth=2` | 200    | 3,146  | 25.6    | 19.3      | 26.0        | 20.0  |

### Lean (core modules only)

| Route                                   | Status | Bytes  | Cold  | p50   | p95   | Mean  |
| --------------------------------------- | ------ | ------ | ----- | ----- | ----- | ----- |
| Public home `/` (site A)                | 200    | 23,324 | 951.0 | 79.7  | 99.0  | 78.8  |
| Public article                          | 200    | 25,234 | 208.1 | 118.0 | 249.4 | 130.5 |
| Admin shell `/admin`                    | 200    | 46,860 | 39.0  | 23.4  | 48.3  | 27.1  |
| Admin API `/api/admin/schedule-health`  | 200    | 235    | 534.2 | 178.6 | 244.5 | 172.8 |
| REST list `/api/social-queue-items`     | 404    | 57     | 19.3  | 5.0   | 27.2  | 6.4   |
| Editor data `/api/content/<id>?depth=2` | 200    | 3,127  | 27.9  | 20.4  | 33.3  | 22.0  |

The Lean 404 on the social queue list is **correct gating** (module off → route absent; proven as a security property in RC2-H-05), not a failure.

## Query counts (PostgreSQL `log_statement='all'` windows, 5 sequential requests per route, Standard)

| Route               | Statements per request | Dominant shapes                                                                                           |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Public home         | ~32                    | content/site/theme resolution                                                                             |
| Editor data read    | ~14                    | single-document fetch + relations                                                                         |
| **Schedule-health** | **~1,235**             | ~595 full `sites` selects + ~562 `member_site_roles` selects **per request**, plus ~19/site count queries |

Schedule-health's count is two orders of magnitude above every other route and matches its latency exactly. The statement shapes show site and member-role rows being re-fetched in a loop (per queue/job item) instead of resolved once — a textbook N+1.

## Worker throughput (Standard profile)

- Burst: 30 queued `social-publish` jobs (fast-failing dispatch attempts against a missing queue item), drained in **45.3 s from worker start** (≈40 jobs/min including worker boot and the 10 s poll cadence; observed cadence ≈10 jobs per poll cycle). This is a cadence baseline, not a saturation test — job payloads that do real provider work will run slower per job.

## Bundle and build (tree at `ab884c7`)

- Production build (solo, this VM): **401 s** wall. Full unit suite (286 files / 2,109 tests, all passing): **267 s** wall on this VM.
- Client static total: **7.03 MB** across 130 JS chunk files; CSS total **0.84 MB**; largest single JS chunk **1.13 MB**. This build system's output does not expose per-route JS attribution on disk (flat hashed chunks), so no per-route JS figure is claimed.
- Server-rendered HTML payloads: public home 23.3 KB, article 25.2 KB, admin shell 46.7 KB.
- Standalone output directory: 1,208 MB on disk (includes node_modules; not a runtime memory figure).
- Media: the world's assets are small (largest 74 KB PNG); no media-size bottleneck is measurable at this data volume.

## Top three bottlenecks (ranked by user impact; H-07 may pick at most two)

1. **Schedule-health N+1 (admin, every operator, Standard profile).** ~1,235 SQL statements and p50 700 ms / p95 1,051 ms for a 235-byte health summary; it also drives the Standard leg's 929 MB peak RSS. Root cause visible in statement shapes: per-item site + member-role re-fetch in a loop. Lean shows the same pattern at lower volume (p50 179 ms). **Decision-grade:** 20 warm samples, tight spread (min 519 ms — never fast), query counts from the server log.
2. **Public article latency (every reader).** Warm p50 137 ms (Standard) / 118 ms (Lean) with ~32 queries behind the home route and a 25 KB payload — the slowest _public_ surface on both profiles, and public latency is the product's storefront. Spread is modest (min 115 ms), so the floor itself is the cost, not variance.
3. **Cold-start first-hit cost (every deploy / restart).** First hit after start: 629–951 ms on public home, 1,233 ms on schedule-health (Standard). On the small-VPS deployments this product targets, restarts are routine (updates, host reboots), so the cold penalty is a recurring user-facing cost, not a one-off.

Not bottlenecks at this volume: editor data reads (p50 ~20 ms), REST list reads (p50 9 ms), worker cadence, media delivery.

## Proposed thresholds (for H-07 to verify against, not claimed as met)

- Schedule-health: p50 ≤ 50 ms and ≤ 50 statements per request on the standard world.
- Public article: warm p50 ≤ 100 ms on the standard world.
- Any admin API route: p95 ≤ 250 ms on the standard world.
- Lean full-matrix peak RSS ≤ 800 MB under the bench load (1 GB cap with OS/PG headroom).

## RC2-H-07 optimization record (2026-11-14)

**Pick:** bottleneck #1 only — the schedule-health / admin-auth query flood.
Bottleneck #2 (public article latency) was profiled and NOT picked (below);
#3 (cold first-hit) was not attempted. The cap is a maximum, not a quota.

**Root cause (traced, not guessed).** The schedule-health route itself is
thin: one `payload.auth()` plus one access-filtered find (5 statements).
The flood lives in `payload.auth()`: Payload's auth operation
unconditionally computes the full admin permissions object
(`getAccessResults`), evaluating access for every collection and global —
concurrently. Renegade's access functions resolve operator site grants
from the database on every evaluation (`resolveOperatorGrantContext`: a
`member-site-roles` find plus a `sites` find). One auth therefore cost
**1,106 statements** (547 role selects + 542 site selects), and the route
total was ~1,235 statements/request at p50 700 ms.

**Fix.** Concurrent grant resolutions for the same (request, user) now
share one in-flight promise in `resolveOperatorGrantContext`
(`src/modules/operations/operator-grants.ts`), threaded through the
collection access closures. The entry is dropped when the resolution
settles, so sequential calls always resolve fresh — a coarser per-request
cache was built first and REJECTED: it broke the pinned semantics that a
flow may change a user's grants mid-request and re-evaluate access
(`tests/unit/related-site-access.test.ts` caught it; the in-flight design
passes it).

**Before / after (same box, same day, same world; Standard profile):**

| Measure                                            | Before (H-06)     | After (H-07)                                   |
| -------------------------------------------------- | ----------------- | ---------------------------------------------- |
| schedule-health warm p50                           | 700 ms            | 131 ms                                         |
| schedule-health warm p95                           | 1,051 ms          | 219 ms                                         |
| schedule-health cold                               | 1,233 ms          | 542 ms                                         |
| schedule-health statements/request                 | ~1,235            | 85                                             |
| `payload.auth()` statements (in-process)           | 1,106             | 30                                             |
| Standard peak RSS under the matrix                 | 929 MB            | 402 MB                                         |
| Other routes (home/article/admin/queue/editor p50) | 83/137/60/9/19 ms | 93/143/55/10/24 ms (noise band, no regression) |

**Threshold status, honestly:** the H-06 proposed target for this route
(p50 ≤ 50 ms and ≤ 50 statements) is NOT met — 131 ms and 85 statements.
The remaining statements come from per-evaluation site/theme resolution
outside the grant path (~19 site-settings + ~19 site selects per request).
That is the named next target for RC3 performance work; it was not folded
into this pass. The auth permissions pass itself went from ~1,106 to ~30
statements.

**Pick #2 assessment (public article):** profiled at 74 statements/request,
spread across content/settings/publication/site/revision reads that scale
with page composition; no single redundant-fetch defect isolated, and
warm p50 (137 → 143 ms) is unchanged by the auth fix as expected (public
routes do not authenticate). Not picked; the profile travels with the
RC3 backlog.

**Regression anchor:** `tests/unit/operator-grant-cache.test.ts` (5 tests:
concurrent sharing, sequential freshness, no cross-request/user sharing,
uncached parity) plus the unchanged tenant-authorization matrix
(21/21 integration) — the optimization holds the tenant boundary.
