/**
 * POD-17 (POD-REQ-36, bounded) — Video render recipe (SERVER, real
 * ffmpeg), the video sibling of the POD-13 audio render in render.ts.
 *
 * Turns a gate-passed POD-13 program audio master into a video
 * episode MP4 in exactly two modes:
 *
 * (a) CAMERA mode — one recorded camera track (POD-17 camera-tracks
 *     core; a video-only WebM) is scaled/padded to the episode frame
 *     and muxed with the rendered program audio. The camera's own
 *     audio, if any exists in the file, is NEVER mapped — the audio
 *     is the POD-13 master, full stop. A camera shorter than the
 *     program is extended by freezing its last frame (`tpad` clone);
 *     a longer camera is trimmed. There is NO switching, mixing of
 *     multiple cameras, overlay, or scene work in v1 — one camera,
 *     full frame (see docs/podcast-studio/VIDEO.md).
 *
 * (b) SLIDESHOW mode — the floor every show gets, NO camera track
 *     required: the episode artwork plus per-chapter images (where
 *     the caller supplies them; artwork is the fallback for chapters
 *     without one) are shown as a slideshow timed to the POD-13
 *     chapter list, muxed with the same program audio.
 *
 * Honesty gate: the render only completes when the OUTPUT passes an
 * ffprobe verification — a video stream is present, the dimensions
 * are exactly the requested frame, and the duration matches the
 * program audio within tolerance (default 0.5 s). A failed probe
 * throws the named `VIDEO_PROBE_GATE` error and no result is
 * returned, so the service layer can never register or attach an
 * unverified video (the feed publishes a video enclosure only from
 * an attach that carries this probe — see feed-build.ts).
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../media/ffmpeg'
import { PodcastRenderError, type PodcastChapter, type RenderedFile } from './render'

export const VIDEO_FRAME = { width: 1280, height: 720 } as const
export const VIDEO_DURATION_TOLERANCE_SEC = 0.5

export type VideoRenderMode = 'camera' | 'slideshow'

export type MediaProbe = {
  durationSec: number
  format: string
  videoCodec: string | null
  audioCodec: string | null
  width: number
  height: number
}

type CommandResult = { stdout: string; stderr: string }

const runCommand = (
  binary: string,
  args: string[],
  options: { timeoutMs?: number; captureStdout?: boolean } = {},
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 30 * 60_000)
    child.stdout.on('data', (chunk: Buffer) => {
      if (options.captureStdout) stdoutChunks.push(chunk)
    })
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-64_000)))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`${binary} failed (${code ?? 'signal'}): ${stderr.slice(-1500)}`))
        return
      }
      resolve({ stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr })
    })
  })

const ffmpegPath = (request: { ffmpeg?: string }): string => resolveFfmpegBinary(request.ffmpeg)
const ffprobePath = (request: { ffprobe?: string }): string => resolveFfprobeBinary(request.ffprobe)

/** General ffprobe wrapper: container duration/format plus the first video and audio streams. */
export async function probeMediaFile(
  filePath: string,
  ffprobe: string = resolveFfprobeBinary(),
): Promise<MediaProbe> {
  const { stdout } = await runCommand(
    ffprobe,
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { captureStdout: true },
  )
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  return {
    durationSec: Number(parsed.format?.duration ?? video?.duration ?? audio?.duration ?? 0),
    format: String(parsed.format?.format_name ?? ''),
    videoCodec: video ? String(video.codec_name ?? '') : null,
    audioCodec: audio ? String(audio.codec_name ?? '') : null,
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
  }
}

export type SlideshowSlide = { imagePath: string; startSec: number; endSec: number }

/**
 * The slideshow timeline: one slide per chapter span (chapter image
 * where supplied for that chapter's start, artwork otherwise), an
 * artwork lead-in when the first chapter starts after 0, and a
 * single full-length artwork slide when there are no chapters. Pure.
 */
export function buildSlideshowSlides(input: {
  chapters: PodcastChapter[]
  chapterImages?: Array<{ startSec: number; imagePath: string }>
  artworkPath: string
  durationSec: number
}): SlideshowSlide[] {
  const chapters = [...input.chapters]
    .filter((chapter) => chapter.startTime < input.durationSec)
    .sort((a, b) => a.startTime - b.startTime)
  if (chapters.length === 0)
    return [{ imagePath: input.artworkPath, startSec: 0, endSec: input.durationSec }]
  const imageFor = (startSec: number): string =>
    input.chapterImages?.find((image) => Math.abs(image.startSec - startSec) < 0.01)?.imagePath ??
    input.artworkPath
  const slides: SlideshowSlide[] = []
  if (chapters[0]!.startTime > 0)
    slides.push({ imagePath: input.artworkPath, startSec: 0, endSec: chapters[0]!.startTime })
  chapters.forEach((chapter, index) => {
    const endSec = index + 1 < chapters.length ? chapters[index + 1]!.startTime : input.durationSec
    if (endSec > chapter.startTime)
      slides.push({ imagePath: imageFor(chapter.startTime), startSec: chapter.startTime, endSec })
  })
  return slides
}

export type VideoRenderRequest = {
  mode: VideoRenderMode
  /** The rendered program audio (the POD-13 master WAV/MP3) — the video's only audio source. */
  audioPath: string
  /** Camera mode: the recorded camera track file (video-only WebM). */
  cameraPath?: string
  /** Slideshow mode: the episode artwork (also the per-chapter fallback image). */
  artworkPath?: string
  /** The POD-13 chapter list the slideshow is timed to. */
  chapters?: PodcastChapter[]
  /** Per-chapter images for slideshow mode, keyed by chapter start. */
  chapterImages?: Array<{ startSec: number; imagePath: string }>
  /** Caller-owned scratch directory; the MP4 lands in `<workDir>/out`. */
  workDir: string
  /** Base name (no extension) for the output file; default 'program-video'. */
  outputName?: string
  width?: number
  height?: number
  /** Max |video − audio| duration delta for the probe gate; default 0.5 s. */
  durationToleranceSec?: number
  ffmpeg?: string
  ffprobe?: string
}

export type VideoRenderResult = {
  mode: VideoRenderMode
  file: RenderedFile
  /** The ffprobe verification of the OUTPUT file (the feed-honesty evidence). */
  probe: MediaProbe & { passed: true }
  audioDurationSec: number
  durationDeltaSec: number
  width: number
  height: number
  slides?: SlideshowSlide[]
}

const fileExists = (filePath: string): Promise<boolean> =>
  access(filePath).then(
    () => true,
    () => false,
  )

const frameFilter = (width: number, height: number): string =>
  `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`

/**
 * Renders one video episode MP4 inside `request.workDir`. Throws a
 * named PodcastRenderError on any failure — including the probe gate
 * — and returns a result ONLY for a probe-verified file.
 */
export async function renderVideoEpisode(request: VideoRenderRequest): Promise<VideoRenderResult> {
  const ffmpeg = ffmpegPath(request)
  const ffprobe = ffprobePath(request)
  const width = request.width ?? VIDEO_FRAME.width
  const height = request.height ?? VIDEO_FRAME.height
  const tolerance = request.durationToleranceSec ?? VIDEO_DURATION_TOLERANCE_SEC

  if (!(await fileExists(request.audioPath)))
    throw new PodcastRenderError(
      'VIDEO_SOURCE_MISSING',
      `Program audio "${request.audioPath}" is missing — the video render cannot start.`,
    )
  const audioProbe = await probeMediaFile(request.audioPath, ffprobe)
  if (!(audioProbe.durationSec > 0))
    throw new PodcastRenderError(
      'VIDEO_SOURCE_MISSING',
      `Program audio "${request.audioPath}" probes to zero duration — the video render cannot start.`,
    )
  const durationSec = audioProbe.durationSec

  const { mkdir } = await import('node:fs/promises')
  const outDir = path.join(request.workDir, 'out')
  await mkdir(outDir, { recursive: true })
  const base = request.outputName ?? 'program-video'
  const outPath = path.join(outDir, `${base}.mp4`)

  let slides: SlideshowSlide[] | undefined
  const args: string[] = ['-hide_banner', '-nostdin', '-y']
  if (request.mode === 'camera') {
    if (!request.cameraPath || !(await fileExists(request.cameraPath)))
      throw new PodcastRenderError(
        'VIDEO_SOURCE_MISSING',
        `Camera track "${request.cameraPath ?? ''}" is missing — the camera render cannot start.`,
      )
    const cameraProbe = await probeMediaFile(request.cameraPath, ffprobe)
    if (!cameraProbe.videoCodec)
      throw new PodcastRenderError(
        'VIDEO_NO_VIDEO_STREAM',
        `Camera track "${request.cameraPath}" contains no video stream — nothing to mux.`,
      )
    // Freeze-extend a short camera to the program length, then trim
    // exact: the output duration is the AUDIO duration in both cases.
    const padSec = Math.max(0, durationSec - cameraProbe.durationSec) + 0.25
    args.push(
      '-i',
      request.cameraPath,
      '-i',
      request.audioPath,
      '-filter_complex',
      `[0:v]${frameFilter(width, height)},tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)},trim=duration=${durationSec.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[vout]`,
      '-map',
      '[vout]',
      '-map',
      '1:a',
    )
  } else {
    if (!request.artworkPath || !(await fileExists(request.artworkPath)))
      throw new PodcastRenderError(
        'VIDEO_SOURCE_MISSING',
        `Episode artwork "${request.artworkPath ?? ''}" is missing — the slideshow render cannot start.`,
      )
    slides = buildSlideshowSlides({
      chapters: request.chapters ?? [],
      chapterImages: request.chapterImages,
      artworkPath: request.artworkPath,
      durationSec,
    })
    for (const slide of slides)
      if (!(await fileExists(slide.imagePath)))
        throw new PodcastRenderError(
          'VIDEO_SOURCE_MISSING',
          `Slideshow image "${slide.imagePath}" is missing — the slideshow render cannot start.`,
        )
    const listPath = path.join(request.workDir, 'slideshow.ffconcat')
    const escape = (value: string) => value.replace(/'/g, `'\\''`)
    const lines = ['ffconcat version 1.0']
    for (const slide of slides) {
      lines.push(`file '${escape(slide.imagePath)}'`)
      lines.push(`duration ${(slide.endSec - slide.startSec).toFixed(3)}`)
    }
    // The concat demuxer only honours the last slide's duration when
    // its file line is repeated without one.
    lines.push(`file '${escape(slides[slides.length - 1]!.imagePath)}'`)
    await writeFile(listPath, lines.join('\n') + '\n')
    args.push(
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-i',
      request.audioPath,
      '-filter_complex',
      `[0:v]${frameFilter(width, height)},trim=duration=${durationSec.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p[vout]`,
      '-map',
      '[vout]',
      '-map',
      '1:a',
    )
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-t',
    durationSec.toFixed(3),
    outPath,
  )
  await runCommand(ffmpeg, args)

  // The honesty gate: probe the OUTPUT and verify it before any
  // caller may register, attach or publish it.
  const probe = await probeMediaFile(outPath, ffprobe)
  const durationDeltaSec = Math.abs(probe.durationSec - durationSec)
  const problems: string[] = []
  if (!probe.videoCodec) problems.push('no video stream in the rendered file')
  if (probe.width !== width || probe.height !== height)
    problems.push(`dimensions ${probe.width}x${probe.height}, expected ${width}x${height}`)
  if (!probe.audioCodec) problems.push('no audio stream in the rendered file')
  if (durationDeltaSec > tolerance)
    problems.push(
      `duration ${probe.durationSec.toFixed(3)}s vs program audio ${durationSec.toFixed(3)}s (Δ ${durationDeltaSec.toFixed(3)}s > ${tolerance}s tolerance)`,
    )
  if (problems.length > 0)
    throw new PodcastRenderError(
      'VIDEO_PROBE_GATE',
      `Rendered video failed ffprobe verification: ${problems.join('; ')}. No video was promoted.`,
    )

  const bytes = await readFile(outPath)
  return {
    mode: request.mode,
    file: {
      path: outPath,
      filename: `${base}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: bytes.byteLength,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      durationSec: probe.durationSec,
    },
    probe: { ...probe, passed: true },
    audioDurationSec: durationSec,
    durationDeltaSec: Number(durationDeltaSec.toFixed(3)),
    width,
    height,
    ...(slides ? { slides } : {}),
  }
}
