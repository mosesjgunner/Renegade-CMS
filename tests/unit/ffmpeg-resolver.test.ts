/**
 * Shared ffmpeg/ffprobe resolver (src/modules/media/ffmpeg.ts):
 * resolution order explicit > bundled > env > bare name, bundled
 * detection requiring an existing executable file, the audio-engine
 * probe (version parsing, missing reporting) and its cache reset.
 * All binaries are fake shell scripts in a temp dir; the temp dir
 * also becomes the cwd so the bundled lookup (`<cwd>/vendor/ffmpeg`)
 * is exercised for real.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AUDIO_ENGINE_MISSING,
  audioEngineMissing,
  bundledFfmpegPath,
  bundledFfprobePath,
  probeAudioEngine,
  resetAudioEngineProbeCache,
  resolveFfmpegBinary,
  resolveFfprobeBinary,
} from '../../src/modules/media/ffmpeg'

const originalCwd = process.cwd()
const originalFfmpegPath = process.env.FFMPEG_PATH
const originalFfprobePath = process.env.FFPROBE_PATH

let workDir: string

const writeExecutable = async (filePath: string, body: string): Promise<string> => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
  await chmod(filePath, 0o755)
  return filePath
}

const fakeVersionScript = (name: 'ffmpeg' | 'ffprobe', version: string): string =>
  `#!/bin/sh\necho '${name} version ${version} https://example.invalid/build'\n`

const restoreEnv = () => {
  if (originalFfmpegPath === undefined) delete process.env.FFMPEG_PATH
  else process.env.FFMPEG_PATH = originalFfmpegPath
  if (originalFfprobePath === undefined) delete process.env.FFPROBE_PATH
  else process.env.FFPROBE_PATH = originalFfprobePath
}

beforeEach(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'ffmpeg-resolver-'))
  process.chdir(workDir)
  delete process.env.FFMPEG_PATH
  delete process.env.FFPROBE_PATH
  resetAudioEngineProbeCache()
})

afterEach(async () => {
  process.chdir(originalCwd)
  restoreEnv()
  resetAudioEngineProbeCache()
  await rm(workDir, { recursive: true, force: true })
})

describe('ffmpeg resolver — resolution order', () => {
  it('falls back to the bare binary names when nothing else is set', () => {
    expect(resolveFfmpegBinary()).toBe('ffmpeg')
    expect(resolveFfprobeBinary()).toBe('ffprobe')
  })

  it('uses the env vars when no bundled binary exists', () => {
    process.env.FFMPEG_PATH = '/somewhere/ffmpeg-env'
    process.env.FFPROBE_PATH = '/somewhere/ffprobe-env'
    expect(resolveFfmpegBinary()).toBe('/somewhere/ffmpeg-env')
    expect(resolveFfprobeBinary()).toBe('/somewhere/ffprobe-env')
  })

  it('prefers the bundled binary over the env vars', async () => {
    const bundledFfmpeg = await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '1.0'),
    )
    const bundledFfprobe = await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffprobe'),
      fakeVersionScript('ffprobe', '1.0'),
    )
    process.env.FFMPEG_PATH = '/somewhere/ffmpeg-env'
    process.env.FFPROBE_PATH = '/somewhere/ffprobe-env'
    expect(bundledFfmpegPath()).toBe(bundledFfmpeg)
    expect(bundledFfprobePath()).toBe(bundledFfprobe)
    expect(resolveFfmpegBinary()).toBe(bundledFfmpeg)
    expect(resolveFfprobeBinary()).toBe(bundledFfprobe)
  })

  it('prefers an explicit path over bundled and env', async () => {
    await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '1.0'),
    )
    process.env.FFMPEG_PATH = '/somewhere/ffmpeg-env'
    expect(resolveFfmpegBinary('/explicit/ffmpeg')).toBe('/explicit/ffmpeg')
    expect(resolveFfprobeBinary('/explicit/ffprobe')).toBe('/explicit/ffprobe')
  })

  it('finds the deployment-root vendor from a standalone working directory', async () => {
    const bundledFfmpeg = await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '1.0'),
    )
    const bundledFfprobe = await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffprobe'),
      fakeVersionScript('ffprobe', '1.0'),
    )
    const standaloneDir = path.join(workDir, 'standalone')
    await mkdir(standaloneDir, { recursive: true })
    process.chdir(standaloneDir)
    expect(resolveFfmpegBinary()).toBe(bundledFfmpeg)
    expect(resolveFfprobeBinary()).toBe(bundledFfprobe)
    const status = await probeAudioEngine()
    expect(status.status).toBe('ready')
    expect(status.ffmpeg.source).toBe('bundled')
  })

  it('does not look outside the working directory when it is not a standalone dir', async () => {
    await writeExecutable(
      path.join(workDir, 'vendor', 'ffmpeg', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '1.0'),
    )
    const innerDir = path.join(workDir, 'somewhere-else')
    await mkdir(innerDir, { recursive: true })
    process.chdir(innerDir)
    expect(resolveFfmpegBinary()).toBe('ffmpeg')
  })

  it('ignores a bundled file that exists but is not executable', async () => {
    const bundled = path.join(workDir, 'vendor', 'ffmpeg', 'ffmpeg')
    await mkdir(path.dirname(bundled), { recursive: true })
    await writeFile(bundled, fakeVersionScript('ffmpeg', '1.0'))
    await chmod(bundled, 0o644)
    process.env.FFMPEG_PATH = '/somewhere/ffmpeg-env'
    expect(resolveFfmpegBinary()).toBe('/somewhere/ffmpeg-env')
    delete process.env.FFMPEG_PATH
    expect(resolveFfmpegBinary()).toBe('ffmpeg')
  })
})

describe('ffmpeg resolver — missing-engine error', () => {
  it('carries the AUDIO_ENGINE_MISSING code and the plain-language message', () => {
    const error = audioEngineMissing()
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(AUDIO_ENGINE_MISSING)
    expect(error.code).toBe('AUDIO_ENGINE_MISSING')
    expect(error.message).toBe("Audio processing isn't set up on this server yet.")
  })
})

describe('ffmpeg resolver — probe', () => {
  it('parses versions from fake ffmpeg/ffprobe scripts and reports ready', async () => {
    const ffmpeg = await writeExecutable(
      path.join(workDir, 'bin', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '7.0.2-static'),
    )
    const ffprobe = await writeExecutable(
      path.join(workDir, 'bin', 'ffprobe'),
      fakeVersionScript('ffprobe', '7.0.2-static'),
    )
    process.env.FFMPEG_PATH = ffmpeg
    process.env.FFPROBE_PATH = ffprobe
    const status = await probeAudioEngine()
    expect(status.status).toBe('ready')
    expect(status.ffmpeg).toEqual({ path: ffmpeg, source: 'env', version: '7.0.2-static' })
    expect(status.ffprobe).toEqual({ path: ffprobe, source: 'env', version: '7.0.2-static' })
  })

  it('reports missing for a nonexistent binary and never throws', async () => {
    process.env.FFMPEG_PATH = path.join(workDir, 'bin', 'no-such-ffmpeg')
    process.env.FFPROBE_PATH = path.join(workDir, 'bin', 'no-such-ffprobe')
    const status = await probeAudioEngine()
    expect(status.status).toBe('missing')
    expect(status.ffmpeg.version).toBeNull()
    expect(status.ffmpeg.source).toBe('env')
    expect(status.ffprobe.version).toBeNull()
  })

  it('caches the probe until the cache is reset', async () => {
    const ffmpeg = await writeExecutable(
      path.join(workDir, 'bin', 'ffmpeg'),
      fakeVersionScript('ffmpeg', '7.0.2-static'),
    )
    const ffprobe = await writeExecutable(
      path.join(workDir, 'bin', 'ffprobe'),
      fakeVersionScript('ffprobe', '7.0.2-static'),
    )
    process.env.FFMPEG_PATH = ffmpeg
    process.env.FFPROBE_PATH = ffprobe
    expect((await probeAudioEngine()).status).toBe('ready')

    process.env.FFMPEG_PATH = path.join(workDir, 'bin', 'gone')
    process.env.FFPROBE_PATH = path.join(workDir, 'bin', 'gone')
    // Still the cached result — the changed env is not re-read.
    expect((await probeAudioEngine()).status).toBe('ready')

    resetAudioEngineProbeCache()
    expect((await probeAudioEngine()).status).toBe('missing')
  })
})
