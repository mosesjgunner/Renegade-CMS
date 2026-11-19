# Member Feeds — Private & Member Podcasts (POD-03, POD-REQ-08)

A creator can run a members-only podcast whose feed and audio are
actually private: each member gets a personal feed URL carrying an
unguessable token, and both the feed and every audio enclosure check
the member's entitlement **at serve time**, on every request. Revoking
the member's entitlement, revoking the token, or rotating it cuts
access immediately — including enclosure URLs a podcast client
already cached.

> Scope note: the deliverable is the API + this document. There is no
> dedicated admin/member UI for token management yet; the endpoints
> below are the surface a UI (or an operator script) drives.

## The model

- **Show privacy** — `podcast-shows.feedVisibility`: `public`
  (default) or `members`. A members show has **no public feed**: the
  public `feed.xml` route answers 404, and its episodes exist only in
  entitled members' token feeds.
- **Episode privacy** — `podcast-episodes.membersOnly`: on a public
  show, a flagged episode is **absent from the public feed entirely**
  (never listed without an enclosure) and appears only in entitled
  members' token feeds. Episodes of a members show are members-only
  regardless of the flag.
- **Entitlement binding** — following the existing commerce pattern
  (the `requiredEntitlement` JSON policy on content/events, checked
  through the subscription system's `hasEntitlement` seam, the same
  seam the subscription download route uses):
  - If the show sets `requiredEntitlement`
    (`{ "resource": "…", "capability": "…", "scope": "…" }`), that
    resource/capability is what a member's subscription plan must
    grant.
  - Otherwise the default binding is resource
    `podcast-show:<show id>`, capability `listen`. A plan grants it by
    including `{ "resource": "podcast-show:<show id>",
"capability": "listen", "siteId": "<site id>", "term":
"subscription" }` in its entitlements; the subscription service
    materialises it into an `entitlements` row keyed to the member's
    supporter record, and revoking/cancelling the subscription revokes
    the row — which is what makes access end immediately.
- **Feed token** — `podcast-feed-tokens`: one active token per
  member+show. A token is 32 random bytes, base64url-encoded (43
  chars). **Only its SHA-256 (hex) is stored** (`tokenHash`); the raw
  token is returned exactly once, in the issue/rotation API response,
  and is never logged (lifecycle log events carry member/show/record
  ids only) and never appears in list responses.

## URLs

| Surface                 | URL                                                                  |
| ----------------------- | -------------------------------------------------------------------- |
| Member feed (subscribe) | `/podcasts/<slug>/member-feed/<token>`                               |
| Token-scoped enclosure  | `/podcasts/<slug>/member-feed/<token>/episode/<episodeId>/audio`     |
| Issue token             | `POST /api/podcast-studio/member-feeds`                              |
| List token metadata     | `GET /api/podcast-studio/member-feeds?showId=<id>` (or `?showSlug=`) |
| Rotate token            | `POST /api/podcast-studio/member-feeds/rotate`                       |
| Revoke token            | `POST /api/podcast-studio/member-feeds/revoke`                       |

Podcast clients subscribe to the member feed URL exactly like a
public feed URL (the path-token pattern is the industry standard for
private feeds). Enclosure URLs inside the member feed are rewritten
to the token-scoped form; public `/media/<id>` URLs never appear in
a member feed. Feed and enclosure responses are `private, no-store`.

## Flows

### Issue (member self-service)

1. Member signs in (member session cookie) and POSTs
   `{ "showId": "…" }` (or `{ "showSlug": "…" }`) to
   `/api/podcast-studio/member-feeds`, with the member CSRF
   double-submit (cookie + `x-member-csrf` header), like the other
   member APIs.
2. For a members show, the member must **currently hold** the show's
   entitlement, else 403. (On a public show anyone may hold a token;
   members-only episodes join the feed only while entitled.)
3. The response is `{ token, feedUrl, memberId, showId, createdAt }`.
   **Show `feedUrl` to the member once** — it cannot be recovered
   later, only rotated. Issuing replaces any active token for that
   member+show (the old one is revoked in the same operation).

Staff can issue for a member by POSTing `{ showId, memberId }` with a
Payload staff session whose operator grant covers the show's site.

### Rotate

`POST /api/podcast-studio/member-feeds/rotate` with the same body.
The old token is revoked in the same operation and a fresh token is
returned once. Every old feed/enclosure URL stops working
immediately. Use this when a member's feed URL leaks.

### Revoke

`POST /api/podcast-studio/member-feeds/revoke` with the same body.
The member's token feed and enclosure URLs fail (404) on the next
request. Revoking a member's **entitlement** (subscription cancelled
or grant revoked) has the same immediate effect even if the token
itself is never revoked, because entitlement is re-checked at serve
time.

### List

`GET /api/podcast-studio/member-feeds?showId=…` returns token
metadata for the caller (staff may pass `memberId`): id, active flag,
created/revoked/last-used stamps. It never returns the token or its
hash.

## Security properties

- Token resolution failures are constant-shape: unknown, malformed,
  revoked, and wrong-show tokens all produce the same 404, on both
  the feed and enclosure routes.
- Enclosure serving refuses tombstoned/quarantined assets and
  cross-site assets, and streams through the shared media range
  machinery (Range/206/416, ETag) — the same code path as
  `/media/<id>`.
- A token for one show never opens another show, and an enclosure
  URL naming an episode of a different show 404s.

## Known gaps

- Real podcast-client behaviour with token feeds (Apple Podcasts
  private feeds, Pocket Casts, etc.) is **UNVERIFIED** — proof is
  HTTP-level only.
- No admin/member UI yet (API + this doc are the deliverable).
- Transcript/chapter URLs inside a member feed still point at the
  public episode routes; only enclosures are token-scoped in POD-03.
