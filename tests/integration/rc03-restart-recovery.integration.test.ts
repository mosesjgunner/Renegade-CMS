import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../../src/scripts/rc02-network.mjs'
import { getPayload, type Payload } from 'payload'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, generateKeyPairSync, verify } from 'node:crypto'
import { createServer } from 'node:https'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import config from '../../src/payload.config'
import {
  createEditorialArticle,
  requestEditorialReview,
  decideEditorialReview,
  scheduleEditorialPublication,
} from '../../src/modules/editorial/persistence'
import { queueActivityDelivery } from '../../src/modules/social/activitypub-runtime'

const runProcess = promisify(execFile)
let payload: Payload
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_release_acceptance'))
    throw new Error('Disposable RC database required')
  payload = await getPayload({ config })
})
afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('RC03 real durable jobs and local federation boundary', () => {
  it('durable pending publication survives competing fresh job runners and publishes one canonical revision', async () => {
    const site = (
      await payload.find({ collection: 'sites', limit: 1, depth: 0, overrideAccess: true })
    ).docs[0]
    const publication = (
      await payload.find({ collection: 'publications', limit: 1, depth: 0, overrideAccess: true })
    ).docs[0]
    const actorId = String(
      (await payload.find({ collection: 'users', limit: 1, overrideAccess: true })).docs[0].id,
    )
    const suffix = randomUUID().slice(0, 8)
    const bundle = await createEditorialArticle(payload, {
      siteId: String(site.id),
      publicationId: String(publication.id),
      title: `RC03 restart ${suffix}`,
      slug: `rc03-restart-${suffix}`,
      canonicalPath: `/articles/rc03-restart-${suffix}`,
      summary: 'Pending publication recovery.',
      sourceMarkdown: '# Restart evidence\n\nThe canonical publication occurs once.',
      actor: { id: actorId, role: 'author' },
      actorUserId: actorId,
    })
    const articleId = String(bundle.article.id)
    await requestEditorialReview(payload, { articleId, actor: { id: actorId, role: 'author' } })
    await decideEditorialReview(payload, {
      articleId,
      approved: true,
      actor: { id: actorId, role: 'publisher' },
    })
    const key = `rc03-restart:${suffix}`
    await scheduleEditorialPublication(payload, {
      articleId,
      actor: { id: actorId, role: 'publisher' },
      scheduledFor: new Date(Date.now() + 500).toISOString(),
      timeZone: 'America/Chicago',
      idempotencyKey: key,
    })
    const scheduled = (
      await payload.find({
        collection: 'scheduled-publish-jobs',
        where: { idempotencyKey: { equals: key } },
        overrideAccess: true,
      })
    ).docs[0]
    expect(scheduled.status).toBe('queued')
    const args = [
      '--import',
      'tsx',
      'tests/helpers/job-restart-process.ts',
      'run',
      String(typeof scheduled.job === 'object' ? scheduled.job?.id : scheduled.job),
    ]
    const options = {
      encoding: 'utf8' as const,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768' },
      timeout: 180_000,
      windowsHide: true,
    }
    // Separate OS processes contend for the real Payload job and shared PostgreSQL publication lock.
    const runners = await Promise.all([
      runProcess(process.execPath, args, options),
      runProcess(process.execPath, args, options),
    ])
    expect(runners.every((result) => result.stdout.includes('RESULT='))).toBe(true)
    await runProcess(process.execPath, args, options)
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
    expect(content.status).toBe('published')
    expect(
      (article.workflowAudit as Array<{ action: string }>).filter(
        (event) => event.action === 'publication.published',
      ),
    ).toHaveLength(1)
    expect(
      (
        await payload.find({
          collection: 'scheduled-publish-jobs',
          where: { idempotencyKey: { equals: key } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(1)
  }, 370_000)

  it('queues one local signed outbox message and truthfully retains a deliberate inbox failure', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const previous = {
      pem: process.env.ACTIVITYPUB_PRIVATE_KEY_PEM,
      keyId: process.env.ACTIVITYPUB_KEY_ID,
      allow: process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT,
    }
    process.env.ACTIVITYPUB_PRIVATE_KEY_PEM = keys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString()
    process.env.ACTIVITYPUB_KEY_ID = 'https://dispatch.rc02.test/actor#rc03-local-key'
    process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT = 'true'
    let signatures = 0
    const server = createServer(
      {
        key: readFileSync('scratch/rc02-tls/key.pem'),
        cert: readFileSync('scratch/rc02-tls/cert.pem'),
      },
      async (request, response) => {
        let body = ''
        for await (const chunk of request) body += chunk
        const signature = String(request.headers.signature).match(/signature="([^"]+)"/)?.[1]
        const signing = `(request-target): post /inbox\nhost: ${request.headers.host}\ndate: ${request.headers.date}\ndigest: ${request.headers.digest}`
        if (
          signature &&
          verify(
            'RSA-SHA256',
            Buffer.from(signing),
            keys.publicKey,
            Buffer.from(signature, 'base64'),
          )
        )
          signatures++
        expect(JSON.parse(body).type).toBe('Create')
        response.writeHead(503)
        response.end('Deliberate local inbox failure')
      },
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const origin = `https://dispatch.rc02.test:${address.port}`
    try {
      await payload.create({
        collection: 'remote-instances',
        data: { origin, status: 'active' },
        overrideAccess: true,
      })
      const input = {
        remoteActor: { profile: { inbox: `${origin}/inbox` } },
        envelope: {
          id: `${origin}/activity/${randomUUID()}`,
          type: 'Create',
          object: { type: 'Note', content: 'RC03 signing boundary' },
        },
      }
      const first = await queueActivityDelivery(payload, input)
      const duplicate = await queueActivityDelivery(payload, input)
      expect(duplicate.id).toBe(first.id)
      const jobs = await payload.find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: 'network-delivery' } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      const job = jobs.docs.find(
        (job) => (job.input as { deliveryId?: string }).deliveryId === first.id,
      )!
      expect(job).toBeTruthy()
      for (let attempt = 0; attempt < 3; attempt++) {
        await payload.jobs.runByID({ id: job.id, silent: true })
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2200))
      }
      const final = await payload.findByID({
        collection: 'outbound-network-deliveries',
        id: first.id,
        overrideAccess: true,
      })
      expect(final.status).toBe('failed')
      expect(signatures).toBe(3)
      const attempts = await payload.find({
        collection: 'network-delivery-attempts',
        where: { delivery: { equals: first.id } },
        limit: 100,
        overrideAccess: true,
      })
      expect(attempts.docs.some((attempt) => JSON.stringify(attempt.outcome).includes('503'))).toBe(
        true,
      )
      mkdirSync('scratch/integration-evidence', { recursive: true })
      writeFileSync(
        'scratch/integration-evidence/federation-boundary.json',
        JSON.stringify(
          {
            deliveryId: first.id,
            duplicateDeliveryId: duplicate.id,
            signaturesVerified: signatures,
            status: final.status,
            attempts: attempts.docs.map((attempt) => ({
              attempt: attempt.attempt,
              outcome: attempt.outcome,
            })),
            boundary: 'Local signing/outbox/failure only; no remote federation acceptance.',
          },
          null,
          2,
        ),
      )
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      for (const [key, value] of [
        ['ACTIVITYPUB_PRIVATE_KEY_PEM', previous.pem],
        ['ACTIVITYPUB_KEY_ID', previous.keyId],
        ['NETWORK_ALLOW_PRIVATE_DEVELOPMENT', previous.allow],
      ]) {
        if (value === undefined) delete process.env[key!]
        else process.env[key!] = value
      }
    }
  }, 60_000)
})
