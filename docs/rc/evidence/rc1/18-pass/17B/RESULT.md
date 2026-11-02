# RC1 Subpass 17B — Result

**Status: PASS (bounded)** — Secrets, egress, dependency and abuse
security. Two real egress gaps were found and fixed (Discord delete
and Mastodon instance-URL paths fetched operator-supplied URLs with
raw `fetch`), the SSRF boundary gained CGNAT coverage, and three
dependency lines with applicable advisories were patch-upgraded
(Next.js 16.4.1, undici 7.30.1, nodemailer 10.1.4) with the remaining
advisories dispositioned per package in `advisories.json`. Everything
else in scope was validated working through the ordinary operator/API
paths: outbound SSRF posture incl. a separate production-posture web
process, signed webhook delivery with persisted/retrievable proof,
secret redaction by canary sweep over responses and server logs,
content-sniffed upload handling, literal SQL-handling, inbound
signature enforcement and rate limiting — 28 journey checks plus 5
restart checks on a disposable database, state persisted and
re-verified after a real web + PostgreSQL restart.

## Preliminary repair (authorized, separate commit `3c62caf`)

17A recorded that the full-project `npm run typecheck` was NOT clean:
exactly 2 pre-existing TS2352 errors in `src/scripts/portability.ts`
(lines 200/216, from 16C commit `177ac2b`) where satellite-adoption
results were cast directly to incompatible record types. Fixed
minimally by routing both casts through `unknown` (the compiler's own
suggestion) — cast-only, no runtime change. Proof: full project
`npm run typecheck` exits 0; the focused portability unit suites pass
19/19 (portability-contracts, portability-workflow,
rc1-03d-portability). This repair is a preliminary, not 17B scope; it
unblocks every later subpass and Pass 18's `verify:release`.

## Environment (recorded verbatim)

- Linux VM, Node v24.22.1, npm 10.9.4; **no Docker** on this VM.
- PostgreSQL **16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)**, local cluster
  at 127.0.0.1:5432 (CI uses a PostgreSQL 17.6 service; nothing in
  17B exercised PG17-specific behavior).
- Disposable database `rc117b_release_acceptance` only; earlier
  passes' retained DBs were not touched (`rc117a_release_acceptance`
  still exists). Fresh-migration acceptance passed (131 migrations
  applied from `src/migrations`).
- Base: `a09e581` (17A PASS) on branch `rc1-17b`. Implementation
  commits: `3c62caf` (preliminary repair), `b2771ac` (dependency
  upgrades + Discord/CGNAT fixes), `0647fba` (harness + units),
  `a3c1655` (Mastodon boundary fix + units).
- Containment: 1,613-file source manifest, SHA-256
  `a99a77fef638fe663e187c96707e9f32667a047cfed2abf3a65e359b15dc836b`
  (`source-tree.json`, re-verified with `--check`).

## Dependency refresh (bounded)

- `npm audit` could not run from this VM: the registry audit endpoint
  returned **403 `policy_denied` and npm exited 1** (raw response in
  `audit-attempt.json`). The refresh was therefore executed against
  **OSV.dev** over all **995 unique (name, version) pairs** in the
  lockfile: **13 packages with advisories, 34 advisories**, each with
  reachability evidence and a disposition in `advisories.json`.
- **Fixed by upgrade:** `next` 16.3.8 → **16.4.1** (two CRITICAL RCE
  advisories whose prerequisites are not met here — no
  `dangerouslyAllowSVG`, no `use cache` — and one HIGH Server-Actions
  DoS whose prerequisite IS present); production `npm run build`
  passed on 16.4.1 with the exact pin restored. `undici` → **7.30.1**
  (8 advisories; runtime-reachable via the outbound boundary).
  `nodemailer` → **10.1.4** (3 recipient-injection advisories).
- **Bounded, not force-upgraded:** `dompurify` (never imported by app
  source; bundled in monaco-editor only), `happy-dom` (server-side
  rich-text rendering only; 2 of 3 fixed only by a major bump),
  `fast-uri` (inside payload's bundled ajv; patch not blind-overridden),
  `deepmerge` (no fixed release), and five dev-only toolchain packages
  (`vitest`, `@vitest/mocker`, `vite`, `minimatch` ×2, `zod` copy).
- **Image scan unexecuted:** no Docker/trivy/grype exists on this VM.
  Dockerfile base pins inventoried instead (`node:24-alpine` ×4,
  `golang:1.27.2-alpine` esbuild stage with an in-Dockerfile advisory
  disposition). The production image belongs to 17C — see NEXT.

## Egress fixes (implementation, not just audit)

- **Discord `deletePost`** fetched the credential-supplied webhook
  URL with raw `fetch` (the path 16C left behind); both branches now
  route through `socialFetch`, so blocked destinations throw before
  any request instead of silently egressing.
- **Mastodon `editPost`/`deletePost`/`fetchPost`/`fetchAnalytics`**
  fetched the operator-supplied instance URL raw with the
  connection's Bearer token attached; all four now use `socialFetch`
  like publish already did. (Publish/media paths already validated;
  Bluesky/Telegram validate every endpoint or use fixed hosts — see
  the audit notes in NEXT.)
- **`isPrivateAddress`** now classifies **CGNAT 100.64.0.0/10** as
  private; it previously passed the SSRF boundary used by
  `safeFetch`/`assertSafeOutboundUrl`.

## UI/operator proof (harness `tests/rc1-17b/`, real Next.js processes)

Fresh phase — **28/28 checks pass**, restart phase — **5/5 pass**:

- Production-posture second web (booted with `VITEST` scrubbed, so
  the test-mode bypass is off): webhook subscriptions targeting the
  cloud metadata address (http AND https), plain-HTTP loopback,
  RFC1918 and a credential-embedded URL are all refused with **zero
  subscriptions persisted**; an AI connection to the metadata address
  never becomes active.
- Signed delivery: an execution event through `recordExecutionEvent`
  produced exactly one receiver hit whose `x-renegade-signature`
  HMAC verified against the subscription secret in-journey; the
  delivery row persisted `state: delivered`; the reconciliation
  endpoint reports `counts.delivered: 1`; the secret appears in no
  request body, audit record or response.
- AI provider secrets: a connection created with a canary API key
  round-trips it through `connectionCredential` (stored encrypted),
  and the canary appears in **no** response body — list, detail, or
  the failed-probe path of a second connection whose credential can
  never be served back decrypted.
- Upload battery: PNG accepted and served with `nosniff`; EXE-,
  HTML- and script-SVG bodies refused 415 by content sniffing (not
  extension); a clean SVG is served only under CSP
  `default-src 'none'`; an oversized body is refused 413 by a
  configured 64 KiB cap; anonymous upload refused; an upload from a
  foreign site origin refused 403.
- SQL handling: the injection-shaped filter returned the literal
  zero-result set (not "all rows"), and an injection-shaped article
  title persisted **verbatim** and read back intact with the table
  unharmed.
- Discord: delete against an allowlisted loopback webhook was
  observed at the receiver; metadata, non-allowlisted loopback and
  RFC1918 webhook URLs all throw **before any request**.
- Boundary battery at the resolver level: public target allowed;
  DNS-rebinding (public name → private answer), literal-private,
  plain-HTTP and credential-embedded targets rejected.
- Inbound email webhook: valid signature reaches application logic
  (400 unmatched event); tampered or missing signature → 401; a
  30-request flood under a configured 25/min cap → 429 with
  `Retry-After`.
- Restart phase: after killing web and PostgreSQL and restarting
  both, the pre-restart owner session still authenticates, uploaded
  media still serves, and the subscription + AI connection persisted;
  canary sweeps over **all** web logs (fresh, production-posture,
  restart) and restart-phase bodies are clean.

Executed-tree note: the journey and restart phases ran on the final
tree except for the later Mastodon fix (`a3c1655`), which the journey
does not exercise; that fix carries its own unit proof (below) and
the focused social suites pass on the final tree. The harness files
were Prettier-normalized after the run (whitespace only; harness
typecheck re-verified clean afterwards).

## Automated proof

- Focused units: `tests/unit/rc1-17b-security.test.ts` **16/16**
  (boundary classification incl. CGNAT and mapped IPv6, outbound URL
  posture with stubbed DNS, media sniffing, JSON-LD escaping, Discord
  and Mastodon dispatch boundaries, fail-closed production encryption
  key). Social suites **20/20** (08a/08c/dist-05) and adapter suites
  pass on the final tree.
- Full unit suite on the final tree: **2040 passed / 5 failed** —
  exactly the `a09e581` baseline (2024/5) plus the 16 new tests; the
  5 failures are the same named pre-existing set (`flow-04-acceptance`,
  `payload-domains`, `rc1-04d-campaign-commerce`,
  `shop-08-command-center-boundaries` ×2), not chased per scope rules.
- Full project typecheck clean (preliminary repair); ESLint and
  Prettier clean on all touched files; production build passed on
  Next 16.4.1.

## Bounds of this PASS

Local disposable evidence only: no real-world provider egress was
exercised (loopback receiver + stubbed DNS/fetch only), no live
charges/messages/posts, PostgreSQL 17 (CI) not exercised, the npm
audit endpoint was unreachable from this VM (OSV used instead), and
the production container image was not built or scanned (no Docker
on this VM — 17C owns it). Pass 17 continues with 17C; aggregate
RC1 NOT READY.
