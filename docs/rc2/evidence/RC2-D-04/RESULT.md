# RC2-D-04 — Campaign journey (cross-family) — RESULT

**Verdict: PASS — 8/8 stages green** (`tests/rc2-d04/journey.mjs` with
`tests/rc2-d04/seed-content.spec.ts` and `tests/rc2-d04/mint-owner.spec.ts`;
final run 10: 8/8). This is the first cross-family CMoS proof — Publishing +
Media/Workflow + Distribution/Audience + Intelligence in one operator
campaign, resolved to canonical IDs throughout. The road here was long
(runs 1–9) because the journey kept surfacing real product behavior —
including one genuine P1 defect, fixed in this same PR (F1 below). Run
history in brief: runs 1–4 were harness-model errors (session cookie shape,
workflow self-approval, draft-approval ordering, newsletter due-window)
plus a sandbox VM replacement that wiped the world mid-flight; runs 5–7
isolated the distribution failure to a single error line; run 8 tripped the
release canonical-collision gate (by design — see Behavior characterized);
run 9 proved the F1 fix end-to-end except the article page, which traced to
a fixture-world gap (no active publication — see Behavior characterized);
run 10 is fully green.

## Test boundary (stated plainly)

Social dispatch runs against the repo's local AT-protocol fixture (the
D-02 boundary: a sandbox provider double; it never counts as live-provider
proof). Email runs on the development capture adapter (the D-03 boundary).
The analytics leg proves the **gate** — consent recording, refusal while
disabled, and the settings-write refusal (F3) — and names the recorded-event
half **NOT VERIFIED in this environment** rather than claiming it. No new
orchestration engine was created: the campaign runs entirely on the
existing release saga, the audience campaign runtime, and the social
outbox. Repurposing (#28) remains E0 — an operator assembled this campaign
by pinning existing artifacts; no automated repurposing pipeline exists,
and none is claimed here.

## What was proven

1. **One canonical campaign.** A single release pins the canonical article
   (by its article-family companion ID + approved revision), its hero
   media, a newsletter message, and an approved social draft — by their
   real IDs, never copies. Gates evaluate clean (0 blockers).
2. **The release completes across all four families.** Article, media,
   newsletter, and distribution artifacts all succeed; the article serves
   publicly at its canonical path (200).
3. **The newsletter leg delivers once and points at the article.** The
   confirmed reader receives exactly one delivery, and the message
   snapshot carries the canonical article URL.
4. **Distribution posts through the release outbox.** The release-created
   queue item is published by the production dispatch path; the provider
   fixture records exactly one new post; the hero media serves publicly.
5. **First-party analytics stays off until an operator enables it.**
   Consent is recorded (200); while `privacy.analyticsEnabled` is false,
   collection refuses the event (202, `consent-required`, nothing stored);
   and the settings write itself is refused for both the site admin and
   the site owner (403) — finding F3.
6. **Failure isolates and reports honestly.** With the media artifact's
   rights restricted after approval, the release lands `partially-failed`:
   media fails with "Rights approval is required" while the article, the
   newsletter, and the social post all succeed.
7. **Retry is surgical and idempotent.** After rights are restored, retry
   completes the release: the media artifact's attempts go to 2, the
   article's stay at 1 (no re-publish), and the reader still has exactly
   one newsletter delivery (no duplicate).
8. **The operator trace is canonical.** Both release records carry all
   four artifact types with their canonical IDs, execution state, and
   resulting URLs (the article's canonical URL on each).

## Findings

### F1 — Release-driven distribution could never dispatch (P1) — FIXED in this PR

The release saga creates social queue items keyed
`release:<releaseId>:<artifactId>:<variantId>`, but the dispatch executor's
authorization check (`executeSocialQueueItem`,
`src/modules/social/tasks.ts`) only accepted queue items whose
idempotency key ends with the variant's approval hash — the standalone
scheduling path's binding. Every release-created item therefore threw
"Queue account, site or approved content no longer matches its
authorization" **before any provider request**, the item sat in
`scheduled` with no failure record, and the saga reported the generic
"Delivery pending or retryable" — a total, silent failure of the release
distribution leg, in any environment, on every release.

Fix: the executor now accepts either binding — the approval-hash suffix
(standalone path) or a release key whose final segment is this variant's
ID (release path). The content-hash comparison against the live records
is unchanged for both paths, so a queue row still cannot be replayed
against altered content. Regression proof:
`tests/integration/social-release-distribution-key.integration.test.ts` —
the release-key case **fails on the unfixed code** (authorization throw,
item stuck `scheduled`) and passes fixed (execution proceeds; the item
ends `failed` with a persisted reason against a revoked test account);
two guard cases prove an unbound key is still refused and the standalone
scheduled key still works. The D-04 journey then proves the fixed path
end-to-end (stages 2 and 4).

### F2 — A source-linked social draft cannot ride its own article's release (P2) → RC2-DEBT-17

Draft approval refuses (400) when a draft's `sourceContent` is not yet
published ("Canonical source content must be published before social
approval"), but a release that would publish that article requires the
draft to be approved before execution. A draft linked to its source
article can therefore never be distributed by the release that publishes
the article. The campaign here used the supported shape instead — an
unlinked approved draft carrying the canonical URL. Either the approval
rule needs a release-scoped exception (approve against the release's
pinned revision), or the product should say plainly that source-linked
drafts distribute in a follow-up release. Recorded as RC2-DEBT-17.

### F3 — Site settings are unwritable by any operator in a multi-site install (P1) → RC2-DEBT-16

The `site-settings` global's update access is
`operatorAllSitesAccess`: an operator qualifies by holding grants on
every site, or by being the global owner — where global-owner status is
read from a user flag (`isGlobalOwner`) that **exists nowhere in the
schema and is set by no code path** (verified: no column, no assignment
in `src/`). In a two-site install, no principal — site admin or site
owner — can update site settings via the API (measured: 403 for both).
One concrete consequence: first-party analytics, off by default by
design, **cannot be switched on** in a multi-site install through any
operator surface the journey could reach, so the recorded-event half of
the analytics leg is NOT VERIFIED here (the gate behavior around it is
proven — stage 5). Recorded as RC2-DEBT-16.

## Behavior characterized (no defect claimed)

- **Workflow self-approval is forbidden** by template: the journey
  submits as the editor and approves as the site admin (a run-3 lesson,
  confirmed in `src/modules/editorial/cmos-workflow.ts`).
- **An attached hero's rights gate its article's publish.** In run 5 the
  failure-arc media was attached as the article's hero: the article
  failed its first publish while the hero was rights-restricted and
  succeeded after restore. With standalone media (runs 9–10) the failure
  isolates to the media artifact alone. Arguably correct semantics —
  recorded so the coupling is a known, named behavior.
- **The release gate treats a shared canonical URL as a collision.** In
  run 8, pinning the article's canonical URL on both the article and the
  distribution artifact failed the URL & Canonical Route Conflict gate
  (blocker) — the gate working as designed; the article pin owns the
  campaign's canonical URL.
- **Publications are created in draft; canonical routes stay 404 until
  an operator activates one.** The fixture builder requests
  `status: 'active'` at creation, but publications land in draft and the
  public catch-all requires an active publication. Earlier journeys
  inherited an already-active publication from the long-lived world; on a
  fresh world the journey performs the activation itself through the
  operator API (PATCH, 200) — the same action an operator takes when
  launching a publication.
