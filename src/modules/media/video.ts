import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

export type VideoProbe = {
  durationSeconds: number
  width: number
  height: number
  container: string
  videoCodec: string
  audioCodec?: string
  checksum: string
  sizeBytes: number
}

export type VideoOutput = {
  key: 'baseline' | 'hls' | 'poster' | 'contact-sheet'
  mimeType: string
  bytes: Uint8Array
  checksum: string
  width?: number
  height?: number
}

export type VideoRecipe = {
  key: string
  version: number
  maxInputBytes: number
  maxDurationSeconds: number
  description: string
}

export const localVideoRecipe: VideoRecipe = {
  key: 'web-video-v1',
  version: 1,
  maxInputBytes: 250 * 1024 * 1024,
  maxDurationSeconds: 15 * 60,
  description: 'H.264/AAC fast-start MP4, single-rendition HLS, poster, and contact sheet.',
}

export type VideoProcessRequest = {
  source: Uint8Array
  recipe: VideoRecipe
  signal?: AbortSignal
  onProgress?: (progress: number) => Promise<void> | void
}

export interface VideoProcessor {
  readonly provider: string
  probe(source: Uint8Array): Promise<VideoProbe>
  process(request: VideoProcessRequest): Promise<{ metadata: VideoProbe; outputs: VideoOutput[] }>
}

const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function command(
  binary: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal: options.signal,
    })
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs)
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-32_000)))
    child.once('error', reject)
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stderr)
      else reject(new Error(`${binary} failed (${code ?? 'signal'}): ${stderr.slice(-2000)}`))
    })
  })
}

/** Local processor for the isolated media-heavy worker. No web request invokes it. */
export class LocalFfmpegVideoProcessor implements VideoProcessor {
  readonly provider = 'local-ffmpeg'
  constructor(
    private readonly ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg',
    private readonly ffprobe = process.env.FFPROBE_PATH || 'ffprobe',
  ) {}

  async probe(source: Uint8Array): Promise<VideoProbe> {
    const directory = path.join(os.tmpdir(), `renegade-video-probe-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
    const input = path.join(directory, 'source.mp4')
    try {
      await writeFile(input, source)
      const child = spawn(
        this.ffprobe,
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += String(chunk)))
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`ffprobe failed: ${stderr}`)),
        )
      })
      const result = JSON.parse(stdout) as {
        streams?: Array<Record<string, unknown>>
        format?: Record<string, unknown>
      }
      const video = result.streams?.find((stream) => stream.codec_type === 'video')
      const audio = result.streams?.find((stream) => stream.codec_type === 'audio')
      const durationSeconds = Number(result.format?.duration || video?.duration || 0)
      const width = Number(video?.width || 0)
      const height = Number(video?.height || 0)
      if (!video || !durationSeconds || !width || !height)
        throw new Error('MP4 has no valid playable video stream.')
      return {
        durationSeconds,
        width,
        height,
        container: String(result.format?.format_name || 'mp4'),
        videoCodec: String(video.codec_name || 'unknown'),
        audioCodec: audio ? String(audio.codec_name || 'unknown') : undefined,
        checksum: digest(source),
        sizeBytes: source.byteLength,
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }

  async process({ source, recipe, signal, onProgress }: VideoProcessRequest) {
    if (source.byteLength > recipe.maxInputBytes)
      throw new Error('Video exceeds the local processing byte limit.')
    const metadata = await this.probe(source)
    if (metadata.durationSeconds > recipe.maxDurationSeconds)
      throw new Error('Video exceeds the local processing duration limit.')
    const directory = path.join(os.tmpdir(), `renegade-video-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
    const input = path.join(directory, 'source.mp4')
    const baseline = path.join(directory, 'baseline.mp4')
    const playlist = path.join(directory, 'stream.m3u8')
    const poster = path.join(directory, 'poster.jpg')
    const sheet = path.join(directory, 'contact-sheet.jpg')
    try {
      await writeFile(input, source)
      await onProgress?.(10)
      const common = [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-threads',
        String(Number(process.env.VIDEO_FFMPEG_THREADS || 1)),
        '-i',
        input,
      ]
      await command(
        this.ffmpeg,
        [
          ...common,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-vf',
          "scale='min(1280,iw)':-2",
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          baseline,
        ],
        { signal, timeoutMs: 20 * 60_000 },
      )
      await onProgress?.(45)
      await command(
        this.ffmpeg,
        [
          ...common,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-hls_time',
          '4',
          '-hls_playlist_type',
          'vod',
          '-hls_segment_filename',
          path.join(directory, 'segment-%03d.ts'),
          playlist,
        ],
        { signal, timeoutMs: 20 * 60_000 },
      )
      await onProgress?.(75)
      await command(
        this.ffmpeg,
        [
          '-hide_banner',
          '-nostdin',
          '-y',
          '-ss',
          String(Math.min(2, metadata.durationSeconds / 3)),
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          "scale='min(1280,iw)':-2",
          poster,
        ],
        { signal, timeoutMs: 120_000 },
      )
      await command(
        this.ffmpeg,
        [
          '-hide_banner',
          '-nostdin',
          '-y',
          '-i',
          input,
          '-vf',
          'fps=1/10,scale=320:-2,tile=4x3',
          '-frames:v',
          '1',
          sheet,
        ],
        { signal, timeoutMs: 180_000 },
      )
      const files = await Promise.all([
        readFile(baseline),
        readFile(playlist),
        readFile(poster),
        readFile(sheet),
      ])
      const outputs: VideoOutput[] = [
        {
          key: 'baseline',
          mimeType: 'video/mp4',
          bytes: files[0],
          checksum: digest(files[0]),
          width: Math.min(1280, metadata.width),
          height: Math.round((metadata.height * Math.min(1, 1280 / metadata.width)) / 2) * 2,
        },
        {
          key: 'hls',
          mimeType: 'application/vnd.apple.mpegurl',
          bytes: files[1],
          checksum: digest(files[1]),
        },
        { key: 'poster', mimeType: 'image/jpeg', bytes: files[2], checksum: digest(files[2]) },
        {
          key: 'contact-sheet',
          mimeType: 'image/jpeg',
          bytes: files[3],
          checksum: digest(files[3]),
        },
      ]
      for (const segment of (await readdir(directory)).filter((item) => item.endsWith('.ts'))) {
        const bytes = await readFile(path.join(directory, segment))
        outputs.push({ key: 'hls', mimeType: 'video/mp2t', bytes, checksum: digest(bytes) })
      }
      await onProgress?.(100)
      return { metadata, outputs }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

/** Provider seam: deployments can upload privately and return the same normalized contract. */
export function configuredVideoProcessor(): VideoProcessor {
  if ((process.env.VIDEO_PROCESSOR || 'local-ffmpeg') !== 'local-ffmpeg') {
    throw new Error('External VIDEO_PROCESSOR selected but no provider adapter is installed.')
  }
  return new LocalFfmpegVideoProcessor()
}

export function validateWebVtt(bytes: Uint8Array) {
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Caption file exceeds 5 MiB.')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  if (!text.startsWith('WEBVTT')) throw new Error('Captions must be valid WebVTT.')
  if (/<script|javascript:|<iframe/i.test(text))
    throw new Error('Caption file contains unsafe markup.')
  const cues = [
    ...text.matchAll(/(?:^|\n)(\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}\.\d{3}/g),
  ]
  if (!cues.length) throw new Error('Caption file contains no timed cues.')
  return { cueCount: cues.length, checksum: digest(bytes) }
}
