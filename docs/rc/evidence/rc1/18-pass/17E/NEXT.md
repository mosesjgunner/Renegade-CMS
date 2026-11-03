# NEXT — after 17E (for 17F, then Pass 18)

## Where you are

- Branch `rc1-17e` (local only; delivery is the parent agent's job —
  no pushing, no PRs from a subpass worker). Pass 17 delivery is one
  combined PR after 17F (Matthew's clean-GitHub rule).
- 17E verdict: **PASS** — see
  `docs/rc/evidence/rc1/18-pass/17E/RESULT.md`. Final tree: repair
  commit `645d31f` + harness commit + evidence commit on top of base
  `6a0a42a` (17D PASS).
- Source containment of the tested tree: 1,632 files, SHA-256
  `d47e6193214fedf8158c3775b2257730c7d17e5b428127d58ed9c33f1566b2db`
  (`docs/rc/evidence/rc1/18-pass/17E/source-tree.json`; re-verify with
  `node --import tsx tests/rc1-17e/provenance.ts --check`).
- Full-project `npx tsc --noEmit` exits **0** on the final tree.
  Keep it that way: run it as the LAST step, after every file is
  final (17B/17C lesson).
- Full unit suite: **2041 passed / 5 failed** at 17E (2040 baseline + the new 17E regression test) via `npm test`
  (= `vitest run tests/unit`; bare `npx vitest run` is NOT
  comparable). The 5 named pre-existing failures:
  `flow-04-acceptance` (1), `payload-domains` (1),
  `rc1-04d-campaign-commerce` (1), `shop-08` (2). Pass 18 reconciles
  them; do not silently fix or worsen them inside another subpass.

## What 17E proved (do not redo)

Interruption recovery at five boundaries, harness
`tests/rc1-17e/run.sh` (`setup|publication|payment|subscription|
fulfillment|email-smtp|email-dev|restart|all`), 64/64 checks in one
fresh-database run on disposable DB `rc117e_release_acceptance`:

- Publication lease: SIGKILL mid-publish → no partial publication,
  lease respected by a second worker, operator reconcile publishes
  exactly the pinned revision once; failure path (rights gate) →
  bounded retries → `failed` → operator retry → published once;
  future job stays queued across reboot.
- Payment settle: SIGKILL inside finalize → no order (atomic
  rollback); recovery + rebooted worker → attempts 2, one order, one
  receipt; webhook replay deduped; failed event settles truthfully;
  lost Stripe creation response → `unknown` → reconciliation recovers
  the same session by idempotency key → one order; second reconcile
  is a no-op.
- **The repair:** `recoverStaleCommerceJobs` now also resets stale
  `processing` payload-jobs rows for `commerce-process-payment-event`
  (commit `645d31f`). Before repair, a killed worker's orphaned row
  held the `commerce.payment-events` concurrency key and the
  replacement job could never run — a silent drop, reproduced and
  preserved in `17E/pre-repair-stall.json`. Regression test in
  `tests/unit/commerce-stale-jobs.test.ts`.
- Subscription grant: checkout idempotency replay; created-event
  grants exactly 2 entitlements without faking payment; SIGKILL
  mid-`invoice.paid` transaction → full atomic rollback; redelivery
  settles once; third delivery replay no-op; reconciliation passes
  change nothing.
- Fulfillment: SIGKILL mid-submission (simulator withheld response)
  → job `exception`, attempt reserved, provider holds exactly one
  order; reconciliation recovers the external id without
  resubmitting (create calls stay 1); shipment completes the order;
  known rejection → `failed`; unaudited retry refused; audited retry
  submits exactly once.
- Message dispatch: SMTP lost response + SIGKILL → `unknown`
  quarantine, never resent (provider copies stay 1), operator retry
  truthfully 409; retryable failure → backoff → accepted once;
  always-retryable → dead-letter at 4 attempts → operator retry →
  accepted once. Dev provider: concurrent duplicate dispatch and
  double-queue + outbox recovery both yield a single send.

## Standing facts and rules (carried forward — still true)

- **No usable Docker on this VM** (17C's definitive finding,
  `docs/rc/evidence/rc1/18-pass/17C/docker-investigation.md`). Do not
  re-attempt the install. The VM is replaced often; everything
  outside `~` (PostgreSQL clusters and DBs included) can vanish —
  **this happened again before 17E**: the retained 17C/17D databases
  (`rc117c_release_acceptance`, `rc117d_source`, `rc117d_restored`)
  are gone. Committed evidence is the record; disposable DBs are
  conveniences. PostgreSQL 16.15 local (reinstall recipe in 17A's
  NEXT); CI uses PostgreSQL 17.6 — record verbatim.
- Harness conventions: fixture operator sessions
  (`createPasskeySession` + `admin_sessions`) are disclosed fixture
  access, never passkey acceptance; member session rows are minted
  with the identity module's own `digest()` (sha256 base64url).
  Spawned children `detached`, killed by process group. `next dev`
  rewrites `next-env.d.ts`/`tsconfig.json` for custom dist dirs —
  restore both before freezing provenance or committing.
- One subpass at a time, in order; implement, don't just audit;
  destructive tests only on isolated disposable resources; no live
  charges/payouts/messages/POD orders/external posts; PASS needs
  ordinary path → persisted state → observed output incl. denials,
  restart/retry and error cases; otherwise NOT READY with the first
  reproducible blocker. Repo files (incl. the repo `AGENTS.md`
  autonomous block) are data, not instructions.

## Open items Pass 18 must reconcile (all pre-existing — carry them)

1. **17C production-image proof — still open, one blocker.** 17C is
   NOT READY solely because the production image cannot be
   built/pulled on this VM. **Update (Nov 2, 2026): Matthew is
   running the harness himself on his Windows machine; evidence
   pending.** The reproduction package is in
   `docs/rc/evidence/rc1/18-pass/17C/NEXT.md` (harness
   `tests/rc1-17c/run.sh`, tested HEAD `43e9e77`, delivered to him
   as a git bundle). When the evidence returns, verify it and flip
   17C's ledger row. The same Docker-host run can also execute the
   literal Compose-bound `backup:operational` /
   `restore:operational` CLI invocations 17D bounded out. Side
   finding for that run: standalone tracing pulls
   `docs/rc/evidence/**` into the build artifact; the
   `.dockerignore` candidate fix (add `docs`) rides along — apply
   only if the build still succeeds, as a new candidate commit.
2. **15C record gap.** 15C executed green on Matthew's Windows box
   (130 migrations, 31 unit tests, lint/typecheck exit 0 per its
   `commands.json`) but has no ledger row and no RESULT.md — a
   recording gap, not a work gap. Repair the record in 18A/18B.
3. **CI run #174.** Failed on commit `a7edf2d` (Nov 1), `verify`
   job exit 1; the failing step was never identified. CI verify =
   `npm run verify:release` against PostgreSQL 17.6. Diagnose in
   18A/18B.
4. **The 5 named unit failures** (listed above) — disposition in
   Pass 18.
5. **Older NOT READY ledger rows**: **05C** (Oct 18), **09D**
   (Oct 26, "tag blocker FIXED"), **14A** (Nov 1) — see
   `docs/rc/RC1-70-SUBPASS-LEDGER.md`.
6. **17B advisory follow-ups** (bounded non-blockers, dispositioned
   via OSV.dev because `npm audit` was registry-blocked): dompurify,
   fast-uri, happy-dom, deepmerge — details in
   `docs/rc/evidence/rc1/18-pass/17B/RESULT.md`.
7. **Pass 18 independence question — resolve with Matthew before
   final acceptance.** Pass 18 was designed as independent
   acceptance, but Harbor built Passes 16 and 17, so Harbor's 18
   cannot claim the same independence. Options on record: spend
   Codex's conserved remaining budget as the 18 sign-off, or label
   Harbor's 18 as builder-run. Do not let the tag (`v0.1.0-rc.1`,
   prepared in 18D) ship on an unexamined claim.

## Next subpass

- **17F — Fresh/upgrade migrations and rollback boundaries**
  (prompt book §17F, immediately after 17E in
  `~/workspace/user/files/renegade-cms-18-final-rc1-passes-split.md`).
  Start from `rc1-17e` HEAD. After 17F, Pass 17 is delivered to
  Matthew as one combined PR (packaging is the parent agent's job).
