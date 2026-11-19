/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
/**
 * POD-17 (POD-REQ-36, bounded) — Video render service (Payload layer).
 *
 * The thin service over the video render core in video.ts, following
 * the POD-13 render-service pattern. Its one job is the attach: a
 * PROBE-VERIFIED video render (the core returns a result only when
 * the output passed ffprobe verification) is registered as a media
 * asset through the POD-13 `storeRenderAsset` dedupe path and bound
 * to the episode as `video`, with the probe report stored verbatim
 * as `videoProvenance`.
 *
 * This attach is the ONLY writer of `episode.video` /
 * `episode.videoProvenance` in the studio, and the feed publishes a
 * video enclosure only when both are present and the provenance
 * probe passed for exactly the attached asset's bytes (feed-build.ts
 * gate) — so a video enclosure in a feed is always backed by a
 * probed render of those bytes, never by an upload or a hope.
 */
import { readFile } from 'node:fs/promises'

import { loadConfig, type AppConfig } from '../../core/config'
import type { MediaPublishingStore } from '../../media/publishing'
import { PodcastRenderError, type RenderedFile } from './render'
import { storeRenderAsset } from './render-service'
import type { VideoRenderResult } from './video'

export type EpisodeVideoProvenance = {
  kind: 'podcast-video-render'
  mode: 'camera' | 'slideshow'
  assetId: string
  probe: {
    passed: true
    durationSec: number
    width: number
    height: number
    videoCodec: string | null
    audioCodec: string | null
    /** SHA-256 (hex) of the rendered MP4 bytes the probe ran against. */
    checksumSha256: string
  }
  audioDurationSec: number
  durationDeltaSec: number
  renderedAt: string
}

/** Builds the stored provenance from a probe-verified render result. Pure. */
export function buildVideoProvenance(
  result: VideoRenderResult,
  assetId: string,
  renderedAt: string = new Date().toISOString(),
): EpisodeVideoProvenance {
  return {
    kind: 'podcast-video-render',
    mode: result.mode,
    assetId,
    probe: {
      passed: true,
      durationSec: result.probe.durationSec,
      width: result.probe.width,
      height: result.probe.height,
      videoCodec: result.probe.videoCodec,
      audioCodec: result.probe.audioCodec,
      checksumSha256: result.file.checksumSha256,
    },
    audioDurationSec: result.audioDurationSec,
    durationDeltaSec: result.durationDeltaSec,
    renderedAt,
  }
}

/**
 * Registers a probe-verified video render as an asset and attaches
 * it to the episode (video + videoProvenance). The episode GUID and
 * audio are never touched — a video attach is purely additive, so an
 * audio-only listener's feed item keeps its identity and enclosure.
 */
export async function attachEpisodeVideo(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: {
    episodeId: string
    result: VideoRenderResult
    title?: string
  },
): Promise<{ assetId: string; provenance: EpisodeVideoProvenance }> {
  const resolvedConfig = config ?? loadConfig()
  const episode = await payload
    .findByID({
      collection: 'podcast-episodes',
      id: input.episodeId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!episode)
    throw new PodcastRenderError(
      'VIDEO_EPISODE_NOT_FOUND',
      `Episode ${input.episodeId} not found — the video render cannot attach.`,
    )
  const siteId = String(
    typeof episode.site === 'string' ? episode.site : ((episode.site as any)?.id ?? ''),
  )
  const file: RenderedFile = input.result.file
  const bytes = await readFile(file.path)
  const assetId = await storeRenderAsset(payload, resolvedConfig, {
    siteId,
    title: input.title ?? file.filename,
    kind: 'video',
    mimeType: 'video/mp4',
    filename: file.filename,
    bytes,
    checksumSha256: file.checksumSha256,
    durationSec: file.durationSec,
  })
  const provenance = buildVideoProvenance(input.result, assetId)
  await payload.update({
    collection: 'podcast-episodes',
    id: input.episodeId,
    data: { video: assetId, videoProvenance: provenance },
    overrideAccess: true,
  })
  return { assetId, provenance }
}
