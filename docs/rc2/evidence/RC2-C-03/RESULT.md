# RC2-C-03 — SEO metadata, redirects and site-quality actions

**Verdict: PASS 12/12 journey stages**, with one named NOT VERIFIED
surface (rendered-audit content checks, F1) and one P2 finding. Run
2026-11-12 against the A-04 two-site fixture world (suffix `2f6c3e85`)
served from the production build of `1aae616` (this prompt's merges do
not change production code). Runner: `tests/rc2-c03/journey.mjs`;
fixtures: `tests/rc2-c03/seed-articles.spec.ts` (a fully-described
trace article, a published article with no meta description, a draft
whose only gap is the description, and a draft whose hero image has
no alt text).

## What was proven

**The page as a crawler sees it.** The trace article's rendered head
carries its `<title>`, the seeded meta description verbatim, an
absolute per-site canonical (`https://a.rc2-a04.test/articles/…`
matching the delivered path), Open Graph title/description/url/
site_name/locale, and a parseable JSON-LD block. `/sitemap.xml` is an
index over per-site children: Site A's child lists the article,
Site B's does not. `/robots.txt` serves per site, points at the
sitemap, allows `/`, and disallows only /admin, /api, /preview,
/setup.

**Redirects are a real, safe operator tool.** Creating a rule through
`POST /api/admin/redirects` returns the persisted rule; the public
catch-all fires it as a **301** to the article. A duplicate create is
rejected (unique site+from constraint, exactly one rule survives).
Validation refuses off-site targets ("Redirects must remain on this
site", 400) and self-redirects (400) before persistence; allowed
statuses are 301/302/307/308 and match types exact/prefix/regex.
A Site B principal creating a rule for Site A gets 403, the anonymous
list call gets 403, and the Site A rule does not fire on Site B's
host (404). Both operator surfaces (`/admin/redirects`,
`/admin/rendered-quality`) load for staff.

**Discovery inspection works.** `GET /api/admin/discovery?id=…`
resolves the no-description article with `indexability.indexable =
true`, its canonical URL, and an operator preview — the same document
model the sitemap, feed and search projection consume (C-02).

**Site-quality actions are connected and actionable.** Through the
editorial workflow (the supported operator path):

- a draft missing its meta description is submitted and approved —
  the gate records a `metadata-description` **warning** in the
  document's quality snapshot without blocking (by design: warning
  severity);
- a draft whose hero image lacks alt text is **blocked** at approval
  (HTTP 422, `media-alt-text`, severity `publication_blocking`);
  adding alt text through the media API and re-approving succeeds,
  and the article then publishes and serves publicly with its title.

## Finding F1 (P2) + NOT VERIFIED: the rendered audit can audit nothing and report clean

`POST /api/admin/discovery/audit` executed (200) and persisted a scan
— with **pages: 0, issues: 0, lifecycle totals all zero**, an output
indistinguishable from "audited everything, found nothing".

Root cause, read in code: `runRenderedAudit`
(`src/modules/public/discovery-audit.ts`) keeps only candidate URLs
whose origin equals the audit origin, and its fetcher refuses
cross-origin targets (SSRF discipline), while the route's
`LOCAL_E2E_TEST_MODE` override points the audit origin at `APP_URL`.
Whenever the serving origin and the site's canonical origin differ —
any staging host, proxy, or E2E topology, including this fixture
world (canonical `https://a.rc2-a04.test` vs served
`http://127.0.0.1:39071`) — every document falls out of scope and the
audit checks nothing. In a canonical single-origin production
deployment the origins coincide and the audit can run; **its content
checks (title/description bounds, canonical conflict, indexability
contradiction, DISC-05 family) are therefore NOT VERIFIED in this
environment**, and are named here rather than claimed.

The defect worth fixing is the silence: a zero-scope audit should
report "0 of N documents in scope" as a visible warning state, not a
clean zero-issue lifecycle. Recorded as **RC2-DEBT-14** (P2,
operator-trust). Owner: RC3 discovery hardening or the H batch that
touches the discovery lifecycle.

## Run history

- Run 1: 8/11 — one stage polluted by this run's own pre-probe (the
  redirect already existed), and the gate stages were written against
  a wrong severity model (description gap is a warning, not a
  blocker); stages redesigned around the real rule severities with
  fresh per-run drafts.
- Run 2: 11/12 — the redirect create returns 201, not the asserted
  200; assertion corrected.
- Run 3: **12/12 PASS.**

Journey idempotence: redirect from-paths are stamped per run; the
gate drafts re-mint when a prior run already approved them.

## Not exercised (named, not claimed)

- The rendered audit's per-page content checks (F1 above).
- Redirect import/export endpoints and prefix/regex match types
  (validation rules read in code; exact-match firing proven live).
- The AI-suggestion accept flow in the Rendered Quality center
  (depends on audit output; blocked by the same F1 topology).
- Multi-locale SEO output (single-locale fixture world, as in B-03).

## Stop point

RC2-C-03 complete. Next prompt: RC2-D-01.
