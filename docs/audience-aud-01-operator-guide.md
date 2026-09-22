# AUD-01 audience operations

Audience identity stays in `subscribers`, with optional `contacts` and `members` projections. Do not create a second person record for a campaign or provider. Email is normalized (Unicode NFKC and case-folded); phones are stored only as E.164. Provider recipient identifiers remain in `delivery-identities`.

Consent events are append-only evidence. A preference change emits `preference-granted` or `preference-withdrawn`; the preference display is only a projection. An import can be previewed and replayed using its digest, but is quarantined unless an operator supplies an explicit basis and source. File presence is never consent.

Public preference and unsubscribe links are HMAC-signed, site/subject/purpose scoped, expiring, and backed by a revocable nonce record. Never reuse a preference token as an unsubscribe or confirmation token. Suppressions win at segment resolution and at worker delivery time. The operator must retain the reason, source, time, and scope.

Merge only records a reviewable alias for identical normalized delivery addresses; it does not rewrite historical consent, suppression, or audit evidence. Different addresses require a reviewed contact merge. Erasure replaces the address with an invalid local placeholder while retaining the digest solely to prevent accidental re-contact; finance, moderation, and legally required audit records are governed by their own explicit retention policy.

Migration `20260920_010000_aud_01_audience_evidence` is additive. Apply it after AUD-00, run `npm run db:migrate`, and backfill address normalization only through a reviewed dry run: conflicting normalized addresses are quarantine cases, never auto-merges. Backup/restore validation must prove token revocation, suppressions, and erased-address digests survive restore before AUD-02/AUD-03 use audience resolution.
