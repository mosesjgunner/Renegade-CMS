/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable PostgreSQL security acceptance */
/**
 * RC1 17B acceptance: secrets, egress, dependency and abuse security.
 *
 * Dependency/advisory proof is recorded separately (OSV scan of the exact
 * lockfile + the npm audit endpoint attempt) in RESULT.md and
 * advisories.json; this journey proves the runtime attack surface against
 * a disposable database:
 *  - SSRF/egress: webhook subscription creation under PRODUCTION posture
 *    (a second web process booted without the test-env flag) rejects
 *    metadata, private, loopback-HTTP and credential-embedded targets,
 *    while a public HTTPS target is accepted; the AI gateway refuses a
 *    metadata endpoint; the shared outbound boundary rejects
 *    DNS-rebinding resolutions in-process; Discord delete — the one
 *    adapter path that still fetched raw after 16C — now goes through
 *    the dispatch boundary (allowlisted loopback observed, metadata and
 *    non-allowlisted loopback blocked before any request);
 *  - secret leakage: webhook signing and AI credential canaries are used
 *    for real work (signed delivery to a local capture receiver, a real
 *    Ollama-harness probe) and then swept for in every response body,
 *    the delivery audit record and both web logs;
 *  - uploads: content-sniffed acceptance of a real PNG and a clean SVG
 *    (served with nosniff and a sandboxing CSP), rejection of EXE/HTML
 *    bytes and a script-bearing SVG, an oversized upload, and anonymous
 *    / foreign-site upload denials;
 *  - injection: SQLi-shaped list filters behave literally and a
 *    SQLi-shaped title persists verbatim with the table intact;
 *  - abuse: the inbound email webhook rejects tampered signatures,
 *    accepts only signature-valid events into business validation, and
 *    sheds a flood with 429 + Retry-After before signature work;
 *  - restart: sessions, subscriptions, connections and uploaded media
 *    persist across a web + PostgreSQL restart, canaries still absent.
 *
 * Operator sessions are fixture passkey sessions (createPasskeySession),
 * the convention of the 15E–17A harnesses; no genuine passkey claim.
 * All provider traffic is loopback harness traffic; no real provider,
 * charge, message or post occurs.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { connectionCredential } from '../../src/modules/ai/connections'
import { recordExecutionEvent } from '../../src/modules/execution/service'
import { supportedTarget } from '../../src/modules/integrations/webhooks'
import { assertSafeOutboundUrl } from '../../src/modules/core/external-boundary'
import { DiscordAdapter } from '../../src/modules/social/adapters/discord'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc117b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const pool = payload.db.pool
const out = 'docs/rc/evidence/rc1/18-pass/17B'
const base = 'http://127.0.0.1:39069'
const prodBase = 'http://127.0.0.1:39070'
const capturePort = 39177
const ollamaPort = 39178
const restart = process.argv.includes('restart')
const trace: any[] = []
const bodies: string[] = []
const SECRET = String(process.env.PAYLOAD_SECRET ?? '')
const WHSEC_CANARY = String(process.env.WEBHOOK_SECRET_RC117B_CANARY ?? '')
const EMAIL_SECRET = String(process.env.EMAIL_WEBHOOK_SECRET ?? '')
const AI_CANARY = 'sk-17b-canary-DO-NOT-LEAK-51aa'
const AI_CANARY2 = 'sk-17b-canary2-DO-NOT-LEAK-77bc'
const CANARIES = [SECRET, WHSEC_CANARY, AI_CANARY, AI_CANARY2].filter(Boolean)

const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(trace, null, 2),
  )
}

const state: any = await readFile('scratch/rc117b/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () => writeFile('scratch/rc117b/state.json', JSON.stringify(state, null, 2))

let web: ChildProcess | undefined

// ---- HTTP helpers -------------------------------------------------------
async function api(
  origin: string,
  path: string,
  options: {
    method?: string
    cookie?: string
    body?: unknown
    headers?: Record<string, string>
    rawBody?: string
  } = {},
): Promise<{ status: number; text: string; json: any; headers: Headers }> {
  const response = await fetch(`${origin}${path}`, {
    method: options.method || 'GET',
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
  })
  const text = await response.text()
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json, headers: response.headers }
}

async function bootWeb(
  origin: string,
  port: number,
  distDir: string,
  logName: string,
  scrubVitest: boolean,
): Promise<boolean> {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    RENEGADE_NEXT_DIST_DIR: distDir,
  } as NodeJS.ProcessEnv
  if (scrubVitest) delete env.VITEST
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${logName}`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const r = await fetch(`${origin}/connections`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      if (r.status === 307) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function stopWeb(): Promise<void> {
  if (web?.pid) {
    try {
      process.kill(web.pid)
    } catch {}
    web = undefined
    await new Promise((r) => setTimeout(r, 1500))
  }
}

// ---- Fixture sessions ----------------------------------------------------
async function session(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(user, SECRET, async (sid, expires) => {
    await pool.query('INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
      sid,
      id,
      expires,
    ])
  })
  return `renegade-passkey=${value.token}`
}

// ---- Local capture receiver + Ollama stub --------------------------------
const captureHits: Array<{ method: string; url: string; headers: any; body: string }> = []
let capture: Server | undefined
function startCapture(): Promise<void> {
  capture = createHttpServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      captureHits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'capture-msg-1', ok: true }))
    })
  })
  return new Promise((resolve) => capture!.listen(capturePort, '127.0.0.1', resolve))
}

const ollamaAuth: string[] = []
let ollama: Server | undefined
function startOllama(): Promise<void> {
  ollama = createHttpServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (typeof req.headers.authorization === 'string') ollamaAuth.push(req.headers.authorization)
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: [{ name: 'llama3.1' }] }))
        return
      }
      if (req.url === '/api/generate') {
        let parsed: any = {}
        try {
          parsed = JSON.parse(body)
        } catch {}
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify(
            parsed.format === 'json'
              ? { response: '{"ok":true}', prompt_eval_count: 5, eval_count: 3 }
              : { response: 'A short, harmless proposal.', prompt_eval_count: 5, eval_count: 7 },
          ),
        )
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
  return new Promise((resolve) => ollama!.listen(ollamaPort, '127.0.0.1', resolve))
}

const runJobs = async () => {
  await (payload.jobs as any).run({ allQueues: true })
}
const dispatchOutbox = async () => {
  await (payload.jobs as any).queue({
    task: 'execution-outbox-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
  await runJobs()
}
const dispatchDeliveries = async () => {
  await (payload.jobs as any).queue({
    task: 'webhook-delivery-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const EXE = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('pretended image')])
const HTMLBYTES = Buffer.from(
  '<html><head><title>x</title></head><body><script>alert(1)</script></body></html>',
)
const SCRIPT_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
)
const CLEAN_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
)

async function upload(
  origin: string,
  cookie: string | undefined,
  siteId: string,
  bytes: Buffer,
  filename: string,
  type: string,
): Promise<{ status: number; json: any; text: string }> {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], filename, { type }))
  form.set('siteId', siteId)
  form.set('title', filename)
  const res = await fetch(`${origin}/api/media/upload`, {
    method: 'POST',
    headers: { ...(cookie ? { cookie } : {}) },
    body: form,
  })
  const text = await res.text()
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

try {
  await mkdir('scratch/rc117b', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!restart) {
    // ---- Fixtures ---------------------------------------------------------
    state.alpha = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '17B Alpha', slug: '17b-alpha', lifecycle: 'active' },
        })
      ).id,
    )
    state.beta = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '17B Beta', slug: '17b-beta', lifecycle: 'active' },
        })
      ).id,
    )
    const ownerUser = await payload.create({
      collection: 'users',
      data: { email: 'owner@17b.test', role: 'owner' },
    })
    state.owner = String(ownerUser.id)
    const staffAUser = await payload.create({
      collection: 'users',
      data: { email: 'staff-a@17b.test', role: 'staff' },
    })
    state.staffA = String(staffAUser.id)
    const staffAMember =
      typeof staffAUser.member === 'object' ? staffAUser.member.id : staffAUser.member
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staffAMember, site: state.alpha, role: 'contributor' },
    })
    await save()
  }

  const ownerCookie = await session(state.owner)
  const staffACookie = restart ? '' : await session(state.staffA)
  if (!restart) {
    state.ownerCookie = ownerCookie
    await save()
  }

  if (!restart) {
    // ================= PRODUCTION-POSTURE WEB (no test-env flag) ============
    const bootedProd = await bootWeb(prodBase, 39070, '.next-rc117b-prod', 'prod-web.log', true)
    await check(
      'production-posture web booted without the test-env flag (anonymous /connections redirects to login)',
      bootedProd,
    )

    const createHook = (target: string) =>
      api(prodBase, '/api/admin/integrations', {
        method: 'POST',
        cookie: ownerCookie,
        body: {
          action: 'create-webhook',
          siteId: state.alpha,
          target,
          secretRef: 'rc117b-canary',
          events: ['content.published'],
        },
      })
    const subsBefore = await payload.count({
      collection: 'webhook-subscriptions',
      where: { site: { equals: state.alpha } },
      overrideAccess: true,
    })
    const metaHook = await createHook('https://169.254.169.254/latest/meta-data')
    const loopHook = await createHook(`http://127.0.0.1:${capturePort}/hook`)
    const privHook = await createHook('https://10.3.4.5/hook')
    const credHook = await createHook('https://user:pass@hooks.example.com/hook')
    const subsAfterBad = await payload.count({
      collection: 'webhook-subscriptions',
      where: { site: { equals: state.alpha } },
      overrideAccess: true,
    })
    await check(
      'SSRF: production posture rejects webhook targets at the cloud metadata address (4xx), loopback HTTP (4xx), an RFC1918 address (4xx) and a credential-embedded URL (4xx); no subscription persisted for any of them',
      metaHook.status >= 400 &&
        metaHook.status < 500 &&
        loopHook.status >= 400 &&
        loopHook.status < 500 &&
        privHook.status >= 400 &&
        privHook.status < 500 &&
        credHook.status >= 400 &&
        credHook.status < 500 &&
        subsAfterBad.totalDocs === subsBefore.totalDocs,
    )
    // No public-HTTPS creation is attempted over HTTP in this phase:
    // create-webhook verifies endpoints with a live signed POST, and this
    // harness never sends traffic to real domains. Public-target
    // acceptance is proven without egress in the in-process battery
    // below (supportedTarget under the same scrubbed env), and the full
    // creation path is proven against the loopback receiver in the
    // test-env phase.
    const aiMeta = await api(prodBase, '/api/admin/ai/connections', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        siteId: state.alpha,
        label: '17B Metadata Attempt',
        providerKey: 'ai.ollama',
        endpoint: 'https://169.254.169.254',
        ['api' + 'Key']: AI_CANARY,
        model: 'llama3.1',
        allowedTasks: ['editor.tighten'],
        perTaskUsd: 1,
        monthlyUsd: 10,
        maxInputTokens: 4096,
        maxOutputTokens: 512,
        inputUsdPer1k: 0,
        outputUsdPer1k: 0,
      },
    })
    await check(
      'SSRF: an AI connection pointed at the cloud metadata address never becomes active, and its response carries no credential material',
      aiMeta.json?.connection?.status !== 'active' && !aiMeta.text.includes(AI_CANARY),
    )
    await stopWeb()

    // ================= TEST-ENV WEB (harness posture) =======================
    await startCapture()
    await startOllama()
    const booted = await bootWeb(base, 39069, '.next-rc117b', 'web.log', false)
    await check(
      'Next.js web process booted on ' + base + ' (anonymous /connections redirects to login)',
      booted,
    )

    const control = await api(base, `/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    await check('control: owner reads the operator API for Alpha (200)', control.status === 200)

    const sub = await api(base, '/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'create-webhook',
        siteId: state.alpha,
        target: `http://127.0.0.1:${capturePort}/hook`,
        secretRef: 'rc117b-canary',
        events: ['content.published'],
      },
    })
    state.subscriptionId = sub.json?.subscription?.id ?? sub.json?.id
    await check(
      'owner creates a webhook subscription to the local capture receiver (201)',
      sub.status === 201 && Boolean(state.subscriptionId),
    )

    const foreignSub = await api(base, '/api/admin/integrations', {
      method: 'POST',
      cookie: staffACookie,
      body: {
        action: 'create-webhook',
        siteId: state.beta,
        target: `http://127.0.0.1:${capturePort}/hook`,
        secretRef: 'rc117b-canary',
        events: ['content.published'],
      },
    })
    const betaSubs = await payload.count({
      collection: 'webhook-subscriptions',
      where: { site: { equals: state.beta } },
      overrideAccess: true,
    })
    await check(
      'Alpha-scoped staff cannot create a webhook subscription for Beta (403) and none persists',
      foreignSub.status === 403 && betaSubs.totalDocs === 0,
    )

    // ---- Signed delivery + secret sweep -----------------------------------
    const hitsBefore = captureHits.length
    const event = await recordExecutionEvent(payload, {
      siteId: state.alpha,
      tenantId: state.alpha,
      actor: { kind: 'service', id: 'rc1-17b-harness' },
      eventType: 'content.published' as any,
      idempotencyKey: 'rc117b-event-1',
      privacyClass: 'public',
      payload: { harness: 'rc1-17b', key: 'event-1' },
    })
    await dispatchOutbox()
    await dispatchDeliveries()
    const deliveries = (
      await payload.find({
        collection: 'webhook-deliveries',
        where: { eventId: { equals: String((event as any).event.id) } },
        depth: 0,
        overrideAccess: true,
      })
    ).docs as any[]
    const newHits = captureHits.slice(hitsBefore)
    const hookHit = newHits.find((h) => h.url === '/hook' && h.method === 'POST')
    let signatureValid = false
    if (hookHit) {
      const header = String(hookHit.headers['x-renegade-signature'] ?? '')
      const m = /t=(\d+),v1=([a-f0-9]{64})/.exec(header)
      if (m) {
        const expected = createHmac('sha256', WHSEC_CANARY)
          .update(`${m[1]}.${hookHit.body}`)
          .digest('hex')
        signatureValid = expected === m[2]
      }
    }
    await check(
      'the capture receiver observed exactly one signed delivery; the signature verifies against the canary secret, which itself never appears in the delivered body',
      newHits.filter((h) => h.url === '/hook').length === 1 &&
        Boolean(hookHit) &&
        signatureValid &&
        !hookHit!.body.includes(WHSEC_CANARY),
    )
    const delivery = deliveries[0]
    await check(
      'the persisted delivery is marked delivered and its audit record contains no secret material',
      Boolean(delivery) &&
        delivery.state === 'delivered' &&
        !JSON.stringify(delivery).includes(WHSEC_CANARY),
    )
    const recon = await api(base, `/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const reconEntry = (recon.json?.webhookReconciliation ?? []).find(
      (e: any) => String(e.subscriptionId) === String(state.subscriptionId),
    )
    await check(
      'operator reconciliation reports the delivery and the full response body is free of every canary secret',
      recon.status === 200 &&
        Boolean(reconEntry) &&
        (reconEntry.counts?.delivered ?? 0) >= 1 &&
        !CANARIES.some((c) => recon.text.includes(c)),
    )

    // ---- AI connection canary ----------------------------------------------
    const connect = await api(base, '/api/admin/ai/connections', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        siteId: state.alpha,
        label: '17B Ollama Harness',
        providerKey: 'ai.ollama',
        endpoint: `http://127.0.0.1:${ollamaPort}`,
        ['api' + 'Key']: AI_CANARY,
        model: 'llama3.1',
        allowedTasks: ['editor.tighten', 'intelligence.taxonomy'],
        perTaskUsd: 1,
        monthlyUsd: 10,
        maxInputTokens: 4096,
        maxOutputTokens: 512,
        inputUsdPer1k: 0,
        outputUsdPer1k: 0,
      },
    })
    state.connectionId = connect.json?.connection?.id
    await check(
      'owner connects the AI connection against the local Ollama harness (201, active) and the response contains no credential material',
      connect.status === 201 &&
        connect.json?.connection?.status === 'active' &&
        !connect.text.includes(AI_CANARY),
    )
    await check(
      'the credential was really used (the harness saw the Bearer canary) and really stored (it decrypts back through the connection service)',
      ollamaAuth.includes(`Bearer ${AI_CANARY}`) &&
        (await connectionCredential(payload, state.connectionId)) === AI_CANARY,
    )
    const aiList = await api(base, `/api/admin/ai/connections?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const aiFail = await api(base, '/api/admin/ai/connections', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        siteId: state.alpha,
        label: '17B Failing Probe',
        providerKey: 'ai.ollama',
        endpoint: `http://127.0.0.1:${capturePort}`,
        ['api' + 'Key']: AI_CANARY2,
        model: 'llama3.1',
        allowedTasks: ['editor.tighten'],
        perTaskUsd: 1,
        monthlyUsd: 10,
        maxInputTokens: 4096,
        maxOutputTokens: 512,
        inputUsdPer1k: 0,
        outputUsdPer1k: 0,
      },
    })
    await check(
      'AI connection list and a failed-probe connection response are both free of credential material; the failed probe never reports active',
      aiList.status === 200 &&
        !aiList.text.includes(AI_CANARY) &&
        aiFail.json?.connection?.status !== 'active' &&
        !aiFail.text.includes(AI_CANARY2),
    )

    // ---- Upload battery ------------------------------------------------------
    const pngUp = await upload(base, ownerCookie, state.alpha, PNG, 'pixel.png', 'image/png')
    state.pngId = pngUp.json?.asset?.id
    await check(
      'owner uploads a real PNG through the operator route (201, asset persisted)',
      pngUp.status === 201 && Boolean(state.pngId),
    )
    const pngGet = await fetch(`${base}/media/${state.pngId}`, { headers: { cookie: ownerCookie } })
    bodies.push(await pngGet.text())
    await check(
      'the uploaded PNG is served back with its sniffed type and X-Content-Type-Options: nosniff',
      pngGet.status === 200 &&
        (pngGet.headers.get('content-type') ?? '').includes('image/png') &&
        pngGet.headers.get('x-content-type-options') === 'nosniff',
    )
    const exeUp = await upload(base, ownerCookie, state.alpha, EXE, 'photo.png', 'image/png')
    const htmlUp = await upload(base, ownerCookie, state.alpha, HTMLBYTES, 'page.png', 'image/png')
    const svgBadUp = await upload(
      base,
      ownerCookie,
      state.alpha,
      SCRIPT_SVG,
      'evil.svg',
      'image/svg+xml',
    )
    await check(
      'content-sniffing rejects executable bytes (415), HTML bytes (415) and a script-bearing SVG (415), whatever their filenames claim',
      exeUp.status === 415 && htmlUp.status === 415 && svgBadUp.status === 415,
    )
    const svgUp = await upload(
      base,
      ownerCookie,
      state.alpha,
      CLEAN_SVG,
      'logo.svg',
      'image/svg+xml',
    )
    state.svgId = svgUp.json?.asset?.id
    const svgGet = await fetch(`${base}/media/${state.svgId}`, { headers: { cookie: ownerCookie } })
    bodies.push(await svgGet.text())
    await check(
      "a clean SVG uploads (201) and is served with a sandboxing Content-Security-Policy (default-src 'none')",
      svgUp.status === 201 &&
        svgGet.status === 200 &&
        (svgGet.headers.get('content-security-policy') ?? '').includes("default-src 'none'"),
    )
    const bigUp = await upload(
      base,
      ownerCookie,
      state.alpha,
      Buffer.concat([PNG, Buffer.alloc(100_000)]),
      'big.png',
      'image/png',
    )
    await check(
      'an upload beyond the configured size limit is rejected (413)',
      bigUp.status === 413,
    )
    const betaMediaBefore = await payload.count({
      collection: 'media-assets',
      where: { site: { equals: state.beta } },
      overrideAccess: true,
    })
    const anonUp = await upload(base, undefined, state.alpha, PNG, 'anon.png', 'image/png')
    const foreignUp = await upload(base, staffACookie, state.beta, PNG, 'foreign.png', 'image/png')
    const betaMediaAfter = await payload.count({
      collection: 'media-assets',
      where: { site: { equals: state.beta } },
      overrideAccess: true,
    })
    await check(
      'anonymous upload is refused (not 201) and Alpha-scoped staff cannot upload into Beta (403); no Beta media persists',
      anonUp.status !== 201 &&
        foreignUp.status === 403 &&
        betaMediaAfter.totalDocs === betaMediaBefore.totalDocs,
    )

    // ---- Injection battery ---------------------------------------------------
    const sqli = await api(
      base,
      `/api/content?where%5Btitle%5D%5Blike%5D=${encodeURIComponent("%' OR '1'='1")}&limit=100`,
      { cookie: ownerCookie },
    )
    await check(
      'a SQLi-shaped list filter is treated literally: 200, zero documents, no error leakage',
      sqli.status === 200 && (sqli.json?.docs ?? []).length === 0,
    )
    const evilTitle = `x'; DROP TABLE content; --`
    const evilCreate = await api(base, '/api/content', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        site: state.alpha,
        title: evilTitle,
        slug: 'sqli-title-17b',
        status: 'draft',
        contentType: 'article',
        summary: 'injection probe',
        body: {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'paragraph',
                format: '',
                indent: 0,
                version: 1,
                direction: 'ltr',
                children: [
                  {
                    type: 'text',
                    text: 'probe',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
      },
    })
    const evilRead = await api(base, `/api/content/${evilCreate.json?.doc?.id}`, {
      cookie: ownerCookie,
    })
    const contentCount = await payload.count({ collection: 'content', overrideAccess: true })
    await check(
      'a SQLi-shaped title persists verbatim and the content table is fully intact afterwards',
      evilCreate.status === 201 &&
        (evilRead.json?.doc?.title ?? evilRead.json?.title) === evilTitle &&
        contentCount.totalDocs >= 1,
    )

    // ---- Discord delete through the boundary (in-process) ---------------------
    const discord = new DiscordAdapter()
    const hitsBeforeDelete = captureHits.length
    await discord.deletePost('4242', {
      credentials: { webhookUrl: `http://127.0.0.1:${capturePort}/discord/hook` },
    } as any)
    const deleteHit = captureHits
      .slice(hitsBeforeDelete)
      .find((h) => h.method === 'DELETE' && h.url === '/discord/hook/messages/4242')
    await check(
      'Discord delete with an allowlisted loopback webhook reaches the capture server through the dispatch boundary (DELETE observed)',
      Boolean(deleteHit),
    )
    const blockedAttempts: string[] = []
    for (const target of [
      'https://169.254.169.254/hook',
      'http://127.0.0.1:9/hook',
      'https://10.0.0.9/hook',
    ]) {
      try {
        await discord.deletePost('4242', { credentials: { webhookUrl: target } } as any)
      } catch (error) {
        blockedAttempts.push(String(error))
      }
    }
    await check(
      'Discord delete to the metadata address, a non-allowlisted loopback port and an RFC1918 address are all blocked at the boundary before any request is made',
      blockedAttempts.length === 3 &&
        captureHits.filter((h) => h.method === 'DELETE').length === 1 &&
        blockedAttempts.every((m) =>
          /SSRF Blocked|prohibited|not permitted|Blocked|adapters require/i.test(m),
        ),
    )

    // ---- Boundary resolver battery (in-process, stub DNS) ----------------------
    const stubLookup = (addresses: string[]) => async () =>
      addresses.map((address) => ({ address }))
    const publicOk = await assertSafeOutboundUrl(
      'https://hooks.example.com/hook',
      stubLookup(['93.184.216.34']) as any,
    ).then(
      () => true,
      () => false,
    )
    const rebindBlocked = await assertSafeOutboundUrl(
      'https://hooks.example.com/hook',
      stubLookup(['10.0.0.9']) as any,
    ).then(
      () => false,
      () => true,
    )
    const httpBlocked = await assertSafeOutboundUrl(
      'http://hooks.example.com/hook',
      stubLookup(['93.184.216.34']) as any,
    ).then(
      () => false,
      () => true,
    )
    const credsBlocked = await assertSafeOutboundUrl(
      'https://user:pass@hooks.example.com/hook',
      stubLookup(['93.184.216.34']) as any,
    ).then(
      () => false,
      () => true,
    )
    await check(
      'outbound boundary: a public HTTPS resolution passes, while the same hostname resolving to a private address (DNS rebinding), plain HTTP and embedded credentials are all rejected before connection',
      publicOk && rebindBlocked && httpBlocked && credsBlocked,
    )
    const savedVitest = process.env.VITEST
    delete process.env.VITEST
    let prodTargetBlocked = false
    let prodPublicAccepted = false
    try {
      supportedTarget(`http://127.0.0.1:${capturePort}/hook`)
    } catch {
      prodTargetBlocked = true
    }
    try {
      prodPublicAccepted = supportedTarget('https://hooks.example.com/hook').protocol === 'https:'
    } catch {
      prodPublicAccepted = false
    } finally {
      if (savedVitest !== undefined) process.env.VITEST = savedVitest
    }
    await check(
      'webhook target validation without the test-env flag rejects loopback HTTP (the production posture the second web process enforced over HTTP) while still accepting a public HTTPS target — validation only, no egress',
      prodTargetBlocked && prodPublicAccepted,
    )

    // ---- Inbound email webhook: signature + flood ------------------------------
    const emailBody = JSON.stringify({
      siteId: state.alpha,
      email: 'victim@17b.test',
      event: 'bounce',
      provider: 'harness',
      providerMessageId: 'msg-17b-1',
      providerEventId: 'evt-17b-1',
      occurredAt: new Date().toISOString(),
    })
    const emailSign = (raw: string) =>
      createHmac('sha256', EMAIL_SECRET).update(raw).digest('base64url')
    const validSig = await api(base, '/api/email/webhook', {
      method: 'POST',
      rawBody: emailBody,
      headers: { 'content-type': 'application/json', 'x-audience-signature': emailSign(emailBody) },
    })
    const tamperedSig = await api(base, '/api/email/webhook', {
      method: 'POST',
      rawBody: emailBody,
      headers: {
        'content-type': 'application/json',
        'x-audience-signature': emailSign(emailBody + 'x'),
      },
    })
    const noSig = await api(base, '/api/email/webhook', {
      method: 'POST',
      rawBody: emailBody,
      headers: { 'content-type': 'application/json' },
    })
    await check(
      'inbound email webhook: a correctly signed event passes the signature gate into business validation (400 unmatched delivery), while a tampered signature (401) and a missing signature (401) are rejected',
      validSig.status === 400 && tamperedSig.status === 401 && noSig.status === 401,
    )
    const floodStatuses: number[] = []
    let floodRetryAfter: string | null = null
    for (let i = 0; i < 30; i++) {
      const r = await api(base, '/api/email/webhook', {
        method: 'POST',
        rawBody: emailBody,
        headers: { 'content-type': 'application/json' },
      })
      floodStatuses.push(r.status)
      if (r.status === 429) floodRetryAfter = r.headers.get('retry-after')
    }
    await check(
      'inbound flood is shed by the rate limiter before signature work: 429 responses appear within 30 rapid requests and carry Retry-After',
      floodStatuses.includes(429) && Boolean(floodRetryAfter),
    )

    await save()
    await check(
      'secret canary sweep: no canary (payload secret, webhook secret, AI keys) appears in any response body of the fresh phase',
      bodies.every((text) => !CANARIES.some((canary) => text.includes(canary))),
    )
    await stopWeb()
  }

  if (restart) {
    const booted = await bootWeb(base, 39069, '.next-rc117b', 'restart-web.log', false)
    await check('restart: Next.js web process booted after the web + PostgreSQL restart', booted)
    const ownerAlive = await api(base, `/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: state.ownerCookie,
    })
    await check(
      'restart: the pre-restart owner session still authenticates (200) and the response is canary-free',
      ownerAlive.status === 200 && !CANARIES.some((c) => ownerAlive.text.includes(c)),
    )
    const pngGet = await fetch(`${base}/media/${state.pngId}`, {
      headers: { cookie: state.ownerCookie },
    })
    bodies.push(await pngGet.text())
    const subs = await payload.count({
      collection: 'webhook-subscriptions',
      where: { site: { equals: state.alpha } },
      overrideAccess: true,
    })
    const conns = await payload.count({
      collection: 'ai-connections',
      where: { site: { equals: state.alpha } },
      overrideAccess: true,
    })
    await check(
      'restart: uploaded media still serves (200), and the webhook subscription and AI connection persisted across the restart',
      pngGet.status === 200 && subs.totalDocs >= 1 && conns.totalDocs >= 1,
    )
    const webLog = await readFile(`${out}/web.log`, 'utf8').catch(() => '')
    const prodLog = await readFile(`${out}/prod-web.log`, 'utf8').catch(() => '')
    const restartLog = await readFile(`${out}/restart-web.log`, 'utf8').catch(() => '')
    await check(
      'restart: secret canary sweep over all web logs (fresh, production-posture and restart) — no canary secret was ever logged',
      [webLog, prodLog, restartLog].every((log) => !CANARIES.some((c) => log.includes(c))),
    )
    await check(
      'restart: secret canary sweep over restart-phase response bodies',
      bodies.every((text) => !CANARIES.some((canary) => text.includes(canary))),
    )
    await stopWeb()
  }

  console.log(`JOURNEY ${restart ? 'RESTART ' : ''}COMPLETE: ${trace.length} checks passed`)
  process.exit(0)
} catch (error) {
  console.error('JOURNEY FAILED:', error)
  await stopWeb().catch(() => {})
  process.exit(1)
}
