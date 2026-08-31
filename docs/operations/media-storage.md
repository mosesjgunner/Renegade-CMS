# Media storage

`media-assets` is the canonical media record. Admin/editorial clients upload through
`POST /api/media/upload`, select the resulting record through the existing
`media-assets` relationship fields, and attach a hero image through
`POST /api/media/attach`. The server allocates an opaque site-prefixed object key;
client filenames, MIME headers, and client paths are never persisted as storage paths.

The default is `STORAGE_DRIVER=local`, with `MEDIA_DIR=./media` in development.
Fresh installs therefore need no object-store credentials. Production local storage
requires an absolute persistent volume. `STORAGE_DRIVER=s3` uses the compatible
S3 REST/SigV4 adapter and requires `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Missing S3 settings fail production
configuration; development safely serves local storage and records a readiness warning.

Allowed uploads are content-sniffed PNG, JPEG, GIF, WebP, PDF, and MP3, subject to
`MEDIA_MAX_UPLOAD_BYTES` (25 MiB default). A declared MIME type or filename cannot
override the signature check. Image dimensions are extracted where supported; focal
points are normalized coordinates. The current architecture records variants but does
not generate responsive derivatives, so rendering uses immutable original delivery URLs.

Public `/media/:id` delivery is available only while the asset is attached as the hero
of published content in the same site. It sets `nosniff`, a checksum ETag, and one-year
immutable caching because replacement creates a new asset and preserves the original.
Deletion is blocked while `media-usages` or content hero references exist. Replacement
creates a new object and stores `replaceGloballyWith`; it does not silently mutate
published references.

For local storage, back up PostgreSQL and `MEDIA_DIR` in the same quiesced backup
window using `npm run backup:operational`; the existing operational backup already
captures `/app/media`. For S3, database backup alone is insufficient: enable versioned
bucket backups/lifecycle policy and preserve object keys referenced by the database.
Run `npm run db:migrate` before deploying this migration. Existing records stay valid;
their checksum/focal-point fields are nullable and can be backfilled by re-uploading or
an operator-managed migration job.
