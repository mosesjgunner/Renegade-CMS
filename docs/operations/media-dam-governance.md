# MED-02 media governance

The default Media Library asks publishers for title, alt text, caption, and creator or credit. Source and licence can be recorded without enabling a governance workflow.

Governed assets opt into release/consent evidence. Rights approval, expiry, and embargo are evaluated before a new public release or distribution use. The safe public policy withdraws delivery of an expired or unapproved asset; the Media governance dashboard must be used to repair or replace it.

An asset remains a stable editorial identity. Replacements always create a new asset and immutable version evidence. The operator chooses one of: **new asset only**, **selected usages**, or **all usages**. The impact preview is the authorization boundary; cross-site links and cycles are refused.

Checksums identify exact duplicate bytes within a site. They may suggest review, but never merge records automatically; a publisher must choose keep or merge. Filename and visual similarity are not merge authority.

`media-usages` records target type/id/revision, field/slot, site/publication/channel, and draft/scheduled/public lifecycle. Reconciliation updates `lastReconciledAt`; stale records remain observable until repaired, not silently discarded.
