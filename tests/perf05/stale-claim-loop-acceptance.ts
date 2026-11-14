/**
 * Perf Pass 0, lane 05 — case 3: repeated worker crashes must terminate a
 * media-variant job, never loop it forever.
 *
 * Evidence rules (per the acceptance bar):
 * - A counter bump alone proves nothing (normal completion bumps it too).
 *   Each recovery cycle must show BOTH, in order:
 *     1. RESET:   processing true->false, totalTried +1, completedAt still
 *                 null — only the reconciler produces this state.
 *     2. CLAIM:   processing false->true again — a fresh claim by the
 *                 worker, which is then crashed mid-run.
 * - The terminal mark is the same RESET shape with hasError=true.
 * - The final restart-and-hold must prove the worker actually reached
 *   the media step: a sentinel media job staged just before the hold has
 *   to complete under that worker while the terminal job stays failed,
 *   unclaimed, and unchanged.
 *
 * Run: python3 ~/workspace/with-env.py <envfile> npx tsx tests/perf05/stale-claim-loop-acceptance.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { uploadMedia } from '../../src/modules/media/workflow'

const ENV_FILE = '/home/hatch/workspace/gui01b-logs/perf05-env.local'
const WITH_ENV = '/home/hatch/workspace/with-env.py'
const world = JSON.parse(
  readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
)
const payload = await getPayload({ config })
const appConfig = loadConfig()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (msg: string) => console.log(`[case3] ${msg}`)

async function stagePng(label: string, size: number): Promise<{ assetId: string; jobId: string }> {
  const raw = Buffer.alloc(size * size * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256)
  const png = await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer()
  const owner = await payload.findByID({
    collection: 'users',
    id: world.ids.adminAUserId,
    depth: 0,
    overrideAccess: true,
  })
  const asset = await uploadMedia(payload, appConfig, {
    user: owner as never,
    scope: { kind: 'site', siteId: world.siteA.siteId } as never,
    title: `Perf05 acceptance ${label}`,
    originalFilename: `perf05-${label}.png`,
    bytes: new Uint8Array(png),
  })
  const assetId = String((asset as unknown as Record<string, unknown>).id)
  const jobs = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: 'media-variant-generate' } },
        { 'input.mediaAssetId': { equals: assetId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return { assetId, jobId: String((jobs.docs[0] as unknown as Record<string, unknown>).id) }
}

const { assetId, jobId } = await stagePng('case3d', 5500)
log(`staged asset ${assetId}, job ${jobId}`)

async function jobRow(id: string = jobId): Promise<Record<string, unknown>> {
  return (await payload.findByID({
    collection: 'payload-jobs',
    id,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown>
}
async function variantRows(): Promise<number> {
  const variants = await payload.find({
    collection: 'media-variants',
    where: { asset: { equals: assetId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  } as never)
  return variants.docs.length
}
function spawnWorker(): ChildProcess {
  const child = spawn('python3', [WITH_ENV, ENV_FILE, 'npm', 'run', 'jobs:worker'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, MEDIA_STALE_CLAIM_MS: '8000' },
  })
  child.unref()
  return child
}
function killWorker(child: ChildProcess) {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}
async function waitFor(label: string, timeoutMs: number, probe: () => Promise<boolean>) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await probe()) return true
    await sleep(2_000)
  }
  log(`timeout: ${label}`)
  return false
}
const snap = (j: Record<string, unknown>) =>
  `processing=${j.processing} totalTried=${j.totalTried} hasError=${j.hasError ?? false} completed=${Boolean(j.completedAt)}`

// Crash 0: claim the fresh job and kill the worker mid-run.
{
  const worker = spawnWorker()
  const claimed = await waitFor('initial claim', 420_000, async () => {
    const current = await jobRow()
    return current.processing === true
  })
  if (!claimed) {
    killWorker(worker)
    throw new Error('case3: initial claim never happened — environment too slow')
  }
  await sleep(3_000)
  killWorker(worker)
  log('crash 0: worker killed mid-run')
  await sleep(2_000)
}

// Recovery cycles: RESET evidence, then fresh CLAIM evidence, then crash.
let terminal = false
let expectedTried = 0
for (let cycle = 1; cycle <= 6 && !terminal; cycle++) {
  const worker = spawnWorker()
  const resetSeen = await waitFor(`cycle ${cycle} reset`, 600_000, async () => {
    const current = await jobRow()
    if (current.hasError === true && current.processing === false) return true
    return (
      current.processing === false &&
      current.completedAt == null &&
      Number(current.totalTried ?? 0) === expectedTried + 1
    )
  })
  const afterReset = await jobRow()
  log(`cycle ${cycle}: reset seen=${resetSeen} — ${snap(afterReset)}`)
  if (!resetSeen) {
    killWorker(worker)
    throw new Error(`case3: no reconciler reset observed in cycle ${cycle}`)
  }
  if (afterReset.hasError === true) {
    terminal = true
    killWorker(worker)
    break
  }
  expectedTried = Number(afterReset.totalTried ?? 0)
  const claimSeen = await waitFor(`cycle ${cycle} fresh claim`, 600_000, async () => {
    const current = await jobRow()
    return current.processing === true && current.completedAt == null
  })
  const afterClaim = await jobRow()
  log(`cycle ${cycle}: fresh claim seen=${claimSeen} — ${snap(afterClaim)}`)
  if (!claimSeen || afterClaim.completedAt) {
    killWorker(worker)
    throw new Error(`case3: no fresh claim in cycle ${cycle} (or job completed — inconclusive)`)
  }
  await sleep(3_000)
  const live = await jobRow()
  if (live.processing !== true) {
    killWorker(worker)
    throw new Error(`case3: claim in cycle ${cycle} did not stay live until the kill`)
  }
  killWorker(worker)
  log(`cycle ${cycle}: worker killed mid-run`)
  await sleep(2_000)
}
if (!terminal) throw new Error('case3: job did not go terminal within the crash budget')

// Restart-and-hold with a sentinel: the hold worker must provably reach
// and drain the media queue (sentinel job completes) while the terminal
// job stays failed, unclaimed, and unchanged.
const beforeHold = await jobRow()
const rowsBeforeHold = await variantRows()
const sentinel = await stagePng('case3d-sentinel', 64)
log(`hold: sentinel job ${sentinel.jobId} staged`)
{
  const worker = spawnWorker()
  const sentinelDone = await waitFor('sentinel completion under hold worker', 600_000, async () => {
    const current = await jobRow(sentinel.jobId)
    return Boolean(current.completedAt)
  })
  killWorker(worker)
  if (!sentinelDone) throw new Error('case3: hold worker never reached the media step')
}
const afterHold = await jobRow()
const rowsAfterHold = await variantRows()
const holdKept =
  afterHold.hasError === true &&
  afterHold.processing === false &&
  afterHold.completedAt == null &&
  Number(afterHold.totalTried ?? 0) === Number(beforeHold.totalTried ?? 0) &&
  rowsAfterHold === rowsBeforeHold
log(
  `hold: terminal job after restart — ${snap(afterHold)}; variant rows ${rowsBeforeHold} -> ${rowsAfterHold}`,
)

console.log(
  JSON.stringify(
    {
      ok: terminal && holdKept,
      jobId,
      finalTotalTried: afterHold.totalTried,
      hasError: afterHold.hasError ?? null,
      completedAt: afterHold.completedAt ?? null,
      variantRows: rowsAfterHold,
      sentinelCompleted: true,
      holdKept,
    },
    null,
    2,
  ),
)
if (!holdKept) throw new Error('case3: restart-and-hold disturbed the terminal job')
process.exit(0)
