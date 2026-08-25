# Social distribution and calendar milestone

The canonical content item remains authoritative. A Campaign connects it to Social Drafts, independently editable Network Variants, attachments, Queue Items, append-only Publish Attempts and External Posts. A failed target never reverses a successful target; Campaign status becomes `partially-published` and retry is restricted to failed variants.

## Adapter capability matrix

| Adapter                                                    | Automatic delivery                                               | Verification                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| ActivityPub / Mastodon-compatible                          | Recorded fixture with idempotent remote ID                       | Fixture-tested                                |
| AT Protocol / Bluesky                                      | Recorded fixture with idempotent remote ID                       | Fixture-tested                                |
| X, Threads, Facebook, Instagram, LinkedIn, YouTube, TikTok | Manual handoff/unavailable according to account capability state | Not live-tested; no API capability is claimed |

Live delivery requires site-owned credentials, current approved scopes and adapter health. Tokens are represented only by an opaque connection reference and never appear in variants, jobs, attempts or diagnostics.

Queue claims have a lease, an immutable idempotency key and bounded Payload Job retries. A provider outcome marked unknown is retained as an attempt rather than blindly retried. Calendar drag/reschedule is a domain command that preserves the IANA timezone and records an audit item; source records remain authoritative.

The lightweight Social Studio route at `/social-studio` provides accessible compose/validation/status feedback. It is a preview surface; authenticated persistence, Media Studio graphic export, ICS feeds, reminders, queue-slot configuration, OAuth callbacks, live federation inboxes and two-way calendar adapters remain follow-up work.
