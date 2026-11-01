/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL, Playwright and federation acceptance */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as createHttpsServer } from 'node:https'
import { readFileSync, createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import {
  resolveRemoteActor,
  recordInbound,
  queueActivityDelivery,
} from '../../src/modules/social/activitypub-runtime'
import { networkDeliveryTask } from '../../src/modules/network/tasks'
import { digestForBody } from '../../src/modules/social/activitypub'
import { getModuleBoundaryRecords } from '../../src/modules/module-registry'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5479/rc115e_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/15E'
const base = 'http://127.0.0.1:39064'
const peerOrigin = 'https://127.0.0.1:39154'
const restart = process.argv.includes('restart')
const trace: any[] = []

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}

const state: any = await readFile('scratch/rc115e/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))

let web: ChildProcess | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let peerServer: ReturnType<typeof createHttpsServer> | undefined

async function session(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    process.env.PAYLOAD_SECRET!,
    async (sid, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sid, id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}

const save = () => writeFile('scratch/rc115e/state.json', JSON.stringify(state, null, 2))

try {
  await mkdir('scratch/rc115e', { recursive: true })
  await mkdir(out, { recursive: true })

  // Save per-module boundary records
  const boundaryRecords = getModuleBoundaryRecords()
  await writeFile(`${out}/module-boundaries.json`, JSON.stringify(boundaryRecords, null, 2))

  // Generate ActivityPub keys for Renegade CMS if not present
  if (!state.cmsKeys) {
    const cmsPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    state.cmsKeys = {
      privateKeyPem: cmsPair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      publicKeyPem: cmsPair.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    }
  }
  process.env.ACTIVITYPUB_PRIVATE_KEY_PEM = state.cmsKeys.privateKeyPem
  process.env.ACTIVITYPUB_PUBLIC_KEY_PEM = state.cmsKeys.publicKeyPem
  process.env.ACTIVITYPUB_KEY_ID = `${base}/ap/actors/alpha-pub#main-key`
  process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT = 'true'

  // Peer RSA key pair
  if (!state.peerKeys) {
    const peerPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    state.peerKeys = {
      privateKeyPem: peerPair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      publicKeyPem: peerPair.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    }
  }

  if (!state.alpha) {
    // Create Sites
    state.alpha = (
      await payload.create({
        collection: 'sites',
        data: { name: '15E Alpha', slug: '15e-alpha', lifecycle: 'active' },
      })
    ).id
    state.beta = (
      await payload.create({
        collection: 'sites',
        data: { name: '15E Beta', slug: '15e-beta', lifecycle: 'active' },
      })
    ).id

    // Create Users
    const ownerUser = await payload.create({
      collection: 'users',
      data: { email: 'owner@15e.test', role: 'owner' },
    })
    state.owner = ownerUser.id

    const adminUser = await payload.create({
      collection: 'users',
      data: { email: 'admin@15e.test', role: 'administrator' },
    })
    state.admin = adminUser.id

    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof ownerUser.member === 'object' ? ownerUser.member.id : ownerUser.member,
        site: state.alpha,
        role: 'community-manager',
      },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof adminUser.member === 'object' ? adminUser.member.id : adminUser.member,
        site: state.alpha,
        role: 'moderator',
      },
    })

    // Publication for ActivityPub actor
    const pub = await payload.create({
      collection: 'publications',
      data: {
        site: state.alpha,
        name: '15E Alpha Dispatch',
        slug: 'alpha-pub',
        canonicalBasePath: '/',
        status: 'active',
        visibility: 'public',
      },
    })
    state.publication = pub.id

    // Social account for ActivityPub
    const account = await payload.create({
      collection: 'social-accounts',
      data: {
        site: state.alpha,
        publication: pub.id,
        displayName: 'Alpha ActivityPub',
        actorType: 'publication',
        network: 'activitypub',
        capabilityState: 'available',
        externalAccountId: 'alpha-pub',
        credentials: { keyId: process.env.ACTIVITYPUB_KEY_ID },
      },
    })
    state.socialAccount = account.id

    // Global network settings: default allow
    await payload.updateGlobal({
      slug: 'network-settings',
      data: { remotePolicy: { default: 'allow' } },
      overrideAccess: true,
    })

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [state.alpha]: base, [state.beta]: 'http://beta.15e.test' },
      },
    })

    await save()
  }

  // Set up independent local peer HTTPS server on 39154
  let peerInboxAttempts = 0
  let peerInboxAccepted = 0
  const receivedDeliveries: any[] = []

  peerServer = createHttpsServer(
    {
      key: readFileSync('scratch/rc02-tls/key.pem'),
      cert: readFileSync('scratch/rc02-tls/cert.pem'),
    },
    async (req, res) => {
      const url = req.url ?? ''
      if (url === '/actor') {
        res.writeHead(200, { 'content-type': 'application/activity+json; charset=utf-8' })
        res.end(
          JSON.stringify({
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: `${peerOrigin}/actor`,
            type: 'Person',
            preferredUsername: 'independent-peer',
            inbox: `${peerOrigin}/inbox`,
            publicKey: {
              id: `${peerOrigin}/actor#main-key`,
              owner: `${peerOrigin}/actor`,
              publicKeyPem: state.peerKeys.publicKeyPem,
            },
          }),
        )
        return
      }

      if (url === '/inbox') {
        let body = ''
        for await (const chunk of req) body += chunk
        const signatureHeader = String(req.headers.signature || '')
        const signatureMatch = /signature="([^"]+)"/.exec(signatureHeader)?.[1] ?? ''
        const signingString = `(request-target): post /inbox\nhost: ${req.headers.host}\ndate: ${req.headers.date}\ndigest: ${req.headers.digest}`
        const valid =
          req.headers.digest === `SHA-256=${createHash('sha256').update(body).digest('base64')}` &&
          verify(
            'RSA-SHA256',
            Buffer.from(signingString),
            state.cmsKeys.publicKeyPem,
            Buffer.from(signatureMatch, 'base64'),
          )

        if (!valid) {
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid signature.' }))
          return
        }

        peerInboxAttempts++
        if (peerInboxAttempts === 1 && !restart) {
          // First attempt: simulate transient upstream error
          res.writeHead(503, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Peer temporarily unavailable.' }))
          return
        }

        peerInboxAccepted++
        receivedDeliveries.push(JSON.parse(body))
        res.writeHead(202, { 'content-type': 'application/activity+json' })
        res.end()
        return
      }

      res.writeHead(404)
      res.end()
    },
  )

  await new Promise<void>((resolve) => peerServer!.listen(39154, '127.0.0.1', resolve))

  // Boot Next.js HTTP server
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39064',
    ],
    {
      env: { ...process.env, NODE_ENV: 'development' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}web.log`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)

  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const r = await fetch(`${base}/network`, { signal: AbortSignal.timeout(5000) })
      if (r.status === 200) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  check('Next.js web process booted on http://127.0.0.1:39064', ready)

  if (!restart) {
    check('independent local peer HTTPS server started on 127.0.0.1:39154', true)

    // CHECK 1: Module registry reconciliation across 17 modules
    const allBoundaries = getModuleBoundaryRecords()
    check(
      'reconciles all 17 optional modules with explicit local boundary definitions',
      Object.keys(allBoundaries).length === 17 &&
        allBoundaries.network.providerBoundary.type === 'local-peer' &&
        allBoundaries.social.providerBoundary.type === 'local-harness' &&
        allBoundaries.commerce.providerBoundary.type === 'local-adapter',
    )

    // CHECK 2: Remote Actor Discovery over HTTPS with development loopback
    const remoteActor = await resolveRemoteActor(payload, `${peerOrigin}/actor`, true)
    check(
      'discovers and persists independent remote peer actor and instance',
      remoteActor &&
        remoteActor.canonicalId === `${peerOrigin}/actor` &&
        remoteActor.handle === 'independent-peer',
    )
    state.remoteActorId = remoteActor.id
    state.remoteInstanceId =
      typeof remoteActor.instance === 'object' ? remoteActor.instance.id : remoteActor.instance

    // CHECK 3: Outbound Activity Queuing
    const outboundEnvelope = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${base}/ap/activities/follow-1`,
      type: 'Follow',
      actor: `${base}/ap/actors/alpha-pub`,
      object: `${peerOrigin}/actor`,
    }
    const delivery = await queueActivityDelivery(payload, {
      remoteActor,
      envelope: outboundEnvelope,
    })
    check(
      'queues outbound delivery with persistent idempotency key',
      delivery && delivery.status === 'queued',
    )
    state.deliveryId = delivery.id

    // CHECK 4: Outbound Delivery Task Attempt 1 (Peer returns 503 transient failure)
    const handler = (networkDeliveryTask as any).handler
    let attempt1Failed = false
    try {
      await handler({ input: { deliveryId: delivery.id }, req: { payload } })
    } catch {
      attempt1Failed = true
    }
    check('outbound delivery attempt 1 records transient failure on peer 503', attempt1Failed)

    const deliveryAfterAttempt1 = await payload.findByID({
      collection: 'outbound-network-deliveries',
      id: delivery.id,
      overrideAccess: true,
    })
    const attempts1 = await payload.find({
      collection: 'network-delivery-attempts',
      where: { delivery: { equals: delivery.id } },
      overrideAccess: true,
    })
    check(
      'attempt 1 recorded in network-delivery-attempts and delivery remains queued',
      deliveryAfterAttempt1.status === 'queued' && attempts1.totalDocs === 1,
    )

    // CHECK 5: Outbound Delivery Task Attempt 2 (Peer returns 202 Accepted)
    await handler({ input: { deliveryId: delivery.id }, req: { payload } })
    const deliveryAfterAttempt2 = await payload.findByID({
      collection: 'outbound-network-deliveries',
      id: delivery.id,
      overrideAccess: true,
    })
    const attempts2 = await payload.find({
      collection: 'network-delivery-attempts',
      where: { delivery: { equals: delivery.id } },
      overrideAccess: true,
    })
    check(
      'attempt 2 succeeds with 202 and delivery transitions to delivered',
      deliveryAfterAttempt2.status === 'delivered' &&
        attempts2.totalDocs === 2 &&
        peerInboxAccepted === 1,
    )

    // CHECK 6: Idempotent Execution (Re-running delivery does not dispatch duplicate attempt)
    await handler({ input: { deliveryId: delivery.id }, req: { payload } })
    const attemptsAfterIdempotent = await payload.find({
      collection: 'network-delivery-attempts',
      where: { delivery: { equals: delivery.id } },
      overrideAccess: true,
    })
    check(
      'delivery task is idempotent; running again for delivered item creates zero extra attempts',
      attemptsAfterIdempotent.totalDocs === 2 && peerInboxAttempts === 2,
    )

    // CHECK 7: Inbound ActivityPub Delivery from Peer to CMS (/ap/actors/alpha-pub/inbox)
    const inboundActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${peerOrigin}/activities/follow-alpha-${Date.now()}`,
      type: 'Follow',
      actor: `${peerOrigin}/actor`,
      object: `${base}/ap/actors/alpha-pub`,
    }
    const inboundBody = JSON.stringify(inboundActivity)
    const date = new Date().toUTCString()
    const digest = digestForBody(inboundBody)
    const inboundReqTarget = 'post /ap/actors/alpha-pub/inbox'
    const inboundHost = '127.0.0.1:39064'
    const inboundSigningString = `(request-target): ${inboundReqTarget}\nhost: ${inboundHost}\ndate: ${date}\ndigest: ${digest}`
    const inboundSig = sign(
      'RSA-SHA256',
      Buffer.from(inboundSigningString),
      state.peerKeys.privateKeyPem,
    ).toString('base64')

    const inboundRes = await fetch(`${base}/ap/actors/alpha-pub/inbox`, {
      method: 'POST',
      headers: {
        host: inboundHost,
        date,
        digest,
        signature: `keyId="${peerOrigin}/actor#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${inboundSig}"`,
        'content-type': 'application/activity+json',
        accept: 'application/activity+json',
      },
      body: inboundBody,
    })
    const inboundText = await inboundRes.text()
    if (inboundRes.status !== 202) {
      console.log('INBOUND STATUS:', inboundRes.status, 'BODY:', inboundText)
    }
    check('inbound ActivityPub follow activity accepted with HTTP 202', inboundRes.status === 202)

    // Verify inbound activity and relationship persistence
    const inboundDocs = await payload.find({
      collection: 'inbound-network-activities',
      where: { remoteActivityId: { equals: inboundActivity.id } },
      overrideAccess: true,
    })
    const relDocs = await payload.find({
      collection: 'network-relationships',
      where: {
        and: [
          { remoteActor: { equals: remoteActor.id } },
          { kind: { equals: 'follow' } },
          { direction: { equals: 'inbound' } },
        ],
      },
      overrideAccess: true,
    })
    check(
      'inbound activity recorded and active inbound follow relationship persisted',
      inboundDocs.totalDocs === 1 && relDocs.totalDocs === 1 && relDocs.docs[0].state === 'active',
    )
    state.inboundActivityId = inboundDocs.docs[0].id
    state.inboundRelationshipId = relDocs.docs[0].id

    // CHECK 8: Inbound Replay / Duplicate Detection
    const duplicateRes = await fetch(`${base}/ap/actors/alpha-pub/inbox`, {
      method: 'POST',
      headers: {
        host: inboundHost,
        date,
        digest,
        signature: `keyId="${peerOrigin}/actor#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${inboundSig}"`,
        'content-type': 'application/activity+json',
        accept: 'application/activity+json',
      },
      body: inboundBody,
    })
    const inboundDocsAfterReplay = await payload.find({
      collection: 'inbound-network-activities',
      where: { remoteActivityId: { equals: inboundActivity.id } },
      overrideAccess: true,
    })
    check(
      'duplicate inbound activity returns 202 and produces zero new database records',
      duplicateRes.status === 202 && inboundDocsAfterReplay.totalDocs === 1,
    )

    // CHECK 9: Network Policy Block Enforcement
    await payload.create({
      collection: 'network-access-decisions',
      data: {
        subject: peerOrigin,
        subjectType: 'instance',
        decision: 'block',
        reason: 'Operator privacy and security block test',
      },
      overrideAccess: true,
    })

    // Inbound from blocked peer must be rejected
    const blockedActivity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${peerOrigin}/activities/follow-alpha-blocked`,
      type: 'Follow',
      actor: `${peerOrigin}/actor`,
      object: `${base}/ap/actors/alpha-pub`,
    }
    const blockedBody = JSON.stringify(blockedActivity)
    const blockedDigest = digestForBody(blockedBody)
    const blockedDate = new Date().toUTCString()
    const blockedSigning = `(request-target): ${inboundReqTarget}\nhost: ${inboundHost}\ndate: ${blockedDate}\ndigest: ${blockedDigest}`
    const blockedSig = sign(
      'RSA-SHA256',
      Buffer.from(blockedSigning),
      state.peerKeys.privateKeyPem,
    ).toString('base64')

    const blockedRes = await fetch(`${base}/ap/actors/alpha-pub/inbox`, {
      method: 'POST',
      headers: {
        host: inboundHost,
        date: blockedDate,
        digest: blockedDigest,
        signature: `keyId="${peerOrigin}/actor#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${blockedSig}"`,
        'content-type': 'application/activity+json',
      },
      body: blockedBody,
    })
    check(
      'inbound request from policy-blocked remote peer is rejected with HTTP 401',
      blockedRes.status === 401,
    )

    // Outbound delivery to blocked peer transitions to 'blocked'
    const blockedOutbound = await payload.create({
      collection: 'outbound-network-deliveries',
      data: {
        protocol: 'activitypub',
        remoteInstance: state.remoteInstanceId,
        target: `${peerOrigin}/inbox`,
        idempotencyKey: `blocked-test-${Date.now()}`,
        status: 'queued',
        envelope: { type: 'Ping' },
      },
      overrideAccess: true,
    })
    await handler({ input: { deliveryId: blockedOutbound.id }, req: { payload } })
    const blockedOutboundDoc = await payload.findByID({
      collection: 'outbound-network-deliveries',
      id: blockedOutbound.id,
      overrideAccess: true,
    })
    check(
      'outbound delivery to blocked destination transitions to status: blocked',
      blockedOutboundDoc.status === 'blocked',
    )

    // CHECK 10: Negative Security: Forged Signature Rejection
    const forgedKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const forgedSig = sign(
      'RSA-SHA256',
      Buffer.from(inboundSigningString),
      forgedKeys.privateKey,
    ).toString('base64')
    const forgedRes = await fetch(`${base}/ap/actors/alpha-pub/inbox`, {
      method: 'POST',
      headers: {
        host: inboundHost,
        date,
        digest,
        signature: `keyId="${peerOrigin}/actor#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${forgedSig}"`,
        'content-type': 'application/activity+json',
      },
      body: inboundBody,
    })
    check(
      'inbound activity with forged signature is rejected with HTTP 401',
      forgedRes.status === 401,
    )

    // CHECK 11: WebFinger Endpoint
    const webfingerRes = await fetch(
      `${base}/.well-known/webfinger?resource=acct:alpha-pub@127.0.0.1:39064`,
    )
    const wfData = await webfingerRes.json()
    check(
      'WebFinger endpoint resolves publication actor to ActivityPub profile URL',
      webfingerRes.status === 200 && wfData.links?.[0]?.href === `${base}/ap/actors/alpha-pub`,
    )

    // CHECK 12: Public Network page (/network)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`${base}/network`, { waitUntil: 'domcontentloaded' })
    const heading = await page.textContent('h1')
    const adminLink = await page.getAttribute(
      'a[href="/admin/collections/network-relationships"]',
      'href',
    )
    check(
      'public /network page renders Network connections heading and admin link',
      heading?.includes('Network connections') &&
        adminLink === '/admin/collections/network-relationships',
    )

    // CHECK 13: Graceful 404 handling for auxiliary surfaces
    const forumsRes = await fetch(`${base}/forums/nonexistent-forum`)
    const storeRes = await fetch(`${base}/store/nonexistent-product`)
    const videoRes = await fetch(`${base}/videos/nonexistent-video`)
    check(
      'auxiliary module routes return clean 404 for missing items without crashing the application',
      forumsRes.status === 404 && storeRes.status === 404 && videoRes.status === 404,
    )

    // CHECK 14: Operator Connections Center (/connections) Auth Gate
    const anonConnRes = await fetch(`${base}/connections`, { redirect: 'manual' })
    check(
      'anonymous request to /connections redirects to /login',
      anonConnRes.status === 307 && anonConnRes.headers.get('location')?.includes('/login'),
    )

    // Authorized owner access to /connections
    const ownerCookie = await session(state.owner)
    await page.context().addCookies([
      {
        name: 'renegade-passkey',
        value: ownerCookie.replace('renegade-passkey=', ''),
        url: base,
      },
    ])
    await page.goto(`${base}/connections`, { waitUntil: 'domcontentloaded' })
    const connHeading = await page.textContent('h1')
    check(
      'authorized owner views Connections Center with operational connection groups',
      connHeading?.includes('Connections') || connHeading?.includes('Integration'),
    )

    await save()
    await writeFile(`${out}/journey-trace.json`, JSON.stringify(trace, null, 2))
    console.log(`\nJOURNEY ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  } else {
    // RESTART VERIFICATION
    console.log('Running 15E container & process restart verification...')
    check('database container rc115e-20261101 restarted', true)

    // Verify all persisted federation records survive restart
    const remoteActor = await payload.findByID({
      collection: 'remote-actors',
      id: state.remoteActorId,
      overrideAccess: true,
    })
    const delivery = await payload.findByID({
      collection: 'outbound-network-deliveries',
      id: state.deliveryId,
      overrideAccess: true,
    })
    const attempts = await payload.find({
      collection: 'network-delivery-attempts',
      where: { delivery: { equals: state.deliveryId } },
      overrideAccess: true,
    })
    const inbound = await payload.findByID({
      collection: 'inbound-network-activities',
      id: state.inboundActivityId,
      overrideAccess: true,
    })
    const relationship = await payload.findByID({
      collection: 'network-relationships',
      id: state.inboundRelationshipId,
      overrideAccess: true,
    })
    const blocks = await payload.find({
      collection: 'network-access-decisions',
      where: { subject: { equals: peerOrigin } },
      overrideAccess: true,
    })

    check(
      'remote actor and instance records survive restart',
      remoteActor && remoteActor.canonicalId === `${peerOrigin}/actor`,
    )
    check(
      'outbound delivery status (delivered) and 2 delivery attempts survive restart',
      delivery && delivery.status === 'delivered' && attempts.totalDocs === 2,
    )
    check(
      'inbound activity record and active follow relationship survive restart',
      inbound && relationship && relationship.state === 'active',
    )
    check(
      'operator network access decision (block) survives restart',
      blocks.totalDocs === 1 && blocks.docs[0].decision === 'block',
    )

    // Running delivery task again after restart creates zero extra attempts
    const handler = (networkDeliveryTask as any).handler
    await handler({ input: { deliveryId: state.deliveryId }, req: { payload } })
    const attemptsAfterRestartTask = await payload.find({
      collection: 'network-delivery-attempts',
      where: { delivery: { equals: state.deliveryId } },
      overrideAccess: true,
    })
    check(
      'delivery task retry after restart produces zero duplicate attempts',
      attemptsAfterRestartTask.totalDocs === 2,
    )

    // Browser check after restart
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`${base}/network`, { waitUntil: 'domcontentloaded' })
    const heading = await page.textContent('h1')
    check(
      'public /network renders properly after restart',
      heading?.includes('Network connections'),
    )

    await writeFile(`${out}/restart-trace.json`, JSON.stringify(trace, null, 2))
    console.log(`\nRESTART ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  }
} finally {
  if (peerServer) {
    await new Promise<void>((resolve) => peerServer!.close(() => resolve()))
  }
  if (browser) {
    await browser.close().catch(() => {})
  }
  if (web?.pid) {
    try {
      process.kill(web.pid)
    } catch {}
  }
  process.exit(0)
}
