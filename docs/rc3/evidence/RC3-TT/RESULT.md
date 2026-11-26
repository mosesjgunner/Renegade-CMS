# RC3-TT — TikTok fake-receipt fix — RESULT

Date: 2026-11-26. Branch `rc3-tiktok-fix` on main `551bd0e` (post-RC3-CE).
Authorized by Matthew, 2026-11-26: "Go — YouTube build + TikTok fix."
Brief: `files/tiktok-fake-receipt-fix-brief-2026-11-26.md` (goal workspace).

## The defect

`TikTokAdapter.publish()` in `src/modules/social/adapters/tiktok.ts`
reported success it never confirmed. After the init call and the binary
chunk upload it immediately returned:

- `status: 'published'`
- `remoteId` = the publish **task** ID (`publish_id`)
- `remoteUrl` = `https://www.tiktok.com/@creator/video/<publish task id>`
  — a literal placeholder username plus a task ID, pointing at no real
  video
- a delivery receipt storing that task ID as the post ID and the
  invented URL as the post's address

The same file already had `checkPublishStatus()` (TikTok's
publish-status endpoint: PROCESSING_DOWNLOAD / PROCESSING_UPLOAD /
SUCCESS / FAILED) — `publish()` never called it.

## The fix (same file, existing machinery, no contract change)

- `publish()` now ends in a receipt gate, `confirmPublish()`: after the
  upload it polls the publish-status endpoint with bounded polls
  (default 5 polls, 2s apart; timing injectable via the adapter
  constructor, mirroring the YouTube adapter's discipline).
- Only a TikTok-confirmed **SUCCESS** returns `published`.
  **FAILED** returns `failed` (kind `validation`) carrying TikTok's own
  `fail_reason` as the provider code and in the message. Still
  processing when the bound runs out returns **`unknown`**
  (kind `remote-unknown`, `remoteOutcome: 'unknown'`) naming the
  publish task ID — never `published`. A transient status-check error
  does not condemn the upload; polling continues within the bound.
- `checkPublishStatus()` now also surfaces `failReason` and the real
  post ID from TikTok's `publicaly_available_post_id` (provider's own
  spelling). A post ID is accepted only as an exact identifier: digit
  strings, or JSON numbers inside the safe-integer range (a longer
  number has already lost precision in parsing and is never turned
  into a URL).
- `remoteUrl` is built only from that real post ID plus the account's
  real handle: `https://www.tiktok.com/@<handle>/video/<post id>`.
  When TikTok confirms SUCCESS but returns no post ID, the result is
  `published` with **no URL and no receipt** rather than an invented
  one. The receipt, when present, stores the real post ID.
- No contract change: the `AdapterResult` union in
  `src/modules/social/contracts.ts` already had published / failed /
  unknown. No new collection, migration, or registration.

## Behavior, before → after

| Situation                            | Before                | After                                          |
| ------------------------------------ | --------------------- | ---------------------------------------------- |
| Upload finishes                      | `published`, fake URL | Poll TikTok's status endpoint                  |
| TikTok confirms SUCCESS with post ID | —                     | `published`, real post ID + real URL + receipt |
| TikTok confirms SUCCESS, no post ID  | —                     | `published`, no URL, no receipt                |
| TikTok reports FAILED                | —                     | `failed` with TikTok's `fail_reason`           |
| Still processing past the bound      | —                     | `unknown`, never published                     |
| Status check errors transiently      | —                     | Keeps polling within the bound, then `unknown` |

## Tests

- New: `tests/unit/social-tiktok-receipt.test.ts` (5 tests) — mocked
  status endpoint through PROCESSING_UPLOAD → SUCCESS, → FAILED with
  reason, never-resolves (exactly the bounded poll count, `unknown`),
  transient status-error tolerance, and SUCCESS-without-post-ID. Every
  scenario asserts the serialized result contains no `@creator` and no
  publish task ID in a video URL.
- Updated deliberately: `tests/unit/dist-04-video-monetized-and-analytics.test.ts`
  — its publish test asserted the fabricated behavior (remoteId =
  publish task ID, URL containing `@creator`, exactly 2 fetch calls).
  It now mocks the status endpoint (PROCESSING_UPLOAD → SUCCESS with a
  real post ID) and asserts the real post ID, the real URL, and 4 fetch
  calls (init + upload + 2 polls). The assertion was changed because
  the behavior it pinned was the defect; it was not weakened — the new
  expectations are stricter.
- No other test asserted the fabricated behavior (grep for `@creator`
  across `src` and `tests` before the fix: only the adapter and that
  one test).

## Gauntlet (final tree, CI order, full logs in `rc3-wave3-logs/rc3tt-*`)

- Fresh migrations: PASS
- Fixture seed: PASS
- Upgrade migrations: PASS (rehearsal 20260914 baseline → current)
- format:check: PASS (after prettier on the edited adapter)
- lint: PASS
- typecheck: PASS
- Unit: **3,016 passed / 0 failed** — main baseline 3,011, delta **+5**,
  exactly the new receipt-gate tests
- Integration: **733 passed / 11 skipped / 0 failed** — delta **0** vs
  the main baseline, as expected (no integration surface changed)
- Production build + smoke: see the delivery report (rig-dependent;
  CI arbitrates)

## Scope held

Only the TikTok adapter's publish path changed. No TikTok Direct Post
audit work (RC4), no inbox-draft (dropped), no other adapter touched,
no contract change, no migration.
