# RC2-B-01 — Publishing journey on the two-site fixture — RESULT

**Verdict: PASS.** The ordinary publishing journey works end to end on the
A-04 two-site world: an editor authors an article in the real editor UI,
the editorial workflow carries it through review and approval, a publisher
publishes it, anonymous readers on the correct site read it at its
canonical URL, a revision propagates, and unpublish/restore behave. Every
negative the prompt names was exercised and held.

- Tested HEAD: `64d1ec5` (main; merge of PR #48, RC2-A-04). Zero
  production code changed by this prompt.
- Served as a production build (`LOCAL_E2E_TEST_MODE=true`, loopback),
  `RENEGADE_MODULES=all`, database `b01_release_acceptance` (PostgreSQL
  16, local), world suffix `00695e59` (sites `a.rc2-a04.test` /
  `b.rc2-a04.test`).
- Executable journey: `tests/rc2-b01/journey.mjs` (Playwright, headless
  Chromium) seeded by `tests/rc2-b01/seed-world.spec.ts`, which builds the
  A-04 world through `tests/fixtures/rc2-world.ts` and leaves it in place.
- Green run: 2026-11-11, **23/23 stages PASS**, exit code 0. Seven
  screenshots captured (create form, saved-revision preview, published
  editor state, public article, Site-B 404, revised public article,
  denied editor). Screenshots are binary and the delivery path for this
  repo is text-only, so they are retained with the run artifacts rather
  than committed; stage results below are the committed record.

## Stage results (green run)

| #   | Stage                                                            | Result |
| --- | ---------------------------------------------------------------- | ------ |
| 1   | Create form accepts taxonomy + media reference                   | PASS   |
| 2   | Save creates the article and lands on its edit page              | PASS   |
| 3   | Reload shows the saved title and body                            | PASS   |
| 4   | Direct status write to review is refused (review queue guard)    | PASS   |
| 5   | Editor submits via the editorial workflow -> status review       | PASS   |
| 6   | Preview is reachable from the editor (Discovery panel)           | PASS   |
| 7   | Preview shows the saved revision                                 | PASS   |
| 8   | Preview does NOT show unsaved edits (and the panel warns)        | PASS   |
| 9   | Staff direct publish is refused (publisher permission guard)     | PASS   |
| 10  | Cross-site principal cannot act on the article via the workflow  | PASS   |
| 11  | Publisher approves via the editorial workflow -> status approved | PASS   |
| 12  | Publisher publishes the approved article (direct write)          | PASS   |
| 13  | Anonymous reader sees the published article at its canonical URL | PASS   |
| 14  | No Site A material on Site B (404)                               | PASS   |
| 15  | Draft article does not leak anonymously                          | PASS   |
| 16  | Missing article is a clean 404                                   | PASS   |
| 17  | Revision persists after reload in the editor                     | PASS   |
| 18  | Revision/audit identity advances with the revision               | PASS   |
| 19  | Revision propagates to the public page                           | PASS   |
| 20  | Publisher unpublishes (direct write back to draft)               | PASS   |
| 21  | Unpublish removes the article from the public site               | PASS   |
| 22  | Restore republishes the article                                  | PASS   |
| 23  | Denied principal cannot open Site A article in the editor        | PASS   |

Canonical URL verified: `/articles/<slug>` on Site A's host returns 200
with title and body; the same path on Site B's host returns 404.

## Findings

**F1 — The lifecycle is workflow-routed by design, and the guards hold.**
The document form's status field is not the publishing path. A direct
write toward `review`/`approved`/`rejected` is refused 403 ("Use the
editorial review queue to submit or decide a review.",
`src/modules/editorial/review-write-guard.ts`), and a `staff`-role user
writing `published` directly is refused 403 ("Publisher permission is
required."). The working path, exercised here: editor `submit` via
`POST /api/admin/workflow/actions` -> `review`; publisher `approve` ->
`approved`; publisher publishes (direct write permitted for
owner/administrator roles). Body edits on a document in review/approved
revert it to draft per the same guard (observed in code; the journey's
revision was made on the published document and persisted normally).
Root-cause class: none — intended architecture, initially misread by the
harness as failure; stages 4 and 9 now assert the guards directly.

**F2 — The approval quality gate is real and blocks on missing alt text.**
Approving an article whose hero media had no alt text failed 422:
"Cannot approve item with 1 blocking quality issues without an explicit
quality waiver authorization." The blocking rule is `media-alt-text`
(`src/modules/quality/contracts.ts`, severity `publication_blocking`;
the built-in workflow template carries the `zero-blocking-issues` gate).
The A-04 world builder creates its shared media without alt text, so the
B-01 seed now sets meaningful alt text on the world asset at seed time
(fixture setup only; the gate itself was left fully in force and is the
reason earlier journey runs could not approve). Root-cause class:
fixture gap surfaced by a correctly working product gate.

**F3 — (P2, friction) A fresh author document lock delays approval by up
to ~5 minutes.** Workflow actions refuse while another editor's document
lock is fresher than 300,000 ms ("Content is locked by another editor.
Wait for release before changing its workflow.",
`src/modules/editorial/cmos-persistence.ts`). The lock row's `updatedAt`
is refreshed by the edit view while the author has the document open;
after the author leaves, approval succeeds only once the lock ages past
the window. In the green run the publisher's approval was refused 14
times over ~280 s before succeeding — the error message is honest and
the behavior is a defensible anti-collision design, but in a newsroom
the practical effect is "the publisher waits up to five minutes after
the writer closes the article." Recorded as friction, not a defect;
candidate polish (queue UI surfaces lock age / holder) is filed to the
RC3 idea pile below. No code change in this prompt.

**F4 — Preview truthfulness is a designed feature and it works.** The
editor's Discovery panel mints previews bound to the _saved_ revision
(`POST /api/admin/content/preview` -> `/preview/article/<token>`,
30-minute expiry, creator-session-bound). After an unsaved title edit,
the existing preview still rendered the saved revision and the panel
showed the explicit warning "you have unsaved edits since this preview
was created." Stage 8 asserts both halves.

**F5 — Harness/environment notes (not product findings).** (a) The
sandbox egress proxy intercepts public-looking hostnames, so local
multi-host browser proofs must add the fixture hosts to `NO_PROXY` and
resolve them via Chromium host-resolver rules (the sandbox DNS resolves
any name to a sinkhole address); the journey runner sets this up itself.
(b) The execution VM was replaced mid-run (server, database and world
manifest lost; the production build under `~/workspace` survived). The
environment was rebuilt (PostgreSQL reinstall, re-migration, re-seed)
and the green run above is against the rebuilt world; earlier partial
runs (2/11 -> 19/23 across iterations) were harness iteration and the
product findings F1–F3 disentangled from them, not product failures.

## Not run, with reasons

- **Embargo / scheduled publication:** draft leakage is covered (stage
  15); a future-dated scheduled-publication case was not staged.
  Scheduling flows through the calendar/schedule surface rather than the
  article lifecycle exercised here; carried as a named gap for the
  D-family workflow journey.
- **Redirect behavior:** canonical URL and clean-404 behavior verified;
  no redirect was created in this journey, so redirect following is
  unverified here (database-managed redirects were mapped in RC2-A-03).

## RC3 idea pile (recorded, not chased)

- Reader-facing "this page was updated" bar with refresh, and an instant
  draft-preview overlay pattern (from the Mishka CMS 0.0.2 read,
  2026-11-11) — candidates for the presentation family.
- Review-queue UI: show document-lock holder and lock age when an action
  is refused for a fresh lock (from F3).
- Shopify Canvas steal list (context-scoped AI prompt bar, whole-site
  board view, cross-page block copy/paste, layout version history,
  publish review dialog) — filed with the RC2-B-02 brief.

## Family ledger update

`docs/rc2/RC2-12-FAMILY-JOURNEYS.md` created by this prompt: Publishing &
Content Management records this journey as its E2 proof. Next prompt:
**RC2-B-02**.
