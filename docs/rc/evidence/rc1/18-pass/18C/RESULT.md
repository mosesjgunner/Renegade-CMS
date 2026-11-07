# RC1 18C - PASS (2026-11-07)

**18C only.** The exact [canonical A-T definition](../../stage-01/golden-journey.txt) governed execution. RC1 remains NOT READY: 18B still records 292 integration passes / 14 failures, and other release gates are not closed here. No next subpass was executed.

## Candidate and changes

Base commit `7e8abe4368b3c26d25237bae9a0a2cfeb13d7974`, plus the [dirty tree](dirty-tree.json); no new commit. [Executable manifest](final-golden/source.json): 1,046 files, SHA-256 `0e78fc115db5167992eb467b168d7cb58fbaa14e2f3d786e583c8fa85df8094e`. Production image `renegade-cms:rc118c-batch-shipping-20261107`, `sha256:68152a598fd0d46e6ce641292e5bd2da3b9695b2eb4e020e44f75d7b8ecb9f89`. [Image containment](final-golden/image-source-containment.json) verifies 971 shipped source/configuration files byte-for-byte, production mode, disabled test authentication and the non-root runtime user. The image's commit label alone does not identify the uncommitted repairs.

Seven runtime/configuration paths changed:

- `src/app/(frontend)/api/admin/discovery/audit/route.ts`: authorize the selected site before fetching or persisting findings; scope default-site lookup through native access. The reproduced foreign-site request created a scan; repaired staff requests return 403 without changing the scan count.
- `src/modules/network/local-peer.ts`, `safe-fetch.ts`, `tasks.ts`: explicit HTTPS numeric-loopback peer origins for isolated federation. Exact origin/port only; DNS names, LAN/metadata addresses, URL credentials and redirects remain rejected.
- `src/scripts/run-jobs-worker.ts`: restrict runners to registered tasks/workflows so disabled-module jobs survive re-enable; process a bounded serial operations batch of ten so housekeeping cannot starve actual intake.
- `compose.production.yaml`, `.env.production.example`: forward/document the production encryption key needed by encrypted social connections and document optional local-peer configuration.

Added two focused unit files (21 cases) and `tests/rc1-18c/` browser/operator, peer, profile, recovery and evidence tools. No schema, collection, migration or generated-type changes. Preexisting 18B RESULT/NEXT and ledger edits were preserved.

## Ordinary journey and persistence

Final canonical evidence is **final-golden**, project `rc118cgolden20261107`: fresh PostgreSQL 17.6 and media volumes, production boot, 131 migrations, `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`. Business state was created through browser UI, native REST and supported action/operator boundaries. Journey SQL is read-only. Owner, staff and administrator use browser WebAuthn registration/authentication with Chromium CTAP2 virtual authenticators; physical-key interoperability is unclaimed. Server fetches explicitly trust the isolated HTTPS CA.

| Steps | Executed action -> persisted state -> observed output |
| --- | --- |
| A-D | Supported one-time token handoff, setup UI passkey enrollment and admin entry; zero users/sites become one owner/passkey/site. Invalid token denied without writes. Invited staff/admin separately enroll and authenticate. |
| E-H | Saved identity/theme; published homepage/navigation; real 73,970-byte PNG upload; taxonomy, author, page/article body, media and SEO saved and rendered. |
| I | Real preview, submit, independent staff approval and publication. Anonymous approval and self-approval denied. |
| J-K | Anonymous rendering/metadata/schema, sitemap index and URL set, robots/feed/search, original media; supported slug edit creates durable HTTP 308 redirect. HTML/XML/screenshots retained. |
| L | Actual worker executes scheduled publication; public content renders; stale sequence rejected. |
| M | Real subscription reaches local SMTP, confirms to active subscriber and accepted delivery; confirmation replay denied. [Observed mail](final-golden/M-local-email.json). |
| N | Local-email member sign-in, thread/reply, operator moderation and member notification; member moderation denied with unchanged protected state. |
| O | Reviewed product, browser cart, authoritative quote, explicit local-test confirmation, signed event and worker produce one paid test order; forged pricing and another guest's status access denied. |
| P | Actual health, telemetry, finance and provider truth inspected; unavailable remote providers remain unconfigured. |
| Q | Web/worker restart preserves one order, social post, delivered federation response and completed release, two triaged forms and two discussion posts. Scheduled content remains published, subscription delivery accepted, confirmation mail unduplicated. |
| R | Logout and entirely new cookie-free browser context authenticate through passkey UI. Supported local owner recovery rotates codes, returns through recovery UI and denies replay. |
| S | Literal shipped maintenance-window backup and isolated restore CLIs; independent `rc118cgoldenrestore20261107` database/media/network and fresh database/session secrets. Counts/content hashes match for 31 critical tables. Fresh browser uses the source-enrolled passkey and reads the restored order. [Backup manifest](final-golden/S-backup-manifest.json). |
| T | Restored article, scheduled article and community page render; original media has all 73,970 bytes and SHA-256 `16b989fd2ac7b2bbf09e1befd6abaaf633edfbb9ed1f1d3083e27700a81cc7d6`. |

Additional enabled-module actions prove events/ICS, article bibliography, book/chapter publication, canonical collaboration checkpoint/stale rejection, form UI -> CRM contact/task intake, machine credential issue/rotate/revoke, consented analytics exposure/conversion and replay protection, human winner/rollback, coordinated release execution and rendered quality scans. The independent peer verifies an actual signed ActivityPub Accept; invalid signature/repeated Follow do not duplicate effects. Bad local Bluesky credentials persist revoked/unavailable; corrected credentials recover the same account, then an approved draft reaches the adapter once. Foreign-site and anonymous connections are denied. These are local peer/adapter/sink outcomes; remote sandbox and real-world outcomes are unexecuted and unclaimed.

## Profiles, negatives and restart

[final-batch](final-batch/evidence-manifest.json) supplies 26 selected profile checkpoints on the same frozen image. Its repeated Standard/all main run is not counted as the final canonical proof. Runtime registration snapshots and individual command exits are retained there.

| Configuration | Collections / lockable | Actual acceptance |
| --- | --- | --- |
| Lean/default | 67 / 46 | Draft -> separate review -> public output; self/anonymous/foreign-site denials; optional native collections 404 and commerce/community 503; stored optional records retained. |
| Standard/default | 67 / 46 | Same core actions/output and denied-role/site/module checks. |
| Lean/all | 207 / 46 | Core and applicable enabled-module actions, including SMTP, member moderation/notification and fresh local checkout. Production Lean federation policy remains disabled, actor endpoint 404; successful local federation belongs to Standard/all. |
| Standard/all | 207 / 46 | Profile core negatives and complete final-golden ordinary/module journey including signed local federation. |

Worker regression: two historical unknown-task failures in an older owned disposable database stay two while a real optional job remains queued under Lean/default; that same job completes after re-enable. No status rows were edited. Final source and restored databases each have **zero unknown-task failures**. Restore without authorization/isolation, against production Compose, or against the running populated target is refused; protected content/order hashes remain equal.

## Commands, counts and evidence

[commands.json](commands.json) records exact commands, exits and validation logs. [acceptance.json](acceptance.json) selects current checkpoints and persistence assertions. Production build, relevant format check, full lint, typecheck and production dependency check exit 0. `npm.cmd test`: **284 files / 2,103 passed / 0 failed / 0 skipped**, including 21 new focused cases. Final browser checkpoints: **68 passed / 0 failed / 0 skipped / 0 unexecuted** within 18C. Restore guards: **3 passed**. Disabled-job/re-enable regression: **1 passed**. Full integration, upgrade and aggregate release acceptance are not passed by this receipt.

One profile harness attempt supplied an uppercase book slug; the correct HTTP 400 and failed receipt are retained beside the corrected passing run. Other earlier parser/encoding/namespace/configuration diagnostics do not establish final proof. No selected acceptance failure remains. Worker logs retain the existing nonfatal out-of-request `revalidatePath` warning; scheduled/released public output was fetched successfully.

Complete raw browser traces, including raster frames, remain private in ignored scratch directories: 137 context traces across the final lanes, with exact paths/hashes in their manifests. Review ZIPs redact credentials and omit raster trace frames; masked screenshots accompany checks and public views. Complete final-golden server/worker/migration/database/proxy/peer logs, profile logs, public HTML/XML/mail/ICS and persistence hashes are retained. [Safety scan](evidence-safety.json) checks exported entries against private values/JWT patterns. Owned disposable containers are stopped; volumes, backups and images are retained. No push, tag, publication, deployment or next subpass.

## Historical containment

Root November 5 artifacts belong to initial image `9ae0c239...` at the base commit; `final/` belongs to partial image `1bf5267c...` and its source manifest; `final-worker/` belongs to `8ccd206d...` and its manifest. Current canonical proof uses final-golden and profile proof final-batch, both image `68152a59...` / executable manifest `0e78fc11...`. Original initial RESULT/NEXT are retained privately with hashes in acceptance.json. The initial partial RESULT follows, superseded by this dated result.

---

# RC1 18C — NOT READY (2026-11-05)

Source commit `7e8abe4368b3c26d25237bae9a0a2cfeb13d7974`. Before this pass the only tracked modifications were the 18B RESULT, NEXT and cumulative ledger; all are documentation and `docs` is excluded by `.dockerignore`. No product changes or commit. Image `sha256:9ae0c239a879a5841ab960817a786dcd33d4900e3afaee64d0eda2025c469598`, tag `renegade-cms:rc118c-20261105`, built from that source with `BUILD_SHA` set to the full commit. Image build internally regenerates Next type configuration. The 18B integration gate is independently NOT READY: 292 passed, 14 failed, 0 skipped on the same commit; see [18B](../18B/RESULT.md).

## Executed

- `docker build --target runner --build-arg BUILD_SHA=7e8abe4368b3c26d25237bae9a0a2cfeb13d7974 --iidfile docs/rc/evidence/rc1/18-pass/18C/image-id.txt -t renegade-cms:rc118c-20261105 .` exit 0; [build log](build.log).
- Standard/default project `rc118c20261105`: `docker compose -p rc118c20261105 -f compose.production.yaml -f compose.network.yaml up -d --no-build --wait --wait-timeout 240` exit 0 with new project volumes, subnet `10.204.122.0/24`, bind `127.0.0.1:3218`, production mode, `LOCAL_E2E_TEST_MODE=false`, `ENABLE_TEST_ROUTES=false`, and unique generated secrets. [boot log](boot.log). `/health/ready` HTTP 200, database OK, migrations applied; PostgreSQL query returned 131 migration rows. Worker health exit 0. Canonical A is partially exercised as boot, not complete installer acceptance.
- Web log contained a one-time setup token; its value is intentionally not retained in evidence. Canonical B was observed, but the token was not used to enroll an owner. A standalone Playwright Chromium context visited `/setup` HTTP 200, heading `Make this site yours.`; invalid token POST `/api/setup/options` returned 400 and `The bootstrap token is invalid.` [Screenshot](setup.png), [trace](setup-trace.zip). After the denial, queries returned zero users and zero sites; a before-state query was not recorded. Browser run exit 0, one positive page and one invalid-token check; no passkey claim.
- `docker restart rc118c20261105-renegade-web-1 rc118c20261105-renegade-worker-1` exit 0; readiness returned 200 and migration count remained 131; worker health exit 0. This is infrastructure restart only, not the required side-effect deduplication proof. `docker stop` for the three owned web, worker and PostgreSQL containers exit 0; volumes and image retained.
- `git diff --check` exit 0 before the final ledger/evidence edits. No focused lint, types, or tests were run in 18C; image build includes Next TypeScript. No automated test suite counts are claimed.

## Remaining acceptance

Canonical C–T are unexecuted: genuine owner/staff passkeys, site building and publication, original media checksum, discovery, local email, community, local checkout, scheduled worker execution, clean-context login, recovery, populated second-environment restore and byte equality. The required Lean/default, Standard/all and Lean/all profile and enabled-module real-action matrices, role/site denials, full browser/network/server evidence and persisted workflow side-effect assertions are unexecuted. No product defect was established by this partial attempt; first missing acceptance is C, owner passkey enrollment, for which an HTTPS browser origin and independent harness remain to be exercised. The stock Playwright configuration enables local test authentication and mutates global setup, so it was not used. This is not a PASS or a completed ordinary workflow.
