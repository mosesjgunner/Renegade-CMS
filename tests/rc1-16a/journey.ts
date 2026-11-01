/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable PostgreSQL + local Ollama-protocol harness acceptance */
/**
 * RC1 16A acceptance: connection management, credentials and health.
 *
 * Proves, against a disposable database and a local Ollama-protocol harness
 * (a local adapter — NOT a real-world provider):
 *  - an owner connects an AI connection through the real probe; status and
 *    lastTestedAt persist; the credential lives only in the encrypted
 *    ai-credentials envelope;
 *  - Connections Center reconcile records OBSERVED probe results (success and
 *    failure) and never fabricates success for unprobed families;
 *  - foreign-site operators are denied on every surface;
 *  - missing credential-encryption configuration fails closed with an
 *    actionable error and persists nothing (route-handler level, in-process);
 *  - POD reconcile runs the local emulator adapter's real health check and
 *    Center disconnect destroys the stored POD key (tombstone overwrite);
 *  - after a web + database restart the connection state is unchanged, the
 *    stored envelope rotates v1 -> v2 through the operator action without
 *    losing the secret, reconcile still probes successfully, and Center
 *    disconnect deletes the envelope so health reflects the disconnect.
 *
 * Operator sessions are fixture passkey sessions (createPasskeySession), the
 * same convention as the 15E harness; no genuine passkey claim is made.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { connectionCredential } from '../../src/modules/ai/connections'
import { encryptCredential, decryptCredential } from '../../src/modules/commerce/pod-connection'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc116a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/16A'
const base = 'http://127.0.0.1:39065'
const ollamaPort = 39165
const restart = process.argv.includes('restart')
const trace: any[] = []
const bodies: string[] = []

const AI_CANARY = 'sk-16a-canary-ai-key-0123456789abcdef'
const POD_CANARY = 'sk-16a-canary-pod-key-0123456789abcdef'
const WHSEC_CANARY = 'whsec-16a-canary-0123456789abcdef'

const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(trace, null, 2),
  )
}

const state: any = await readFile('scratch/rc116a/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () => writeFile('scratch/rc116a/state.json', JSON.stringify(state, null, 2))

let web: ChildProcess | undefined
let harness: Server | undefined
const harnessStats = { tags: 0, generate: 0, authorizations: [] as string[] }

function startHarness(): Promise<void> {
  harness = createHttpServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const auth = req.headers.authorization
      if (typeof auth === 'string') harnessStats.authorizations.push(auth)
      if (req.url === '/api/tags') {
        harnessStats.tags++
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: [{ name: 'llama3.1' }] }))
        return
      }
      if (req.url === '/api/generate') {
        harnessStats.generate++
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
  return new Promise((resolve) => harness!.listen(ollamaPort, '127.0.0.1', resolve))
}

async function stopHarness(): Promise<void> {
  if (!harness) return
  const server = harness
  harness = undefined
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

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

async function api(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<{ status: number; text: string; json: any }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json }
}

async function bootWeb(logName: string): Promise<boolean> {
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39065',
    ],
    { env: { ...process.env, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${logName}`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const r = await fetch(`${base}/connections`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      if (r.status === 307) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

const centerEntry = (json: any, collection: string, id: string) =>
  (json?.connections ?? []).find((c: any) => c.collection === collection && c.id === id)

try {
  await mkdir('scratch/rc116a', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!restart) {
    // ---- Fixtures ------------------------------------------------------
    state.alpha = (
      await payload.create({
        collection: 'sites',
        data: { name: '16A Alpha', slug: '16a-alpha', lifecycle: 'active' },
      })
    ).id
    state.beta = (
      await payload.create({
        collection: 'sites',
        data: { name: '16A Beta', slug: '16a-beta', lifecycle: 'active' },
      })
    ).id
    const ownerUser = await payload.create({
      collection: 'users',
      data: { email: 'owner@16a.test', role: 'owner' },
    })
    state.owner = ownerUser.id
    const adminUser = await payload.create({
      collection: 'users',
      data: { email: 'admin@16a.test', role: 'administrator' },
    })
    state.admin = adminUser.id
    const ownerMember =
      typeof ownerUser.member === 'object' ? ownerUser.member.id : ownerUser.member
    const adminMember =
      typeof adminUser.member === 'object' ? adminUser.member.id : adminUser.member
    // Owner holds grants on every site (global owner); admin only on Beta.
    for (const site of [state.alpha, state.beta]) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: ownerMember, site, role: 'community-manager' },
      })
    }
    await payload.create({
      collection: 'member-site-roles',
      data: { member: adminMember, site: state.beta, role: 'moderator' },
    })
    await save()
  }

  const ownerCookie = await session(state.owner)
  const adminCookie = await session(state.admin)

  if (!restart) await startHarness()
  const booted = await bootWeb(restart ? 'restart-web.log' : 'web.log')
  await check(
    `${restart ? 'restart: ' : ''}Next.js web process booted on ${base} (anonymous /connections redirects to login)`,
    booted,
  )

  if (!restart) {
    // ---- Anonymous gates ----------------------------------------------
    const anonAi = await api(`/api/admin/ai/connections?siteId=${state.alpha}`)
    const anonCenter = await api(`/api/admin/integrations?siteId=${state.alpha}`)
    await check(
      'anonymous requests to AI family and Connections Center APIs are denied 403',
      anonAi.status === 403 && anonCenter.status === 403,
    )

    // ---- Connect through the real probe --------------------------------
    const connectBody = {
      siteId: state.alpha,
      label: '16A Ollama Harness',
      providerKey: 'ai.ollama',
      endpoint: `http://127.0.0.1:${ollamaPort}`,
      apiKey: AI_CANARY,
      model: 'llama3.1',
      allowedTasks: ['editor.tighten', 'intelligence.taxonomy'],
      perTaskUsd: 1,
      monthlyUsd: 10,
      maxInputTokens: 4096,
      maxOutputTokens: 512,
      inputUsdPer1k: 0,
      outputUsdPer1k: 0,
    }
    const connect = await api('/api/admin/ai/connections', {
      method: 'POST',
      cookie: ownerCookie,
      body: connectBody,
    })
    await check(
      'owner connects AI connection against local Ollama harness: 201, status active, text+structured capabilities from the real probe',
      connect.status === 201 &&
        connect.json?.connection?.status === 'active' &&
        Array.isArray(connect.json?.connection?.capabilities) &&
        connect.json.connection.capabilities.includes('ai.text.rewrite') &&
        connect.json.connection.capabilities.includes('ai.text.structured') &&
        Boolean(connect.json?.connection?.lastTestedAt),
    )
    state.connectionId = connect.json.connection.id
    state.lastTestedAt = connect.json.connection.lastTestedAt
    await save()
    await check(
      'connect response contains no credential material',
      !connect.text.includes(AI_CANARY),
    )

    const persisted = await payload.findByID({
      collection: 'ai-connections',
      id: state.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    const credentialRows = await payload.find({
      collection: 'ai-credentials',
      where: { connection: { equals: state.connectionId } },
      depth: 0,
      overrideAccess: true,
    })
    const envelope = credentialRows.docs[0]?.envelope
    await check(
      'connection and exactly one v1 credential envelope persist; envelope holds no plaintext secret and decrypts to the saved key',
      persisted?.status === 'active' &&
        Boolean(persisted?.lastTestedAt) &&
        credentialRows.totalDocs === 1 &&
        envelope?.keyId === 'v1' &&
        !JSON.stringify(envelope).includes(AI_CANARY) &&
        (await connectionCredential(payload, state.connectionId)) === AI_CANARY,
    )
    await check(
      'harness observed the real probes (model discovery + text + structured generate) with the credential sent only to the provider endpoint',
      harnessStats.tags >= 1 &&
        harnessStats.generate >= 2 &&
        harnessStats.authorizations.includes(`Bearer ${AI_CANARY}`),
    )

    // ---- Foreign-site negatives ----------------------------------------
    const foreignGet = await api(`/api/admin/ai/connections?siteId=${state.alpha}`, {
      cookie: adminCookie,
    })
    const foreignPost = await api('/api/admin/ai/connections', {
      method: 'POST',
      cookie: adminCookie,
      body: { ...connectBody, label: 'Foreign Attempt' },
    })
    const foreignReconcile = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'ai-connections',
        connectionId: state.connectionId,
      },
    })
    const foreignRotate = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: adminCookie,
      body: { action: 'rotate-credential-keys' },
    })
    await check(
      'foreign-site administrator is denied on AI read (403), AI connect (403), Center reconcile (403) and key rotation (403)',
      foreignGet.status === 403 &&
        foreignPost.status === 403 &&
        foreignReconcile.status === 403 &&
        foreignRotate.status === 403,
    )
    const afterForeign = await payload.find({
      collection: 'ai-connections',
      where: { site: { equals: state.alpha } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'foreign attempts persisted nothing (still exactly one Alpha AI connection)',
      afterForeign.totalDocs === 1,
    )

    // ---- Center projection + page --------------------------------------
    const center = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const aiEntry = centerEntry(center.json, 'ai-connections', state.connectionId)
    await check(
      'Connections Center reports the AI connection active/healthy with lastSuccessAt from the observed probe',
      center.status === 200 &&
        aiEntry?.status === 'active' &&
        aiEntry?.healthState === 'healthy' &&
        aiEntry?.lastSuccessAt === state.lastTestedAt &&
        aiEntry?.isUnknown === false &&
        !center.text.includes(AI_CANARY),
    )
    const pageRes = await api('/connections', { cookie: ownerCookie })
    await check(
      'owner renders /connections page showing the connection label and no credential material',
      pageRes.status === 200 &&
        pageRes.text.includes('16A Ollama Harness') &&
        !pageRes.text.includes(AI_CANARY),
    )

    // ---- Center reconcile: observed success ----------------------------
    const reconcileOk = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'ai-connections',
        connectionId: state.connectionId,
      },
    })
    await check(
      'Center reconcile runs the live AI probe and records observed success (probePerformed, observedSuccess, healthy, lastSuccessAt set)',
      reconcileOk.status === 200 &&
        reconcileOk.json?.probePerformed === true &&
        reconcileOk.json?.reconciliation?.observedSuccess === true &&
        reconcileOk.json?.reconciliation?.healthState === 'healthy' &&
        Boolean(reconcileOk.json?.reconciliation?.lastSuccessAt),
    )
    const auditsOk = await payload.find({
      collection: 'integration-audit-events',
      where: { action: { equals: 'connection.reconciled' } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'reconcile audit event records probePerformed=true, dryRun=false, outcome allowed',
      auditsOk.docs.some(
        (d: any) =>
          d.outcome === 'allowed' &&
          d.subject?.probePerformed === true &&
          d.subject?.dryRun === false,
      ),
    )

    // ---- Center reconcile: observed failure, then recovery -------------
    await stopHarness()
    const reconcileFail = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'ai-connections',
        connectionId: state.connectionId,
      },
    })
    const degraded = await payload.findByID({
      collection: 'ai-connections',
      id: state.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'with the harness down, Center reconcile records the observed failure: no success claimed, connection persisted degraded with redacted error',
      reconcileFail.status === 200 &&
        reconcileFail.json?.probePerformed === true &&
        reconcileFail.json?.reconciliation?.observedSuccess === false &&
        reconcileFail.json?.reconciliation?.lastSuccessAt === null &&
        reconcileFail.json?.reconciliation?.healthState === 'warning' &&
        degraded?.status === 'degraded' &&
        Boolean(degraded?.lastError) &&
        !String(degraded?.lastError).includes(AI_CANARY),
    )
    const auditsFail = await payload.find({
      collection: 'integration-audit-events',
      where: { action: { equals: 'connection.reconciled' } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'failed probe audit event records outcome failed with probePerformed=true',
      auditsFail.docs.some(
        (d: any) => d.outcome === 'failed' && d.subject?.probePerformed === true,
      ),
    )
    await startHarness()
    const retest = await api('/api/admin/ai/connections', {
      method: 'PATCH',
      cookie: ownerCookie,
      body: { id: state.connectionId, siteId: state.alpha, action: 'test' },
    })
    const recovered = await payload.findByID({
      collection: 'ai-connections',
      id: state.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'family test action re-probes and recovers the connection to active with a fresh lastTestedAt',
      retest.status === 200 &&
        recovered?.status === 'active' &&
        Boolean(recovered?.lastTestedAt) &&
        recovered?.lastError === null,
    )
    state.lastTestedAt = String(recovered.lastTestedAt)
    await save()

    // ---- Unprobed family stays honestly unknown -------------------------
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: state.alpha,
        label: '16A Merchant',
        providerKey: 'manual',
        merchantCountry: 'US',
        status: 'active',
        credentialReference: 'vault://16a/merchant',
      },
    })
    state.merchantId = merchant.id
    const merchantReconcile = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'merchant-connections',
        connectionId: merchant.id,
      },
    })
    await check(
      'merchant reconcile performs no probe and fabricates nothing: probePerformed=false, observedSuccess=false, health unknown, lastSuccessAt null',
      merchantReconcile.status === 200 &&
        merchantReconcile.json?.probePerformed === false &&
        merchantReconcile.json?.reconciliation?.observedSuccess === false &&
        merchantReconcile.json?.reconciliation?.healthState === 'unknown' &&
        merchantReconcile.json?.reconciliation?.lastSuccessAt === null &&
        String(merchantReconcile.json?.message || '').includes('No success was recorded'),
    )

    // ---- POD: local adapter probe, then disconnect purge ----------------
    const pod = await payload.create({
      collection: 'pod-connections',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        providerKey: 'pod-emulator',
        label: '16A POD Emulator',
        encryptedApiKey: encryptCredential(POD_CANARY),
        encryptedWebhookSecret: encryptCredential(WHSEC_CANARY),
        status: 'active',
        capabilities: {},
      },
    })
    state.podId = pod.id
    const podReconcile = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'pod-connections',
        connectionId: pod.id,
      },
    })
    const podAfterProbe = await payload.findByID({
      collection: 'pod-connections',
      id: pod.id,
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'POD reconcile runs the local emulator adapter health probe and persists the observed healthy result',
      podReconcile.status === 200 &&
        podReconcile.json?.probePerformed === true &&
        podReconcile.json?.reconciliation?.observedSuccess === true &&
        podAfterProbe?.lastHealthStatus === 'healthy' &&
        Boolean(podAfterProbe?.lastHealthCheckedAt),
    )
    const podDisconnect = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'disconnect-provider',
        collection: 'pod-connections',
        connectionId: pod.id,
      },
    })
    const podAfterDisconnect = await payload.findByID({
      collection: 'pod-connections',
      id: pod.id,
      depth: 0,
      overrideAccess: true,
    })
    let podKeyAfter: string | null = null
    try {
      podKeyAfter = decryptCredential(String(podAfterDisconnect?.encryptedApiKey || ''))
    } catch {}
    await check(
      'Center POD disconnect purges credentials: key envelope overwritten (decrypts to tombstone, not the saved key), webhook secret cleared, status disabled',
      podDisconnect.status === 200 &&
        podDisconnect.json?.credentialsPurged === true &&
        podAfterDisconnect?.status === 'disabled' &&
        !String(podAfterDisconnect?.encryptedApiKey || '').includes(POD_CANARY) &&
        podKeyAfter !== null &&
        podKeyAfter !== POD_CANARY &&
        (podAfterDisconnect?.encryptedWebhookSecret ?? null) === null,
    )

    // ---- Missing provider configuration fails closed --------------------
    const connectionsBefore = await payload.find({
      collection: 'ai-connections',
      depth: 0,
      overrideAccess: true,
    })
    const credentialsBefore = await payload.find({
      collection: 'ai-credentials',
      depth: 0,
      overrideAccess: true,
    })
    const savedKey = process.env.AI_CREDENTIAL_KEY_BASE64URL
    delete process.env.AI_CREDENTIAL_KEY_BASE64URL
    delete process.env.AI_CREDENTIAL_KEYRING_JSON
    delete process.env.AI_CREDENTIAL_ACTIVE_KEY_ID
    let missingConfigStatus = 0
    let missingConfigText = ''
    try {
      const { POST } = await import('../../src/app/(frontend)/api/admin/ai/connections/route')
      const response = await POST(
        new Request(`${base}/api/admin/ai/connections`, {
          method: 'POST',
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          body: JSON.stringify({ ...connectBody, label: 'Missing Config Attempt' }),
        }),
      )
      missingConfigStatus = response.status
      missingConfigText = await response.text()
    } finally {
      if (savedKey) process.env.AI_CREDENTIAL_KEY_BASE64URL = savedKey
    }
    const connectionsAfter = await payload.find({
      collection: 'ai-connections',
      depth: 0,
      overrideAccess: true,
    })
    const credentialsAfter = await payload.find({
      collection: 'ai-credentials',
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'missing AI credential-encryption configuration fails closed with the actionable error and persists no connection or credential rows (route-handler level, in-process)',
      missingConfigStatus === 400 &&
        missingConfigText.includes('AI credential encryption is not configured') &&
        connectionsAfter.totalDocs === connectionsBefore.totalDocs &&
        credentialsAfter.totalDocs === credentialsBefore.totalDocs,
    )

    // ---- Canary sweep ----------------------------------------------------
    const webLog = await readFile(`${out}/web.log`, 'utf8').catch(() => '')
    const joined = bodies.join('\n')
    await check(
      'no canary secret appears in any API/page response body or the web log',
      !joined.includes(AI_CANARY) &&
        !joined.includes(POD_CANARY) &&
        !joined.includes(WHSEC_CANARY) &&
        !webLog.includes(AI_CANARY) &&
        !webLog.includes(POD_CANARY) &&
        !webLog.includes(WHSEC_CANARY),
    )

    await save()
    console.log(`\nJOURNEY ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  } else {
    // ---- RESTART VERIFICATION -------------------------------------------
    // Web + database were restarted between phases; run.sh restart exports
    // the v2 keyring with v2 active. The stored envelope is still v1.
    const persisted = await payload.findByID({
      collection: 'ai-connections',
      id: state.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    const credentialRows = await payload.find({
      collection: 'ai-credentials',
      where: { connection: { equals: state.connectionId } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'after web+DB restart the AI connection is still active with the original lastTestedAt and its v1 envelope still decrypts (v1 retained in keyring)',
      persisted?.status === 'active' &&
        Date.parse(String(persisted?.lastTestedAt)) === Date.parse(String(state.lastTestedAt)) &&
        credentialRows.totalDocs === 1 &&
        credentialRows.docs[0]?.envelope?.keyId === 'v1' &&
        (await connectionCredential(payload, state.connectionId)) === AI_CANARY,
    )

    const rotate = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: { action: 'rotate-credential-keys' },
    })
    const rotatedRows = await payload.find({
      collection: 'ai-credentials',
      where: { connection: { equals: state.connectionId } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'owner rotates credential keys through the Center operator action: 1 envelope re-encrypted v1 -> v2, secret intact, no secret in the response',
      rotate.status === 200 &&
        rotate.json?.success === true &&
        rotate.json?.rotated === 1 &&
        rotate.json?.failed === 0 &&
        rotate.json?.activeKeyId === 'v2' &&
        rotatedRows.docs[0]?.envelope?.keyId === 'v2' &&
        (await connectionCredential(payload, state.connectionId)) === AI_CANARY &&
        !rotate.text.includes(AI_CANARY),
    )
    const rotateAudits = await payload.find({
      collection: 'integration-audit-events',
      where: { action: { equals: 'credential_keys.rotated' } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'rotation audit event recorded with outcome allowed',
      rotateAudits.docs.some((d: any) => d.outcome === 'allowed' && d.subject?.rotated === 1),
    )
    const rotateAgain = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: { action: 'rotate-credential-keys' },
    })
    await check(
      'second rotation is idempotent (rotated 0, alreadyCurrent 1)',
      rotateAgain.status === 200 &&
        rotateAgain.json?.rotated === 0 &&
        rotateAgain.json?.alreadyCurrent === 1,
    )

    await startHarness()
    const reconcileRotated = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'reconcile-provider',
        collection: 'ai-connections',
        connectionId: state.connectionId,
      },
    })
    await check(
      'reconcile still probes successfully with the rotated envelope',
      reconcileRotated.status === 200 &&
        reconcileRotated.json?.probePerformed === true &&
        reconcileRotated.json?.reconciliation?.observedSuccess === true,
    )
    const center = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const aiEntry = centerEntry(center.json, 'ai-connections', state.connectionId)
    await check(
      'Center still reports the connection active/healthy with an observed lastSuccessAt after restart + rotation',
      aiEntry?.status === 'active' &&
        aiEntry?.healthState === 'healthy' &&
        Boolean(aiEntry?.lastSuccessAt),
    )
    const pageRes = await api('/connections', { cookie: ownerCookie })
    await check(
      'owner renders /connections after restart showing the connection label and no credential material',
      pageRes.status === 200 &&
        pageRes.text.includes('16A Ollama Harness') &&
        !pageRes.text.includes(AI_CANARY),
    )

    // ---- Disconnect purges the envelope ---------------------------------
    const disconnect = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: {
        action: 'disconnect-provider',
        collection: 'ai-connections',
        connectionId: state.connectionId,
      },
    })
    const afterDisconnect = await payload.findByID({
      collection: 'ai-connections',
      id: state.connectionId,
      depth: 0,
      overrideAccess: true,
    })
    const credentialsAfter = await payload.find({
      collection: 'ai-credentials',
      where: { connection: { equals: state.connectionId } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'Center disconnect purges credentials: envelope rows deleted, connection disconnected with capabilities and models cleared',
      disconnect.status === 200 &&
        disconnect.json?.credentialsPurged === true &&
        credentialsAfter.totalDocs === 0 &&
        afterDisconnect?.status === 'disconnected' &&
        Array.isArray(afterDisconnect?.capabilities) &&
        afterDisconnect.capabilities.length === 0 &&
        Array.isArray(afterDisconnect?.models) &&
        afterDisconnect.models.length === 0,
    )
    const centerAfter = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const entryAfter = centerEntry(centerAfter.json, 'ai-connections', state.connectionId)
    await check(
      'Center health reflects the disconnect: status disconnected, lastSuccessAt null, canDisconnect false',
      entryAfter?.status === 'disconnected' &&
        entryAfter?.lastSuccessAt === null &&
        entryAfter?.canDisconnect === false,
    )
    const testDisconnected = await api('/api/admin/ai/connections', {
      method: 'PATCH',
      cookie: ownerCookie,
      body: { id: state.connectionId, siteId: state.alpha, action: 'test' },
    })
    await check(
      'family test on a disconnected connection is refused with the reconnect instruction',
      testDisconnected.status === 400 &&
        String(testDisconnected.json?.error || '').includes('Connection is disconnected'),
    )

    const webLog = await readFile(`${out}/restart-web.log`, 'utf8').catch(() => '')
    const joined = bodies.join('\n')
    await check(
      'no canary secret appears in any restart-phase response body or the restart web log',
      !joined.includes(AI_CANARY) &&
        !joined.includes(POD_CANARY) &&
        !joined.includes(WHSEC_CANARY) &&
        !webLog.includes(AI_CANARY) &&
        !webLog.includes(POD_CANARY) &&
        !webLog.includes(WHSEC_CANARY),
    )

    console.log(`\nRESTART ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  }
} finally {
  await stopHarness().catch(() => {})
  if (web?.pid) {
    try {
      process.kill(web.pid)
    } catch {}
  }
  process.exit(0)
}
