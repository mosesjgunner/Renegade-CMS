# ADR-0007: Canonical media asset, blob, and variant contract

## Status

Accepted — MED-00, 2026-09-12.

## Decision

`media-assets` is the stable editorial identity. It owns accessible title, alt text,
caption, credit, rights, replacement history, retention, site ownership, and its
stable delivery URL: `/media/:assetId`. It does not expose a storage key.

`media-blobs` owns a private physical object: a site-scoped SHA-256 checksum,
sniffed MIME type, dimensions/duration where available, byte size, provider, and
opaque storage key. Identical bytes deduplicate only inside one Site. A blob is
not a public resource and is never addressed by a browser URL.

`media-variants` records a generated representation and its own blob, processing
state, dimensions, and provenance. A generated representation never overwrites
an original. Replacing an asset creates a new asset and leaves a bounded,
site-scoped replacement chain as audit evidence.

Originals are private by default. `/media/:assetId` resolves a replacement only
when the asset is ready, not retained/withdrawn, and has either a site-identity
policy or a same-site approved use on a published surface. Raw Payload media and
object storage remain staff-only. `MediaUsage` is the first-class record for
content, layouts, themes, SEO, podcast, video, and distribution use; it must
carry a site and explicit public approval.

The local adapter remains the zero-provider default. Local and S3-compatible
adapters implement the same opaque-key, private-object, atomic-write capability
contract. Delivery URLs do not encode a provider or storage location.

## Consequences

Writes store bytes before metadata, then compensate by removing only a newly
written blob if metadata creation fails. Deletion is refused for an attached
asset or for a shared blob; byte removal is compensated if asset deletion fails.
Operational backup continues to include the database plus the media volume, so
asset/blob references and bytes restore together. Legacy metadata-only
`local://` records are compatibility-only and cannot be served publicly.
