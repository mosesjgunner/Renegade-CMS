# Media publishing workflow evidence

The primary hosted-video adapter is YouTube. It accepts only canonical HTTPS embed URLs for the supplied video ID, uses a sandboxed iframe, and represents unavailable or removed media as a visible status message instead of an empty/broken player. Native MP4 records are served through the existing media route; WebVTT caption assets are exposed as HTML media tracks.

Podcast shows and episodes use the existing site/publication/space ownership fields. A published show with RSS enabled is available at `/podcasts/{show}/feed.xml`. The feed emits RSS 2.0, iTunes fields, Podcasting 2.0 chapters/transcript extensions, a self link, and only enclosures with a content-sniffed MP3, a byte length, and a public media URL. Future scheduled records remain out of public pages and feeds.

RSS import is explicit: a show must have `importOwnership = claimed-import`. Imported episodes are keyed as `rss:{showId}:{guid}` and retain a source checksum. Repeating an unchanged feed creates no records; a changed item updates its one owned record. Cross-site imports fail before any record is loaded or written.

YouTube sync uses the same claim boundary (`syncClaimed` on the channel), a stable `youtube:{channelId}:{videoId}` identity, and a source checksum, so it also upserts safely on repeated sync. The adapter deliberately reports a disabled, actionable configuration state until both channel ID and API key are present.

Proof coverage is in `tests/unit/media-publishing-workflows.test.ts`; it verifies feed/enclosure output, repeatable parse identity, malformed enclosure rejection, unsafe embed rejection, removed-media behavior, adapter misconfiguration, and transcript timing. Existing execution-foundation tests cover retrying background jobs, terminal failures, idempotent redelivery, and tenant-scope rejection.
