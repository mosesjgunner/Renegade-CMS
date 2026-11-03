/* eslint-disable @typescript-eslint/no-explicit-any -- disposable recovery harness */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import {
  createEditorialArticle,
  requestEditorialReview,
  decideEditorialReview,
  scheduleEditorialPublication,
} from '../../src/modules/editorial/persistence'
import { executeScheduledPublishJob } from '../../src/modules/editorial/scheduler'

assert.equal(process.env.RC117E_PUBLICATION, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:55418/rc117epub_release_acceptance',
)
const payload: any = await getPayload({ config })
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const mode = process.argv[2]
if (mode === 'lease' || mode === 'commit') {
  const update = payload.update.bind(payload)
  payload.update = async (args: any) => {
    if (
      mode === 'commit' &&
      args.collection === 'scheduled-publish-jobs' &&
      args.data?.status === 'completed'
    ) {
      console.log('PUBLICATION_COMMITTED')
      await new Promise(() => {})
    }
    const result = await update(args)
    if (
      mode === 'lease' &&
      args.collection === 'scheduled-publish-jobs' &&
      args.data?.status === 'processing'
    ) {
      console.log('LEASE_PERSISTED')
      await new Promise(() => {})
    }
    return result
  }
  await executeScheduledPublishJob(payload, process.argv[3], {
    workerId: 'crashed-harness',
    leaseDurationSeconds: 6,
  })
  throw new Error('Expected process interruption')
}
const trace: string[] = []
const commitCase = mode === 'commit-journey'
function check(name: string, condition: unknown) {
  assert.ok(condition, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
async function waitFor<T>(name: string, fn: () => Promise<T | false>, timeout = 60000): Promise<T> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await pause(300)
  }
  throw new Error(`Timed out: ${name}`)
}
let child: ChildProcess | undefined
let worker: ChildProcess | undefined
try {
  const demo = await ensureRenegadePartyDemo(payload)
  const suffix = Date.now().toString()
  const bundle: any = await createEditorialArticle(payload, {
    siteId: demo.siteId,
    publicationId: demo.publicationId,
    title: `17E interruption ${suffix}`,
    slug: `rc117e-${suffix}`,
    canonicalPath: `/articles/rc117e-${suffix}`,
    summary: 'Recovery of a scheduled publication.',
    sourceMarkdown: '# Recovery\n\nOne publication.',
    actor: { id: demo.userId, role: 'author' },
    actorUserId: demo.userId,
  })
  const articleId = String(bundle.article.id)
  await requestEditorialReview(payload, { articleId, actor: { id: demo.userId, role: 'author' } })
  await decideEditorialReview(payload, {
    articleId,
    approved: true,
    actor: { id: demo.userId, role: 'publisher' },
  })
  const key = `rc117e:${suffix}`
  await scheduleEditorialPublication(payload, {
    articleId,
    actor: { id: demo.userId, role: 'publisher' },
    actorUserId: demo.userId,
    scheduledFor: new Date(Date.now() + 1000).toISOString(),
    timeZone: 'UTC',
    idempotencyKey: key,
  })
  const rows = await payload.find({
    collection: 'scheduled-publish-jobs',
    where: { idempotencyKey: { equals: key } },
    overrideAccess: true,
  })
  const jobId = String(rows.docs[0].id)
  check(
    'normal editorial scheduling persisted one queued job',
    rows.totalDocs === 1 && rows.docs[0].status === 'queued',
  )
  await pause(1500)
  child = spawn(
    process.execPath,
    ['--import', 'tsx', 'tests/rc1-17e/publication.ts', commitCase ? 'commit' : 'lease', jobId],
    { env: process.env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true },
  )
  let output = ''
  child.stdout!.on('data', (chunk) => {
    output += String(chunk)
  })
  await waitFor('interruption point', async () =>
    output.includes(commitCase ? 'PUBLICATION_COMMITTED' : 'LEASE_PERSISTED'),
  )
  const leased = await payload.findByID({
    collection: 'scheduled-publish-jobs',
    id: jobId,
    overrideAccess: true,
  })
  check(
    'processing lease persisted before interruption',
    leased.status === 'processing' && leased.leaseOwner === 'crashed-harness',
  )
  if (commitCase) {
    const before = await payload.findByID({
      collection: 'content',
      id: String(bundle.content.id),
      depth: 0,
      overrideAccess: true,
    })
    check('publication committed before job finalization', before.status === 'published')
  }
  const exited = new Promise((resolve) => child!.once('exit', resolve))
  child.kill('SIGKILL')
  await exited
  child = undefined
  worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: process.env,
    stdio: 'ignore',
    windowsHide: true,
  })
  const completed: any = await waitFor(
    'worker recovery',
    async () => {
      const row = await payload.findByID({
        collection: 'scheduled-publish-jobs',
        id: jobId,
        overrideAccess: true,
      })
      return row.status === 'completed' && row
    },
    90000,
  )
  const article = await payload.findByID({
    collection: 'article-family-content',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  })
  const content = await payload.findByID({
    collection: 'content',
    id: String(bundle.content.id),
    depth: 0,
    overrideAccess: true,
  })
  const events = (article.workflowAudit ?? []).filter(
    (event: any) => event.action === 'publication.published',
  )
  check(
    'worker recovered expired lease and finalized job',
    completed.leaseOwner == null && completed.leaseExpiresAt == null,
  )
  check(
    'published content persisted exactly one publication audit',
    content.status === 'published' && events.length === 1,
  )
  await executeScheduledPublishJob(payload, jobId, { workerId: 'replay' })
  const replay = await payload.findByID({
    collection: 'article-family-content',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  })
  check(
    'replay does not add publication effect',
    replay.workflowAudit.filter((event: any) => event.action === 'publication.published').length ===
      1,
  )
  const payloadJobId = String(typeof completed.job === 'object' ? completed.job.id : completed.job)
  const payloadJob: any = await waitFor('payload job finalization', async () => {
    const job = await payload.findByID({
      collection: 'payload-jobs',
      id: payloadJobId,
      depth: 0,
      overrideAccess: true,
    })
    return job.completedAt && job
  })
  check('underlying payload job reaches completed state without an error', !payloadJob.hasError)
  await writeFile(
    `docs/rc/evidence/rc1/18-pass/17E/publication-${commitCase ? 'commit-final' : 'lease-rerun'}-trace.json`,
    JSON.stringify(
      {
        trace,
        jobId,
        articleId,
        status: completed.status,
        publicationEvents: events.length,
        payloadJobId,
        payloadJobAttempts: payloadJob.totalTried,
        leaseSeconds: 6,
        boundary: `service-created schedule; instrumented scheduler process killed ${commitCase ? 'after publication commit before job finalization' : 'after lease write'}; actual worker recovery`,
      },
      null,
      2,
    ),
  )
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL')
  if (worker && worker.exitCode === null) {
    const exited = new Promise((resolve) => worker!.once('exit', resolve))
    worker.kill('SIGKILL')
    await exited
  }
  await payload.destroy()
}
process.exit(0)
