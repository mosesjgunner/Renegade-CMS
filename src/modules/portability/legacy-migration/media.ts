import { assertSafeOutboundUrl, safeFetch } from '../../core/external-boundary'
import { inspectMedia } from '../../media/storage'
import type { NormalizedMedia } from './types'

export type MediaAcquisitionResult = {
  acquiredMedia: Map<string, { mediaId: string; sha256: string; fileName: string; mimeType: string }>
  urlRewireMap: Map<string, string> // sourceUrl -> /media/:mediaId
  idRewireMap: Map<string, string> // sourceAttachmentId -> mediaId
  warnings: Array<{ code: string; message: string; sourceId?: string }>
  errors: Array<{ code: string; message: string; sourceId?: string }>
  totalDownloadedBytes: number
}

export interface MediaStoreBoundary {
  createMedia(args: {
    siteId: string
    fileName: string
    mimeType: string
    bytes: Uint8Array
    sha256: string
    title?: string
    altText?: string
    caption?: string
    width?: number
    height?: number
  }): Promise<{ id: string; url: string }>
  findMediaBySha256?(siteId: string, sha256: string): Promise<{ id: string; url: string } | null>
}

/**
 * Acquire legacy media safely:
 * - Checks explicit download permission
 * - Enforces SSRF boundary (rejects private addresses, loopbacks, internal ranges)
 * - Inspects magic bytes / MIME sniff
 * - Deduplicates via SHA-256
 * - Generates usage rewiring table
 */
export async function acquireLegacyMedia(
  items: NormalizedMedia[],
  store: MediaStoreBoundary,
  options: {
    siteId: string
    remoteMediaDownloadAllowed?: boolean
    localMediaFiles?: Record<string, { buffer: Buffer; fileName: string; mimeType?: string }>
    fetcher?: typeof fetch
  },
): Promise<MediaAcquisitionResult> {
  const acquiredMedia = new Map<string, { mediaId: string; sha256: string; fileName: string; mimeType: string }>()
  const urlRewireMap = new Map<string, string>()
  const idRewireMap = new Map<string, string>()
  const warnings: Array<{ code: string; message: string; sourceId?: string }> = []
  const errors: Array<{ code: string; message: string; sourceId?: string }> = []
  const sha256ToAsset = new Map<string, { mediaId: string; url: string }>()

  let totalDownloadedBytes = 0

  for (const item of items) {
    let bytes: Uint8Array | null = null
    let fileName = item.fileName

    // 1. Check local media buffer first
    const localMatch =
      options.localMediaFiles?.[item.sourceUrl] ||
      options.localMediaFiles?.[item.fileName] ||
      (options.localMediaFiles && Object.entries(options.localMediaFiles).find(([k]) => item.sourceUrl.endsWith(k))?.[1])

    if (localMatch) {
      bytes = new Uint8Array(localMatch.buffer)
      fileName = localMatch.fileName || item.fileName
    } else if (item.sourceUrl.startsWith('http://') || item.sourceUrl.startsWith('https://')) {
      // 2. Remote download requires explicit permission
      if (!options.remoteMediaDownloadAllowed) {
        warnings.push({
          code: 'REMOTE_MEDIA_DOWNLOAD_DISALLOWED',
          sourceId: item.id,
          message: `Remote media download permission is not enabled. Skipping download of ${item.sourceUrl}.`,
        })
        continue
      }

      // 3. Enforce SSRF boundary
      try {
        await assertSafeOutboundUrl(item.sourceUrl, undefined, { allowHttp: true })
      } catch (err) {
        errors.push({
          code: 'SSRF_REJECTED',
          sourceId: item.id,
          message: `Remote media URL blocked by SSRF boundary (${err instanceof Error ? err.message : String(err)}): ${item.sourceUrl}`,
        })
        continue
      }

      // 4. Download safely with bounded size and timeout
      try {
        const response = await safeFetch(item.sourceUrl, {}, {
          fetcher: options.fetcher,
          maxBytes: 25 * 1024 * 1024, // 25MB maximum per asset
        })
        if (!response.ok) {
          warnings.push({
            code: 'MEDIA_DOWNLOAD_HTTP_ERROR',
            sourceId: item.id,
            message: `Remote media download failed with HTTP status ${response.status}: ${item.sourceUrl}`,
          })
          continue
        }
        const arrayBuf = await response.arrayBuffer()
        bytes = new Uint8Array(arrayBuf)
        totalDownloadedBytes += bytes.byteLength
      } catch (err) {
        warnings.push({
          code: 'MEDIA_DOWNLOAD_FAILED',
          sourceId: item.id,
          message: `Remote media download error: ${err instanceof Error ? err.message : String(err)} (${item.sourceUrl})`,
        })
        continue
      }
    }

    if (!bytes || bytes.length === 0) {
      continue
    }

    // 5. Inspect magic bytes & MIME sniffing
    let inspection
    try {
      inspection = inspectMedia(bytes)
    } catch {
      errors.push({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        sourceId: item.id,
        message: `Asset ${fileName} failed MIME validation or has unsupported magic bytes.`,
      })
      continue
    }

    const sha256 = inspection.sha256

    // 6. Cryptographic Deduplication: check if already downloaded or in store
    let existing = sha256ToAsset.get(sha256)
    if (!existing && store.findMediaBySha256) {
      const found = await store.findMediaBySha256(options.siteId, sha256)
      if (found) {
        existing = { mediaId: found.id, url: found.url }
      }
    }

    let mediaId: string
    let mediaUrl: string

    if (existing) {
      mediaId = existing.mediaId
      mediaUrl = existing.url
    } else {
      // 7. Store new asset in target site
      try {
        const created = await store.createMedia({
          siteId: options.siteId,
          fileName,
          mimeType: inspection.mimeType,
          bytes,
          sha256,
          title: item.title,
          altText: item.altText,
          caption: item.caption,
          width: inspection.width,
          height: inspection.height,
        })
        mediaId = created.id
        mediaUrl = created.url
        sha256ToAsset.set(sha256, { mediaId, url: mediaUrl })
      } catch (err) {
        errors.push({
          code: 'MEDIA_STORE_FAILED',
          sourceId: item.id,
          message: `Failed to persist media asset ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
        })
        continue
      }
    }

    // Record acquired asset mappings
    acquiredMedia.set(item.id, {
      mediaId,
      sha256,
      fileName,
      mimeType: inspection.mimeType,
    })
    urlRewireMap.set(item.sourceUrl, mediaUrl)
    idRewireMap.set(item.id, mediaId)
  }

  return {
    acquiredMedia,
    urlRewireMap,
    idRewireMap,
    warnings,
    errors,
    totalDownloadedBytes,
  }
}

/** Rewire legacy image URLs in content or layout blocks to canonical Renegade media URLs */
export function rewireMediaUrls(content: string, urlRewireMap: Map<string, string>): string {
  let result = content
  for (const [sourceUrl, renegadeUrl] of urlRewireMap.entries()) {
    if (sourceUrl && renegadeUrl) {
      result = result.split(sourceUrl).join(renegadeUrl)
    }
  }
  return result
}
