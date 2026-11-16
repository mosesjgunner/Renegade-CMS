# RC2-I-01 — Twelve-family operator acceptance matrix (independent replay)

**Verdict: all 12 families replayed on the exact candidate; 11 PASS at
their proven scope, Family 5 PASS with one open decision, Family 12 PASS
with two bounded findings carried from H-08.** Every family's supported
E2 positive journey and at least one meaningful negative/denied/failure
case were re-run against the frozen candidate — no cell rests on an
earlier pass's RESULT.md. I-01 repaired nothing: every disagreement with
an earlier verdict is recorded below as a finding for I-02, and every
provider-truth label from the original passes is preserved exactly.

## Candidate identity

- Git HEAD for every replay: `17e115910b25f730949bccc95f6979b65eda7cdb`
  ("Update next.config.ts", on top of the lane-04 merge `6d79433`) —
  main after PRs #77 (H-08) and #78–#82 (Performance Pass 0 lanes
  01–05). The SHA was recorded before the first replay and re-checked
  before the last; main did not move during the pass.
- Host: this sandbox VM (~8 GB), PostgreSQL 16 native cluster. The VM
  was replaced three times during the run (Nov 15, ~03:55, ~08:59,
  ~11:08 CT); after each replacement the rig was rebuilt from scratch
  (migrations, A-04 world, server, jobs worker) and the affected family
  legs were re-run against the rebuilt rig on the same candidate SHA.
- Served instances used the production standalone build of the
  candidate. Per-family environment files (module secrets, provider
  fixtures) were the same ones the original family passes used.
- Run logs for every leg are retained with this pass's working papers;
  the per-family stage counts below are the counts those logs report.

## Family matrix

| #   | Family                             | Replay (positive journey + negative case)                                                                                                                                                                                                                    | Verdict                                      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | Publishing & Content Management    | B-01 replayed 23/23; B-03 replayed 13/13 (attributed article across homepage/archive/feed/sitemap, slug-rename 308, denied edit)                                                                                                                             | PASS                                         |
| 2   | Presentation & Website Building    | B-02 replayed 14/14 (builder composition, theme switch without content loss, unsupported-block fallback, cross-site 404)                                                                                                                                     | PASS                                         |
| 3   | Media & Multimedia                 | C-01 replayed 16/16; C-02 replayed 10/10; C-03 replayed 12/12 (rendered-audit content checks remain NOT VERIFIED, RC2-DEBT-14)                                                                                                                               | PASS                                         |
| 4   | Editorial Workflow & Orchestration | D-01 replayed 11/11 (reject/resubmit/approve, restart-surviving schedule, partial-failure release with exactly-once retry, Site B refused 403)                                                                                                               | PASS                                         |
| 5   | Distribution, Marketing & Audience | D-02 social replayed 7/7; D-04 cross-family release replayed 8/8 clean; D-03 newsletter replayed 6/7 — see Finding 1                                                                                                                                         | PASS with one open decision (Finding 1)      |
| 6   | Analytics & Optimization           | G-02 replayed 8/8 (consent-first analytics, dedupe, withdrawal, experiment winner gating + rollback, wrong-site negatives)                                                                                                                                   | PASS                                         |
| 7   | Community & Member Systems         | E-01 replayed 11/11 API + 4/4 browser; E-02 replayed 12/12 API + 3/3 browser; E-03 replayed 11/11 API + 4/4 browser; mandated negatives measured separately — see Findings 2, 4, 5, 6                                                                        | PASS at proven scope; standing gap measured  |
| 8   | Commerce & Monetization            | F-01 replayed 12/12; F-02 replayed 11/11; F-03 replayed 13/13. Labels preserved: recurring checkout NOT executable in the sandbox (Stripe is the only recurring adapter, no fixture); POD emulator-proven, live Printful unavailable by design, #51 stays E1 | PASS at proven scope                         |
| 9   | AI & Editorial Intelligence        | G-01 replayed 12/12 against the deterministic local Ollama-shaped fixture. No hosted provider verified                                                                                                                                                       | PASS at proven scope                         |
| 10  | Identity, Permissions & Security   | H-02 role matrix replayed in full: **32 boundary holds, 0 breaches, 7 measures** — the measures are Findings 2, 3, 4, 5 below, all matching their registered expectations                                                                                    | PASS (boundaries hold); measures as expected |
| 11  | Network & Extensibility            | G-03 replayed ALL PASS, 9 stages, against the HTTPS-loopback peer. Labels preserved: #69 E2 local-peer bounded, public interop NOT VERIFIED, #70 R2R stays E0                                                                                                | PASS at proven scope                         |
| 12  | Installation, Infrastructure & Ops | Full H-08 lifecycle replayed in fresh disposable databases — see below                                                                                                                                                                                       | PASS with two bounded findings (as in H-08)  |

## Family 12 detail (lifecycle replay)

- **Fresh install (native):** all migrations applied cleanly to the
  candidate; A-04 world seeded under Lean; the published article serves
  200; a real media upload returned 201 with physical bytes on disk.
- **Backup:** pg_dump + media tar produced with the documented v1
  layout; manifest built with the product's own
  `createOperationalBackupManifest` (build SHA = the candidate) and
  validated by `verifyOperationalBackup` — **OK**, 2 files, 1,695,739
  bytes. Manifest secret scan: PAYLOAD_SECRET value absent, database
  password absent, no `enc:` strings.
- **Restore:** `pg_restore` exit 0 into a fresh database; `db:migrate`
  on the restored instance applied **0 migrations**; table digests
  compared source vs restored — **311 tables, same set, 228 rows, 0
  mismatches**; the restored instance serves the article (200) and a
  pre-backup admin session still authenticates (`/api/users/me` 200).
- **Upgrade rehearsal:** `npm run test:migrations:upgrade` —
  "Upgrade rehearsal passed: 20260914_110000_med_05_video_workflow ->
  current."
- **Bounded finding A (unchanged from H-08):** `install.sh` exits 1 with
  the clean refusal "Docker is installed but unavailable to this user."
  Compose provisioning remains unverifiable in this sandbox (no Docker
  daemon); ledger #77 stays E2, and the remaining proof needs a Docker
  host.
- **Bounded finding B (RC2-DEBT-26, reproduced exactly):** the portable
  round trip is PARTIAL — export held 19 records across 13 collections
  with zero dummy-credential plaintext, zero encrypted references and
  zero `enc:` strings; import into a fresh target completed **14 of
  19**, the same 4 failures as H-08 (the member-space-post chain:
  spaces, content, article-family-content, revision-records —
  unresolvable profile/creator references written as empty strings
  into UUID columns). The imported published article serves 200 on the
  target instance.

## Findings for I-02 (all measured on the candidate; nothing repaired)

1. **Empty-audience guard — open decision (Family 5, non-Red).** The
   D-03 replay verified the unsubscribe/suppression machinery clean
   (suppressed addresses receive nothing; forged webhook 401), but
   scheduling the next campaign to the now-zero-eligible segment
   returns 400 `{"error":"Empty audience: …","emptyAudience":true}`
   where the original journey contract expected a 200
   schedule-and-deliver-to-nobody. Reproduced independently by probe.
   Decision attached for I-02: keep the guard and update the journey
   contract, or restore schedule-anyway. (Filed with the pass's working
   papers as the I-02 empty-audience finding.)
2. **RC2-DEBT-18 (P1) re-proven live.** The E-01 replay again measured
   the magic-link GET completion route returning HTTP 500 on a fresh
   valid token, consuming the single-use token. Parked in I-02 by the
   owner's explicit choice (Nov 14).
3. **RC2-DEBT-16 (P1) re-measured three times.** H-02 matrix cells
   B1/B2: site-settings save returns 403 for the site admin and for
   the global owner. The Performance Lane 01 ride-along (below)
   measured the same 403 through the normal REST route. Parked in
   I-02 by the owner's explicit choice (Nov 14).
4. **RC2-DEBT-19 (P1) confirmed as a measured gap.** In the E-02
   replay, reporting a member with no site role row returns 404; after
   a role row exists the same report returns 201 and the case opens.
   H-02 matrix cell G7 measured the same 404. The fix is designed
   under the owner's decided member-standing model C (one identity,
   per-site standing).
5. **Member-standing enforcement gap (model C decided, not built).**
   Posting on a site the member never joined returned **201** in three
   independent measurements: the Family 7 negative probe (forum post
   on Site B), and H-02 matrix cells G2/G3/G5 (201 each). Matrix cell
   G12 confirms the complementary boundary does hold: a suspension on
   Site A does not reach Site B (post on B = 201 is correct there
   because standing is per-site). Enforcement is an I-02/RC3 build
   item, not an I-01 repair.
6. **RC2-DEBT-24 (P2) reproduced.** A scope-less `suspend_posting`
   returns 200 and the member's next post still returns **201** — the
   sanction restricts nothing site-wide; reinstatement cleanup
   returned 200.
7. **RC2-DEBT-26 (P2) reproduced exactly** — see Family 12, bounded
   finding B.

No new P0s. No Red-gate defect (security/privacy/data-loss/tenant/
payment) was found by any replay: the H-02 matrix reported 0 boundary
breaches, and every cross-site negative across the families refused as
specified.

## Ride-along: Performance Lane 01 POST-route freshness close-out

Executed during this window against the candidate server, per the
staging brief's addendum. Sequence: GET / on Site A showed the current
site name (from the site-settings global, read 200) → `POST
/api/globals/site-settings` with the operator cookie returned **403**
`{"errors":[{"message":"You are not allowed to perform this
action."}]}` → the first fetch after still showed the original name
(the save never landed), so no restore was needed and the original was
confirmed in place. Verdict: this is the pre-registered fork's second
branch — a live re-measurement of **RC2-DEBT-16 (P1)**, not a lane-01
failure. Lane 01's Gate 1 stands passed via the owner's PC data-layer
save; the remainder is closed in the lane-01 scorecard with this
evidence.

## What I-01 did not do

- Repaired nothing (scope guard). All findings above name their I-02
  repair or decision.
- Did not upgrade any provider-truth label: F-02 recurring checkout
  NOT executable in the sandbox; POD emulator-proven with #51 at E1;
  G-01 no hosted AI provider verified; G-03 #69 E2 local-peer bounded
  with public interop NOT VERIFIED and #70 at E0; Neo4j remains absent
  from the CMS runtime (E0, per G-02's graph inspection).
- Did not assert the 90-area ledger reaches E1 anywhere it did not
  already say so; the RC3 gate (every applicable item ≥ E1, each
  family ≥ E2) is untouched by this pass.

## Handoff

Stop and hand off **RC2-I-02** (repair pass): the two parked P1 fixes
(RC2-DEBT-16, RC2-DEBT-18), RC2-DEBT-19 under model C, the
empty-audience decision (Finding 1), and the remaining register, in
the owner's chosen order. I-03 (exit sign-off) follows I-02; neither
I-01 nor I-02 authorizes a release tag or release notes.
