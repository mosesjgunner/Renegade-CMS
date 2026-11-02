# Next after 16C — Pass 17 pickup (cold start)

Pass 16 is complete: 16A (connections/credentials/health), 16B
(webhooks/delivery/reconciliation) and 16C (import/export, provider
conformance, extensions boundary) are all PASS (bounded). **Pass 17
(17A–17F, security/recovery/ops) is yours.** No part of Pass 17 was
executed. Work exactly one subpass at a time from the prompt book
(`renegade-cms-18-final-rc1-passes-split.md`, edition 2026-10-17, the
"### 17A"…"### 17F" sections), produce RESULT.md + a cumulative ledger
row + NEXT.md per subpass, and stop for the user's review/merge after
each. Pass 18 is independent final acceptance and must NOT be run by
whoever built Pass 16 or Pass 17.

## Tree identity — read this first

- Base for all of Pass 16: `a7edf2d` (Pass 15 head, Gemini's final push).
- 16A head: `6c62037` on branch `rc1-16a` (4 commits on `a7edf2d`).
  Delivered as PR #15; the user merged it to main on 2026-11-01
  (merge commit `16b310d`) — verify current GitHub state before
  assuming; branches move after handoff.
- 16B head: `750f8aa` on branch `rc1-16b` (5 commits on `6c62037`).
  Delivered as PR #16 (closed unmerged) and PR #17 (opened by the user);
  the user's stated plan is one combined PR covering 16B+16C against
  main once 16C lands — again, verify on GitHub, don't assume.
- 16C: branch `rc1-16c` from `750f8aa`. Implementation/test commits:
  `177ac2b6dd753f9f4aa0c9382cf4f2a16aef89fc` (product fixes) and
  `a3ccba6bd25575634671b90edcc6ecbe2d1bf7c3` (harness + unit tests),
  plus the evidence commit that carries this file. Source containment at the tested tree:
  1,603 files, SHA-256 `d9a9c6f1d030ab9d28ebebf5a2cca15e7496f66116a611d749ce3bc70554ce27` (manifest:
  `docs/rc/evidence/rc1/18-pass/16C/source-tree.json`; re-verify with
  `node --import tsx tests/rc1-16c/provenance.ts --check`).
- The repo's cumulative ledger is `docs/rc/RC1-70-SUBPASS-LEDGER.md`;
  one row per subpass, newest evidence linked from the row. Evidence
  for every subpass lives under `docs/rc/evidence/rc1/18-pass/<ID>/`
  (RESULT.md, NEXT.md, journey-trace.json, restart-trace.json,
  web.log, restart-web.log, source-tree.json; 16C adds
  provider-matrix.json).

## How the disposable harness works (16A–16C pattern)

Each subpass ships a self-contained harness under `tests/rc1-<id>/`:

- `run.sh` with three actions. `migrate` runs
  `npm run test:migrations:fresh` against a clearly-labeled disposable
  database (the verifier REQUIRES the database name to end in
  `_release_acceptance`). `journey` wipes harness state/media/dist,
  boots a real Next.js dev server (`next dev --webpack`, dedicated
  port and `RENEGADE_NEXT_DIST_DIR=.next-rc1<id>`), creates fixtures
  in-process through Payload, and drives the ordinary operator HTTP
  paths plus in-process adapter calls, writing `journey-trace.json`
  live (each `check()` appends and flushes, so a crash still leaves a
  trace). `restart` restarts the PostgreSQL cluster
  (`sudo pg_ctlcluster 16 main restart`) and re-runs the journey in
  its restart phase against the persisted state file
  (`scratch/rc1<id>/state.json`).
- Operator sessions are **fixture passkey sessions** (a session row is
  inserted directly for a seeded user). No genuine passkey ceremony is
  claimed anywhere in Pass 16 — keep that honesty in 17.
- Next dev regenerates `next-env.d.ts` and `tsconfig.json` for the
  harness dist dir on every boot. **Revert both before freezing
  provenance** (`git checkout -- next-env.d.ts tsconfig.json`) or the
  delivered tree will carry harness-local paths.
- One-shot tsx scripts that initialize Payload must exit explicitly
  (`process.exit(...)` after `payload.db.destroy()`): Payload leaves
  background handles alive and the process otherwise hangs forever
  after finishing its work. This bit 16C twice (see RESULT); any
  helper you write in 17 needs the same ending.

### This VM vs your Docker/Windows setup

- Here: Linux VM, Node v24.22.1, npm (the repo's canonical flow; CI
  uses npm), **no Docker**, ~7 GB RAM / 4 cores. PostgreSQL is a local
  Ubuntu cluster: **PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)**,
  `postgres`/`postgres` at 127.0.0.1:5432, controlled with
  `sudo pg_ctlcluster 16 main start|restart`. CI uses a PostgreSQL
  **17.6** service — every Pass 16 evidence set records the PG16
  substitution verbatim; nothing in 16A–16C exercised PG17-specific
  behavior. On your setup, prefer the repo's Docker flow where a
  subpass calls for it (17C is expected to need Docker — that's why
  Pass 17 is on your machine), and record whatever you actually used
  the same way.
- A full harness journey here takes ~5–9 minutes wall clock (web
  compile + many Payload-initializing subprocesses). Budget for it;
  don't mistake the silence for a hang — check the trace file, it
  flushes per check.
- Git identity in this clone is repo-local `Harbor <harbor@localhost>`.
  Local git here has no push credentials; delivery went through the
  user's GitHub connector as snapshot commits. Follow whatever
  delivery route the user gives you; merges are always the user's.

## Standing rules (from the prompt book + the user)

- Implement, don't audit. One subpass per run; never auto-start the
  next. Preserve pre-existing edits, databases, media, secrets and
  evidence — disposable resources only for destructive tests, clearly
  labeled (Pass 16 used `rc116a_*` / `rc116b_*` / `rc116c_*` databases
  and `scratch/rc1<id>/`; those databases are retained evidence — do
  not drop or mutate them).
- No live charges or payouts, no unsolicited messages, no real POD
  orders, no external posts, no real provider calls. Local harnesses,
  emulators, deterministic adapters and development sinks only, and
  label every claim exactly: unconfigured safety / adapter-harness
  success / remote sandbox / real-world outcome are different claims.
- PASS requires the ordinary UI/operator path → persisted state →
  observed output, including denied roles/sites, restart/retry
  behavior and error paths. Anything less is NOT READY with the first
  reproducible blocker named.
- Secrets never appear in evidence, logs or artifacts; every Pass 16
  journey ends with a canary sweep proving it.

## Facts you can rely on (verified in Pass 16; don't rediscover)

- **Payload record ids on this tree are UUIDs** (the Postgres schema
  uses `gen_random_uuid()`), and **Payload does not honor a supplied
  id on create** — neither `payload.create` nor `payload.db.create`.
  (The 16B NEXT said integer ids; that was wrong for this tree and is
  superseded by this note.) Any import/restore design must assign new
  ids and remap references, which is exactly what the 16C CLI store
  now does (`src/scripts/portability.ts`: `idMap`, deep reference
  remapping incl. UUID tokens in composite keys, satellite adoption,
  deferred circular pointers restored in `repairRelationships`).
- Creating a site auto-provisions a default publication; creating
  published content auto-provisions its article-family row and a
  sequence-1 revision. Fixtures and importers must expect those rows.
- Hierarchy/taxonomy hooks (`guardHierarchyNode`,
  `enforceSiteTenantBoundary`) accept site/relationship ids as strings
  or `{id}` objects — **not numbers** — and publication-scoped
  taxonomy requires the publication to exist first. Categories/tags
  need `scope: 'publication'` + a publication in fixtures.
- Published article/page content requires a Lexical `body` or the
  hierarchy guard rejects it ("Add content in the editor before
  publishing").
- Webhook signatures (16B): outbound HMAC `t=<ts>,v1=<hmac>` over
  `${timestamp}.${raw}`, 300 s tolerance, timing-safe verify; inbound
  email/commerce callbacks are rate-limited per key before processing
  (`INBOUND_WEBHOOK_RATE_LIMIT_PER_MINUTE`, default 300); email
  signature encoding is HMAC-SHA256 **base64url**, the commerce
  deterministic adapter's is **hex**. `reconcileWebhookSubscriptions`
  (`src/modules/integrations/reconciliation.ts`) is delivery truth;
  16A's `reconcileProviderState` is provider health — different
  functions, don't conflate.
- Social adapters (16C): all publish paths go through the dispatch
  boundary (`src/modules/social/dispatch-boundary.ts`); loopback
  origins must be allowlisted in `SOCIAL_LOCAL_ADAPTER_ORIGINS` or
  `assertSocialEndpoint` throws. `getProviderCapabilityTruth` reports
  each adapter class's own declared mode verbatim — several classes
  declare `live` (a real HTTP publish implementation), which is not a
  remote-outcome claim.
- AI (16A/16C): only two provider keys exist, `ai.ollama` (loopback
  HTTP by validation) and `ai.openai-compatible` (**HTTPS required** —
  no local-HTTP success path exists by design; prove error contracts,
  not completions). AI credential keyring rotates past v1 (16A).
- Portability (16C): the executable end-to-end paths are the portable
  archive (`src/scripts/portability.ts` export/import, AES-256-GCM,
  checkpoint + `--resume` idempotency) and the legacy WXR pipeline
  (`src/modules/portability/legacy-migration`). The other import
  adapters are framework contracts over pre-parsed `SourceRecord`s;
  only `wordpress-export` has a dedicated parser. A plain re-import
  without `--resume` is NOT idempotent by design.
- Module registry truth (`src/modules/module-registry.ts`): social =
  `local-harness`, network = `local-peer`, newsletter = `local-sink`,
  commerce = `local-adapter`, everything else `local-only`. Keep
  claims consistent with it.

## Carried open items — read before starting 17A

1. **15C record gap (repair before 18A).** Pass 15C has no ledger row
   and no RESULT.md. Its evidence folder
   (`docs/rc/evidence/rc1/18-pass/15C/`) holds only `commands.json`,
   `containment.json`, `source-tree.json`; `commands.json` shows the
   run executed green on the user's Windows box (130 migrations; 31
   unit tests passed / 0 failed; ESLint/Prettier/typecheck exit 0).
   The repair is clerical: write RESULT.md + the ledger row from
   those artifacts, or rerun the record half. The run itself is not
   missing — the paperwork is.
2. **CI run #174 failed, step unidentified.** On Pass 15 head
   `a7edf2d`, the `verify` job (which runs `npm run verify:release`
   against PostgreSQL 17.6) exited 1 on 2026-11-01. Nobody has
   identified the failing step. `verify:release` is Pass 18 scope,
   but if 17 work touches release plumbing, expect this to resurface.
3. **Pre-existing unit failures (verified at base; do not chase).**
   Full suite at 16C: 2020 passed / 5 failed (2025 total) — the same 5 failures verified pre-existing at base; the +2 over 16B's 2018 passed are this subpass's new workflow tests. The 5 failures,
   reproduced identically at base `a7edf2d`: `flow-04-acceptance`,
   `payload-domains`, `rc1-04d-campaign-commerce`,
   `shop-08-command-center-boundaries` (×2). Plus 2 rc05 integration
   failures (product lifecycle + price tampering; catalog publish
   hook) reproduced at base `6c62037` in 16B. Diff any new run
   against this list, not against zero.
4. **Older NOT READY ledger rows still open:** 05C, 09D ("tag blocker
   FIXED"), 14A. They are 17/18-relevant context, not Pass 17 scope
   unless the prompt book says so.
5. **Discord delete path** still uses raw `fetch` (16C aligned
   publish + edit onto `socialFetch`/`assertSocialEndpoint`). Same
   pattern, small follow-up, not yet done — don't claim it.
6. **License mismatch (repo-level, user's call, do not reopen
   unprompted):** `LICENSE` file says GPL-3.0; README badge and
   `package.json` say AGPL-3.0. Recorded for completeness only.

## Honest bounds of what Pass 16 proved

- No real-world provider outcome anywhere: no live AI completion
  against a remote model, no real social post, no SMTP delivery, no
  Stripe charge or payout, no real Printful/Printify order or health.
  All successes are local harnesses, emulators, deterministic
  adapters, or development sinks.
- Health/capability claims are probe- and declaration-based (16A's
  truthful `unknown` for unprobed families; 16C's verbatim adapter
  modes). Nothing upgrades a claim beyond what was executed.
- Everything ran on PostgreSQL 16.15, not CI's 17.6, with fixture
  passkey sessions (no genuine passkey), on one Linux VM without
  Docker. 17C's Docker-based proof has no Pass 16 precedent to lean
  on — build its harness fresh from the 16 pattern.
- 16B's webhook proof did not wait out real wall-clock backoff
  (30/60/120/240 s was verified from persisted due-times, not by
  sleeping). If 17 needs true elapsed-time behavior, say so in its
  evidence rather than inheriting the claim.

Good luck. The pattern that worked: read the prompt-book section in
full, inventory against the real code before fixing, prove through
the operator path on disposable resources, and write the evidence so
the next agent never has to guess.
