#!/usr/bin/env node
/**
 * Installs the bundled ffmpeg audio engine into <repo root>/vendor/ffmpeg/.
 *
 * The engine is a standalone static binary fetched at install time — it is
 * not linked into the application. Its version and SHA-256 are pinned in
 * scripts/ffmpeg-bundle.json: verification FAILS CLOSED on a checksum
 * mismatch (an unverified binary is never installed).
 *
 * Test overrides: FFMPEG_BUNDLE_URL and FFMPEG_BUNDLE_SHA256 replace the
 * pinned download URL / checksum for this run only (used by
 * tests/unit/ffmpeg-bundle-install.test.ts against a local fixture).
 *
 * Flags: --force reinstalls even when the pinned version is present;
 * --dir <path> overrides the target directory (default vendor/ffmpeg).
 * Idempotent: a binary that already reports the pinned version is left
 * alone and no download happens.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

class BundleError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new BundleError(code, message)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const parseArgs = (argv) => {
  const args = { force: false, dir: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--force') {
      args.force = true
    } else if (arg === '--dir') {
      i += 1
      if (!argv[i])
        fail('FFMPEG_BUNDLE_USAGE', '--dir needs a path, for example --dir /tmp/ffmpeg.')
      args.dir = argv[i]
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/install-bundled-ffmpeg.mjs [--force] [--dir <path>]')
      process.exit(0)
    } else {
      fail('FFMPEG_BUNDLE_USAGE', `Unknown argument: ${arg}`)
    }
  }
  return args
}

const binaryVersion = async (binary) => {
  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-version'], { timeout: 10_000 })
    const firstLine = String(stdout || stderr || '').split('\n')[0] ?? ''
    const match = firstLine.match(/version\s+([^\s]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// The pinned static build reports itself as e.g. "7.0.2-static": the
// pinned release number with a build suffix is the pinned version.
const isPinnedVersion = (version, pinnedVersion) =>
  version === pinnedVersion ||
  (typeof version === 'string' &&
    (version.startsWith(`${pinnedVersion}-`) || version.startsWith(`${pinnedVersion}_`)))

const binaryFilters = async (binary) => {
  try {
    const { stdout, stderr } = await execFileAsync(binary, ['-filters'], { timeout: 10_000 })
    return String(stdout || stderr || '')
  } catch {
    return ''
  }
}

const sha256OfFile = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })

const findByName = async (dir, name) => {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === name) return full
    if (entry.isDirectory()) {
      const found = await findByName(full, name)
      if (found) return found
    }
  }
  return null
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'scripts', 'ffmpeg-bundle.json'), 'utf8'),
  )
  const pinnedVersion = String(manifest.version)
  const targetDir = args.dir ? path.resolve(args.dir) : path.join(repoRoot, 'vendor', 'ffmpeg')
  const ffmpegTarget = path.join(targetDir, 'ffmpeg')
  const ffprobeTarget = path.join(targetDir, 'ffprobe')

  if (!args.force && existsSync(ffmpegTarget) && existsSync(ffprobeTarget)) {
    const installed = await binaryVersion(ffmpegTarget)
    if (isPinnedVersion(installed, pinnedVersion)) {
      console.log(`Audio engine already installed (ffmpeg ${pinnedVersion}); nothing to do.`)
      return
    }
  }

  const buildKey = `${process.platform}-${process.arch}`
  const pinnedBuild = manifest.builds?.[buildKey]
  const downloadUrl = process.env.FFMPEG_BUNDLE_URL || pinnedBuild?.url
  const expectedSha256 = (
    process.env.FFMPEG_BUNDLE_SHA256 ||
    pinnedBuild?.sha256 ||
    ''
  ).toLowerCase()
  if (!downloadUrl || !expectedSha256) {
    fail(
      'FFMPEG_BUNDLE_UNSUPPORTED_PLATFORM',
      `No bundled audio engine is pinned for this computer (${buildKey}). ` +
        'Install ffmpeg 7 or newer another way, or set FFMPEG_PATH to an existing ffmpeg.',
    )
  }

  console.log(`Downloading the audio engine (ffmpeg ${pinnedVersion}) for ${buildKey}…`)
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-ffmpeg-bundle-'))
  try {
    const archivePath = path.join(tmpDir, 'ffmpeg-bundle.tar.xz')
    let response
    try {
      response = await fetch(downloadUrl)
    } catch (error) {
      fail(
        'FFMPEG_BUNDLE_DOWNLOAD_FAILED',
        `Could not download the audio engine: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (!response.ok) {
      fail(
        'FFMPEG_BUNDLE_DOWNLOAD_FAILED',
        `Could not download the audio engine (the server answered ${response.status}).`,
      )
    }
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))

    console.log('Checking the download is exactly the pinned build…')
    const actualSha256 = await sha256OfFile(archivePath)
    if (actualSha256.toLowerCase() !== expectedSha256) {
      fail(
        'FFMPEG_BUNDLE_CHECKSUM_MISMATCH',
        'The downloaded audio engine does not match its pinned checksum, so it was NOT installed. ' +
          `Expected ${expectedSha256}, got ${actualSha256.toLowerCase()}.`,
      )
    }
    console.log('Checksum verified.')

    const extractDir = path.join(tmpDir, 'extracted')
    await mkdir(extractDir, { recursive: true })
    try {
      // Only the binaries and the license are needed — the tarball also
      // carries manpages and model files we would throw away. Never
      // restore the tarball's file ownership (--no-same-owner): as root
      // that tries to chown to the packager's uid and can fail outright.
      await execFileAsync(
        'tar',
        [
          '--no-same-owner',
          '--wildcards',
          '-xf',
          archivePath,
          '-C',
          extractDir,
          '*/ffmpeg',
          '*/ffprobe',
          '*/GPLv3.txt',
        ],
        { timeout: 120_000 },
      )
    } catch {
      // Layout surprise: fall back to unpacking everything and searching it.
      await rm(extractDir, { recursive: true, force: true })
      await mkdir(extractDir, { recursive: true })
      try {
        await execFileAsync('tar', ['--no-same-owner', '-xf', archivePath, '-C', extractDir], {
          timeout: 120_000,
        })
      } catch (error) {
        fail(
          'FFMPEG_BUNDLE_EXTRACT_FAILED',
          `Could not unpack the audio engine download: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const ffmpegSource = await findByName(extractDir, 'ffmpeg')
    const ffprobeSource = await findByName(extractDir, 'ffprobe')
    if (!ffmpegSource || !ffprobeSource) {
      fail(
        'FFMPEG_BUNDLE_ARCHIVE_CONTENTS',
        'The audio engine download did not contain both ffmpeg and ffprobe, so nothing was installed.',
      )
    }
    const licenseSource = await findByName(extractDir, 'GPLv3.txt')

    await mkdir(targetDir, { recursive: true })
    await copyFile(ffmpegSource, ffmpegTarget)
    await copyFile(ffprobeSource, ffprobeTarget)
    await chmod(ffmpegTarget, 0o755)
    await chmod(ffprobeTarget, 0o755)
    if (licenseSource) {
      // The full GPL-3.0 text ships inside the tarball; keep it beside the binaries.
      await copyFile(licenseSource, path.join(targetDir, 'GPLv3.txt'))
    } else {
      console.log('Note: no GPLv3.txt was found in the download, so no license file was copied.')
    }

    console.log('Checking the installed audio engine runs…')
    const installedVersion = await binaryVersion(ffmpegTarget)
    const filters = await binaryFilters(ffmpegTarget)
    const missingFilters = ['loudnorm', 'subtitles'].filter((name) => !filters.includes(name))
    if (!isPinnedVersion(installedVersion, pinnedVersion) || missingFilters.length > 0) {
      await rm(ffmpegTarget, { force: true })
      await rm(ffprobeTarget, { force: true })
      fail(
        'FFMPEG_BUNDLE_VERIFY_FAILED',
        !isPinnedVersion(installedVersion, pinnedVersion)
          ? `The installed ffmpeg reported version ${installedVersion ?? 'none'} instead of the pinned ${pinnedVersion}, so it was removed.`
          : `The installed ffmpeg is missing required filters (${missingFilters.join(', ')}), so it was removed.`,
      )
    }
    console.log(`Audio engine ready: ffmpeg ${installedVersion} installed in ${targetDir}.`)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  const code = error instanceof BundleError ? error.code : 'FFMPEG_BUNDLE_FAILED'
  console.error(
    `Audio engine install failed [${code}]: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
})
