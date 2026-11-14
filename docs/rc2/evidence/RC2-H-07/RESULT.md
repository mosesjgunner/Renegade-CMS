# RC2-H-07 — Targeted optimization

**Verdict: PASS.** The #1 measured bottleneck from RC2-H-06 (the
schedule-health / admin-auth query flood) is fixed with a behavior-
preserving change and same-box before/after evidence. One pick was made
(the pack's cap is at most two, not a quota); pick #2 was profiled and
declined with the evidence recorded. The proposed stretch threshold for
the route is honestly reported as NOT met, with the residual named.

## What was wrong

The schedule-health route is a thin handler (auth + one access-filtered
find = 5 SQL statements), yet H-06 measured ~1,235 statements per
request. Bisecting the layers (in-process probes with statement-log
counting) isolated it:

- `payload.find` with access control: 5 statements.
- `resolveOperatorGrantContext` alone: 2 statements.
- `payload.auth()`: **1,106 statements**, every call.

Payload's auth operation unconditionally runs `getAccessResults`, which
evaluates access for every collection and global concurrently to build
the admin permissions object — an object this route (and most admin API
routes) never reads. Each evaluation called
`resolveOperatorGrantContext`, which ran a `member-site-roles` find and
a `sites` find: ~547 + ~542 selects per auth.

## The fix

`resolveOperatorGrantContext` now accepts the caller's request object,
and concurrent resolutions for the same (request, user) share a single
in-flight promise (WeakMap keyed by request; the entry is dropped when
the promise settles). Threaded through the collection access closures in
`src/collections/*` and the helpers in
`src/modules/operations/operator-grants.ts` (30 call sites). Callers
without a request keep the exact uncached behavior.

**Design constraint found by test:** a first version cached the grant
for the whole request. The existing suite caught it —
`tests/unit/related-site-access.test.ts` pins that a flow may change a
user's grants mid-request and re-evaluate access. That semantics is
load-bearing (grant/invite flows), so the design was narrowed to
in-flight sharing only: simultaneous evaluations (the permissions pass)
dedupe; sequential evaluations always resolve fresh. The failing test
passes under the shipped design.

## Before / after (same box, same session, Standard profile)

| Measure                            | Before         | After                  |
| ---------------------------------- | -------------- | ---------------------- |
| schedule-health warm p50 / p95     | 700 / 1,051 ms | 131 / 219 ms           |
| schedule-health cold               | 1,233 ms       | 542 ms                 |
| schedule-health statements/request | ~1,235         | 85                     |
| `payload.auth()` statements        | 1,106          | 30                     |
| Standard peak RSS (matrix)         | 929 MB         | 402 MB                 |
| Other benched routes               | —              | unchanged within noise |

Proposed H-06 threshold for the route (p50 ≤ 50 ms, ≤ 50 statements):
**not met** (131 ms / 85). The residual statements are per-evaluation
site/theme resolution outside the grant path; named in
`docs/rc2/RC2-PERFORMANCE.md` as the next RC3 performance target rather
than silently expanding this pass.

## Pick #2 (public article latency): profiled, not picked

74 statements/request spread across content, settings, publication,
site, and revision reads that scale with page composition; warm p50
unchanged (137 → 143 ms, noise). No single demonstrable redundant-fetch
defect was isolated, and the pack forbids speculative changes — the
profile is recorded in RC2-PERFORMANCE.md for RC3.

## Verification

- New unit regression test `tests/unit/operator-grant-cache.test.ts`:
  5/5 (concurrent sharing; sequential freshness; no sharing across
  requests or users; uncached parity of returned grants).
- Tenant boundary: `tenant-authorization-matrix` integration 21/21;
  `authorization-matrix` + `adversarial-cross-site-matrix` units pass.
- Full unit suite: 287 files / 2,114 tests — 2,113 pass. The single
  miss is `dist-01`'s randomized AES-GCM tamper assertion, which imports
  none of this diff, passed standalone (19/19) and passed in this pass's
  first full run; it is a pre-existing intermittent, not introduced here.
  (The suite also caught this pass's own first design — see above.)
- Typecheck: 0 errors. Solo production build completed; after-bench ran
  against it on the same VM as the H-06 baseline (no replacement
  between the before and after legs).

## Scope honesty

Changed: `src/modules/operations/operator-grants.ts` + access-closure
threading in 7 collection files + one unit test. No route, schema, or
behavior change; no caching of grants beyond an in-flight promise.
Cold-start bottleneck #3 was not attempted.
