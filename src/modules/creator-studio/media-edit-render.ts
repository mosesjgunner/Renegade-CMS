import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../media/ffmpeg'
import { cleanupProgramFilters, VOICE_CLEANUP_PRESET } from '../podcast-studio/intelligence/cleanup'
import { sourceFormats, type Dependency } from './media-edit-projects'
import { timelineDuration, type EditRecipe, type ExportProfile } from './media-edit-recipe'

export const renderRecipeVersion = 1
export const renderDeadlineMs = 8 * 60_000
const profiles = { landscape: [1280, 720], vertical: [720, 1280] }
const exec = promisify(execFile)
const seconds = (value: number) => value.toFixed(6)
const audioBase = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
const videoCodec = [
  '-c:v',
  'libx264',
  '-threads:v',
  '2',
  '-preset',
  'veryfast',
  '-crf',
  '20',
  '-maxrate',
  '5M',
  '-bufsize',
  '10M',
  '-pix_fmt',
  'yuv420p',
]
const audioCodec = ['-c:a', 'aac', '-b:a', '160k']
const inputLimits = [
  '-protocol_whitelist',
  'file',
  '-probesize',
  '5000000',
  '-analyzeduration',
  '5000000',
]
const localMov = ['-enable_drefs', '0', '-use_absolute_path', '0']

type Stream = {
  codec_type: string
  codec_name: string
  width?: number
  height?: number
  duration?: string
  nb_read_packets?: string
}
type Inspection = {
  streams: Stream[]
  chapters: Array<{ start_time: string; tags?: { title?: string } }>
  format: { duration?: string }
}
type LocalSource = Pick<Dependency, 'mimeType'> & { filename: string }
type AudioControls = Pick<
  EditRecipe['clips'][number],
  'gain' | 'muted' | 'audioFadeIn' | 'audioFadeOut'
>

const looks = {
  original: '',
  mono: 'hue=s=0',
  vivid: 'eq=contrast=1.1:saturation=1.35',
  bright: 'eq=brightness=0.07:gamma=1.11',
  'low-light': 'eq=gamma=1.35:saturation=1.12',
}

function fades(filter: 'fade' | 'afade', duration: number, fadeIn: number, fadeOut: number) {
  return [
    ...(fadeIn > 0 ? [`${filter}=t=in:st=0:d=${seconds(fadeIn)}`] : []),
    ...(fadeOut > 0
      ? [`${filter}=t=out:st=${seconds(duration - fadeOut)}:d=${seconds(fadeOut)}`]
      : []),
  ]
}

function audioFilters(controls: AudioControls, duration: number) {
  return [
    `volume=${controls.muted ? '0' : `${controls.gain}dB`}`,
    ...fades('afade', duration, controls.audioFadeIn, controls.audioFadeOut),
  ]
}

function mediaInput(source: LocalSource, seek = 0) {
  const demuxer = sourceFormats[source.mimeType]
  return [
    ...inputLimits,
    '-threads',
    '2',
    '-f',
    demuxer,
    ...(demuxer === 'mov' ? localMov : []),
    ...(seek ? ['-ss', seconds(seek)] : []),
    '-i',
    source.filename,
  ]
}

function timestamp(value: number) {
  const ms = Math.round(value * 1000)
  return new Date(ms).toISOString().slice(11, 23).replace('.', ',')
}

async function installFont(directory: string) {
  const candidates =
    process.platform === 'win32'
      ? [path.join(process.env.SystemRoot || 'C:/Windows', 'Fonts/arial.ttf')]
      : [
          '/usr/share/fonts/dejavu/DejaVuSans.ttf',
          '/usr/share/fonts/TTF/DejaVuSans.ttf',
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ]
  for (const file of candidates) {
    if (
      await access(file).then(
        () => true,
        () => false,
      )
    ) {
      await copyFile(file, path.join(directory, 'overlay.ttf'))
      return
    }
  }
  throw new Error('Media export font is unavailable.')
}

function metadataText(value: string) {
  return value.replace(/[\\;#=]/g, '\\$&')
}

export async function fileDigest(filename: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return `sha256:${hash.digest('hex')}`
}

export async function renderMediaEdit(input: {
  directory: string
  recipe: EditRecipe
  sources: Map<string, LocalSource>
  profile: ExportProfile
  signal: AbortSignal
}) {
  const { directory, recipe, sources, profile, signal } = input
  const duration = timelineDuration(recipe)
  const [width, height] = profiles[profile]
  const options = { cwd: directory, signal, maxBuffer: 512 * 1024, windowsHide: true }
  const ffmpeg = (args: string[]) =>
    exec(
      resolveFfmpegBinary(),
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-max_alloc',
        '134217728',
        '-filter_threads',
        '2',
        '-filter_complex_threads',
        '2',
        ...args,
      ],
      options,
    )
  const probe = async (filename: string, args: string[] = []): Promise<Inspection> =>
    JSON.parse(
      (
        await exec(
          resolveFfprobeBinary(),
          [
            '-v',
            'error',
            '-max_alloc',
            '134217728',
            ...inputLimits,
            ...args,
            '-show_entries',
            'stream=codec_type,codec_name,width,height,duration,nb_read_packets:format=duration:chapter=start_time:chapter_tags=title',
            '-of',
            'json',
            filename,
          ],
          options,
        )
      ).stdout,
    )

  if (!recipe.clips.length) throw new Error('Add a clip before rendering.')
  const source = (id: string) => {
    const item = sources.get(id)
    if (!item) throw new Error('Missing source.')
    return item
  }
  const inspected = new Map<string, Inspection>()
  for (const [id, item] of sources) {
    const demuxer = sourceFormats[item.mimeType]
    const inspection = await probe(item.filename, [
      '-f',
      demuxer,
      ...(demuxer === 'mov' ? localMov : []),
    ])
    if (
      inspection.streams.some(
        (stream) =>
          stream.codec_type === 'video' &&
          (!stream.width || !stream.height || stream.width * stream.height > 16_777_216),
      )
    )
      throw new Error('A source exceeds the supported frame size.')
    inspected.set(id, inspection)
  }

  const segments: Array<{ filename: string; duration: number }> = []
  let elapsed = 0
  let frameBoundary = 0
  for (const [index, clip] of recipe.clips.entries()) {
    const item = source(clip.asset)
    const inspection = inspected.get(clip.asset)!
    const length = clip.out - clip.in
    elapsed += length
    const endFrame = Math.round(elapsed * 30)
    const frameCount = endFrame - frameBoundary
    const segmentDuration = frameCount / 30
    frameBoundary = endFrame
    const still = item.mimeType.startsWith('image/')
    const visual = inspection.streams.find((stream) => stream.codec_type === 'video')
    if (
      !visual ||
      (!still && clip.out > Number(visual.duration ?? inspection.format?.duration) + 0.1)
    )
      throw new Error('A clip exceeds the available source.')
    const hasAudio =
      !clip.muted && inspection.streams.some((stream) => stream.codec_type === 'audio')
    const crop = clip.crop
    const w = Math.round((width * clip.scale) / 2) * 2
    const h = Math.round((height * clip.scale) / 2) * 2
    const rotation = { 0: '', 90: 'transpose=clock', 180: 'hflip,vflip', 270: 'transpose=cclock' }
    const filters = [
      'format=yuv444p',
      `crop=iw*${crop.width}:ih*${crop.height}:iw*${crop.x}:ih*${crop.y}`,
      rotation[clip.rotation],
      clip.fit === 'cover' ? `crop=min(iw\\,ih*${w}/${h}):min(ih\\,iw*${h}/${w})` : '',
      clip.fit === 'cover'
        ? `scale=${w}:${h}`
        : `scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      `crop=min(iw\\,${width}):min(ih\\,${height})`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      'setsar=1',
      looks[clip.look],
      'setpts=PTS-STARTPTS',
      `tpad=stop_mode=clone:stop_duration=${seconds(still ? length : 0.12)}`,
      'fps=30',
      `trim=end_frame=${frameCount}`,
      ...fades('fade', length, clip.fadeIn, clip.fadeOut),
    ]
      .filter(Boolean)
      .join(',')
    const output = `clip-${index}.nut`
    await ffmpeg([
      ...mediaInput(item, still ? 0 : clip.in),
      ...(hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
      '-map',
      '0:v:0',
      '-map',
      hasAudio ? '0:a:0' : '1:a:0',
      '-vf',
      filters,
      '-af',
      [audioBase, 'apad', ...audioFilters(clip, length)].join(','),
      '-t',
      seconds(segmentDuration),
      ...videoCodec,
      '-bf',
      '0',
      '-c:a',
      'pcm_s16le',
      '-map_metadata',
      '-1',
      output,
    ])
    const segment = await probe(output, ['-count_packets'])
    const segmentVideo = segment.streams.find((stream) => stream.codec_type === 'video')
    if (Number(segmentVideo?.nb_read_packets) !== frameCount)
      throw new Error(
        `Clip ${index + 1} decoded ${segmentVideo?.nb_read_packets ?? 0} of ${frameCount} frames.`,
      )
    segments.push({ filename: output, duration: segmentDuration })
  }

  await writeFile(
    path.join(directory, 'clips.txt'),
    segments
      .map(({ filename, duration }) => `file ${filename}\nduration ${seconds(duration)}\n`)
      .join(''),
  )
  const args = [...inputLimits, '-f', 'concat', '-safe', '1', '-i', 'clips.txt']
  const graph = ['[0:v:0]fps=30[program]']
  let nextInput = 1
  let video = 'program'
  let audio = '0:a:0'
  if (recipe.layers.some((layer) => layer.kind !== 'graphic')) await installFont(directory)
  for (const [index, layer] of recipe.layers.entries()) {
    const next = `layer${index}`
    const enabled = `enable='gte(t,${seconds(layer.start)})*lt(t,${seconds(layer.end)})'`
    if (layer.kind === 'graphic') {
      args.push(...mediaInput(source(layer.asset)))
      const overlay = `graphic${index}`
      graph.push(
        `[${nextInput++}:v:0]format=rgba,scale=${Math.round((width * layer.width) / 2) * 2}:${Math.round((height * 0.8) / 2) * 2}:force_original_aspect_ratio=decrease[${overlay}]`,
      )
      graph.push(
        `[${video}][${overlay}]overlay=x=(W-w)*${layer.x}:y=(H-h)*${layer.y}:${enabled}[${next}]`,
      )
    } else {
      const file = `layer-${index}.txt`
      await writeFile(path.join(directory, file), layer.text)
      const style =
        layer.kind === 'brand'
          ? 'box=1:boxcolor=black@0.75:boxborderw=12'
          : 'shadowcolor=black:shadowx=2:shadowy=2'
      graph.push(
        `[${video}]drawtext=fontfile=overlay.ttf:textfile=${file}:expansion=none:fontcolor=${layer.color}:fontsize=${Math.round(width * 0.048)}:x=(w-tw)*${layer.x}:y=(h-th)*${layer.y}:${style}:${enabled}[${next}]`,
      )
    }
    video = next
  }
  const voice = recipe.voiceover
  if (voice) {
    const item = source(voice.asset)
    const inspection = inspected.get(voice.asset)!
    const audioStream = inspection.streams.find((stream) => stream.codec_type === 'audio')
    const length = voice.out - voice.in
    if (
      !audioStream ||
      voice.out > Number(audioStream.duration ?? inspection.format?.duration) + 0.1
    )
      throw new Error('The voiceover exceeds the available source.')
    args.push(...mediaInput(item, voice.in))
    const cleanup = voice.cleanup ? cleanupProgramFilters(VOICE_CLEANUP_PRESET).filters : []
    const filters = [
      `atrim=duration=${seconds(length)}`,
      'asetpts=PTS-STARTPTS',
      audioBase,
      ...cleanup,
      ...audioFilters(voice, length),
      `adelay=${Math.round(voice.offset * 1000)}:all=1`,
    ].join(',')
    graph.push(`[${nextInput++}:a:0]${filters}[voice]`)
    graph.push(
      '[0:a:0][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false:latency=true[mix]',
    )
    audio = 'mix'
  }
  let captions: number | undefined
  if (recipe.captions.length) {
    await writeFile(
      path.join(directory, 'captions.srt'),
      recipe.captions
        .map(
          (cue, index) =>
            `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n\n`,
        )
        .join(''),
    )
    captions = nextInput++
    args.push(...inputLimits, '-f', 'srt', '-i', 'captions.srt')
  }
  let chapters: number | undefined
  if (recipe.chapters.length) {
    await writeFile(
      path.join(directory, 'chapters.txt'),
      ';FFMETADATA1\n' +
        recipe.chapters
          .map(
            (chapter, index) =>
              `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(chapter.at * 1000)}\nEND=${Math.round((recipe.chapters[index + 1]?.at ?? duration) * 1000)}\ntitle=${metadataText(chapter.title)}\n`,
          )
          .join(''),
    )
    chapters = nextInput++
    args.push(...inputLimits, '-f', 'ffmetadata', '-i', 'chapters.txt')
  }

  const final = 'output.mp4'
  await ffmpeg([
    ...args,
    '-filter_complex',
    graph.join(';'),
    '-map',
    `[${video}]`,
    '-map',
    audio === '0:a:0' ? audio : `[${audio}]`,
    ...(captions === undefined
      ? []
      : ['-map', `${captions}:s:0`, '-c:s', 'mov_text', '-disposition:s:0', 'default']),
    '-map_metadata',
    String(chapters ?? -1),
    '-map_chapters',
    String(chapters ?? -1),
    '-t',
    seconds(duration),
    ...videoCodec,
    ...audioCodec,
    '-movflags',
    '+faststart',
    final,
  ])
  const report = await probe(final, ['-count_packets', '-show_chapters'])
  const visual = report.streams.find((stream) => stream.codec_type === 'video')
  const sound = report.streams.find((stream) => stream.codec_type === 'audio')
  const subtitle = report.streams.find((stream) => stream.codec_type === 'subtitle')
  if (
    visual?.codec_name !== 'h264' ||
    visual.width !== width ||
    visual.height !== height ||
    !(Number(visual.nb_read_packets) >= Math.floor(duration * 30) - 2) ||
    sound?.codec_name !== 'aac' ||
    !(Number(sound.nb_read_packets) > 0) ||
    !Number.isFinite(Number(report.format?.duration)) ||
    Math.abs(Number(report.format.duration) - duration) > 0.12 ||
    (recipe.captions.length &&
      (subtitle?.codec_name !== 'mov_text' ||
        !(Number(subtitle.nb_read_packets) >= recipe.captions.length))) ||
    (report.chapters?.length ?? 0) !== recipe.chapters.length ||
    recipe.chapters.some(
      (chapter, index) =>
        report.chapters[index]?.tags?.title !== chapter.title ||
        Math.abs(Number(report.chapters[index]?.start_time) - chapter.at) > 0.002,
    )
  )
    throw new Error('The MP4 did not pass stream verification.')

  await ffmpeg([
    '-xerror',
    ...inputLimits,
    '-threads',
    '2',
    '-i',
    final,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-f',
    'null',
    '-',
  ])
  const thumbnail = 'thumbnail.jpg'
  await ffmpeg([
    ...(recipe.thumbnailAsset
      ? mediaInput(source(recipe.thumbnailAsset))
      : ['-ss', seconds(recipe.thumbnailAt), ...inputLimits, '-i', final]),
    '-frames:v',
    '1',
    '-vf',
    'scale=640:-2',
    '-threads:v',
    '1',
    '-q:v',
    '3',
    thumbnail,
  ])
  const image = (await probe(thumbnail)).streams[0]
  if (image?.codec_name !== 'mjpeg' || !image.width || !image.height)
    throw new Error('The thumbnail did not pass verification.')
  async function verifiedFile(name: string, maxBytes: number) {
    const filename = path.join(directory, name)
    const { size } = await stat(filename)
    if (!size || size > maxBytes) throw new Error('Output exceeds the render size limit.')
    return { filename, size, checksum: await fileDigest(filename) }
  }
  return {
    video: await verifiedFile(final, 100 * 1024 * 1024),
    thumbnail: await verifiedFile(thumbnail, 2 * 1024 * 1024),
    report: {
      recipeVersion: renderRecipeVersion,
      width,
      height,
      duration: Number(report.format.duration),
      videoCodec: visual.codec_name,
      audioCodec: sound.codec_name,
      captions: recipe.captions.length,
      chapters: recipe.chapters.length,
      thumbnailWidth: image.width,
      thumbnailHeight: image.height,
    },
  }
}
