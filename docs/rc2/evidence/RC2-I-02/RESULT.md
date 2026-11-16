# RC2-I-02 — Repair reconciliation

**Verdict: PASS.** All five repairs I-01 handed over are fixed and proven
end-to-end on a production build of this tree: RC2-DEBT-18 (magic-link
GET 500), RC2-DEBT-16 (site settings unwritable in multi-site),
RC2-DEBT-19 (role-less member un-reportable, repaired under the decided
model C), RC2-DEBT-24 (scope-less suspend restricted nothing), and
RC2-DEBT-26 (portable import corrupting the member-space-post chain).
I-01's one open decision — the newsletter empty-audience guard — is
resolved as **option A** (guard kept, journey contract updated; flagged
for the owner's veto at merge). RC2-DEBT-07's floor proof was run: the
defect is **real** (see below); its fix is a bounded follow-up whose
disposition is the owner's call at this pass's merge. No Red-gate
defects were found or introduced. Nothing else was repaired.

## Candidate identity

- Base: GitHub main `f68927d` (PR #83 merge, RC2-I-01). All repairs are
  on branch `rc2-i02`; verification ran against a production standalone
  build of the repaired tree (build stamp reports the base SHA with
  "clean source: false" — the uncommitted repairs, as expected).
- Host: this sandbox VM (~8 GB), PostgreSQL 16 native cluster. The VM
  was replaced once during verification (Nov 16, ~05:01 CT); the rig
  was rebuilt (PostgreSQL, databases, migrations including the new
  `20261116_120000_rc2_global_owner_flag`, server, jobs worker, seeded
  worlds) and every leg below ran after the rebuild.
- Unit suite on the final tree: **291 files / 2,137 tests, all
  passing.** Typecheck and lint clean. Run logs for every leg are
  retained with this pass's working papers.

## Repairs and their proofs

### RC2-DEBT-18 — magic-link GET completion 500 (P1) — CLOSED

`Response.redirect()` returns immutable headers in this runtime, so
appending the session/CSRF cookies threw after the single-use token
was already consumed. The route now builds a plain mutable
`Response` (302 + Location) and appends cookies to it, for the success,
invalid-token, and pending-approval redirects alike.
**Proof:** E-01 journey replayed **11/11 API + 4/4 browser**; its probe
records the GET completion at **HTTP 302** (was 500).

### RC2-DEBT-16 — site settings unwritable in multi-site (P1) — CLOSED

Root cause: the grant resolver read `isGlobalOwner` from the user
object, but the flag existed nowhere in the users schema and was set
by no code path. The fix gives global ownership a real representation:
an `isGlobalOwner` checkbox on the users collection (update access
already owner-global-only), migration
`20261116_120000_rc2_global_owner_flag` (adds the column, backfills
from `installation_state.owner_user_id`), and the installer now sets
the flag on the owner it creates.
**Proof:** H-02 matrix replayed on a fresh two-site world — **38
boundary holds, 0 breaches** (was 32 holds / 7 measures in I-01). The
converted cells: a site admin's settings save is refused 403 (B1), a
per-site owner's save is refused 403 (B2), and the installation owner
saves **200**, enables analytics (`privacy.analyticsEnabled` read back
`true` through the product surface), and restores (B3). The
recorded-event half of the acceptance is the G-02 journey, replayed
**8/8** on this build (consent-first collect, dedupe, operator report,
withdrawal).

### RC2-DEBT-19 — role-less member un-reportable (P1) — CLOSED

Repaired under member-standing **model C** (decided Nov 12, 2026: one
identity, per-site standing). New service
`src/modules/community/site-standing.ts` (find-or-create the member's
`member-site-roles` row at role `member`, race-safe via the
(site, member) unique index; the collection's audit hook records the
join) and a new member-facing route `POST /api/community/join` (joins
the host's site; 201 created / 200 idempotent; CSRF- and origin-checked;
a plain `member` row confers no moderation power — the actor/grant
resolvers filter on moderator/operator roles).
**Proof:** E-02 journey replayed **14/14 API + 3/3 browser** (was
12/12): a fresh member's profile report before joining is refused 404
(the model-C-correct expectation), the join returns **201
(created=true, role=member)**, and the report then opens a case. The
H-02 matrix carries the same cells (G7 hold 404, G7b hold join 201 →
report 201, G7c hold: standing on site A creates nothing on site B).
**Explicitly not flipped:** posting gates. A member can still post on
a site they have never joined (the matrix keeps those cells as
measures, matching I-01). Enforcing join-before-posting is the design
brief's separate decision and is accounted here, not silently shipped.

### RC2-DEBT-24 — scope-less suspend restricted nothing (P2) — CLOSED

Member sanctions (`suspend_posting` / `ban_member`) submitted without
a scope now default to `site_global` instead of an object scope on
the member, and the success response echoes the applied scope and
scopeId. The product UI always sent scope explicitly; only API
callers were exposed.
**Proof:** new E-02 stage 7b — a scope-less suspend returns 200 with
`scope: "site_global"` echoed, the member's next post is refused 403,
the lift returns 200, and posting succeeds again (201).

### RC2-DEBT-26 — portable import corrupting the space-post chain (P2) — CLOSED

Two-sided fix. Export (`site-export.ts`) now pulls space profiles and
space members **by reference**, like authors and owners — profiles and
members carry no site field, so the site scan never reached them and
the profile was simply absent from the archive. Import
(`portability.ts`) gained a sever pass: after remapping, a
relationship/upload value that is neither an id this import wrote nor
a source id the archive carries is severed to null where the field is
not required (required fields keep the value and fail loudly, as
before); in-archive-but-unwritten ids are left for the workflow's
retry passes.
**Proof:** full round trip replayed through the real CLI on this
build. Export of the seeded Site A: 21 records with the whole chain
inside — spaces 1, **profiles 1 (the space's profile, previously
missing)**, members 2, content 3 (including the space post),
article-family 2, revision-records 2, media 1 (a real server upload
replaced the fixture's hollow asset first, as in H-08/I-01). Import
into a fresh target database and site: **20 records completed, 0
failed rows** (the 21st record is the site itself, mapped to the
target), 12 relationship repairs, 1 media reconciled. Target
verification: the imported space's profile and member point at real
remapped records, and the space post, its article-family companion,
and both revisions are present. (I-01 measured this leg PARTIAL at
14/19 with exactly this chain failing.)

### Finding 1 — empty-audience guard: option A (owner may veto at merge)

The guard stays: scheduling a campaign to a segment with zero
eligible recipients is refused. The D-03 journey contract was updated
to assert the guarded behavior and replayed **7/7**: after the only
subscriber unsubscribes (suppression recorded), the next campaign is
refused **400 with `emptyAudience: true`** and zero new deliveries to
the address. This was Harbor's recommended option, taken so the pass
could close; it is flagged in the merge request for the owner's veto —
restoring schedule-anyway is a small, well-understood reversal.

## RC2-DEBT-07 — Lean floor proof: defect CONFIRMED, fix disposition open

The register asked for proof, not presumption. Proof, on this build:
with the Lean profile (`RENEGADE_MODULES` empty = floor only, 67
collections registered), `quality-scans` and `quality-issues` are
**not registered**, and the rendered-audit lifecycle's first write
throws `The collection with slug quality-scans can't be found`. So on
a Lean install the Rendered Quality admin view mounts (its
registration in `payload.config.ts` is unconditional), an operator
can run an audit, and the run fails at the persistence step — the
results cannot be saved. This is a real missing seam, not a graceful
empty state. The bounded fix (gate the view and the audit routes on
the `quality` module, with a clear "module not enabled" response) is
**not** in this pass: it touches the shared admin config after the
verification build, and the staging brief reserves deferral calls to
the owner. Recommended disposition: a small follow-up repair, or RC3
— owner's call at this merge. The row stays open at P1 with this
proof attached.

## Register reconciliation

- **Closed by this pass:** DEBT-16, DEBT-18, DEBT-19, DEBT-24,
  DEBT-26 (closure notes appended to each row, with the evidence
  above).
- **DEBT-07:** proof run (above); row annotated, still open.
- **DEBT-01 (P1, profile/space duplicate state):** not in this pass's
  repair set — the decided merge is its own design pass (H-03
  lineage). It remains the largest open P1 and its disposition
  (schedule the merge, or formally scope it to RC3) is an I-03 exit
  decision for the owner; this pass neither hides nor re-labels it.
- **Assigned-pass complete, closure annotation owed:** DEBT-05,
  DEBT-06, DEBT-09, DEBT-12 (assigned H-04), DEBT-08 (H-02), DEBT-10
  (H-05), DEBT-13 (H-06). Those passes are complete and merged, and
  spot checks show their subject matter moved (the module registry
  now claims the previously unclaimed telecom and webhook
  collections), but no owning RESULT closes these rows by number and
  the register carries no closure annotations for them. A row-by-row
  closure audit was not part of this pass; the annotations are owed
  at I-03's exit review rather than asserted here. DEBT-22 was
  already annotated closed by H-05, and H-04's RESULT closes
  DEBT-20's dead-writer half explicitly.
- **RC3-owned P2s, reconciled not repaired:** DEBT-02, -03, -04, -14,
  -15, -17, -20 (remainder), -21 (remainder), -23, -25.
- **DEBT-11 (license mismatch):** unchanged — the owner's one-line
  decision (AGPL-3.0 previously recommended). Listed, not repaired.

## What did not change

No posting-gate enforcement (model C's flip remains a separate
decision), no aesthetic rewrites, no scope additions. Harness changes
are confined to the fixtures and journeys named above (the
installation-owner principal, the B3/G7 matrix cells, E-02 stages,
the D-03 contract, and the `tests/rc2-h08/i02-*` proof scripts).
