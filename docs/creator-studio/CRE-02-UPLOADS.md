# Creator Studio submissions

Members open **Community submissions** from `/studio`. They can drop files or pick up to 20 per batch, set titles, captions, and image alt text, and pause and resume uploads. To resume after a reload, select the same original file and destination. The browser verifies the previously accepted chunks against the server manifest before sending missing chunks.

## Site policy

In the site’s Creator policy, enable Creator Studio, set the per-member upload count and byte quotas, and list each destination that accepts submissions.

```json
{
  "enabled": true,
  "quotas": { "bytes": 1000000000, "uploadCount": 100 },
  "submissionTargets": [
    "gallery:00000000-0000-4000-8000-000000000001",
    "content:00000000-0000-4000-8000-000000000002",
    "theater:00000000-0000-4000-8000-000000000003",
    "room:00000000-0000-4000-8000-000000000004"
  ]
}
```

Replace these UUIDs with album, content, video, and room conversation IDs from that site. Gallery, content, and theater destinations must be public and available. Rooms use current room membership and attendance rules. Removing a destination from the policy immediately disables its submission feed and derivative delivery.

Grant ordinary members `media.upload` and `media.submit`. Grant `media.edit-own` for edits while pending and `media.publish-own` for publishing after approval. Site moderators and community managers can preview, approve, reject, and withdraw submissions. Review decisions require a reason. The `notifications` module delivers those decisions to the member’s inbox. A rejected member can appeal once, with the decision assigned to a different reviewer. An image needs alt text before approval.

## Storage and validation

- Set `MEDIA_MAX_UPLOAD_BYTES` for the per-file limit. Each request carries a bounded chunk and the server persists its SHA-256 and byte range. Unfinished uploads expire after 24 hours.
- Use a durable private `MEDIA_DIR` shared by the web and operations worker. Member originals and derivatives live on this volume even when the canonical staff media library uses S3. The media archive includes finalized creator files. The upload cleanup task removes abandoned staging and expired quarantine files.
- Raster images are decoded within a pixel budget and repackaged as WebP with metadata removed. Audio and video require FFmpeg and ffprobe. The accepted containers are MP3, WAV, Ogg audio, MP4, and WebM. PDF requires Poppler and is rebuilt as an image-only document with bounded pages and output. Plain WebVTT requires timed cues. Active HTML, SVG, archives, and animated images are rejected.
- Set `CREATOR_UPLOAD_SCANNER` to the path of an executable that accepts the source file path and prints `clean`, `infected`, or `unavailable`. Set `CREATOR_UPLOAD_REQUIRE_SCANNER=true` to hold finalization when a scanner is missing or unavailable. An infected result marks the upload quarantined and prevents preview and publication.

## Verification

On disposable PostgreSQL, the fresh migration applied and four targeted integration tests passed. Chromium in mobile emulation exercised the file picker, drop event, interrupted chunk retry, status after reload, member publication, and loading the public derivative. The service tests covered all four destinations, cross-site and owner checks, invalid sources, quarantine and expiry, an independent appeal, and recovery after a separate finalizer process exited. The browser checks used a warmed Next development server because cold route compilation intermittently returned HTTP 500.

Linux checks matched the output checksum for a 96 MiB streamed assembly and probed real WAV, MP4, WebM, and PDF derivatives. The scanner used an injected verdict for quarantine. Production image execution and a live scanner remain outside these results.
