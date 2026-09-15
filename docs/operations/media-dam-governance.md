# MED-02 media governance

The default Media Library asks publishers for title, alt text, caption, and creator or credit. Source and licence can be recorded without enabling a governance workflow.

Governed assets opt into release/consent evidence. Rights approval, expiry, and embargo are evaluated before a new public release or distribution use. The safe public policy withdraws delivery of an expired or unapproved asset; the Media governance dashboard must be used to repair or replace it.

An asset remains a stable editorial identity. Replacements always create a new asset and immutable version evidence. The operator chooses one of: **new asset only**, **selected usages**, or **all usages**. The impact preview is the authorization boundary; cross-site links and cycles are refused.

Checksums identify exact duplicate bytes within a site. They may suggest review, but never merge records automatically; a publisher must choose keep or merge. Filename and visual similarity are not merge authority.

`media-usages` records target type/id/revision, field/slot, site/publication/channel, and draft/scheduled/public lifecycle. The worker-owned `media-usage-reconcile` task rebuilds the projection from rich text, page/Puck layouts, SEO/social overrides, and social-distribution attachments. It refreshes current rows and removes only its own stale `dam:` projections; legacy/manual rows are untouched. The dashboard reports the repair result and opens a durable incident when an expired/failed asset is already used publicly.

Bulk tag, collection, metadata, archive, and metadata-export requests are staff- and site-scoped per asset. Their response lists successes, independent failures, and the exact reversible fields for UI undo. Archive removes an asset from discovery but retains the canonical record and bytes for recovery.

The media library exposes the replacement impact before upload, including target, field/slot, and lifecycle. A checksum candidate is only a review queue: keep merely records the human decision, while merge is a separately confirmed action that writes immutable replacement evidence.
