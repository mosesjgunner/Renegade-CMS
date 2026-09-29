# Admin release handoff — 2026-09-29

## Release decision

**Status: BLOCKED — no release candidate is established.** There is no exact immutable SHA that can truthfully be described as having passed Prompt 6. The latest Prompt 6 Chromium attempt failed, and the worktree is dirty. Its base `HEAD` is `8ea0e248412252b230d1b3a5b76d6791798c449d`; that commit does not identify the tested changes and is not a candidate SHA. Do not deploy or promote it.

This is a synthesis of the functionality work tree, Prompt 5/5B, ADMIN-00 route/role evidence, and the recorded browser attempt. No broad application gate was rerun.

## Candidate identity and configuration

| Field | Recorded value | Status |
| --- | --- | --- |
| Candidate SHA | None | UNPROVEN; only current Git reference is dirty base `8ea0e248412252b230d1b3a5b76d6791798c449d` |
| Prompt 5 / 5B profile | Standard local; no database reset; no `LOCAL_E2E_TEST_MODE` | Evidence-only, dirty tree |
| Prompt 6 attempted profile | Isolated DB and `MEDIA_DIR`; port `3113`; `LOCAL_E2E_TEST_MODE=true`; `RENEGADE_MODULES=all`; `RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=true`; Playwright 1.62.1 default Chromium; fixture-created owner | Failed before full route/role suite |
| Ordinary operator profile | `node .next/standalone/server.js`; preserve configured DB; omit `LOCAL_E2E_TEST_MODE` | Required future release proof; not rerun |
| Provider classes used | fixture and local only | No sandbox or live operation evidenced |

Reproduction requires a new isolated Prompt 6 DB/media directory and the attempted profile above. A distributable candidate requires committing intended content, confirming a clean tree at that SHA, and rerunning the affected gates.

## Capability ledger

| Capability | State | Evidence / provider label | Release limit |
| --- | --- | --- | --- |
| Admin navigation and route guards | PARTIAL | Prompt 5 focused tests/lint; fixture/local | No live owner/administrator/staff browser matrix |
| Publishing / Pages | FAIL | Prompt 6 Chromium fixture/local; slug redirect passed | `/admin/pages` did not render expected heading |
| Media Library | PARTIAL | Standard-profile composed route; local | Upload/create/save/reload unproven on current candidate |
| Workflow / releases | PARTIAL / BLOCKED | Prompt 5 contracts; fixture | No normal UI lifecycle; no frozen candidate |
| Audience | PARTIAL | Prompt 5 contracts; fixture | No consent/campaign browser flow; seeded demo data is not operations evidence |
| Community | PARTIAL | Prompt 5B contracts; fixture | Cross-site browser/HTTP, restart, restore unproven |
| Commerce | PARTIAL | Prompt 5B and deterministic checkout; local | Normal-surface, webhook/restart, configured provider proof absent |
| Fulfillment | PARTIAL | Prompt 5B modeled contracts; fixture | No provider/manufacture/carrier/restart/restore proof |
| Social distribution | DEFERRED | Preview/adapter contracts; fixture | OAuth, persistence, delivery, federation deferred |
| Analytics | PARTIAL | Prompt 5B contracts; fixture | Browser consent/reporting and reconciliation absent |
| Providers / AI | PARTIAL | Inventory and proposal governance; fixture/local | No configured-provider/browser apply proof |
| Migration / settings / users-security | PARTIAL | Prompt 5 focused checks; fixture | No candidate migration rehearsal, authenticated saves, or live passkeys |
| Backup, restore, authentic customer upgrade | BLOCKED / UNPROVEN | No current candidate evidence | No full DB+media isolated restore or authentic upgrade artifact |

Provider labels: **fixture** means seeded/mocked records; **local** means deterministic loopback/emulator/storage; **sandbox** means configured external test account (none); **live** means production external provider (none). Local checkout is neither sandbox nor live settlement proof.

## Route and role/permission matrices

[`admin-route-matrix.md`](../../admin-route-matrix.md) is the canonical declared route list. Current release evidence is focused policy/route coverage, not browser acceptance.

| Route group | Declared access | Evidence state |
| --- | --- | --- |
| `/admin`, posts, pages, media, navigation, discovery, workflow, releases, audience, community, commerce, fulfillment, social, security, providers, AI | owner, administrator, staff; staff site-scoped | PARTIAL; Pages is the first current browser failure |
| `/admin/telemetry`, `/admin/capabilities` | owner | PARTIAL; policy evidence only |
| `/admin/migration` | owner, administrator | PARTIAL; policy evidence only |
| Unmounted record/global entries | no route; visible `aria-disabled` text | VERIFIED only as noninteractive treatment |

| Persona | Declared permission | Evidence state |
| --- | --- | --- |
| Owner | All supported areas; owner-only telemetry/Capability Center | PARTIAL: focused tests, no current browser session |
| Administrator | Supported areas and migration; excludes owner-only areas | PARTIAL: focused tests, no current browser session |
| Staff with `adminSites` | Site-scoped supported operations; no maintenance/owner-only areas | PARTIAL: focused tests, no current browser session |
| Anonymous, member, unsupported role | Denied/redirected | PARTIAL: focused tests, no current browser session |
| Publisher, editor, moderator, commerce | Not staff login roles | N/A |

## Browser evidence index

| Evidence | Candidate relation | Result / boundary |
| --- | --- | --- |
| `test-results/editorial-admin-workflow-P-f1263-to-public-editorial-journey-chromium/trace.zip` and `error-context.md` | Dirty base `8ea0e248…`; Prompt 6 | FAIL at `tests/browser/editorial-admin-workflow.spec.ts:66`; media, workflow, logout/re-login, navigation, administrator, and staff checks did not run |
| `docs/stabilization/media-library-2026-09-28.md` | Dirty base `8ea0e248…` | PARTIAL composed-route/load evidence, not write acceptance |
| `docs/execution/admin-operator-proof.md` | Different dirty base `6d2435bd…` | Historical only; cannot transfer to current candidate |
| `docs/execution/admin-00-role-route-evidence.md` | Earlier focused evidence | PARTIAL; not browser-role proof |

## First failing gate and limitations

**First failing gate:** Prompt 6 editorial Chromium journey at `/admin/pages`, `tests/browser/editorial-admin-workflow.spec.ts:66`; expected Pages heading did not render. The smallest repair target is the mounted Pages surface or route registration. This handoff makes no repair.

Release blockers: no immutable clean candidate; incomplete role/browser matrix; no current normal-surface write/save/reload coverage; no configured sandbox/live provider proof; no worker restart/reconciliation proof; no successful full DB+media isolated restore; and no authentic prior-customer-release upgrade proof. Static inspection, unit tests, compilation, and healthy containers do not close these gates.

## Handoff conclusion

The release status is evidence-backed and internally consistent with the functionality work tree, but it is **not tied to a clean immutable candidate SHA**. The admin release remains **BLOCKED**.
