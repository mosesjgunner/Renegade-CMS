# RC2-H-06 — Performance baseline: measure before optimizing

**Verdict: PASS.** The project's first performance baseline now exists and is filed in `docs/rc2/RC2-PERFORMANCE.md` with commands, raw evidence references, reliability limits, and proposed thresholds. Nothing was optimized (that is H-07's job, against this baseline); no speedup is claimed anywhere. Base: main `ab884c7` (after PR #74). Main CI badge: **passing** on the merged tree.

## The footprint question, settled by measurement

Both legs ran as real constraints — systemd scopes with hard cgroup caps (`MemoryMax`, swap disabled inside the cap), RSS sampled every 200 ms — against the RC2-A-04 standard world (2 sites, 6 content rows, 10 members, 6 staff users, 2 media assets, 4 orders):

- **Lean under a 1 GB cap: FITS.** Idle RSS 251 MB, peak 666 MB under the full route-matrix load, settled ~322 MB, no cgroup kill, every core route answered. With PostgreSQL's ~123 MB resident on the same box, the whole stack peaked at ≈789 MB for this workload. The Aug 2026 design target ("Lean on a 1 GB-class VPS") is now a _measured_ property at this data volume — recorded beside the target, with Matthew's standing position unchanged: 1 GB was a stress-test fixture, the practical floor remains the 2 GB class, and the 6–8 GB figures are his own server, not a product minimum.
- **Standard under a 2 GB cap:** idle 386 MB, peak 929 MB — the peak is driven by bottleneck #1 below, not by the module set itself.

## The matrix (1 cold + 20 warm sequential samples per route, loopback)

Full tables live in RC2-PERFORMANCE.md. Headline rows (warm p50/p95):

- Public home: Standard 83/277 ms; Lean 80/99 ms.
- Public article: Standard 137/175 ms; Lean 118/249 ms.
- Admin shell: Standard 60/137 ms; Lean 23/48 ms.
- Editor data read: ~20/26–33 ms on both profiles — healthy.
- REST queue list: 9 ms p50 (Standard); **404 under Lean — correct module gating**, not a failure.
- Schedule-health: Standard **700/1,051 ms**; Lean 179/245 ms.

## Top three bottlenecks (decision-grade for H-07; details + evidence in RC2-PERFORMANCE.md)

1. **Schedule-health N+1.** ~**1,235 SQL statements per request** (PostgreSQL statement log, 5-request windows) for a 235-byte response: ~595 full `sites` selects + ~562 `member_site_roles` selects per request — site/role rows re-fetched in a per-item loop. It is the slowest route measured, never fast (min 519 ms), and it drives Standard's peak memory.
2. **Public article latency.** Slowest public surface on both profiles (p50 137/118 ms) with a high floor (min 115 ms) — the cost is structural, not variance.
3. **Cold first-hit cost.** 629–951 ms on public home and 1,233 ms on schedule-health after a restart — recurring on the small-VPS deployments this product targets.

## Other measures

- Worker throughput (Standard): 30 fast-failing jobs drained in 45.3 s from worker start (≈40 jobs/min including boot and poll cadence) — a cadence baseline, not saturation.
- Query counts: public home ~32/request; editor data ~14/request.
- Bundle: 7.03 MB client static (130 JS chunks), 0.84 MB CSS, largest chunk 1.13 MB; per-route JS attribution is not exposed by this build output, so none is claimed. HTML payloads 23–47 KB.
- Build: 401 s solo on this VM. Unit suite (also the H-06 tree's regression check): **286 files / 2,109 tests, all passing**, 267 s wall on this VM.

## Reliability limits (stated, not hidden)

Sandbox VM: ~1.5 shared CPUs with host throttling, replaceable without warning. Legs ran solo/sequential; no VM replacement occurred during measurement. Data volume is the small standard world — absolute numbers are floors; the _rankings_ and the _query counts_ are the durable output. Browser-side metrics (LCP/INP) were not instrumented; server response time is the measured quantity.

## Deliverables in this PR

- `docs/rc2/RC2-PERFORMANCE.md` — the living baseline (three footprint numbers restated at the top; matrix; query counts; top three; proposed thresholds).
- `tests/rc2-h06/bench.mjs` (timing harness) and `tests/rc2-h06/seed-jobs.ts` (throughput seeder).
- RC2-STATUS row for H-06; combined row shrinks to H-07…08.
- Raw evidence (bench JSONs, RSS series, worker timings) retained in the rig logs; the summary tables above are computed from them.
