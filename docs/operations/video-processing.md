# MED-05 video processing

Renegade stores uploaded MP4 originals through the MED-01 resumable path. Original object keys stay private. A `video-assets` record is the processing identity; canonical `videos` remain connected to shared content, revisions, scheduling, rights, canonical URL, and existing distribution/SEO seams.

## Local small-video profile

Start it with `docker compose -f compose.production.yaml --profile media-heavy up -d media-heavy`. This image alone contains FFmpeg. Start at one job, one FFmpeg thread, 2 CPUs, 2 GiB RAM, and temporary plus durable disk around four times the source size. The local envelope is MP4 up to 250 MiB and 15 minutes. Use an external provider above it.

Recipe `web-video-v1` creates an H.264/AAC fast-start MP4 capped at 1280 pixels wide, a single-rendition VOD HLS playlist and segments, JPEG poster, and 4x3 contact sheet. Checksums, duration, dimensions, codecs, recipe version, and processor identity are recorded. This is an honest playable baseline, not a multi-bitrate ladder.

`VideoProcessor` is the provider seam. An adapter must use private input, return the normalized metadata/output contract, verify checksums, support cancellation, and hide provider storage identifiers. Selecting an unavailable `VIDEO_PROCESSOR` fails explicitly. Renegade never claims automatic transcription unless a provider actually creates a transcript revision.

## Operations and recovery

Payload retries four times with exponential backoff. The heavy queue has global concurrency one. Progress and heartbeat persist; cancellation is cooperative between stages. Jobs without a heartbeat for 15 minutes are requeued. Failed regeneration keeps `lastGoodOutputs`. Operators may set `cancelRequested`, inspect `failure`, or force regeneration.

Backups include the database and canonical media volume; staging and FFmpeg temp files are disposable. Restore verifies output checksums. Missing derivatives can be deterministically regenerated from the private original and recipe version. Do not claim recovery until anonymous MP4 range and HLS requests pass.

Caption uploads accept UTF-8 WebVTT only, capped at 5 MiB, with timed-cue and active-markup validation. Records carry language, label, kind, default selection, and optional transcript linkage.
