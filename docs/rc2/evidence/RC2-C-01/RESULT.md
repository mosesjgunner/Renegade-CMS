# RC2-C-01 — Result

**Prompt:** Media upload, rights, derivative and public usage (RC2 execution pack, section C)

**Executed:** 2026-11-12
**Base commit:** `3fa2667` (main after PR #51)
**Journey:** `tests/rc2-c01/journey.mjs` — **PASS 16/16** (run 2; run 1 was 14/16 with two
journey-side misunderstandings, disclosed below). The proof runs against the A-04
two-site world served in production mode **with the jobs worker running**
(`npm run jobs:worker`) — the production web + worker topology; variant
generation does not happen inside the web process.
**Production code changed:** none.

## What the journey proves

1. **Upload → persistence.** `POST /api/media/upload` returns 201 with the
   asset's title and alt text, its kind/mime detection, a storage location
   namespaced by the owning site, and a `sha256:` checksum that matches the
   uploaded bytes' SHA-256 computed independently by the journey. The bytes
   read back from disk at that storage location hash to the same value —
   the stored master is the uploaded master. (Storage keys are
   content-derived: re-uploading identical bytes lands on the same key.)
2. **Rights metadata.** The DAM field set (license, license type/URL,
   creator credit, copyright owner, source, usage restrictions, consent and
   release references, embargo, rights expiry, `rightsStatus`) persists via
   the operator API. `rightsStatus` is an enum
   (`pending | approved | restricted | expired`); an invalid value rejects
   the whole update rather than half-applying it. Public delivery policy
   reads this metadata: a rights issue withdraws delivery (see below).
3. **Derivative path.** `POST /api/media/:id/variants` answers **202** with a
   queued job whose idempotency key embeds the asset checksum and the
   recipe contract. The worker generates the derivatives (one thumbnail
   request produced the full standard recipe set in probing: 20 ready
   variants); the journey polls to a ready 400×300 JPEG thumbnail with its
   own id, dimensions and byte size. Variants are separate records — the
   master's checksum and bytes never change.
4. **Public through use, not through upload.** Before attachment, anonymous
   `GET /media/:id` is **404** — library media is not public merely for
   existing. After `POST /api/media/attach` (hero) onto the published
   article: anonymous GET returns **200 with bytes identical to the
   master**, the thumbnail variant serves anonymously as a distinct JPEG
   derivative, and the public article page references the media URL.
   (Policy, from `publicMedia`: site brand assets, published products,
   published public content referencing the asset, or an approved public
   usage make media deliverable; tombstoned/quarantined/rights-flagged
   media is withdrawn.)
5. **Usage view.** The operator detail reports the usage list (target
   content id, field `heroMedia`, purpose `hero`, lifecycle `public`),
   `usageCount`, and `publiclyDeliverable: true`.
6. **Replacement.** `PUT /api/media/:id` is explicit about scope
   (`mode=new-asset | selected-usages | all-usages`; the default only
   stages a candidate). With `all-usages`: a new asset is created, every
   usage is rewired, the original's `replaceGloballyWith` points to it,
   the original record keeps its own checksum as evidence, the
   replacement carries the new bytes' checksum, and the original's public
   URL now serves the **new** bytes through the replacement chain.
7. **Failure manners.** A corrupt PNG and a plain-text upload are both
   refused **415 "Unsupported or corrupt media file."** with no asset
   created. Missing media is a clean 404 on both the public path and the
   operator detail.
8. **Tenant isolation.** The Site B principal is refused **403** on all
   three attempts: uploading into Site A, reading Site A's asset detail,
   and attaching Site A's asset.
9. **Module-off (Lean).** A second boot of the same build with the Lean
   floor profile answers the media command center with
   `{ "overview": null, "moduleAvailable": false }` — a deliberate gate,
   not a false success or a 500.

## Findings

- **F1 — Public delivery is usage-based (by design, now proven).** Worth
  operator documentation: uploading alone never makes media public, and
  unpublishing the last public usage withdraws delivery.
- **F2 — Variant requests expand to the standard recipe set.** Asking for
  `thumbnail` generated 20 ready variants. Idempotent and cheap for small
  images, but the behavior is broader than the request; noted for the
  performance ledger when large media is profiled in the D/H work.
- Not exercised: the miniPaint/image-editor **UI** (the supported
  derivative path — recipes, focal point and crop contracts — was
  exercised through the operator API), podcast/video/POD media (separately
  classified per the pack), and chunked upload sessions. These remain for
  later C/H prompts, not claimed here.

## Run history (honest)

Run 1: 14/16. Both failures were the journey's own model of the product,
corrected after reading the service code: the variant queue answers 202
(async accepted), and replacement defaults to `new-asset` staging rather
than rewiring. Run 2: 16/16 with both semantics asserted as designed.

## Exit assessment

**Media family at E2** under the supported local-storage + worker
processing profile: one asset's full lifecycle — upload, rights,
derivative, public usage, replacement — is a connected, tenant-safe
workflow. Advanced podcast/video/POD media remain separately classified.
