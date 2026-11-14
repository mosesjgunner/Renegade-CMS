/**
 * Perf Pass 0, lane 05 — crash-replay acceptance for stale media-variant
 * job claims. Disposable fixture data only (b01 world database).
 *
 * Case 1: kill the worker mid-generation; after a restart (with a short
 *   stale-claim threshold via MEDIA_STALE_CLAIM_MS), the ORIGINAL job —
 *   no re-upload, no manual reset — completes with all variants ready.
 * Case 2: a slow but still-running job is NOT reclaimed by the reconciler
 *   at the production threshold, and completes normally.
 * Case 3: repeated worker crashes cannot loop forever — after the retry
 *   budget is consumed by stale-claim recoveries, the job goes terminal
 *   (hasError) and is never run again; variants are never duplicated.
 *
 * Run: python3 ~/workspace/with-env.py <envfile> npx tsx tests/perf05/stale-claim-acceptance.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import sharp from 'sharp'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { uploadMedia } from '../../src/modules/media/workflow'
import { recoverStaleMediaVariantJobs } from '../../src/modules/media/tasks'

const ENV_FILE = '/home/hatch/workspace/gui01b-logs/perf05-env.local'
const WITH_ENV = '/home/hatch/workspace/with-env.py'
const world = JSON.parse(
  readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
)

const payload = await getPayload({ config })
const appConfig = loadConfig()
const results: Record<string, unknown> = {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function hugePng(): Promise<Uint8Array> {
  const size = 5000
  const raw = Buffer.alloc(size * size * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256)
  const png = await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

async function stage(label: string): Promise<{ assetId: string; jobId: string }> {
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
    bytes: await hugePng(),
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
  const job = jobs.docs[0] as unknown as Record<string, unknown>
  return { assetId, jobId: String(job.id) }
}

async function jobRow(jobId: string): Promise<Record<string, unknown>> {
  const job = await payload.findByID({
    collection: 'payload-jobs',
    id: jobId,
    depth: 0,
    overrideAccess: true,
  } as never)
  return job as unknown as Record<string, unknown>
}

async function variantStats(assetId: string) {
  const variants = await payload.find({
    collection: 'media-variants',
    where: { asset: { equals: assetId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  } as never)
  const docs = variants.docs as unknown as Record<string, unknown>[]
  const ready = docs.filter((d) => d.processingState === 'ready').length
  // A variant's identity is recipe + format + label: one recipe emits
  // several format rows, so recipeKey alone repeats legitimately.
  const keys = docs.map(
    (d) => `${String(d.recipeKey)}|${String(d.format)}|${String(d.label ?? '')}`,
  )
  return { total: docs.length, ready, duplicates: keys.length - new Set(keys).size }
}

function spawnWorker(extraEnv: Record<string, string> = {}): ChildProcess {
  const child = spawn('python3', [WITH_ENV, ENV_FILE, 'npm', 'run', 'jobs:worker'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...extraEnv },
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

async function waitFor(
  label: string,
  timeoutMs: number,
  probe: () => Promise<boolean>,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await probe()) return
    await sleep(1_000)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

// ---------- Case 1: crash, restart, original job completes 20/20 ----------
{
  const { assetId, jobId } = await stage('case1')
  const worker = spawnWorker()
  await waitFor('case1 job claimed', 180_000, async () => {
    const job = await jobRow(jobId)
    return job.processing === true
  })
  killWorker(worker)
  await sleep(3_000)
  const stuck = await jobRow(jobId)
  if (stuck.processing !== true || stuck.completedAt) {
    throw new Error('case1: job did not remain stuck after the kill — crash not replayed')
  }
  const worker2 = spawnWorker({ MEDIA_STALE_CLAIM_MS: '8000' })
  try {
    await waitFor('case1 job completed after restart', 420_000, async () => {
      const job = await jobRow(jobId)
      return Boolean(job.completedAt)
    })
  } finally {
    killWorker(worker2)
  }
  const job = await jobRow(jobId)
  const stats = await variantStats(assetId)
  results.case1 = { jobId, hasError: job.hasError ?? null, ...stats }
  if (job.hasError) throw new Error('case1: recovered job ended in error')
  if (stats.ready !== stats.total || stats.total === 0 || stats.duplicates !== 0) {
    throw new Error(`case1: variants incomplete or duplicated: ${JSON.stringify(stats)}`)
  }
}

// ---------- Case 2: slow live job is not reclaimed ----------
{
  const { assetId, jobId } = await stage('case2')
  const worker = spawnWorker()
  try {
    await waitFor('case2 job claimed', 180_000, async () => {
      const job = await jobRow(jobId)
      return job.processing === true
    })
    const recovered = await recoverStaleMediaVariantJobs(payload as never)
    const during = await jobRow(jobId)
    results.case2 = { recovered, processingDuringRun: during.processing }
    if (recovered !== 0) throw new Error('case2: reconciler touched a live job')
    if (during.processing !== true) throw new Error('case2: live job claim was disturbed')
    await waitFor('case2 job completed normally', 420_000, async () => {
      const job = await jobRow(jobId)
      return Boolean(job.completedAt)
    })
  } finally {
    killWorker(worker)
  }
  const stats = await variantStats(assetId)
  results.case2 = { ...(results.case2 as object), ...stats }
  if (stats.ready !== stats.total || stats.total === 0) {
    throw new Error(`case2: variants incomplete: ${JSON.stringify(stats)}`)
  }
}

// ---------- Case 3: repeated crashes terminate, never loop ----------
{
  const { assetId, jobId } = await stage('case3')
  for (let cycle = 0; cycle < 8; cycle++) {
    const job = await jobRow(jobId)
    if (job.hasError === true || job.completedAt) break
    const worker = spawnWorker({ MEDIA_STALE_CLAIM_MS: '8000' })
    const claimed = await waitFor(`case3 cycle ${cycle} claim`, 180_000, async () => {
      const current = await jobRow(jobId)
      return (
        current.processing === true || current.hasError === true || Boolean(current.completedAt)
      )
    })
      .then(() => true)
      .catch(() => false)
    killWorker(worker)
    await sleep(2_000)
    if (!claimed) break
  }
  await sleep(12_000) // let any final recovery cycle mark the job terminal
  const worker = spawnWorker({ MEDIA_STALE_CLAIM_MS: '8000' })
  await sleep(30_000)
  killWorker(worker)
  const job = await jobRow(jobId)
  const stats = await variantStats(assetId)
  results.case3 = {
    hasError: job.hasError ?? null,
    processing: job.processing,
    completedAt: job.completedAt ?? null,
    totalTried: job.totalTried,
    ...stats,
  }
  if (job.hasError !== true)
    throw new Error('case3: job did not go terminal after repeated crashes')
  if (job.completedAt) throw new Error('case3: terminal job nevertheless completed')
  if (stats.duplicates !== 0) throw new Error('case3: duplicate variants generated')
}

console.log(JSON.stringify({ ok: true, results }, null, 2))
process.exit(0)
