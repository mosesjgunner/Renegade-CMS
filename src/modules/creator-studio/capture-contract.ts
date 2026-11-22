import type { StudioTrackRole } from '../podcast-studio/contracts/track-manifest'

export const captureModes = ['audio', 'video', 'screen', 'screen-camera'] as const
export type CaptureMode = (typeof captureModes)[number]
export const captureTrackIds = ['master', 'screen', 'camera', 'mic', 'system'] as const
export type CaptureTrackId = (typeof captureTrackIds)[number]
export const captureLimit = 256 * 1024 * 1024
export const captureChunkLimit = 8 * 1024 * 1024
export const captureMaxChunks = 12_000
export const captureMime = /^(audio|video)\/(webm|mp4|ogg)(;[\w\s=.,'"-]{1,115})?$/i

export type CaptureTrack = {
  id: CaptureTrackId
  role: StudioTrackRole
  mimeType: string
  startedMs: number
  settings: Array<{
    kind: string
    width?: number
    height?: number
    frameRate?: number
    sampleRate?: number
    channelCount?: number
    facingMode?: string
    displaySurface?: string
  }>
}
export type CaptureOrientation = { atMs: number; angle: number; portrait: boolean }
export type CaptureManifest = {
  version: 1
  key: string
  mode: CaptureMode
  createdAt: string
  localConsentAt: string
  endedMs?: number
  endReason?: string
  tracks: CaptureTrack[]
  orientation: CaptureOrientation[]
  pauses: Array<{ atMs: number; resumedMs?: number }>
}
export type CaptureChunk = {
  index: number
  track: CaptureTrackId
  mimeType: string
  eventMs: number
  timecodeMs?: number
  bytes: Blob
}
export type CaptureSessionView = {
  id: string
  key: string
  mode: CaptureMode
  createdAt: string
  state: string
  received: number
  bytes: number
  limit: number
  expiresAt: string
  endedMs?: number
  endReason?: string
  hasVideo?: boolean
  asset?: string
}

export function captureExtension(mimeType: string) {
  const [kind, format] = mimeType.split(';')[0].split('/')
  return format === 'mp4' && kind === 'audio' ? 'm4a' : format || 'bin'
}
