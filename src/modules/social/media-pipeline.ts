import { type SocialNetwork } from './contracts'

export interface MediaAssetMetadata {
  id: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  width?: number
  height?: number
  aspectRatio?: number // width / height
  durationSeconds?: number
}

export interface MediaAdaptationPlan {
  targetNetwork: SocialNetwork
  needsResize: boolean
  targetAspectRatio?: {
    min: number
    max: number
    preferred?: 'VERTICAL_9_16' | 'SQUARE_1_1' | 'PORTRAIT_4_5' | 'LANDSCAPE_16_9' | 'VERTICAL_2_3'
  }
  targetDimensions?: { width: number; height: number }
  needsFormatConversion: boolean
  targetMimeType: string
  needsCompression: boolean
  maxFileSizeBytes: number
  actionSummary: string[]
}

/**
 * Platform media constraints dictionary based on the 2026 specification.
 */
export const PLATFORM_MEDIA_RULES: Record<
  SocialNetwork,
  {
    allowedImageMimes: string[]
    allowedVideoMimes: string[]
    maxImageBytes: number
    maxVideoBytes: number
    maxVideoDurationSeconds: number
    aspectRatios: {
      min: number
      max: number
      preferred?: 'VERTICAL_9_16' | 'SQUARE_1_1' | 'PORTRAIT_4_5' | 'LANDSCAPE_16_9' | 'VERTICAL_2_3'
    }
  }
> = {
  bluesky: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedVideoMimes: [],
    maxImageBytes: 1000000, // 1 MB strict PDS limit
    maxVideoBytes: 50 * 1024 * 1024,
    maxVideoDurationSeconds: 60,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  mastodon: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 40 * 1024 * 1024,
    maxVideoDurationSeconds: 180,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  linkedin: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif'],
    allowedVideoMimes: ['video/mp4'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 500 * 1024 * 1024,
    maxVideoDurationSeconds: 1800,
    aspectRatios: { min: 0.5, max: 2.0, preferred: 'LANDSCAPE_16_9' },
  },
  instagram: {
    allowedImageMimes: ['image/jpeg'], // Instagram requires JPEG
    allowedVideoMimes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 90,
    aspectRatios: { min: 0.8, max: 1.91, preferred: 'PORTRAIT_4_5' }, // 4:5 to 1.91:1
  },
  facebook: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 10 * 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 14400,
    aspectRatios: { min: 0.5, max: 2.0, preferred: 'LANDSCAPE_16_9' },
  },
  threads: {
    allowedImageMimes: ['image/jpeg', 'image/png'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 300,
    aspectRatios: { min: 0.8, max: 1.91, preferred: 'SQUARE_1_1' },
  },
  pinterest: {
    allowedImageMimes: ['image/jpeg', 'image/png'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 2 * 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 900,
    aspectRatios: { min: 0.5, max: 1.0, preferred: 'VERTICAL_2_3' }, // 2:3 vertical (0.667)
  },
  x: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 512 * 1024 * 1024,
    maxVideoDurationSeconds: 140,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  tiktok: {
    allowedImageMimes: ['image/jpeg', 'image/png'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 4 * 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 600,
    aspectRatios: { min: 0.5, max: 0.6, preferred: 'VERTICAL_9_16' }, // 9:16 vertical
  },
  youtube: {
    allowedImageMimes: ['image/jpeg', 'image/png'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
    maxImageBytes: 2 * 1024 * 1024,
    maxVideoBytes: 256 * 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 43200,
    aspectRatios: { min: 0.5, max: 2.0, preferred: 'LANDSCAPE_16_9' },
  },
  activitypub: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoMimes: ['video/mp4', 'video/webm'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 40 * 1024 * 1024,
    maxVideoDurationSeconds: 180,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  telegram: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif'],
    allowedVideoMimes: ['video/mp4'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 50 * 1024 * 1024,
    maxVideoDurationSeconds: 1800,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  discord: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxImageBytes: 25 * 1024 * 1024,
    maxVideoBytes: 25 * 1024 * 1024,
    maxVideoDurationSeconds: 1800,
    aspectRatios: { min: 0.5, max: 2.5 },
  },
  manual: {
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    allowedVideoMimes: ['video/mp4'],
    maxImageBytes: 50 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
    maxVideoDurationSeconds: 3600,
    aspectRatios: { min: 0.2, max: 5.0 },
  },
}

/**
 * Plans necessary transformations (resizing, format conversion, compression) for a given media asset and target network.
 */
export function planMediaAdaptation(
  asset: MediaAssetMetadata,
  targetNetwork: SocialNetwork,
): MediaAdaptationPlan {
  const rules = PLATFORM_MEDIA_RULES[targetNetwork] || PLATFORM_MEDIA_RULES.manual
  const actionSummary: string[] = []

  let needsFormatConversion = false
  let targetMimeType = asset.mimeType

  // 1. Format check
  if (!rules.allowedImageMimes.includes(asset.mimeType)) {
    needsFormatConversion = true
    targetMimeType = 'image/jpeg' // Safe universal fallback
    actionSummary.push(`Convert ${asset.mimeType} to image/jpeg for ${targetNetwork}`)
  }

  // 2. Size / compression check
  let needsCompression = false
  if (asset.fileSizeBytes > rules.maxImageBytes) {
    needsCompression = true
    actionSummary.push(
      `Compress image from ${asset.fileSizeBytes} bytes to satisfy ${targetNetwork}'s limit of ${rules.maxImageBytes} bytes`,
    )
  }

  // 3. Aspect ratio / dimension check
  let needsResize = false
  const currentRatio = asset.aspectRatio || (asset.width && asset.height ? asset.width / asset.height : undefined)

  if (currentRatio !== undefined) {
    if (currentRatio < rules.aspectRatios.min || currentRatio > rules.aspectRatios.max) {
      needsResize = true
      actionSummary.push(
        `Adjust aspect ratio ${currentRatio.toFixed(2)} to fall within ${targetNetwork} bounds [${rules.aspectRatios.min}..${rules.aspectRatios.max}]`,
      )
    }
  }

  return {
    targetNetwork,
    needsResize,
    targetAspectRatio: rules.aspectRatios,
    needsFormatConversion,
    targetMimeType,
    needsCompression,
    maxFileSizeBytes: rules.maxImageBytes,
    actionSummary,
  }
}

/**
 * Validates whether a media asset is compliant with a target network or requires processing.
 */
export function validateMediaForNetwork(
  asset: MediaAssetMetadata,
  targetNetwork: SocialNetwork,
): { isValid: boolean; blockers: string[]; warnings: string[] } {
  const rules = PLATFORM_MEDIA_RULES[targetNetwork] || PLATFORM_MEDIA_RULES.manual
  const blockers: string[] = []
  const warnings: string[] = []

  // Check MIME
  if (!rules.allowedImageMimes.includes(asset.mimeType) && !rules.allowedVideoMimes.includes(asset.mimeType)) {
    warnings.push(`File format ${asset.mimeType} is not natively supported by ${targetNetwork}; requires automated conversion.`)
  }

  // Check file size
  const maxBytes = asset.mimeType.startsWith('video/') ? rules.maxVideoBytes : rules.maxImageBytes
  if (asset.fileSizeBytes > maxBytes) {
    if (targetNetwork === 'bluesky') {
      blockers.push(`File size (${asset.fileSizeBytes} bytes) exceeds Bluesky's strict 1,000,000 byte limit.`)
    } else {
      warnings.push(`File size exceeds ${targetNetwork} threshold (${maxBytes} bytes); compression will be applied.`)
    }
  }

  // Check video duration
  if (asset.durationSeconds && asset.durationSeconds > rules.maxVideoDurationSeconds) {
    blockers.push(
      `Video duration (${asset.durationSeconds}s) exceeds ${targetNetwork} limit of ${rules.maxVideoDurationSeconds}s.`,
    )
  }

  // Check aspect ratio
  if (asset.aspectRatio !== undefined) {
    if (asset.aspectRatio < rules.aspectRatios.min || asset.aspectRatio > rules.aspectRatios.max) {
      blockers.push(
        `Aspect ratio (${asset.aspectRatio}) is out of permissible range (${rules.aspectRatios.min} - ${rules.aspectRatios.max}) for ${targetNetwork}.`,
      )
    }
  }

  return {
    isValid: blockers.length === 0,
    blockers,
    warnings,
  }
}

/**
 * Simulates on-demand image buffer adaptation (compression, format header tagging).
 */
export function adaptImageBuffer(
  inputBuffer: Buffer,
  currentMime: string,
  plan: MediaAdaptationPlan,
): { buffer: Buffer; mimeType: string; wasTransformed: boolean } {
  if (!plan.needsCompression && !plan.needsFormatConversion && !plan.needsResize) {
    return { buffer: inputBuffer, mimeType: currentMime, wasTransformed: false }
  }

  let outputBuffer = inputBuffer
  let outputMime = plan.needsFormatConversion ? plan.targetMimeType : currentMime

  // If compression is needed (e.g. Bluesky 1MB limit), iteratively downscale buffer slice in simulation
  if (plan.needsCompression && outputBuffer.length > plan.maxFileSizeBytes) {
    // In production Node/sharp pipeline, this resamples and compresses. Here we simulate bounded byte slicing
    outputBuffer = outputBuffer.subarray(0, plan.maxFileSizeBytes)
  }

  return {
    buffer: outputBuffer,
    mimeType: outputMime,
    wasTransformed: true,
  }
}
