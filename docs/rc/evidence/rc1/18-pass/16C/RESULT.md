# RC1 Subpass 16C — Result

**Status: PASS (bounded)** — Import/export, provider conformance and the
extensions boundary. The portable site round trip now actually completes:
export → encrypted archive → clean target → import → equivalent persisted
state, proven export-vs-export. Getting there required repairing the
import path itself: the documented CLI hung after finishing its work, and
its Payload store assumed record ids are preserved on create — they are
not — so every record that referenced another imported record failed.
The CLI store now remaps references through a source→actual identity map,
the import workflow writes in dependency order with one deferred retry,
auto-provisioned satellite rows are adopted instead of collided with, and
the circular article-family↔revision pointers are restored by a real
`repairRelationships`. The Discord adapter's publish path, which bypassed
the shared dispatch boundary entirely, now routes through it like its
siblings.

Base commit `750f8aa` (16B head; 16A `6c62037` and base `a7edf2d` beneath)
on local branch `rc1-16c` (not pushed; delivery is the reviewer's step).
Implementation commits: `177ac2b6dd753f9f4aa0c9382cf4f2a16aef89fc`
(product fixes) and `a3ccba6bd25575634671b90edcc6ecbe2d1bf7c3`
(harness + unit tests), plus this evidence.
Source containment: 1,603 files, SHA-256 `d9a9c6f1d030ab9d28ebebf5a2cca15e7496f66116a611d749ce3bc70554ce27` (`source-tree.json` beside
this file; `--check` re-verified after freezing).

Environment substitution (recorded, not hidden): this VM has no Docker,
so the disposable acceptance databases are clearly-labeled local
PostgreSQL 16.15 databases — `PostgreSQL 16.15 (Ubuntu
16.15-0ubuntu0.24.04.1)` — named `rc116c_release_acceptance` (source) and
`rc116c_target_release_acceptance` (clean import target), with disposable
media roots under `scratch/rc116c/`. The 16A/16B databases
(`rc116a_*`, `rc116b_*`) were not touched. 132 migration files; fresh
migrations applied and verified by `test:migrations:fresh` on both
databases (exit 0, "Fresh migration acceptance passed"). All providers
are local harnesses or in-process local adapters: an Ollama-protocol
harness, an AT Protocol XRPC harness, a loopback capture server, the POD
emulator, the deterministic commerce adapter, and the email development
sink. No external posts, no live charges, no real POD orders, no remote
provider calls.

## What was broken — verified before fixing

1. **The portability CLI never exited.** `src/scripts/portability.ts`
   finished its work (archive written, success JSON printed) and then hung
   indefinitely — Payload initialization leaves background handles alive
   and the script only set `process.exitCode`. Observed directly: a manual
   export completed in ~40 s and was still running 7 minutes later.
   Sibling one-shot scripts (`seed.ts`, `semantic-url-backfill.ts`) exit
   explicitly; this one did not.
2. **Import could not round-trip any site with internal references.**
   Payload's Postgres adapter assigns record ids itself — verified
   experimentally: neither `payload.create` nor `payload.db.create`
   honors a supplied UUID id. The CLI store wrote `{ id, ...data }`
   assuming preservation, discarded the actual ids, and left every
   reference pointing at source ids: taxonomy → publication `Not Found`
   (collection hooks resolve references), `content_authors` /
   `article_family_content` / `revision_records` foreign-key violations.
   Only reference-free records imported (6 of 11 in the fixture).
3. **Manifest order is alphabetical, not dependency order.**
   `importPortableManifest` processed records in manifest order, so
   categories were attempted before the publications they reference.
4. **Auto-provisioned satellites collide.** Creating a site provisions a
   default publication; creating published content provisions its
   article-family row, which provisions a sequence-1 revision. The
   exported family/revision rows collided on the unique `content` and
   `(article, sequence)` constraints instead of adopting those rows.
   The family↔revision reference is also circular
   (`currentRevision`/`latestPublishedRevision` ↔ `article`), so neither
   can be created first with pointers intact; the CLI's
   `repairRelationships` was a stub returning 0.
5. **The ID-conflict guard false-positived on site-less collections**
   (authors, article-family, revisions carry no `site` field): the check
   compared `'' !== targetSiteId` and would have thrown a spurious
   conflict on any update-path write.
6. **Discord publish bypassed the dispatch boundary.** Every sibling
   adapter asserts endpoints via `assertSocialEndpoint` and fetches via
   `socialFetch`; Discord pre-checked with a stricter private
   `validateOutboundUrl` (no local-harness allowance) and used raw
   `fetch`, so it had no sanctioned loopback path and none of the shared
   timeout/redirect policy.

## Implementation

1. **CLI exits explicitly** (`src/scripts/portability.ts`):
   `process.exit(process.exitCode ?? 0)` after `payload.db.destroy()`,
   the `semantic-url-backfill.ts` pattern. Export now completes and exits
   0 in ~13 s (was: hang).
2. **Identity map + reference remapping in the CLI store**: the store
   records source-id → actual-id for every written row (the source site
   id is pre-seeded to the target site) and deep-rewrites data through
   the map before each write — whole-string references, and UUID tokens
   embedded in composite strings (the article family key is
   `content:<content-id>`). Reads resolve through the map, so the
   update path and the other-site conflict check operate on the rows the
   import actually created. `repairRelationships` now returns the true
   count of records whose references were rewritten.
3. **Dependency order + one deferred retry**
   (`src/modules/portability/workflow.ts`): records are processed in
   `PORTABLE_COLLECTIONS` order (dependency-shaped: sites → publications
   → taxonomy → content → article family → revisions), stable within a
   collection; a row whose write fails is retried once after the main
   pass before being reported in `failedRows`. Checkpoint/resume
   semantics unchanged. Covered by 2 new unit tests (ordering, retry).
4. **Satellite adoption + deferred circular pointers** (CLI store):
   `article-family-content` adopts the auto-provisioned row found by its
   unique `content` relation; `revision-records` adopts by
   `(article, sequence)`. The family's `currentRevision` /
   `latestPublishedRevision` are written as null and restored by
   `repairRelationships` once the revision rows exist.
5. **Conflict guard narrowed**: the other-site check now fires only when
   the existing row actually carries a `site` value.
6. **Discord publish on the shared boundary**
   (`src/modules/social/adapters/discord.ts`): publish pre-checks with
   `assertSocialEndpoint` (same normalized validation failure on block)
   and sends via `socialFetch`; the edit fetch uses `socialFetch` too.
   Production posture is unchanged (HTTPS/public unless an origin is
   explicitly allowlisted for local-harness mode). The delete path still
   uses raw `fetch` — recorded as a carried observation in NEXT.md, not
   silently claimed.

No schema changes and no new migrations in this subpass.

## UI / operator proof (live, disposable resources)

Harness: `tests/rc1-16c/run.sh` (`migrate` / `journey` / `restart`),
`tests/rc1-16c/journey.ts`, `tests/rc1-16c/target-tool.ts` (target-DB
companion: ensure-site, snapshot, export-manifest, media-sha, and a
raw-SQL conflict holder — Payload create cannot assign ids, so a
pre-existing colliding row is planted by SQL, simulating an earlier
SQL-level restore). Traces in `journey-trace.json` (31 checks) and
`restart-trace.json` (4 checks) beside this file; web logs in `web.log`
/ `restart-web.log`; the provider conformance record is
`provider-matrix.json` (11 entries, 52 sub-checks, all passed).
Operator sessions are fixture passkey sessions (the 15E/16A convention);
no genuine passkey claim.

Journey (31/31 passed):

- Web boot; export route denies anonymous (403) and a foreign-site
  administrator (403); the owner exports its own site (200). The
  manifest validates, carries the seeded author/publication/category/
  tag/content/media/event/timeline records, embeds the media bytes
  (base64) with matching checksum, and contains no secret-bearing keys.
- Documented CLI exports the encrypted archive (exit 0, record count
  matches the HTTP export, file mode 0600) and refuses a malformed key
  before touching the database.
- Import dry-run reports the full plan and leaves the clean target
  byte-identical to its baseline (a fresh site legitimately carries an
  auto-provisioned publication; the proof is "unchanged", not "empty").
- Import `--apply`: 11/11 records, no failed rows, no validation
  errors. **Export-vs-export equivalence**: re-exporting the target
  reproduces every source record with an identical normalized checksum
  per collection (ids normalized to REF, array-row ids to ROW,
  `publicModifiedAt` excluded as a server re-stamp, media
  storageLocation normalized; publications compared as a sub-multiset
  because the target also carries its own provisioned publication).
  Imported media bytes hash-identical under the target site.
- Re-import with `--resume` and the run checkpoint: every record
  skipped, zero created, counts unchanged. (Idempotency is
  checkpoint-based by design; see bounds.)
- Negatives: a tampered archive (one flipped ciphertext character) and
  a wrong-key import are rejected before any write, target unchanged;
  an archive carrying another site's record is rejected whole by the
  tenant-boundary assertion; a same-ID row owned by another site fails
  its row (exit 1, `belongs to another site`) and is never overwritten;
  `createPortableManifest` refuses a secret-bearing record.
- Restart (4/4, after a real web + PostgreSQL restart): source export
  still serves the seeded records; imported records and media bytes
  persist intact in the target.
- Canary sweep: neither archive key, the wrong key, the AI canary, nor
  the payload secret appears in any HTTP response or CLI output.

## Provider conformance (`provider-matrix.json`)

- **ai.ollama** (4/4, local protocol harness): discovery, completion
  with token counts, harness observed the probes, outage fails
  truthfully. **ai.openai-compatible** (2/2, error contracts only): the
  adapter requires HTTPS, so plain-HTTP loopback is rejected and an
  unreachable HTTPS endpoint fails with a normalized error — no live
  completion is claimed or fabricatable locally.
- **social.bluesky** (4/4, loopback XRPC harness): publish, idempotent
  replay creating no second record, missing/rejected credentials fail
  as `reconnect-required`. **social.mastodon+discord** (3/3, loopback
  capture server; both published; Discord after fix 6 above).
  **social.capability-truth** (2/2): all registered networks report a
  mode and the truth view never upgrades an adapter's own declaration.
- **commerce.deterministic-test** (6/6): readiness, hosted checkout in
  `action-required`, idempotent replay to the same reference, state
  transition retrievable, signed webhook normalizes / wrongly signed
  rejected, missing secret reports `missing-secret`. No live charge.
- **commerce.pod** (9/9): emulator health/catalog/file-validation/
  upload/preflight/estimate, idempotent order creation, P.O. Box
  rejection as a normalized provider error; the simulator refuses
  construction without explicit loopback enablement, and the real
  Printful adapter refuses construction without an API token. No real
  POD outcome is claimed.
- **email.development-sink** (4/4): the capture adapter retains the
  exact envelope, a simulated bounce is reported not hidden, the
  disabled adapter refuses truthfully, and `EMAIL_MODE=disabled`
  selects it. Local sink only; no SMTP/remote delivery claimed.
- **extensions.reference-adapters** (6/6, `shipping: false` in the
  matrix): contract test activates capabilities, the registry exposes
  capabilities only from active unexpired connections, a failed test
  marks the connection invalid with the secret redacted, the email
  reference adapter executes only into the development sink, an
  out-of-contract capability is refused, diagnostic redaction strips
  credential material. A source scan in the journey proves no file
  outside `src/modules/extensions/` references these developer
  reference adapters — they are not shipping transports and are not
  presented as such.
- **extensions.lifecycle** (6/6): untrusted install refused,
  core-incompatible manifest rejected at discovery, an ungranted
  permission (`payments.refund`) blocks install, the in-tree example
  extension installs/enables/reports healthy, and uninstall under the
  `export` policy requires a completed export first. The lifecycle
  service is a library boundary in RC1: no route or UI loads extension
  code and discovery never downloads packages.
- **import.adapters** (6/6 framework + source inspection): framework
  dry-run completes zero records and reports unmapped fields; apply
  completes all records with deterministic ids stable across runs;
  legacy-URL redirects derive from record pairs; unknown adapter keys
  are rejected; marketing enrollment is forbidden by plan validation;
  identity-review mappings block a non-dry run. Per-adapter truth:
  only `wordpress-export` has a dedicated source parser
  (`src/modules/portability/legacy-migration`, proven in earlier
  passes and not re-executed here); the remaining
  `implemented-contract` adapters run through this framework on
  pre-parsed `SourceRecord`s, and `requires-source-fixture` adapters
  are not executable imports in RC1.
- Carried from 16A (not re-executed): Connections Center disconnect
  purges credentials (AI envelopes deleted, POD key tombstoned) — see
  the 16A evidence.

## Automated proof

- Focused unit suites: `portability-workflow` (5 tests, incl. the 2
  new ordering/retry tests), `portability-contracts`,
  `rc1-03d-portability` — 19/19 passed. Social provider suites
  (`rc1-08a-social-providers`, `rc1-13b-provider-truth`) — 29/29
  passed after the Discord change.
- Full unit suite: 2020 passed / 5 failed (2025 total) — the same 5
  failures verified pre-existing at base (`flow-04-acceptance`,
  `payload-domains`, `rc1-04d-campaign-commerce`,
  `shop-08-command-center-boundaries` ×2); the +2 over 16B's 2018
  passed are this subpass's new workflow tests.
- Harness typecheck (`tsc -p tests/rc1-16c/tsconfig.json`), ESLint
  `--max-warnings=0`, and Prettier are clean on all touched files.
  `next-env.d.ts` / `tsconfig.json` (regenerated by next dev for the
  harness dist dir) were reverted before the provenance freeze.

## Bounds — what this does NOT prove

- No real-world provider outcome of any kind: no live AI completion
  (OpenAI-compatible is HTTPS-only by design), no live social post, no
  SMTP delivery, no Stripe charge, no real Printful/Printify order.
  Every success above is a local harness, emulator, deterministic
  adapter, or development sink, and the matrix says so per row.
- Idempotency across import runs is the checkpoint/`--resume`
  mechanism, as designed. A plain re-import without the checkpoint
  re-attempts creation and fails rows on unique constraints (reported,
  exit 1); it is not a silent-corruption path for the collections
  proven here, but it is not a no-op either, and no such claim is made.
- Import coverage is proven on the fixture's collections (sites,
  authors, publications, categories, tags, content,
  article-family-content, revision-records, events, timelines,
  media-assets). Other portable collections share the same store code
  path but were not individually exercised end-to-end here.
- PostgreSQL 16.15 here vs CI's PostgreSQL 17 — recorded, as in
  16A/16B; no PG17-specific behavior is exercised.
- Fixture passkey sessions only; no genuine passkey ceremony.
- `verify:release` was not run (Pass 18 scope).
