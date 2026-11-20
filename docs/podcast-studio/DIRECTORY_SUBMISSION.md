# Podcast Directory Submission — Manual Guidance

Renegade does **not** submit feeds to any directory automatically, and no
code path in the CMS contacts Apple, Spotify, or the Podcast Index on a
show's behalf. Submission is a manual, one-time step the show owner performs
in each directory's own dashboard, using the feed URL Renegade serves.
Directory ingestion of any Renegade feed is **UNVERIFIED** — no directory
has ingested a Renegade feed as part of the POD-01 work; the checklist below
is the documented prerequisite set, not a tested claim.

## Prerequisites checklist (verify before submitting anywhere)

- [ ] The show is published and **RSS enabled**; the feed loads at
      `https://<your-domain>/podcasts/<show-slug>/feed.xml`.
- [ ] Feed health is green: `GET /api/podcasts/<show-slug>/feed-health`
      (staff sign-in required) returns `"valid": true` with no errors.
      Read the three answers separately: `valid`/`errors` cover the XML
      and its enclosures; `prerequisites` lists what a directory still
      needs (artwork, a first episode, an owner email) without failing
      validity; `directoryAcceptance` is always `"not-verified"` — no
      Renegade check can prove a directory accepted the show. Only the
      directory's own dashboard proves that.
- [ ] The channel carries `podcast:guid`, `podcast:locked`, and
      `podcast:medium` (emitted on every Renegade feed since POD-01), plus
      show artwork of at least 1400×1400 px, a title, a description, a
      language, and an iTunes category.
- [ ] At least one published episode with a playable audio enclosure
      (directories reject empty feeds), served over HTTPS with byte-range
      support from your host.
- [ ] `podcast:locked` reads `yes` with the owner's email set
      (show → _Locked owner email_), so a later feed move is recognised as
      the owner's own.
- [ ] The show's _Directory owner email_ is set. Directories verify
      ownership against the feed's `<itunes:owner><itunes:email>` — a
      different element from `podcast:locked`, with a different job.
      Setting it is opt-in: the address is **public in the feed** (anyone
      who downloads the feed can read it), so use an address you are
      comfortable exposing. It is never copied from your account email or
      from the locked owner email automatically.
- [ ] You control the email address directories send verification mail to
      (the directory owner email above).

## Apple Podcasts Connect

1. Sign in at <https://podcastsconnect.apple.com> with the show owner's
   Apple ID.
2. Add a show by RSS feed and paste the Renegade feed URL.
3. Complete the verification email step, set availability/territory and
   content rights, and submit for review.
4. After approval, record the Apple show URL in your own show notes; the
   CMS does not track it.

## Spotify

1. Sign in at <https://podcasters.spotify.com>.
2. Add the show by pasting the Renegade feed URL and complete the email
   verification (the code goes to the address in the feed's
   `<itunes:owner>` element — set the show's _Directory owner email_
   first; the `podcast:locked` owner email is not the address Spotify
   verifies against).
3. Confirm catalog details and submit.

## Podcast Index

1. Sign in at <https://podcastindex.org> and use the "Add" flow, or add the
   feed from a supporting app.
2. Paste the Renegade feed URL. The feed's `podcast:guid` is stable across
   slug renames (it is generated once and stored on the show), so the
   directory identity survives URL changes; if the feed URL itself moves,
   serve a redirect from the old URL and update the listing.

## Moving a feed later

- Keep `podcast:locked` at `yes` until the move is done; it tells other
  platforms only the owner may move the feed.
- Put a permanent (301/308) redirect from the old feed URL to the new one,
  and keep it in place — directories and apps follow it at their own pace.
- Never change the show's stored `podcastGuidValue`; it is the show's
  permanent Podcasting 2.0 identity.
