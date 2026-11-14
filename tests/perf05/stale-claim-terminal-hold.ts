/**
 * Perf Pass 0, lane 05 — case 3, terminal step + restart-and-hold.
 *
 * Continues the exact job staged by stale-claim-loop-acceptance.ts after
 * its cycles 1-4 (each: reconciler reset observed, fresh claim observed,
 * worker killed mid-run). That run's cycle-5 worker never reached the
 * media step within 600s — the fixture database's operations backlog had
 * grown past what a fresh worker drains in that window on this VM — so
 * the terminal mark is observed here against the same job, followed by
 * the sentinel restart-and-hold.
 *
 * Run: python3 ~/workspace/with-env.py <envfile> npx tsx tests/perf05/stale-claim-terminal-hold.ts
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
const JOB_ID = 'b8d46050-58a9-4827-964b-fa037c8123b1'
const ASSET_ID = 'ce44c6c9-c09c-4670-8795-151951462d2c'
const world = JSON.parse(
  readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
)
const payload = await getPayload({ config })
const appConfig = loadConfig()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (msg: string) => console.log(`[case3-terminal] ${msg}`)

async function jobRow(id: string): Promise<Record<string, unknown>> {
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
    where: { asset: { equals: ASSET_ID } },
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

const start = await jobRow(JOB_ID)
log(`starting state — ${snap(start)}`)
if (start.processing !== true || Number(start.totalTried ?? 0) !== 4 || start.hasError === true) {
  throw new Error('terminal step: job is not in the expected pre-terminal state')
}

// Terminal mark: one worker, never killed, must mark the job failed.
let terminal = false
{
  const worker = spawnWorker()
  terminal = await waitFor('terminal mark', 1_500_000, async () => {
    const current = await jobRow(JOB_ID)
    return current.hasError === true && current.processing === false
  })
  killWorker(worker)
}
const marked = await jobRow(JOB_ID)
log(`after terminal worker — ${snap(marked)}`)
if (!terminal) throw new Error('terminal step: job never went terminal')

// Restart-and-hold with a sentinel proving the worker reached the media
// queue while the terminal job stays exactly as marked.
const rowsBeforeHold = await variantRows()
const raw = Buffer.alloc(64 * 64 * 3, 128)
const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } })
  .png()
  .toBuffer()
const owner = await payload.findByID({
  collection: 'users',
  id: world.ids.adminAUserId,
  depth: 0,
  overrideAccess: true,
})
const sentinelAsset = await uploadMedia(payload, appConfig, {
  user: owner as never,
  scope: { kind: 'site', siteId: world.siteA.siteId } as never,
  title: 'Perf05 acceptance case3d-sentinel',
  originalFilename: 'perf05-case3d-sentinel.png',
  bytes: new Uint8Array(png),
})
const sentinelAssetId = String((sentinelAsset as unknown as Record<string, unknown>).id)
const sentinelJobs = await payload.find({
  collection: 'payload-jobs',
  where: {
    and: [
      { taskSlug: { equals: 'media-variant-generate' } },
      { 'input.mediaAssetId': { equals: sentinelAssetId } },
    ],
  },
  limit: 1,
  depth: 0,
  overrideAccess: true,
} as never)
const sentinelJobId = String((sentinelJobs.docs[0] as unknown as Record<string, unknown>).id)
log(`hold: sentinel job ${sentinelJobId} staged`)
let sentinelDone = false
{
  const worker = spawnWorker()
  sentinelDone = await waitFor('sentinel completion under hold worker', 1_200_000, async () => {
    const current = await jobRow(sentinelJobId)
    return Boolean(current.completedAt)
  })
  killWorker(worker)
}
if (!sentinelDone) throw new Error('terminal step: hold worker never reached the media step')
const afterHold = await jobRow(JOB_ID)
const rowsAfterHold = await variantRows()
const holdKept =
  afterHold.hasError === true &&
  afterHold.processing === false &&
  afterHold.completedAt == null &&
  Number(afterHold.totalTried ?? 0) === Number(marked.totalTried ?? 0) &&
  rowsAfterHold === rowsBeforeHold
log(
  `hold: terminal job after restart — ${snap(afterHold)}; variant rows ${rowsBeforeHold} -> ${rowsAfterHold}`,
)
console.log(
  JSON.stringify(
    {
      ok: terminal && sentinelDone && holdKept,
      jobId: JOB_ID,
      finalTotalTried: afterHold.totalTried,
      hasError: afterHold.hasError ?? null,
      completedAt: afterHold.completedAt ?? null,
      variantRows: rowsAfterHold,
      sentinelCompleted: sentinelDone,
      holdKept,
    },
    null,
    2,
  ),
)
if (!holdKept) throw new Error('terminal step: restart-and-hold disturbed the terminal job')
process.exit(0)
