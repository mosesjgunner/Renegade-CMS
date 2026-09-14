import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

import { LocalFfmpegVideoProcessor, localVideoRecipe } from '../modules/media/video'

const evidenceDir = process.argv[2] || '/tmp/med05-video-evidence'
await mkdir(evidenceDir, { recursive: true })
const sourcePath = path.join(evidenceDir, 'small-real-source.mp4')

await new Promise<void>((resolve, reject) => {
  const child = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=24:duration=6',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=6',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      sourcePath,
    ],
    { stdio: 'inherit' },
  )
  child.once('error', reject)
  child.once('close', (code) =>
    code === 0 ? resolve() : reject(new Error(`fixture ffmpeg exited ${code}`)),
  )
})

const source = new Uint8Array(await (await import('node:fs/promises')).readFile(sourcePath))
const progress: number[] = []
const startedAt = Date.now()
const result = await new LocalFfmpegVideoProcessor().process({
  source,
  recipe: localVideoRecipe,
  onProgress: (value) => {
    progress.push(value)
  },
})
let segmentIndex = 0
for (const output of result.outputs) {
  const filename =
    output.key === 'hls' && output.mimeType === 'video/mp2t'
      ? `segment-${String(segmentIndex++).padStart(3, '0')}.ts`
      : output.key === 'hls'
        ? 'stream.m3u8'
        : `${output.key}.${output.mimeType === 'video/mp4' ? 'mp4' : 'jpg'}`
  await writeFile(path.join(evidenceDir, filename), output.bytes)
}
const manifest = {
  generatedAt: new Date().toISOString(),
  processor: 'local-ffmpeg',
  recipe: localVideoRecipe,
  elapsedMs: Date.now() - startedAt,
  progress,
  metadata: result.metadata,
  outputs: result.outputs.map(({ bytes, ...output }) => ({
    ...output,
    sizeBytes: bytes.byteLength,
  })),
}
await writeFile(path.join(evidenceDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest, null, 2))
