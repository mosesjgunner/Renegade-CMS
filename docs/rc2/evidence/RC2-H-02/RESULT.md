# RC2-H-02 — Full interactive role and two-site boundary proof: RESULT

**Verdict: PASS.** The boundary matrix ran over HTTP against the live
server on a fresh A-04 world (suffix `cb5140e7`): **32 boundary cells
hold, 0 breaches, 7 standing/settings cells measured** against the
decided rules. One new tenant-boundary defect was found in an export
path and **fixed in this PR** with a fail-on-old-code regression test.
Two known P1s were re-measured exactly as filed. The member-standing
enforcement gap was measured, not passed over.

Branch off main `3075450` (post-PR #69). Harness:
`tests/rc2-h02/setup.spec.ts` (world + every actor session) and
`tests/rc2-h02/matrix.mjs` (the matrix; run 3 is canonical —
`h02-matrix-run3.log`). Actors: global owner, site admin, site editor,
site member, subscriber, a fresh self-signup member, the other site's
admin as the denied principal, and anonymous.

## The rule under test, stated before running (per the staging brief)

Member standing is **decided: model C** — one identity, per-site
standing (joining a site creates the `member_site_roles` row; each
site's admin controls its own members, moderation, bans). The
provisioning fix (join-creates-standing) has **not landed** — it is a
design (`rc2-debt19-fix-design-2026-11-12.md`) owned by RC3 community /
H-03. H-02 therefore measures the standing cells against C and records
today's behavior as the measured state; it does not pass C on the
strength of the design doc, and it does not flip any gate.

## Boundary matrix — all hold

- **Content (Payload REST):** site admin lists own site (200, all docs
  own-site) and sees zero of the other site's; the denied principal
  cannot read (404), edit (403) or delete (403) site A's draft; the
  editor reads, creates (201) and submits; cross-site create by site
  A's admin naming site B is refused (403); admin deletes own site's
  content (200).
- **Editorial workflow:** editor submits own draft (200); the editor
  cannot approve their own submission (403, self-approval forbidden);
  the site admin approves (200).
- **Media:** editor uploads (201); the denied principal's upload is
  refused (403).
- **Active-site switching:** admin's switch to the other site is
  refused (403) **and the active site afterwards is still their own**
  — the failed switch remains visibly failed at the state level; a
  forged `renegade-active-site` cookie unlocks nothing (site B list
  still empty); switching to their own site succeeds (200).
- **Campaigns:** creating a campaign against the other site is refused
  (403), while the same call against the own site reaches validation
  (400) — the boundary, not the payload, decides.
- **Moderation:** a joined member's profile report opens a case (201);
  the queue is readable by the site's moderator; a site-global
  suspension blocks the member's comments **and** forum posts (403,
  `MEMBER_POSTING_SUSPENDED`) and reinstatement restores both; a plain
  member cannot moderate (403).
- **Anonymous / public:** anonymous draft read refused (403); the
  anonymous content list returns nothing draft-shaped; site A's public
  search does not surface site B content.

## Finding fixed in this PR — indexing export leaked every site's feed (P1)

`GET /api/admin/indexing/export` required a staff login but **no site
scope**: it returned the `discovery.indexing.changed` feed for _all_
sites to any staff account. Measured live before the fix: a Site B
administrator received 20 changes spanning 10 sites — content URLs,
actions and states — including sites they have no authority over.
Read-only metadata (no content bodies, no secrets, no writes), classed
P1 tenant-boundary, fixed here because H-02 is the boundary prompt and
the fix follows the codebase's own pattern:

- The route now resolves a granted site via `resolveRedirectSite`
  (the same helper the sibling redirects export already uses) and
  returns 403 when the caller has no grant on the resolved site; the
  change list is filtered to that site. Response shape unchanged.
- Regression: `tests/integration/indexing-export-site-scope.integration.test.ts`
  — 5 tests (anonymous refused; own-site admin sees only own changes;
  naming another tenant's site is 403; a foreign admin asking for
  site A is refused; no-parameter resolves to the caller's own site).
  **4 of 5 fail on the pre-fix code** (the anonymous case already
  passed), 5 of 5 pass fixed.
- The other export surfaces were checked: redirects export already
  resolves a granted site; calendar export is the public events feed
  generator, a different surface by design.

## Standing cells — measured against model C

| Cell                                              | C target           | Measured                         |
| ------------------------------------------------- | ------------------ | -------------------------------- |
| Member with standing on A comments/posts on A     | allowed            | 201 ✔                           |
| Same member comments on B (never joined)          | refused            | **201 — gate not enforced**      |
| Same member posts in B's forum (never joined)     | refused            | **201 — gate not enforced**      |
| Fresh member (no standing anywhere) comments on A | refused until join | **201 — gate not enforced**      |
| Report joined member's profile on A               | case opens         | 201 ✔                           |
| Report fresh member's profile on A                | case opens         | **404 — RC2-DEBT-19, unchanged** |
| Report member A's profile on B (never joined)     | refused            | 404 ✔ (correct under C)         |
| Site A suspension reaching site B                 | must not           | B posting unaffected ✔          |

The posting-gate gap is the known enforcement half of model C: the
DEBT-19 fix design assigns the provisioning fix (which makes members
reportable) and leaves gate enforcement to be built with it — owned by
RC3 community / H-03, recorded here as measured, not as a pass. Where
standing rows exist, per-site scope already behaves as C requires
(reportability and suspension are correctly per-site).

## Known P1s re-measured

- **RC2-DEBT-16 (site settings unwritable in multi-site):** save as
  site admin → 403; save as global owner → 403. Unchanged, not
  softened to single-site.
- **RC2-DEBT-19:** fresh member not reportable (404) — see table.

## New debt filed

- **RC2-DEBT-24 (P2):** the moderation route defaults an omitted
  `scope` to `'object'`, so a `suspend_posting`/`ban_member` submitted
  without scope returns success while recording a sanction that does
  not restrict site-wide posting — and the response never echoes the
  applied scope. Measured: scope-less suspend → member kept posting
  (201/201); the identical action with `scope: 'site_global'` → 403
  on both surfaces. The product UI path sends scope explicitly (the
  E-02 proof); the trap is for API callers and future UI regressions.

## Tested vs unavailable cells

- **Commerce deep cells** (cross-site capability initiate): not
  re-run; F-03's proof stands (cross-site capability initiate → 403,
  PR #65) on the same fixture family.
- **Quality / calendar dedicated surfaces:** covered at the mechanism
  level by the REST scoping cells above (list/read/write follow the
  same grant machinery) plus their family proofs (C-03, D-01); no
  separate per-surface role matrix was run.
- **Browser click-paths:** the matrix ran over HTTP with real session
  cookies against the live server; the one user-visible assertion in
  scope (a failed site switch remains visibly failed) was proven at
  the state level — after refusal, the active site is unchanged.
- **Worker/cache negative paths:** no new boundary was discovered
  that implicates them; the jobs worker was running for the
  moderation legs and no cross-site effect was observed. H-05 owns
  job/webhook failure injection.

## Notes on method (harness traps, for the next runner)

- Staff mutations must send `Origin: http://127.0.0.1:39071` verbatim
  (the served `APP_URL`); `localhost` does not string-match and every
  mutation 403s at the proxy gate, which looks exactly like a grant
  refusal. Matrix runs 1–2 differ from run 3 only by harness fixes of
  this kind (plus the moderation `scope` field and the media form's
  required `siteId`/`title`/`altText` fields); no product behavior
  changed between runs except the export fix, which is test-proven
  in-process rather than re-probed live (the live re-proof rides the
  next production build).
