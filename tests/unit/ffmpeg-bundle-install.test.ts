import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(__dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts', 'install-bundled-ffmpeg.mjs')

const FAKE_FFMPEG = `#!/bin/sh
if [ "$1" = "-version" ] || [ "$1" = "--version" ]; then
  echo "ffmpeg version 7.0.2 Copyright (c) 2000-2024 the FFmpeg developers"
  exit 0
fi
if [ "$1" = "-filters" ]; then
  echo "Filters:"
  echo " ... loudnorm          A->A       Loudness normalizer"
  echo " ... subtitles         V->V       Render text subtitles onto input video"
  exit 0
fi
exit 0
`

const FAKE_FFPROBE = `#!/bin/sh
if [ "$1" = "-version" ] || [ "$1" = "--version" ]; then
  echo "ffprobe version 7.0.2 Copyright (c) 2007-2024 the FFmpeg developers"
  exit 0
fi
exit 0
`

type RunResult = { code: number; stdout: string; stderr: string }

const runInstaller = async (dir: string, env: Record<string, string>): Promise<RunResult> => {
  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, '--dir', dir], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      timeout: 60_000,
    })
    return { code: 0, stdout: String(stdout), stderr: String(stderr) }
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string }
    return {
      code: typeof failed.code === 'number' ? failed.code : 1,
      stdout: String(failed.stdout ?? ''),
      stderr: String(failed.stderr ?? ''),
    }
  }
}

describe('bundled ffmpeg installer script', () => {
  let workDir: string
  let server: Server
  let bundleUrl: string
  let bundleSha256: string
  let baseUrl: string
  const requestCounts = new Map<string, number>()

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'ffmpeg-bundle-test-'))
    const fixtureDir = path.join(workDir, 'ffmpeg-7.0.2-amd64-static')
    await mkdir(fixtureDir, { recursive: true })
    const ffmpegPath = path.join(fixtureDir, 'ffmpeg')
    const ffprobePath = path.join(fixtureDir, 'ffprobe')
    await writeFile(ffmpegPath, FAKE_FFMPEG)
    await writeFile(ffprobePath, FAKE_FFPROBE)
    await writeFile(path.join(fixtureDir, 'GPLv3.txt'), 'GNU GENERAL PUBLIC LICENSE\n')
    await chmod(ffmpegPath, 0o755)
    await chmod(ffprobePath, 0o755)

    const archivePath = path.join(workDir, 'fixture.tar.xz')
    await execFileAsync('tar', ['-cJf', archivePath, '-C', workDir, 'ffmpeg-7.0.2-amd64-static'])
    const archive = await readFile(archivePath)
    bundleSha256 = createHash('sha256').update(archive).digest('hex')

    // The same archive with junk appended: valid bytes arrive, but the
    // checksum no longer matches — a download corrupted in transit.
    const corruptedArchive = Buffer.concat([archive, Buffer.from('corrupted-in-transit')])
    server = createServer((request, response) => {
      const count = (requestCounts.get(request.url ?? '') ?? 0) + 1
      requestCounts.set(request.url ?? '', count)
      if (request.url === '/fixture.tar.xz') {
        response.writeHead(200, { 'content-type': 'application/x-xz' })
        response.end(archive)
        return
      }
      if (request.url === '/flaky-checksum.tar.xz') {
        response.writeHead(200, { 'content-type': 'application/x-xz' })
        response.end(count === 1 ? corruptedArchive : archive)
        return
      }
      if (request.url === '/always-corrupt.tar.xz') {
        response.writeHead(200, { 'content-type': 'application/x-xz' })
        response.end(corruptedArchive)
        return
      }
      if (request.url === '/flaky-http.tar.xz') {
        if (count === 1) {
          response.writeHead(500)
          response.end()
          return
        }
        response.writeHead(200, { 'content-type': 'application/x-xz' })
        response.end(archive)
        return
      }
      response.writeHead(404)
      response.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('fixture server has no port')
    baseUrl = `http://127.0.0.1:${address.port}`
    bundleUrl = `${baseUrl}/fixture.tar.xz`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(workDir, { recursive: true, force: true })
  })

  it('installs a checksum-verified fixture, then skips on the second run', async () => {
    const targetDir = path.join(workDir, 'installed')
    const env = { FFMPEG_BUNDLE_URL: bundleUrl, FFMPEG_BUNDLE_SHA256: bundleSha256 }

    const first = await runInstaller(targetDir, env)
    expect(first.code, first.stderr).toBe(0)
    expect(first.stdout).toContain('Checksum verified.')
    expect(first.stdout).toContain('Audio engine ready: ffmpeg 7.0.2')
    expect(existsSync(path.join(targetDir, 'ffmpeg'))).toBe(true)
    expect(existsSync(path.join(targetDir, 'ffprobe'))).toBe(true)
    expect(existsSync(path.join(targetDir, 'GPLv3.txt'))).toBe(true)

    const second = await runInstaller(targetDir, env)
    expect(second.code, second.stderr).toBe(0)
    expect(second.stdout).toContain('already installed')
  })

  it('fails closed on a checksum mismatch and installs no binary', async () => {
    const targetDir = path.join(workDir, 'corrupted')
    const result = await runInstaller(targetDir, {
      FFMPEG_BUNDLE_URL: bundleUrl,
      FFMPEG_BUNDLE_SHA256: '0'.repeat(64),
    })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('FFMPEG_BUNDLE_CHECKSUM_MISMATCH')
    expect(existsSync(path.join(targetDir, 'ffmpeg'))).toBe(false)
    expect(existsSync(path.join(targetDir, 'ffprobe'))).toBe(false)
  })

  it('retries a corrupted download and installs the verified build', async () => {
    const targetDir = path.join(workDir, 'flaky-checksum')
    const result = await runInstaller(targetDir, {
      FFMPEG_BUNDLE_URL: `${baseUrl}/flaky-checksum.tar.xz`,
      FFMPEG_BUNDLE_SHA256: bundleSha256,
    })
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout).toContain('did not match its pinned checksum')
    expect(result.stdout).toContain('Checksum verified.')
    expect(result.stdout).toContain('Audio engine ready: ffmpeg 7.0.2')
    expect(existsSync(path.join(targetDir, 'ffmpeg'))).toBe(true)
    expect(existsSync(path.join(targetDir, 'ffprobe'))).toBe(true)
    expect(requestCounts.get('/flaky-checksum.tar.xz')).toBe(2)
  })

  it('retries a failed download and installs the verified build', async () => {
    const targetDir = path.join(workDir, 'flaky-http')
    const result = await runInstaller(targetDir, {
      FFMPEG_BUNDLE_URL: `${baseUrl}/flaky-http.tar.xz`,
      FFMPEG_BUNDLE_SHA256: bundleSha256,
    })
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout).toContain('the download failed')
    expect(result.stdout).toContain('Checksum verified.')
    expect(result.stdout).toContain('Audio engine ready: ffmpeg 7.0.2')
    expect(existsSync(path.join(targetDir, 'ffmpeg'))).toBe(true)
    expect(existsSync(path.join(targetDir, 'ffprobe'))).toBe(true)
    expect(requestCounts.get('/flaky-http.tar.xz')).toBe(2)
  })

  it('gives up after 3 corrupted downloads, fails closed, and installs nothing', async () => {
    const targetDir = path.join(workDir, 'always-corrupt')
    const result = await runInstaller(targetDir, {
      FFMPEG_BUNDLE_URL: `${baseUrl}/always-corrupt.tar.xz`,
      FFMPEG_BUNDLE_SHA256: bundleSha256,
    })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('FFMPEG_BUNDLE_CHECKSUM_MISMATCH')
    expect(requestCounts.get('/always-corrupt.tar.xz')).toBe(3)
    expect(existsSync(path.join(targetDir, 'ffmpeg'))).toBe(false)
    expect(existsSync(path.join(targetDir, 'ffprobe'))).toBe(false)
  })
})
