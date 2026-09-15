# Media storage

`media-assets` is the canonical media record. Admin/editorial clients upload through
`POST /api/media/upload`, select the resulting record through the existing
`media-assets` relationship fields, and attach a hero image through
`POST /api/media/attach`. The server allocates an opaque site-prefixed object key;
client filenames, MIME headers, and client paths are never persisted as storage paths.

## Resumable publisher uploads (MED-01)

The Media Library uses `POST /api/media/sessions` to create a 24-hour, owner- and
site-bound upload intent. It uploads ordered raw chunks to
`PATCH /api/media/sessions/:sessionId` with `Content-Range`, so a cancelled browser
can retry an identical chunk without duplicating bytes. `POST` to that same route
finalizes exactly once: the server verifies owner, exact size, optional SHA-256,
and magic-byte MIME before creating the asset/blob transaction. The browser receives
only the canonical `/media/:assetId` URL, never an object key or storage URL.

Local chunks live under `MEDIA_DIR/.upload-sessions/<uuid>` and are private. The
`media-upload-cleanup` worker task marks expired sessions and removes only their
matching staging directory every fifteen minutes. Do not mount this directory as a
public web root; mount the same persistent `MEDIA_DIR` into web and worker containers.
Failed finalization retains its staged bytes until expiry for diagnosis/retry; completed
and cancelled sessions remove staging bytes immediately.

The default is `STORAGE_DRIVER=local`, with `MEDIA_DIR=./media` in development.
Fresh installs therefore need no object-store credentials. Production local storage
requires an absolute persistent volume. `STORAGE_DRIVER=s3` uses the compatible
S3 REST/SigV4 adapter and requires `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`,
`S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Missing S3 settings fail production
configuration; development safely serves local storage and records a readiness warning.

Allowed uploads are content-sniffed PNG, JPEG, GIF, WebP, SVG, PDF, and MP3, subject to
`MEDIA_MAX_UPLOAD_BYTES` (25 MiB default). A declared MIME type or filename cannot
override the signature check. SVG input is independently inspected and refuses script,
event-handler, active URL, foreign-object, and XML-entity constructs; it is served only
with a restrictive CSP and is never blindly rasterized.

## Image variants (MED-03)

The original is a private, immutable blob. Upload and explicit regeneration create a
durable `media-jobs` record keyed by original checksum plus the approved recipe contract,
then queue `media-variant-generate` on the `media` worker. Web requests never run Sharp.
The worker has a per-asset concurrency key, four exponential-backoff attempts, durable
retry/cancellation state, and a manual retry action in Media Library. Deleting an orphan
asset cancels its queued/running work; workers recheck cancellation and deletion before
decoding.

Only registered recipes may be requested: `thumbnail`, `inline`, `hero`, `og`, `square`,
`portrait`, and `wide`. Theme/component code asks for one of those names; arbitrary
resize query parameters are rejected. Each rendition strips embedded metadata, applies
EXIF orientation, records safe dimensions/color analysis and crop/focal metadata in the
database, and writes a checksum- and recipe-version-addressed immutable object. Responsive
`<picture>` markup emits AVIF/WebP plus JPEG fallback, real rendition dimensions, width
descriptors, `sizes`, lazy decoding, and eager hero priority. Public rendition responses
have a checksum ETag, `nosniff`, one-year immutable caching, and a versioned URL.

GIF/WebP animations are preserved as approved originals and are not silently converted to
a still image. Safe SVGs preserve their original vector bytes; unsafe SVGs fail upload.
The current implementation intentionally has no automatic animated poster recipe.
When a recipe is regenerated, the live pointer changes only after its new object is ready;
the prior ready blob remains as `previousBlob` for a one-step rollback. Variant GC protects
originals, ready pointers, previous rollback blobs, and all referenced uses before deleting
only unreferenced output.

### Worker resources

| Profile  | Minimum practical allocation | Policy                                                                                         |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Lean     | 2 vCPU, 2 GiB RAM            | Keep `media` worker at one process; AVIF can be slow and jobs may queue.                       |
| Standard | 4 vCPU, 4 GiB RAM            | One media worker with per-asset serialization; retain 2–4 GiB free disk for transient outputs. |

Do not run media workers in a serverless request runtime. Web and worker containers must
share the persistent `MEDIA_DIR` volume (or the same S3-compatible bucket); backup includes
both original and checksum-addressed generated objects.

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
