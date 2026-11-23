import { execFile } from 'node:child_process'
import { copyFile, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../media/ffmpeg'
import { inspectMedia } from '../media/storage'
import { validateWebVtt } from '../media/video'
import { MediaWorkflowError } from '../media/workflow'

const run = promisify(execFile)
const pixelLimit = 24_000_000
const documentLimit = 8 * 1024 * 1024
const runDocument = (binary: string, args: string[]) =>
  process.platform === 'linux'
    ? run(
        '/bin/sh',
        ['-c', 'ulimit -v 524288 && ulimit -c 0 && exec "$@"', 'creator-document', binary, ...args],
        { timeout: 8_000, maxBuffer: 64 * 1024 },
      )
    : run(binary, args, { timeout: 8_000, maxBuffer: 64 * 1024 })

export type SourceScan = (
  source: Readonly<{ filename: string; checksum: string }>,
) => Promise<'clean' | 'infected' | 'unavailable'>

/** Operators may attach an executable that reads the path and returns a scanner verdict. */
export const scanSubmissionSource: SourceScan = async ({ filename }) => {
  const scanner = process.env.CREATOR_UPLOAD_SCANNER
  if (!scanner)
    return process.env.CREATOR_UPLOAD_REQUIRE_SCANNER === 'true' ? 'unavailable' : 'clean'
  try {
    const { stdout } = await run(scanner, [filename], { timeout: 30_000, maxBuffer: 4096 })
    return stdout.trim() === 'clean'
      ? 'clean'
      : stdout.trim() === 'infected'
        ? 'infected'
        : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const unsupported = () =>
  new MediaWorkflowError('Unsupported, unsafe, or corrupt source file.', 415)

async function sourceHeader(filename: string) {
  const handle = await open(filename, 'r')
  try {
    const header = Buffer.alloc(512 * 1024)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return header.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function derivePdf(filename: string, output: string, size: number) {
  if (size > documentLimit) throw unsupported()
  const original = await readFile(filename)
  const source = original.toString('latin1')
  if (
    !/%%EOF\s*$/.test(source) ||
    /\/(?:Encrypt|ObjStm|JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA|JBIG2Decode|JPXDecode)\b/i.test(
      source.replace(/#([a-f\d]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    )
  )
    throw unsupported()
  const { stdout } = await runDocument(process.env.CREATOR_PDFINFO || 'pdfinfo', [filename])
  const pages = Number(/^Pages:\s+(\d+)$/m.exec(stdout)?.[1])
  if (!Number.isInteger(pages) || pages < 1 || pages > 20) throw unsupported()
  // Render one page at a time and build a fresh image-only PDF from the output.
  const pageFile = output + '.page.jpg'
  const header = Buffer.from('%PDF-1.4\n')
  const parts: Buffer[] = [header]
  const offsets = [0]
  let length = header.length
  function add(body: (string | Buffer)[]) {
    offsets.push(length)
    for (const value of [`${offsets.length - 1} 0 obj\n`, ...body, '\nendobj\n']) {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
      parts.push(bytes)
      length += bytes.length
    }
    if (length > documentLimit) throw unsupported()
  }
  add(['<< /Type /Catalog /Pages 2 0 R >>'])
  add([
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`,
  ])
  try {
    for (let page = 1; page <= pages; page++) {
      await runDocument(process.env.CREATOR_PDFTOPPM || 'pdftoppm', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-singlefile',
        '-scale-to',
        '1200',
        '-jpeg',
        filename,
        output + '.page',
      ])
      if ((await stat(pageFile)).size > documentLimit) throw unsupported()
      const image = await sharp(pageFile, { limitInputPixels: 1_440_000 }).jpeg().toBuffer()
      const { width, height } = await sharp(image).metadata()
      const first = 3 + (page - 1) * 3
      const draw = `q ${width} 0 0 ${height} 0 0 cm /Im Do Q\n`
      add([
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im ${first + 1} 0 R >> >> /Contents ${first + 2} 0 R >>`,
      ])
      add([
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
        image,
        '\nendstream',
      ])
      add([`<< /Length ${draw.length} >>\nstream\n${draw}endstream`])
    }
    parts.push(
      Buffer.from(
        `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
          .slice(1)
          .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
          .join(
            '',
          )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
      ),
    )
    await writeFile(output, Buffer.concat(parts), { mode: 0o600 })
  } finally {
    await rm(pageFile, { force: true })
  }
}

export async function prepareSubmissionSource(filename: string, size: number, claimedType: string) {
  const derivative = path.join(path.dirname(filename), 'preview')
  try {
    const header = await sourceHeader(filename)
    const ebml = header.length >= 4 && header.readUInt32BE(0) === 0x1a45dfa3
    const sniffed =
      ebml && header.subarray(4, 128).includes(Buffer.from('webm'))
        ? { mimeType: 'video/webm', kind: 'video', width: undefined, height: undefined }
        : inspectMedia(header)
    if (sniffed.mimeType === 'image/svg+xml') throw unsupported()
    let sourceMime: string = sniffed.mimeType
    let mimeType: string = sourceMime
    let kind: string = sniffed.kind
    let durationSeconds: number | undefined
    if (kind === 'image') {
      if ((sniffed.width ?? 1) * (sniffed.height ?? 1) > pixelLimit) throw unsupported()
      const image = sharp(await readFile(filename), {
        limitInputPixels: pixelLimit,
        failOn: 'warning',
      })
      const metadata = await image.metadata()
      if ((metadata.pages ?? 1) > 1 || metadata.width * metadata.height > pixelLimit)
        throw unsupported()
      await image
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp()
        .toFile(derivative)
      mimeType = 'image/webp'
    } else if (kind === 'audio' || kind === 'video') {
      const format = {
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'video/mp4': 'mov',
        'video/webm': 'matroska',
      }[sourceMime]
      if (!format) throw unsupported()
      const input = [
        '-protocol_whitelist',
        'file',
        '-max_alloc',
        '67108864',
        '-f',
        format,
        ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []),
      ]
      const { stdout } = await run(
        resolveFfprobeBinary(),
        [
          '-v',
          'error',
          ...input,
          '-show_entries',
          'format=duration:stream=index,codec_type,codec_name,width,height:stream_disposition=attached_pic',
          '-of',
          'json',
          filename,
        ],
        { timeout: 15_000, maxBuffer: 128 * 1024 },
      )
      const probe = JSON.parse(stdout) as {
        streams?: Array<{
          index: number
          codec_type: string
          codec_name: string
          width?: number
          height?: number
          disposition?: { attached_pic?: number }
        }>
        format?: { duration?: string }
      }
      const tracks = probe.streams ?? []
      const video = tracks.find(
        (stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1,
      )
      const audio = tracks.find((stream) => stream.codec_type === 'audio')
      const duration = Number(probe.format?.duration)
      if (
        (!video && !audio) ||
        (video && !['mov', 'matroska'].includes(format)) ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 14_400 ||
        (video &&
          (!video.width ||
            !video.height ||
            video.width * video.height > pixelLimit ||
            !(format === 'mov' ? ['h264', 'hevc', 'av1'] : ['vp8', 'vp9', 'av1']).includes(
              video.codec_name,
            )))
      )
        throw unsupported()
      durationSeconds = duration
      if (format === 'mov' && !video) sourceMime = 'audio/mp4'
      if (format === 'matroska' && !video) sourceMime = 'audio/webm'
      kind = video ? 'video' : 'audio'
      mimeType = sourceMime
      const maps = [video, audio].flatMap((track) => (track ? ['-map', `0:${track.index}`] : []))
      await run(
        resolveFfmpegBinary(),
        [
          '-nostdin',
          '-v',
          'error',
          '-xerror',
          '-y',
          ...input,
          '-i',
          filename,
          ...maps,
          '-map_metadata',
          '-1',
          '-map_metadata:s',
          '-1',
          '-map_chapters',
          '-1',
          '-c',
          'copy',
          '-fs',
          String(size + 1024 * 1024),
          '-f',
          format === 'mov' ? 'mp4' : format === 'matroska' ? 'webm' : format,
          derivative,
        ],
        { timeout: 60_000, maxBuffer: 128 * 1024 },
      )
      const rendered = await run(
        resolveFfprobeBinary(),
        [
          '-v',
          'error',
          ...input,
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          derivative,
        ],
        { timeout: 15_000, maxBuffer: 4096 },
      )
      if (!(Number(rendered.stdout) >= duration - Math.min(1, duration / 10))) throw unsupported()
    } else if (sourceMime === 'application/pdf') {
      await derivePdf(filename, derivative, size)
    } else if (sourceMime === 'text/vtt' && size <= documentLimit) {
      const bytes = await readFile(filename)
      validateWebVtt(bytes)
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!/^WEBVTT(?:[ \t][^\r\n]*)?\r?\n/.test(text) || /[<\u0000]/.test(text))
        throw unsupported()
      await copyFile(filename, derivative)
      mimeType = 'text/plain; charset=utf-8'
    } else throw unsupported()
    if (
      claimedType &&
      claimedType !== 'application/octet-stream' &&
      claimedType !== sourceMime &&
      !(sourceMime === 'video/mp4' && claimedType === 'video/quicktime') &&
      !(sourceMime === 'audio/webm' && claimedType === 'video/webm') &&
      !(sourceMime === 'audio/mp4' && ['video/mp4', 'audio/x-m4a'].includes(claimedType)) &&
      !(
        sourceMime === 'audio/wav' &&
        ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(claimedType)
      ) &&
      !(sourceMime === 'audio/mpeg' && claimedType === 'audio/mp3') &&
      !(sourceMime === 'audio/ogg' && claimedType === 'application/ogg') &&
      !(claimedType === 'text/plain' && sourceMime === 'text/vtt')
    )
      throw unsupported()
    return { kind, sourceMime, mimeType, durationSeconds }
  } catch (error) {
    await rm(derivative, { force: true })
    const code = (error as { code?: string | number }).code
    if (code === 'ENOENT' || code === 127)
      throw new MediaWorkflowError('The required media or document probe is unavailable.', 503)
    throw unsupported()
  }
}
