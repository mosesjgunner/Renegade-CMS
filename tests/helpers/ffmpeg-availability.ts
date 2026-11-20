import { spawnSync } from 'node:child_process'

import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../src/modules/media/ffmpeg'

/**
 * One-time probe for the real ffmpeg / ffprobe binaries.
 *
 * The podcast "real ffmpeg" measurement suites spawn the actual
 * binaries, resolved through the shared audio-engine resolver
 * (src/modules/media/ffmpeg) exactly the way the production code
 * resolves them: bundled vendor copy first, then FFMPEG_PATH /
 * FFPROBE_PATH, then the bare command on PATH. Those binaries exist
 * on the dev rig but not on every CI runner; there the spawning
 * suites must SKIP — via the named
 * conditions below, in the `describe.skipIf(!isPod19Db)` style —
 * instead of dying with `spawn ffprobe ENOENT`. Pure suites (graph
 * construction, string building, state machines) never import this
 * and keep running everywhere.
 */
const probe = (binary: string): boolean => {
  const result = spawnSync(binary, ['-version'], { encoding: 'utf8' })
  return !result.error && result.status === 0
}

/** True when the ffmpeg binary the render/conform/peaks code resolves is spawnable. */
export const hasFfmpeg = probe(resolveFfmpegBinary())

/** True when the ffprobe binary the render/probe code resolves is spawnable. */
export const hasFfprobe = probe(resolveFfprobeBinary())

/** True when both binaries are spawnable — the render/probe suites need the pair. */
export const hasFfmpegBinaries = hasFfmpeg && hasFfprobe
