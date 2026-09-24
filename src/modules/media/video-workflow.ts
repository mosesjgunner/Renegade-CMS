import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { mediaStorage } from './storage'
import { configuredVideoProcessor, localVideoRecipe } from './video'

const id = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

export async function processVideoAsset(payload: Payload, config: AppConfig, videoAssetId: string) {
  const record = (await payload.findByID({
    collection: 'video-assets' as never,
    id: videoAssetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
  if (record.cancelRequested) return { completed: false, cancelled: true }
  const source = (await payload.findByID({
    collection: 'media-assets',
    id: id(record.sourceAsset),
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
  if (source.kind !== 'video' || source.mimeType !== 'video/mp4')
    throw new Error('Only verified MP4 source assets are supported by the local video recipe.')
  const blob = (await payload.findByID({
    collection: 'media-blobs',
    id: id(source.originalBlob),
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
  const storage = mediaStorage(config)
  const bytes = await storage.get(String(blob.storageKey))
  if (!bytes) throw new Error('Private video source bytes are unavailable.')
  const attempts = Number(record.attempts || 0) + 1
  await payload.update({
    collection: 'video-assets' as never,
    id: videoAssetId,
    overrideAccess: true,
    data: {
      processingState: 'probing',
      progress: 2,
      attempts,
      heartbeatAt: new Date().toISOString(),
      failure: null,
    } as never,
  } as never)
  const processor = configuredVideoProcessor()
  try {
    const result = await processor.process({
      source: bytes,
      recipe: localVideoRecipe,
      onProgress: async (progress) => {
        const latest = (await payload.findByID({
          collection: 'video-assets' as never,
          id: videoAssetId,
          depth: 0,
          overrideAccess: true,
        } as never)) as unknown as Record<string, unknown>
        if (latest.cancelRequested) throw new Error('Video processing cancelled by operator.')
        await payload.update({
          collection: 'video-assets' as never,
          id: videoAssetId,
          overrideAccess: true,
          data: {
            processingState: 'processing',
            progress,
            heartbeatAt: new Date().toISOString(),
          } as never,
        } as never)
      },
    })
    const siteId = id(source.site)
    const persisted: Array<Record<string, unknown>> = []
    let hlsIndex = 0
    for (const output of result.outputs) {
      const extension =
        output.mimeType === 'video/mp4'
          ? 'mp4'
          : output.mimeType === 'application/vnd.apple.mpegurl'
            ? 'm3u8'
            : output.mimeType === 'video/mp2t'
              ? 'ts'
              : 'jpg'
      const filename =
        output.key === 'hls' && extension === 'ts'
          ? `segment-${String(hlsIndex++).padStart(3, '0')}.ts`
          : `${output.key}.${extension}`
      const storageKey = `${siteId}/video/${videoAssetId}/r${localVideoRecipe.version}/${filename}`
      await storage.put(storageKey, output.bytes, output.mimeType)
      persisted.push({
        key: output.key,
        filename,
        storageKey,
        mimeType: output.mimeType,
        checksum: output.checksum,
        sizeBytes: output.bytes.byteLength,
        width: output.width,
        height: output.height,
      })
    }
    const previous = Array.isArray(record.outputs) ? record.outputs : []
    await payload.update({
      collection: 'video-assets' as never,
      id: videoAssetId,
      overrideAccess: true,
      data: {
        processingState: 'ready',
        progress: 100,
        metadata: { ...result.metadata, processor: processor.provider },
        outputs: persisted,
        lastGoodOutputs: previous.length ? previous : persisted,
        heartbeatAt: new Date().toISOString(),
        failure: null,
      } as never,
    } as never)
    await payload.update({
      collection: 'media-assets',
      id: String(source.id),
      overrideAccess: true,
      data: {
        durationSeconds: result.metadata.durationSeconds,
        width: result.metadata.width,
        height: result.metadata.height,
        videoMetadata: result.metadata,
        processingState: 'ready',
      } as never,
    } as never)
    return { completed: true, count: persisted.length }
  } catch (error) {
    await payload
      .update({
        collection: 'video-assets' as never,
        id: videoAssetId,
        overrideAccess: true,
        data: {
          processingState: String(error).includes('cancelled') ? 'cancelled' : 'failed',
          failure: {
            message:
              error instanceof Error ? error.message.slice(0, 1000) : 'Video processing failed.',
            retryable: attempts < 4,
          },
          heartbeatAt: new Date().toISOString(),
        } as never,
      } as never)
      .catch(() => undefined)
    throw error
  }
}

export async function queueVideoProcessing(payload: Payload, videoAssetId: string, force = false) {
  const asset = (await payload.findByID({
    collection: 'video-assets' as never,
    id: videoAssetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
  const key = `video:${videoAssetId}:${id(asset.sourceAsset)}:${localVideoRecipe.key}:v${localVideoRecipe.version}`
  if (!payload.jobs?.queue) throw new Error('The media-heavy queue is unavailable.')
  const queued = await payload.jobs.queue({
    task: 'video-process',
    queue: 'media-heavy',
    input: { videoAssetId, idempotencyKey: force ? `${key}:regen:${Date.now()}` : key },
  } as never)
  await payload.update({
    collection: 'video-assets' as never,
    id: videoAssetId,
    overrideAccess: true,
    data: { processingState: 'queued', progress: 0, cancelRequested: false } as never,
  } as never)
  return queued
}

export async function recoverStaleVideoJobs(payload: Payload, staleMs = 15 * 60_000) {
  const stale = await payload.find({
    collection: 'video-assets' as never,
    where: {
      and: [
        { processingState: { in: ['probing', 'processing'] } },
        { heartbeatAt: { less_than: new Date(Date.now() - staleMs).toISOString() } },
      ],
    },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  } as never)
  for (const item of stale.docs) await queueVideoProcessing(payload, String(item.id), true)
  return stale.docs.length
}
