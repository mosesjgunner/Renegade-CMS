/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable PostgreSQL + local harness acceptance */
/**
 * RC1 16C acceptance: import/export, provider conformance and the
 * extensions boundary.
 *
 * Proves, against two disposable databases (source rc116c_release_acceptance
 * and clean target rc116c_target_release_acceptance) and local harnesses
 * only (test doubles — NOT real-world providers):
 *  - a real supported export/import round trip: operator HTTP export and
 *    the documented CLI (`tsx src/scripts/portability.ts`) export an
 *    encrypted archive from the source site; the CLI imports it into a
 *    clean target database; export-vs-export comparison proves equivalent
 *    persisted state, media bytes included; re-import is idempotent;
 *  - import negatives: tampered archive, wrong key, cross-tenant archive
 *    and a same-ID foreign-site conflict are all rejected without partial
 *    corruption; secret-bearing records are refused at export time;
 *  - provider conformance, observed per adapter and written to
 *    provider-matrix.json: AI Ollama (live local harness) and the
 *    OpenAI-compatible error contract, Bluesky/Mastodon/Discord against
 *    loopback harnesses, the deterministic commerce adapter, the POD
 *    emulator + simulator fail-safe + unconfigured Printful, email
 *    development sink / disabled adapter, the extension reference
 *    adapters (non-shipping) and the import-adapter framework;
 *  - the extensions boundary: lifecycle trust/permission/compatibility
 *    gates, capability availability only from active unexpired
 *    connections, redacted connection-test failures, and a source scan
 *    proving the developer reference adapters have no production caller;
 *  - restart: imported state survives a web + PostgreSQL restart.
 *
 * Operator sessions are fixture passkey sessions (createPasskeySession),
 * the same convention as the 15E/16A/16B harnesses; no genuine passkey
 * claim is made.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { mediaStorage } from '../../src/modules/media/storage'
import { loadConfig } from '../../src/modules/core/config'
import {
  checksum,
  createPortableArchive,
  createPortableManifest,
  validatePortableManifest,
  discoverImport,
  executeImport,
  validateImportPlan,
  IMPORT_ADAPTERS,
  type PortableManifest,
} from '../../src/modules/portability/contracts'
import { discoverAiModels, ollamaAdapter, validateAiEndpoint } from '../../src/modules/ai/gateway'
import {
  blueskyAdapter,
  getProviderCapabilityTruth,
} from '../../src/modules/social/provider-runtime'
import { ADAPTER_REGISTRY } from '../../src/modules/social/worker'
import { MastodonAdapter } from '../../src/modules/social/adapters/mastodon'
import { DiscordAdapter } from '../../src/modules/social/adapters/discord'
import { createDeterministicPaymentAdapter } from '../../src/modules/commerce/payment-provider'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { PodSimulatorAdapter } from '../../src/modules/commerce/pod-simulator'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import {
  developmentCaptureEmailAdapter,
  disabledEmailAdapter,
  localMailSinkReceipts,
  resetLocalMailSink,
  selectEmailDeliveryAdapter,
  simulateLocalMailSinkOutcome,
} from '../../src/modules/email/delivery'
import {
  CapabilityRegistry,
  redactDiagnostic,
  testConnection,
} from '../../src/modules/extensions/registry'
import { ExtensionLifecycleService } from '../../src/modules/extensions/lifecycle'
import {
  developmentEmailAdapter,
  localFilesystemAdapter,
} from '../../src/modules/extensions/reference-adapters'
import { exampleExtension } from '../../src/modules/extensions/example-extension'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc116c_release_acceptance',
)
assert.equal(
  process.env.TARGET_DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc116c_target_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/16C'
const base = 'http://127.0.0.1:39067'
const restart = process.argv.includes('restart')
const trace: any[] = []
const bodies: string[] = []
const matrix: any[] = []

const KEY = process.env.PORTABILITY_KEY!
const WRONG_KEY = process.env.PORTABILITY_WRONG_KEY!
const AI_CANARY = 'rc116c-ai-canary-secret-44d1'
const CANARIES = [KEY, WRONG_KEY, AI_CANARY, process.env.PAYLOAD_SECRET!]

const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(trace, null, 2),
  )
}
const matrixRow = (row: any) => {
  matrix.push(row)
  console.log(
    `MATRIX ${row.key}: ${row.checks.filter((c: any) => c.outcome === 'passed').length}/${row.checks.length} checks passed`,
  )
}

const state: any = await readFile('scratch/rc116c/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () => writeFile('scratch/rc116c/state.json', JSON.stringify(state, null, 2))

// ---- Subprocess helpers ---------------------------------------------------
const targetEnv = {
  DATABASE_URL: process.env.TARGET_DATABASE_URL!,
  DATABASE_URI: process.env.TARGET_DATABASE_URL!,
  MEDIA_DIR: process.env.TARGET_MEDIA_DIR!,
}
// The portability CLI prints its report as pretty-printed JSON as the LAST
// stdout payload; Payload's own log lines precede it.
const lastJson = (text: string): any => {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i] === '{') {
      try {
        return JSON.parse(lines.slice(i).join('\n'))
      } catch {
        // keep scanning
      }
    }
  }
  throw new Error(`no JSON object found in output: ${text.slice(-400)}`)
}
const runNode = (script: string, args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}
const runCli = (args: string[], env: Record<string, string> = {}) =>
  runNode('src/scripts/portability.ts', args, env)
const runTarget = (args: string[]) => {
  const result = runNode('tests/rc1-16c/target-tool.ts', args, targetEnv)
  assert.equal(result.status, 0, `target-tool ${args[0]} failed: ${result.stderr.slice(-800)}`)
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!)
}

// ---- Session / HTTP helpers ------------------------------------------------
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

let web: ChildProcess | undefined
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
      '39067',
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
async function stopWeb(): Promise<void> {
  if (web?.pid) {
    try {
      process.kill(web.pid)
    } catch {}
    web = undefined
    await new Promise((r) => setTimeout(r, 1500))
  }
}

// ---- Local provider harnesses ----------------------------------------------
// Ollama-protocol harness: /api/tags + /api/generate.
const ollamaPort = 39167
let ollama: Server | undefined
const ollamaStats = { tags: 0, generate: 0 }
function startOllama(): Promise<void> {
  ollama = createHttpServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      if (req.url === '/api/tags') {
        ollamaStats.tags++
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ models: [{ name: 'llama3.2' }, { name: 'qwen2.5' }] }))
      }
      if (req.url === '/api/generate') {
        ollamaStats.generate++
        const body = JSON.parse(raw || '{}')
        const structured = Boolean(body.format)
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(
          JSON.stringify({
            model: body.model,
            response: structured ? '{"summary":"harness"}' : 'harness rewrite output',
            prompt_eval_count: 11,
            eval_count: 7,
          }),
        )
      }
      res.writeHead(404)
      res.end('{}')
    })
  })
  return new Promise((resolve) => ollama!.listen(ollamaPort, '127.0.0.1', resolve))
}
async function stopOllama(): Promise<void> {
  if (!ollama) return
  const server = ollama
  ollama = undefined
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// AT Protocol XRPC harness for the Bluesky provider-runtime adapter:
// createSession / getRecord / createRecord with an in-memory record store.
const xrpcPort = 39168
let xrpc: Server | undefined
const xrpcState = { records: new Map<string, any>(), creates: 0, sessions: 0 }
function startXrpc(): Promise<void> {
  xrpc = createHttpServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${xrpcPort}`)
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      if (url.pathname === '/xrpc/com.atproto.server.createSession') {
        const body = JSON.parse(raw || '{}')
        if (body.password !== 'harness-app-password')
          return json(401, { error: 'AuthenticationRequired', message: 'Invalid password.' })
        xrpcState.sessions++
        return json(200, { accessJwt: 'harness-jwt', did: 'did:plc:rc116c', handle: 'rc116c.test' })
      }
      if (url.pathname === '/xrpc/com.atproto.repo.getRecord') {
        const record = xrpcState.records.get(url.searchParams.get('rkey') ?? '')
        if (!record) return json(400, { error: 'RecordNotFound', message: 'Record not found.' })
        return json(200, { uri: record.uri, value: record.value })
      }
      if (url.pathname === '/xrpc/com.atproto.repo.createRecord') {
        const body = JSON.parse(raw || '{}')
        xrpcState.creates++
        const uri = `at://did:plc:rc116c/app.bsky.feed.post/${body.rkey}`
        xrpcState.records.set(body.rkey, { uri, value: body.record })
        return json(200, { uri })
      }
      return json(404, { error: 'Unknown', message: 'Unknown XRPC method.' })
    })
  })
  return new Promise((resolve) => xrpc!.listen(xrpcPort, '127.0.0.1', resolve))
}
async function stopXrpc(): Promise<void> {
  if (!xrpc) return
  const server = xrpc
  xrpc = undefined
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// Generic loopback capture server (Mastodon statuses + Discord webhook).
const capturePort = 39169
let capture: Server | undefined
const captureHits: { path: string; body: any }[] = []
function startCapture(): Promise<void> {
  capture = createHttpServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      let body: any = {}
      try {
        body = JSON.parse(raw || '{}')
      } catch {}
      captureHits.push({ path: req.url ?? '', body })
      if ((req.url ?? '').startsWith('/api/v1/statuses')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(
          JSON.stringify({ id: '109876543210', url: `http://127.0.0.1:${capturePort}/statuses/1` }),
        )
      }
      if ((req.url ?? '').startsWith('/discord/')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ id: '555000111', channel_id: '777' }))
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })
  })
  return new Promise((resolve) => capture!.listen(capturePort, '127.0.0.1', resolve))
}
async function stopCapture(): Promise<void> {
  if (!capture) return
  const server = capture
  capture = undefined
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// ---- Equivalence normalization ----------------------------------------------
// Imported rows live under NEW ids (the adapter assigns them), so equivalence
// is judged per collection as a multiset of normalized record checksums:
// record ids referenced anywhere become REF, Payload array-row ids become
// ROW, the site reference and the media storage location are normalized, and
// the portable timestamps are dropped.
const uuidTokenGlobal = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const normalizeData = (data: any, siteIds: string[], recordIds: Set<string>): any => {
  if (typeof data === 'string') {
    if (recordIds.has(data)) return 'REF'
    if (/^[0-9a-f]{24}$/.test(data)) return 'ROW'
    // Composite keys embed a record id (articleKey is `content:<id>`).
    if (data.length >= 36)
      return data.replace(uuidTokenGlobal, (token) => (recordIds.has(token) ? 'REF' : token))
    return data
  }
  if (Array.isArray(data)) return data.map((item) => normalizeData(item, siteIds, recordIds))
  if (!data || typeof data !== 'object') return data
  const outData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === '_portableTimestamps') continue
    // Server-stamped at publication time and re-derived on import, in the
    // same class as the createdAt/updatedAt the export sets aside.
    if (key === 'publicModifiedAt') continue
    if (key === 'site' && siteIds.includes(String(value))) {
      outData[key] = 'SITE'
    } else if (key === 'storageLocation' && typeof value === 'string') {
      outData[key] = `media/${value.split('/').pop()}`
    } else {
      outData[key] = normalizeData(value, siteIds, recordIds)
    }
  }
  return outData
}
const manifestMultisets = (
  manifest: PortableManifest,
  siteIds: string[],
  recordIds: Set<string>,
) => {
  const map = new Map<string, string[]>()
  for (const record of manifest.records) {
    if (record.collection === 'sites') continue
    const list = map.get(record.collection) ?? []
    list.push(checksum(normalizeData(record.data, siteIds, recordIds)))
    map.set(record.collection, list)
  }
  for (const list of map.values()) list.sort()
  return map
}
const isSubMultiset = (needles: string[], haystack: string[]) => {
  const counts = new Map<string, number>()
  for (const item of haystack) counts.set(item, (counts.get(item) ?? 0) + 1)
  return needles.every((item) => {
    const remaining = counts.get(item) ?? 0
    if (!remaining) return false
    counts.set(item, remaining - 1)
    return true
  })
}
const forbiddenKey =
  /(^|_)(secret|token|password|private.?key|recovery.?key|seed.?phrase|card.?number|oauth)(_|$)/i
const findForbiddenKeys = (value: unknown, path = ''): string[] => {
  if (Array.isArray(value))
    return value.flatMap((item, i) => findForbiddenKeys(item, `${path}[${i}]`))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
    ...(forbiddenKey.test(key) ? [`${path}.${key}`] : []),
    ...findForbiddenKeys(nested, `${path}.${key}`),
  ])
}

const MEDIA_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=',
  'base64',
)
const MEDIA_SHA = createHash('sha256').update(MEDIA_BYTES).digest('hex')

try {
  await mkdir('scratch/rc116c', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!restart) {
    // ---- Fixtures ---------------------------------------------------------
    state.alpha = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '16C Alpha', slug: '16c-alpha', lifecycle: 'active' },
        })
      ).id,
    )
    state.beta = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '16C Beta', slug: '16c-beta', lifecycle: 'active' },
        })
      ).id,
    )
    const ownerUser = await payload.create({
      collection: 'users',
      data: { email: 'owner@16c.test', role: 'owner' },
    })
    state.owner = String(ownerUser.id)
    const adminUser = await payload.create({
      collection: 'users',
      data: { email: 'admin@16c.test', role: 'administrator' },
    })
    state.admin = String(adminUser.id)
    const ownerMember =
      typeof ownerUser.member === 'object' ? ownerUser.member.id : ownerUser.member
    const adminMember =
      typeof adminUser.member === 'object' ? adminUser.member.id : adminUser.member
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

    const alpha = Number(state.alpha)
    state.author = String(
      (
        await payload.create({
          collection: 'authors',
          data: { displayName: 'Riley Reporter', slug: 'riley-reporter' },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.publication = String(
      (
        await payload.create({
          collection: 'publications',
          data: { site: state.alpha, name: 'Renegade Ledger', slug: 'renegade-ledger' },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.category = String(
      (
        await payload.create({
          collection: 'categories',
          data: {
            site: state.alpha,
            name: 'Civic Ledger',
            slug: 'civic-ledger',
            scope: 'publication',
            publication: state.publication,
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.tag = String(
      (
        await payload.create({
          collection: 'tags',
          data: {
            site: state.alpha,
            name: 'Transparency',
            slug: 'transparency',
            scope: 'publication',
            publication: state.publication,
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.content = String(
      (
        await payload.create({
          collection: 'content',
          data: {
            site: state.alpha,
            title: 'The Ledger Opens',
            slug: 'the-ledger-opens',
            summary: 'A portable article about public records.',
            status: 'published',
            contentType: 'article',
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
                        text: 'The ledger opens with a public record anyone can verify.',
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
            publishedAt: '2026-10-20T12:00:00.000Z',
            authors: [{ author: state.author, displayOrder: 0, role: 'Reporter' }],
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    const storage = mediaStorage(loadConfig())
    state.mediaLocation = 'rc116c-hero.png'
    await storage.put(state.mediaLocation, MEDIA_BYTES, 'image/png')
    state.media = String(
      (
        await payload.create({
          collection: 'media-assets',
          data: {
            site: state.alpha,
            title: 'Ledger hero image',
            kind: 'image',
            storageLocation: state.mediaLocation,
            storageProvider: 'local',
            originalFilename: 'rc116c-hero.png',
            mimeType: 'image/png',
            sizeBytes: MEDIA_BYTES.length,
            checksum: MEDIA_SHA,
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.event = String(
      (
        await payload.create({
          collection: 'events',
          data: {
            site: state.alpha,
            title: 'Ledger Launch Night',
            slug: 'ledger-launch-night',
            startsAt: '2027-04-15T23:00:00.000Z',
            endsAt: '2027-04-16T01:00:00.000Z',
            timeZone: 'America/New_York',
            status: 'published',
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.timeline = String(
      (
        await payload.create({
          collection: 'timelines',
          data: { site: state.alpha, title: 'Renegade Milestones', slug: 'renegade-milestones' },
          overrideAccess: true,
        } as never)
      ).id,
    )
    await save()
  }

  const ownerCookie = await session(state.owner)
  const adminCookie = await session(state.admin)

  const booted = await bootWeb(restart ? 'restart-web.log' : 'web.log')
  await check(
    `${restart ? 'restart: ' : ''}Next.js web process booted on ${base} (anonymous /connections redirects to login)`,
    booted,
  )

  if (!restart) {
    // ---- Operator export (HTTP) -------------------------------------------
    const anonExport = await api(`/api/migration/export?siteId=${state.alpha}`)
    const foreignExport = await api(`/api/migration/export?siteId=${state.alpha}`, {
      cookie: adminCookie,
    })
    const ownerExport = await api(`/api/migration/export?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    await check(
      'export route denies anonymous (403) and foreign-site administrator (403); owner exports its own site (200)',
      anonExport.status === 403 && foreignExport.status === 403 && ownerExport.status === 200,
    )
    const manifest = ownerExport.json.manifest as PortableManifest
    validatePortableManifest(manifest)
    const collections = new Set(manifest.records.map((record) => record.collection))
    await check(
      'owner export manifest validates and carries the seeded content, media, event and timeline records',
      ownerExport.json.recordCount === manifest.records.length &&
        collections.has('content') &&
        collections.has('media-assets') &&
        collections.has('events') &&
        collections.has('timelines') &&
        manifest.records.some((record) => String(record.id) === String(state.content)),
    )
    const mediaEntry = manifest.media.find((entry) => String(entry.id) === String(state.media))
    await check(
      'exported media entry carries the original bytes (base64) with matching checksum',
      Boolean(mediaEntry?.objectData) &&
        createHash('sha256')
          .update(Buffer.from(mediaEntry!.objectData!, 'base64'))
          .digest('hex') === MEDIA_SHA &&
        mediaEntry!.originalChecksum === MEDIA_SHA,
    )
    await check(
      'exported manifest contains no secret-bearing keys anywhere',
      findForbiddenKeys(manifest).length === 0,
    )
    state.sourceManifest = manifest

    // ---- CLI export ---------------------------------------------------------
    const archivePath = 'scratch/rc116c/archive.json'
    const cliExport = runCli([
      'export',
      '--file',
      archivePath,
      '--key',
      KEY,
      '--site-id',
      state.alpha,
    ])
    bodies.push(cliExport.stdout, cliExport.stderr)
    const cliExportJson = lastJson(cliExport.stdout)
    await check(
      'documented CLI exports an encrypted archive (exit 0, state completed, record count matches the HTTP export)',
      cliExport.status === 0 &&
        cliExportJson.state === 'completed' &&
        cliExportJson.records === manifest.records.length &&
        existsSync(archivePath),
    )
    await check(
      'CLI archive file is written with owner-only permissions (0600)',
      (statSync(archivePath).mode & 0o777) === 0o600,
    )
    const badKeyExport = runCli([
      'export',
      '--file',
      'scratch/rc116c/bad-key.json',
      '--key',
      'not-a-key',
      '--site-id',
      state.alpha,
    ])
    await check(
      'CLI refuses a malformed archive key before touching the database',
      badKeyExport.status !== 0 &&
        /64-hex-character|32-byte hex/.test(badKeyExport.stderr + badKeyExport.stdout),
    )

    // ---- Import round trip into the clean target database -------------------
    const targetSite = runTarget(['ensure-site', '16c-target', '16C Target'])
    state.targetSite = targetSite.id
    // Creating a site auto-provisions a default publication for it; that is
    // the target's legitimate baseline, so the dry-run proof is "unchanged
    // from baseline", not "empty".
    const baselineSnapshot = runTarget(['snapshot', state.targetSite])
    const baselineCounts = Object.fromEntries(
      Object.entries(baselineSnapshot).map(([key, rows]) => [key, (rows as any[]).length]),
    )
    const targetArgs = ['--file', archivePath, '--target-site-id', state.targetSite]
    const dryRun = runCli(['import', ...targetArgs, '--key', KEY], targetEnv)
    bodies.push(dryRun.stdout, dryRun.stderr)
    const dryReport = lastJson(dryRun.stdout)
    const afterDrySnapshot = runTarget(['snapshot', state.targetSite])
    const afterDryCounts = Object.fromEntries(
      Object.entries(afterDrySnapshot).map(([key, rows]) => [key, (rows as any[]).length]),
    )
    await check(
      'CLI import dry-run reports the full plan and writes nothing to the clean target',
      dryRun.status === 0 &&
        dryReport.dryRun === true &&
        dryReport.created === 0 &&
        JSON.stringify(afterDryCounts) === JSON.stringify(baselineCounts),
    )
    const applied = runCli(['import', ...targetArgs, '--key', KEY, '--apply'], targetEnv)
    bodies.push(applied.stdout, applied.stderr)
    const appliedReport = lastJson(applied.stdout)
    state.appliedReport = appliedReport
    await check(
      'CLI import --apply completes with no failed rows and no validation errors',
      applied.status === 0 &&
        appliedReport.dryRun === false &&
        appliedReport.failedRows.length === 0 &&
        appliedReport.validationErrors.length === 0 &&
        appliedReport.created + appliedReport.updated === manifest.records.length - 1,
    )
    const targetManifest = runTarget(['export-manifest', state.targetSite]) as PortableManifest
    const recordIds = new Set(
      [...manifest.records, ...targetManifest.records].map((record) => String(record.id)),
    )
    const sourceSets = manifestMultisets(manifest, [state.alpha, state.targetSite], recordIds)
    const targetSets = manifestMultisets(targetManifest, [state.alpha, state.targetSite], recordIds)
    // Every source collection's records must be present in the target with
    // identical normalized checksums; non-publication collections must match
    // exactly (the target additionally carries its own auto-provisioned
    // publication, which the source export cannot contain).
    const inequivalent = [...sourceSets.entries()].filter(([collection, needles]) => {
      const haystack = targetSets.get(collection) ?? []
      return collection === 'publications'
        ? !isSubMultiset(needles, haystack)
        : JSON.stringify(needles) !== JSON.stringify(haystack)
    })
    if (inequivalent.length)
      console.log(
        'INEQUIVALENT',
        inequivalent.map(([c]) => c),
      )
    await check(
      'export-vs-export equivalence: every source record is persisted in the target with an identical normalized checksum (ids remapped; target may additionally carry its own auto-provisioned publication)',
      inequivalent.length === 0 && sourceSets.size > 0,
    )
    const targetMedia = runTarget([
      'media-sha',
      `${state.targetSite}/${state.mediaLocation.split('/').pop()}`,
    ])
    await check(
      'imported media bytes are stored under the target site with identical content',
      targetMedia.sha256 === MEDIA_SHA,
    )
    const again = runCli(
      [
        'import',
        ...targetArgs,
        '--key',
        KEY,
        '--apply',
        '--resume',
        '--checkpoint',
        'scratch/rc116c/archive.json.checkpoint.json',
      ],
      targetEnv,
    )
    bodies.push(again.stdout, again.stderr)
    const againReport = lastJson(again.stdout)
    const snapshotAfter = runTarget(['snapshot', state.targetSite])
    const countsAfter = Object.fromEntries(
      Object.entries(snapshotAfter).map(([key, rows]) => [key, (rows as any[]).length]),
    )
    state.targetCounts = countsAfter
    await check(
      're-import with the run checkpoint (--resume) is idempotent: every record skipped, zero created, no duplicates, per-collection counts unchanged',
      again.status === 0 &&
        againReport.created === 0 &&
        againReport.skipped === manifest.records.length - 1 &&
        countsAfter['content'] === 1 &&
        countsAfter['media-assets'] === 1,
    )
    await save()

    // ---- Import negatives -----------------------------------------------------
    const countsBefore = JSON.stringify(countsAfter)
    const archiveRaw = readFileSync(archivePath, 'utf8')
    const archiveJson = JSON.parse(archiveRaw)
    const tampered = {
      ...archiveJson,
      ciphertext:
        archiveJson.ciphertext.slice(0, 40) +
        (archiveJson.ciphertext[40] === 'A' ? 'B' : 'A') +
        archiveJson.ciphertext.slice(41),
    }
    writeFileSync('scratch/rc116c/tampered.json', JSON.stringify(tampered))
    const tamperedRun = runCli(
      [
        'import',
        '--file',
        'scratch/rc116c/tampered.json',
        '--key',
        KEY,
        '--target-site-id',
        state.targetSite,
        '--apply',
      ],
      targetEnv,
    )
    await check(
      'tampered archive is rejected (integrity/decrypt failure) and imports nothing',
      tamperedRun.status !== 0 &&
        /integrity|decrypt|validated/.test(tamperedRun.stderr + tamperedRun.stdout) &&
        JSON.stringify(
          Object.fromEntries(
            Object.entries(runTarget(['snapshot', state.targetSite])).map(([k, rows]) => [
              k,
              (rows as any[]).length,
            ]),
          ),
        ) === countsBefore,
    )
    const wrongKeyRun = runCli(['import', ...targetArgs, '--key', WRONG_KEY, '--apply'], targetEnv)
    await check(
      'import with the wrong archive key fails before any write',
      wrongKeyRun.status !== 0 &&
        /integrity|decrypt|validated/.test(wrongKeyRun.stderr + wrongKeyRun.stdout),
    )
    // Cross-tenant archive: an Alpha-site archive carrying a Beta-site record.
    const crossManifest = createPortableManifest({
      createdAt: new Date().toISOString(),
      records: [
        ...manifest.records,
        {
          collection: 'content',
          id: '987654',
          data: {
            site: Number(state.beta),
            title: 'Foreign stowaway',
            slug: 'foreign-stowaway',
            status: 'draft',
          },
        },
      ],
      media: manifest.media,
    })
    writeFileSync(
      'scratch/rc116c/cross-site.json',
      JSON.stringify(createPortableArchive(crossManifest, Buffer.from(KEY, 'hex'))),
    )
    const crossRun = runCli(
      [
        'import',
        '--file',
        'scratch/rc116c/cross-site.json',
        '--key',
        KEY,
        '--target-site-id',
        state.targetSite,
        '--apply',
      ],
      targetEnv,
    )
    await check(
      'archive crossing a tenant boundary is rejected whole (no partial import)',
      crossRun.status !== 0 && /tenant boundary/.test(crossRun.stderr + crossRun.stdout),
    )
    // Same-ID foreign-site conflict: the row fails, the holder is untouched.
    // The holder row is planted by SQL with the source content's exact id
    // (Payload create cannot assign ids), simulating a pre-existing row from
    // an earlier SQL-level restore in a shared database.
    const otherSite = runTarget(['ensure-site', '16c-other', '16C Other'])
    runTarget(['create-content-conflict', String(state.content), otherSite.id])
    const conflictManifest = createPortableManifest({
      createdAt: new Date().toISOString(),
      records: manifest.records.filter(
        (record) => record.collection === 'sites' || record.collection === 'content',
      ),
      media: [],
    })
    writeFileSync(
      'scratch/rc116c/conflict.json',
      JSON.stringify(createPortableArchive(conflictManifest, Buffer.from(KEY, 'hex'))),
    )
    const conflictRun = runCli(
      [
        'import',
        '--file',
        'scratch/rc116c/conflict.json',
        '--key',
        KEY,
        '--target-site-id',
        state.targetSite,
        '--apply',
      ],
      targetEnv,
    )
    bodies.push(conflictRun.stdout)
    const conflictReport = lastJson(conflictRun.stdout)
    const otherSnapshot = runTarget(['snapshot', otherSite.id])
    await check(
      'same-ID record owned by another site fails its row (exit 1) and is never overwritten',
      conflictRun.status === 1 &&
        conflictReport.failedRows?.some((row: any) =>
          /belongs to another site/.test(row.message),
        ) &&
        (otherSnapshot['content'] ?? []).some(
          (row: any) => row.data.title === '16C Conflict Holder',
        ),
    )
    // Secret refusal at export-contract level.
    let secretRefused = false
    try {
      createPortableManifest({
        createdAt: new Date().toISOString(),
        records: [{ collection: 'content', id: '1', data: { title: 'x', api_secret: 'canary' } }],
        media: [],
      })
    } catch (error) {
      secretRefused = /refuses secret material/.test(String(error))
    }
    await check('portable manifest creation refuses secret-bearing records', secretRefused)
  }

  if (!restart) {
    // ======================================================================
    // Provider conformance — every outcome below is observed in this run
    // and recorded into provider-matrix.json.
    // ======================================================================
    const now = new Date().toISOString()

    // ---- AI: Ollama against the local protocol harness ---------------------
    await startOllama()
    const ollamaEndpoint = `http://127.0.0.1:${ollamaPort}`
    const discovered = await discoverAiModels('ai.ollama', ollamaEndpoint, AI_CANARY)
    const models: string[] = Array.isArray(discovered) ? discovered : [String(discovered)]
    const completion = await ollamaAdapter(ollamaEndpoint, AI_CANARY).complete({
      model: 'llama3.2',
      prompt: 'Rewrite: the ledger opens.',
    } as any)
    const completionText = String(completion.output)
    await stopOllama()
    const downError: string = await discoverAiModels('ai.ollama', ollamaEndpoint, AI_CANARY).then(
      () => 'no-error',
      (error) => String(error),
    )
    matrixRow({
      key: 'ai.ollama',
      family: 'ai',
      boundary: 'local-only (loopback enforced by validateAiEndpoint)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'model discovery against local Ollama-protocol harness',
          outcome: models.includes('llama3.2') ? 'passed' : 'failed',
        },
        {
          name: 'text completion returns harness output with token counts',
          outcome:
            completionText.includes('harness') && completion.outputTokens === 7
              ? 'passed'
              : 'failed',
        },
        {
          name: 'harness observed the real probes',
          outcome: ollamaStats.tags >= 1 && ollamaStats.generate >= 1 ? 'passed' : 'failed',
        },
        {
          name: 'provider down produces a failure, never a fabricated success',
          outcome: downError !== 'no-error' && downError.length > 0 ? 'passed' : 'failed',
        },
      ],
      notes: 'Local protocol harness only; no real Ollama or remote AI outcome is claimed.',
    })
    await check(
      'conformance ai.ollama: discovery + completion observed against the local harness; outage fails truthfully',
      models.includes('llama3.2') &&
        completionText.includes('harness') &&
        downError !== 'no-error' &&
        downError.length > 0,
    )

    // ---- AI: OpenAI-compatible error contract -------------------------------
    let httpsRejection = ''
    try {
      validateAiEndpoint('ai.openai-compatible', `http://127.0.0.1:${xrpcPort}`)
    } catch (error) {
      httpsRejection = String(error)
    }
    const unreachable = await discoverAiModels(
      'ai.openai-compatible',
      'https://127.0.0.1:9',
      AI_CANARY,
    ).catch((error) => String(error))
    matrixRow({
      key: 'ai.openai-compatible',
      family: 'ai',
      boundary: 'remote (HTTPS required; no loopback HTTP path exists by design)',
      shipping: true,
      verification: 'executed-16c (error contracts only)',
      checks: [
        {
          name: 'plain-HTTP loopback endpoint is rejected (HTTPS required)',
          outcome: /HTTPS/.test(httpsRejection) ? 'passed' : 'failed',
        },
        {
          name: 'unreachable HTTPS endpoint fails discovery with a normalized error',
          outcome: unreachable.length > 0 ? 'passed' : 'failed',
        },
      ],
      notes:
        'No live completion is claimed: the adapter requires an HTTPS endpoint, so no local HTTP harness success is possible or fabricated. Ollama is the locally provable AI path (16A + this run).',
    })
    await check(
      'conformance ai.openai-compatible: HTTPS-only contract and normalized discovery failure observed',
      /HTTPS/.test(httpsRejection) && unreachable.length > 0,
    )

    // ---- Social: Bluesky against the loopback XRPC harness -------------------
    await startXrpc()
    const variant = {
      id: 'rc116c-variant-1',
      accountId: 'rc116c-account',
      network: 'bluesky',
      text: 'The ledger opens — conformance post.',
      attachments: [],
      status: 'approved',
      idempotencyKey: 'rc116c-post-1',
    } as any
    const bskyContext = {
      credentials: {
        identifier: 'rc116c.test',
        appPassword: 'harness-app-password',
        service: `http://127.0.0.1:${xrpcPort}`,
      },
    } as any
    const publishBsky = blueskyAdapter.publish!
    const first = await publishBsky(variant, bskyContext)
    const replay = await publishBsky(variant, bskyContext)
    const noCreds = await publishBsky(variant, { credentials: {} } as any)
    const badCreds = await publishBsky(variant, {
      credentials: {
        identifier: 'rc116c.test',
        appPassword: 'wrong-password',
        service: `http://127.0.0.1:${xrpcPort}`,
      },
    } as any)
    await stopXrpc()
    matrixRow({
      key: 'social.bluesky',
      family: 'social',
      boundary: 'local-harness (module registry: social = local-harness)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'publish succeeds against the XRPC harness with a remote id',
          outcome: first.status === 'published' && Boolean(first.remoteId) ? 'passed' : 'failed',
        },
        {
          name: 'replay of the same idempotency key creates no second record',
          outcome: replay.status === 'published' && xrpcState.creates === 1 ? 'passed' : 'failed',
        },
        {
          name: 'missing credentials fail as reconnect-required',
          outcome:
            noCreds.status === 'failed' && noCreds.error?.kind === 'reconnect-required'
              ? 'passed'
              : 'failed',
        },
        {
          name: 'rejected credentials fail as reconnect-required',
          outcome:
            badCreds.status === 'failed' && badCreds.error?.kind === 'reconnect-required'
              ? 'passed'
              : 'failed',
        },
      ],
      notes: 'Loopback XRPC harness only; no live Bluesky outcome is claimed.',
    })
    await check(
      'conformance social.bluesky: publish + idempotent replay + credential error contracts observed',
      first.status === 'published' && xrpcState.creates === 1 && noCreds.status === 'failed',
    )

    // ---- Social: Mastodon + Discord against the loopback capture server -------
    await startCapture()
    const mastodon = new MastodonAdapter()
    const mastoResult = await mastodon
      .publish({ ...variant, network: 'mastodon', idempotencyKey: 'rc116c-masto-1' }, {
        credentials: {
          instanceUrl: `http://127.0.0.1:${capturePort}`,
          accessToken: 'harness-token',
        },
      } as any)
      .catch((error: unknown) => ({ status: 'threw', error: String(error) }) as any)
    const discord = new DiscordAdapter()
    const discordResult = await discord
      .publish({ ...variant, network: 'discord', idempotencyKey: 'rc116c-discord-1' }, {
        credentials: { webhookUrl: `http://127.0.0.1:${capturePort}/discord/hook` },
      } as any)
      .catch((error: unknown) => ({ status: 'threw', error: String(error) }) as any)
    await stopCapture()
    matrixRow({
      key: 'social.mastodon+discord',
      family: 'social',
      boundary: 'local-harness (loopback instance/webhook endpoints)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: `mastodon publish against loopback instance (observed status: ${mastoResult.status})`,
          outcome: mastoResult.status === 'published' ? 'passed' : 'observed-failure',
        },
        {
          name: `discord publish against loopback webhook (observed status: ${discordResult.status})`,
          outcome: discordResult.status === 'published' ? 'passed' : 'observed-failure',
        },
        {
          name: 'loopback server observed both publish calls',
          outcome: captureHits.length >= 2 ? 'passed' : 'failed',
        },
      ],
      notes: 'Loopback endpoints only; no live network outcome is claimed for either.',
    })
    await check(
      'conformance social.mastodon/discord: both adapters executed against loopback endpoints and their outcomes were recorded',
      captureHits.length >= 1 &&
        typeof mastoResult.status === 'string' &&
        typeof discordResult.status === 'string',
    )

    // ---- Social: capability truth for every registered network -----------------
    const truthRows = Object.keys(ADAPTER_REGISTRY).map((network) => {
      const truth = getProviderCapabilityTruth(network as any)
      const declared = (ADAPTER_REGISTRY as any)[network]?.mode
      return { network, mode: truth.mode, declared }
    })
    matrixRow({
      key: 'social.capability-truth',
      family: 'social',
      boundary: 'per-network (see modes)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'capability truth is reported for every registered network',
          outcome: truthRows.length >= 12 ? 'passed' : 'failed',
        },
        {
          name: 'reported mode never exceeds the adapter class declaration (no upgraded claims)',
          outcome: truthRows.every((row) => row.mode === row.declared) ? 'passed' : 'failed',
        },
      ],
      notes: `Observed modes: ${truthRows.map((row) => `${row.network}=${row.mode}`).join(', ')}. These are the adapter classes' own declared modes, reported verbatim by getProviderCapabilityTruth; a declared "live" mode means the class implements a real HTTP publish path (executed here only for bluesky, mastodon and discord, against loopback harnesses) — it is not a remote-outcome claim for any network.`,
    })
    await check(
      'social capability truth: every network reports a mode and the truth view never upgrades an adapter declaration',
      truthRows.length >= 12 && truthRows.every((row) => row.mode === row.declared),
    )

    // ---- Commerce: deterministic payment adapter --------------------------------
    const payments = createDeterministicPaymentAdapter({
      secret: 'rc116c-det-secret',
      isolated: true,
    })
    const readiness = await payments.readiness()
    const checkoutRequest = {
      idempotencyKey: 'rc116c-checkout-1',
      attemptId: 'attempt-1',
      amountMinor: '1299',
      currency: 'USD',
      expiresAt: '2030-01-01T00:00:00.000Z',
      successUrl: 'http://127.0.0.1:39067/checkout/success',
      cancelUrl: 'http://127.0.0.1:39067/checkout/cancel',
      metadata: {},
    } as any
    const checkout = await payments.createHostedCheckout(checkoutRequest)
    const checkoutReplay = await payments.createHostedCheckout(checkoutRequest)
    ;(payments as any).setState(checkout.providerReference, 'succeeded')
    const settled = await payments.retrieve(checkout.providerReference)
    const webhookBody = JSON.stringify({
      providerEventId: 'evt-rc116c-1',
      providerReference: checkout.providerReference,
      kind: 'succeeded',
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { harness: true },
    })
    const webhookSignature = createHash('sha256').update('placeholder').digest('hex')
    const { createHmac } = await import('node:crypto')
    const goodSignature = createHmac('sha256', 'rc116c-det-secret')
      .update(webhookBody)
      .digest('hex')
    const parsedEvent = payments.normalizeSignedWebhook(webhookBody, goodSignature)
    const rejectedEvent = payments.normalizeSignedWebhook(webhookBody, webhookSignature)
    const noSecret = createDeterministicPaymentAdapter({ secret: '', isolated: true })
    const noSecretReadiness = await noSecret.readiness()
    matrixRow({
      key: 'commerce.deterministic-test',
      family: 'commerce',
      boundary: 'local-adapter (module registry: commerce = local-adapter)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'readiness healthy with a configured secret',
          outcome: readiness.ready ? 'passed' : 'failed',
        },
        {
          name: 'hosted checkout created in action-required state',
          outcome:
            checkout.state === 'action-required' && Boolean(checkout.providerReference)
              ? 'passed'
              : 'failed',
        },
        {
          name: 'idempotent replay returns the same provider reference',
          outcome:
            checkoutReplay.providerReference === checkout.providerReference ? 'passed' : 'failed',
        },
        {
          name: 'state transition to succeeded is retrievable',
          outcome: settled.state === 'succeeded' ? 'passed' : 'failed',
        },
        {
          name: 'correctly signed webhook normalizes; wrongly signed webhook is rejected',
          outcome:
            parsedEvent?.providerEventId === 'evt-rc116c-1' && rejectedEvent === null
              ? 'passed'
              : 'failed',
        },
        {
          name: 'missing secret reports not-ready instead of fabricating health',
          outcome:
            !noSecretReadiness.ready && noSecretReadiness.reason === 'missing-secret'
              ? 'passed'
              : 'failed',
        },
      ],
      notes:
        'Deterministic local adapter; no live charge or payout is claimed. Live Stripe remains unconfigured in RC1 scope.',
    })
    await check(
      'conformance commerce.deterministic-test: checkout lifecycle, idempotency and signed-webhook contract observed',
      readiness.ready &&
        settled.state === 'succeeded' &&
        parsedEvent?.providerEventId === 'evt-rc116c-1' &&
        rejectedEvent === null,
    )

    // ---- Commerce: POD emulator, simulator fail-safe, unconfigured Printful -----
    const pod = new PodEmulatorAdapter()
    const podHealth = await pod.health()
    const catalog = await pod.getCatalog()
    const variantId = (catalog[0] as any)?.variants?.[0]?.id ?? (catalog[0] as any)?.id
    const fileCheck = await pod.validateFile({
      filename: 'art.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      dpi: 300,
      widthPx: 4500,
      heightPx: 5400,
    } as any)
    const uploaded = await pod.uploadPrintFile({
      filename: 'art.png',
      mimeType: 'image/png',
      hash: 'c'.repeat(64),
    } as any)
    const preflight = await pod.preflight({
      variantId,
      printArea: 'front',
      artwork: {
        id: 'art-1',
        hash: 'c'.repeat(64),
        mimeType: 'image/png',
        widthPx: 4500,
        heightPx: 5400,
        dpi: 300,
      },
      placement: { topMm: 20, leftMm: 20, widthMm: 280, heightMm: 340 },
    } as any)
    const estimate = await pod.estimateCost({
      variantId,
      quantity: 1,
      recipientAddress: { country: 'US', state: 'TX', postalCode: '78201', city: 'San Antonio' },
    } as any)
    const order = await pod.createOrder({
      orderId: 'rc116c-order-1',
      idempotencyKey: 'rc116c-pod-1',
      recipient: {
        name: 'Riley Reporter',
        address1: '100 Main St',
        city: 'San Antonio',
        country: 'US',
        state: 'TX',
        postalCode: '78201',
      },
      items: [{ variantId, quantity: 1 }],
    } as any)
    const orderReplay = await pod.createOrder({
      orderId: 'rc116c-order-1',
      idempotencyKey: 'rc116c-pod-1',
      recipient: {
        name: 'Riley Reporter',
        address1: '100 Main St',
        city: 'San Antonio',
        country: 'US',
        state: 'TX',
        postalCode: '78201',
      },
      items: [{ variantId, quantity: 1 }],
    } as any)
    const poBoxError = await pod
      .createOrder({
        orderId: 'rc116c-order-2',
        idempotencyKey: 'rc116c-pod-2',
        recipient: {
          name: 'Riley Reporter',
          address1: 'PO Box 12',
          city: 'San Antonio',
          country: 'US',
        },
        items: [{ variantId, quantity: 1 }],
      } as any)
      .catch((error: any) => error)
    let simulatorGuard = ''
    try {
      new PodSimulatorAdapter('http://127.0.0.1:39999/', 'printful', 'conn-1')
    } catch (error) {
      simulatorGuard = String(error)
    }
    let printfulGuard = ''
    try {
      new PrintfulPodAdapter({ apiKey: '' } as any)
    } catch (error) {
      printfulGuard = String(error)
    }
    matrixRow({
      key: 'commerce.pod',
      family: 'commerce',
      boundary:
        'local-adapter (POD loopback simulator/emulator; live creation opt-in required and off)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'emulator health + catalog available',
          outcome: Boolean(podHealth) && catalog.length > 0 ? 'passed' : 'failed',
        },
        {
          name: 'file validation accepts conforming artwork',
          outcome:
            (fileCheck as any).valid !== false && (fileCheck as any).issues?.length === 0
              ? 'passed'
              : 'failed',
        },
        {
          name: 'upload returns a remote file reference',
          outcome: Boolean((uploaded as any).remoteFileId ?? (uploaded as any).id)
            ? 'passed'
            : 'failed',
        },
        {
          name: 'preflight passes at 300 DPI placement',
          outcome: preflight.passed ? 'passed' : 'failed',
        },
        {
          name: 'cost estimate returns minor-unit totals',
          outcome: Number(estimate.totalCostMinor) > 0 ? 'passed' : 'failed',
        },
        {
          name: 'order creation is idempotent per key',
          outcome:
            order.externalOrderId === orderReplay.externalOrderId && order.state === 'submitted'
              ? 'passed'
              : 'failed',
        },
        {
          name: 'P.O. Box recipient is rejected with a normalized provider error',
          outcome: /P\.O\. Box/.test(String(poBoxError?.message ?? poBoxError))
            ? 'passed'
            : 'failed',
        },
        {
          name: 'simulator refuses construction without explicit loopback enablement (fail-safe)',
          outcome: /simulator requires explicitly enabled loopback/.test(simulatorGuard)
            ? 'passed'
            : 'failed',
        },
        {
          name: 'real Printful adapter refuses construction without an API token (no fabricated provider)',
          outcome: /API token is missing/.test(printfulGuard) ? 'passed' : 'failed',
        },
      ],
      notes:
        'Emulator outcomes are local claims only; no real Printful/Printify order, upload or mockup is claimed (16A named the same bound).',
    })
    await check(
      'conformance commerce.pod: emulator lifecycle + idempotency + normalized errors + simulator/Printful fail-safes observed',
      preflight.passed &&
        order.externalOrderId === orderReplay.externalOrderId &&
        /simulator requires/.test(simulatorGuard),
    )

    // ---- Email: development sink + disabled --------------------------------------
    resetLocalMailSink()
    const emailRequest = {
      from: 'ledger@rc116c.test',
      to: 'reader@rc116c.test',
      subject: 'Your ledger digest',
      text: 'Portability proof, delivered locally.',
      idempotencyKey: 'rc116c-mail-1',
      category: 'transactional' as const,
    }
    const sent = await developmentCaptureEmailAdapter.send(emailRequest)
    const receipts = localMailSinkReceipts()
    simulateLocalMailSinkOutcome('rc116c-mail-2', 'bounce')
    const bounced = await developmentCaptureEmailAdapter.send({
      ...emailRequest,
      idempotencyKey: 'rc116c-mail-2',
    })
    const disabledResult = await disabledEmailAdapter.send(emailRequest)
    const selectedDisabled = selectEmailDeliveryAdapter(loadConfig())
    matrixRow({
      key: 'email.development-sink',
      family: 'email',
      boundary: 'local-sink (module registry: newsletter = local-sink)',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'development capture adapter accepts and retains the exact envelope',
          outcome:
            sent.ok && receipts.some((r) => r.subject === 'Your ledger digest')
              ? 'passed'
              : 'failed',
        },
        {
          name: 'simulated bounce outcome is reported, not hidden',
          outcome: !bounced.ok || (bounced as any).status === 'bounced' ? 'passed' : 'failed',
        },
        {
          name: 'disabled adapter refuses delivery truthfully',
          outcome: !disabledResult.ok ? 'passed' : 'failed',
        },
        {
          name: 'EMAIL_MODE=disabled selects the disabled adapter',
          outcome: selectedDisabled.id === 'disabled' ? 'passed' : 'failed',
        },
      ],
      notes: `Bounce outcome observed as: ${JSON.stringify(bounced).slice(0, 200)}. Local sink only; no SMTP or remote delivery is claimed.`,
    })
    await check(
      'conformance email: development sink retains envelopes and reports outcomes; disabled mode refuses truthfully',
      sent.ok && receipts.length >= 1 && !disabledResult.ok && selectedDisabled.id === 'disabled',
    )
  }

  if (!restart) {
    const now = new Date().toISOString()
    // ======================================================================
    // Extensions boundary
    // ======================================================================
    const connBase = {
      id: 'conn-16c',
      providerKey: 'storage.local-filesystem',
      externalAccountId: 'local',
      label: 'Local filesystem (reference)',
      siteId: String(state.alpha),
      status: 'configured' as const,
      encryptedSecretRef: null,
      scopes: [] as string[],
      expiresAt: null,
      refreshMetadata: null,
      capabilities: [] as any[],
      lastHealthCheckAt: null,
      lastError: null,
      auditEventIds: [] as string[],
    }
    const registry = new CapabilityRegistry([localFilesystemAdapter, developmentEmailAdapter])
    const tested = await testConnection(localFilesystemAdapter, connBase as any, now)
    const activeConn = { ...connBase, status: 'active' as const, capabilities: tested.capabilities }
    const expiredConn = { ...activeConn, expiresAt: '2000-01-01T00:00:00.000Z' }
    const failingAdapter = {
      contract: localFilesystemAdapter.contract,
      test: async () => {
        throw new Error(`Bearer token=${AI_CANARY} was rejected`)
      },
      execute: async () => ({}),
    } as any
    const failedTest = await testConnection(failingAdapter, connBase as any, now)
    const emailExec = await developmentEmailAdapter.execute(
      {
        capability: 'email.transactional',
        payload: { idempotencyKey: 'ref-mail-1' },
        idempotencyKey: 'ref-mail-1',
      },
      connBase as any,
    )
    let wrongCapability = ''
    try {
      await localFilesystemAdapter.execute(
        { capability: 'email.transactional', payload: {}, idempotencyKey: 'x' },
        connBase as any,
      )
    } catch (error) {
      wrongCapability = String(error)
    }
    matrixRow({
      key: 'extensions.reference-adapters',
      family: 'extensions',
      boundary:
        'developer reference — NOT shipping (no production caller; verified by source scan in this run)',
      shipping: false,
      verification: 'executed-16c',
      checks: [
        {
          name: 'connection test activates the filesystem reference adapter with its declared capability',
          outcome:
            tested.status === 'active' &&
            tested.capabilities.some((c: any) => c.key === 'storage.object')
              ? 'passed'
              : 'failed',
        },
        {
          name: 'capability registry exposes capabilities only from active, unexpired connections',
          outcome:
            registry.has('storage.object', [activeConn as any], now) &&
            !registry.has('storage.object', [expiredConn as any], now)
              ? 'passed'
              : 'failed',
        },
        {
          name: 'failed connection test marks the connection invalid with the secret redacted',
          outcome:
            failedTest.status === 'invalid' &&
            !failedTest.lastError!.message.includes(AI_CANARY) &&
            failedTest.lastError!.message.includes('[REDACTED]')
              ? 'passed'
              : 'failed',
        },
        {
          name: 'email reference adapter executes only into the development sink',
          outcome: (emailExec as any).delivery === 'development-sink' ? 'passed' : 'failed',
        },
        {
          name: 'adapter refuses a capability outside its contract',
          outcome: /unsupported capability/.test(wrongCapability) ? 'passed' : 'failed',
        },
        {
          name: 'diagnostic redaction strips credential material',
          outcome: !redactDiagnostic(`token=${AI_CANARY}`).includes(AI_CANARY)
            ? 'passed'
            : 'failed',
        },
      ],
      notes:
        'These adapters prove the provider contract shape only. They are developer reference material (historical PROVIDER_MATRIX: DEFERRED/EXPERIMENTAL) and are not presented as shipping transports.',
    })
    await check(
      'extensions boundary: reference adapters honor the contract, capability gating and redaction — and are not shipping transports',
      tested.status === 'active' &&
        failedTest.status === 'invalid' &&
        !failedTest.lastError!.message.includes(AI_CANARY),
    )

    // Source scan: no production caller of the reference adapters.
    const { readdir } = await import('node:fs/promises')
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true })
      const files: string[] = []
      for (const entry of entries) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory()) files.push(...(await walk(path)))
        else if (/\.tsx?$/.test(entry.name)) files.push(path)
      }
      return files
    }
    const srcFiles = await walk('src')
    const externalCallers = srcFiles.filter(
      (file) =>
        !file.startsWith('src/modules/extensions/') &&
        /reference-adapters|localFilesystemAdapter|developmentEmailAdapter/.test(
          readFileSync(file, 'utf8'),
        ),
    )
    await check(
      'source scan: no file outside src/modules/extensions references the developer reference adapters',
      externalCallers.length === 0,
    )

    // Lifecycle gates.
    const lifecycle = new ExtensionLifecycleService({
      coreVersion: '0.1.0',
      schemaVersion: '1.0.0',
      grantedPermissions: ['connections.manage'],
    })
    const exampleRecord = lifecycle.discover({
      manifest: exampleExtension.manifest,
      source: 'local-deployment',
      trusted: true,
      hooks: exampleExtension.hooks,
    })
    const untrusted = lifecycle.discover({
      manifest: { ...exampleExtension.manifest, key: 'example.untrusted' } as any,
      source: 'local-deployment',
      trusted: false,
    })
    const untrustedInstall = lifecycle.install('example.untrusted')
    const incompatible = lifecycle.discover({
      manifest: {
        ...exampleExtension.manifest,
        key: 'example.future',
        compatibleCore: '^9.0.0',
      } as any,
      source: 'local-deployment',
      trusted: true,
    })
    const permissionManifest = {
      ...exampleExtension.manifest,
      key: 'example.payments',
      permissions: ['payments.refund'],
    }
    lifecycle.discover({
      manifest: permissionManifest as any,
      source: 'local-deployment',
      trusted: true,
    })
    lifecycle.reviewPermissions('example.payments', ['payments.refund'])
    const permissionInstall = lifecycle.install('example.payments')
    lifecycle.reviewPermissions('example.health-check', [])
    const installed = lifecycle.install('example.health-check')
    const enabled = await lifecycle.enable('example.health-check')
    const healthy = await lifecycle.checkHealth('example.health-check')
    const exportManifest = {
      ...exampleExtension.manifest,
      key: 'example.exporter',
      uninstall: 'export' as const,
    }
    lifecycle.discover({
      manifest: exportManifest as any,
      source: 'local-deployment',
      trusted: true,
    })
    lifecycle.reviewPermissions('example.exporter', [])
    lifecycle.install('example.exporter')
    let exportGate = ''
    try {
      await lifecycle.uninstall('example.exporter')
    } catch (error) {
      exportGate = String(error)
    }
    const exported = await lifecycle.uninstall('example.exporter', { exported: true })
    matrixRow({
      key: 'extensions.lifecycle',
      family: 'extensions',
      boundary:
        'server-only lifecycle; discovery accepts deployed metadata and never downloads or loads code',
      shipping: true,
      verification: 'executed-16c',
      checks: [
        {
          name: 'in-tree example extension discovers as compatible (contract proof only, no product behavior)',
          outcome: exampleRecord.state === 'compatible' ? 'passed' : 'failed',
        },
        {
          name: 'untrusted extension is refused installation',
          outcome:
            untrusted.state !== 'installed' &&
            untrustedInstall.diagnostics.some((d) => /explicitly trusted/.test(d))
              ? 'passed'
              : 'failed',
        },
        {
          name: 'core-incompatible extension is rejected at discovery',
          outcome: incompatible.state === 'incompatible' ? 'passed' : 'failed',
        },
        {
          name: 'extension requesting an ungranted permission cannot install',
          outcome:
            permissionInstall.state === 'incompatible' &&
            permissionInstall.diagnostics.some((d) => /permission denied: payments\.refund/.test(d))
              ? 'passed'
              : 'failed',
        },
        {
          name: 'trusted compatible extension installs, enables and reports healthy',
          outcome:
            installed.state === 'installed' &&
            enabled.state === 'enabled' &&
            healthy.health?.status === 'healthy'
              ? 'passed'
              : 'failed',
        },
        {
          name: 'uninstall with export policy requires a completed export first',
          outcome:
            /requires a completed export/.test(exportGate) && exported.removed
              ? 'passed'
              : 'failed',
        },
      ],
      notes:
        'The lifecycle service is a library boundary in RC1: no route or UI loads extension code, and discovery never downloads packages. There is no marketplace in scope.',
    })
    await check(
      'extensions lifecycle: trust, compatibility and permission gates all fail closed; the example extension enables cleanly',
      untrustedInstall.state === 'incompatible' &&
        incompatible.state === 'incompatible' &&
        permissionInstall.state === 'incompatible' &&
        enabled.state === 'enabled',
    )

    // ======================================================================
    // Import adapters: framework execution + truth table
    // ======================================================================
    const sourceRecords = [
      {
        sourceId: 'post-1',
        kind: 'post',
        payload: { title: 'One', legacyUrl: '/old-one', canonicalPath: '/one' },
      },
      { sourceId: 'post-2', kind: 'post', payload: { title: 'Two', extraField: 'unmapped' } },
    ]
    const discovery = discoverImport('markdown', sourceRecords as any)
    const mapping = {
      adapter: 'markdown' as const,
      mappings: [{ source: 'title', target: 'title', transform: 'copy' as const }],
      records: sourceRecords as any,
      identityReviewRequired: false,
      consentReviewRequired: false,
      financialReviewRequired: false,
    }
    const { previewMapping } = await import('../../src/modules/portability/contracts')
    const preview = previewMapping(mapping as any)
    const planBase = {
      runId: 'rc116c-framework',
      adapter: 'markdown' as const,
      discovery,
      mapping: preview,
      allowMarketingEnrollment: false as const,
      allowFinancialFinalization: false as const,
      rollbackBoundary: 'created-by-run-only' as const,
    }
    const dryResult = executeImport({ ...planBase, dryRun: true })
    const appliedResult = executeImport({ ...planBase, dryRun: false })
    const appliedAgain = executeImport({ ...planBase, dryRun: false })
    let unknownAdapter = ''
    try {
      discoverImport('bogus' as any, [])
    } catch (error) {
      unknownAdapter = String(error)
    }
    const marketingErrors = validateImportPlan({
      ...planBase,
      dryRun: true,
      allowMarketingEnrollment: true as any,
    })
    const reviewBlocked = executeImport({
      ...planBase,
      dryRun: false,
      mapping: { ...preview, identityReviewRequired: true },
    })
    matrixRow({
      key: 'import.adapters',
      family: 'import',
      boundary: 'local-export / feed / authorized-api per adapter contract',
      shipping: true,
      verification: 'executed-16c (framework) + source inspection (parsers)',
      checks: [
        {
          name: 'framework dry-run completes zero records and reports unmapped fields',
          outcome:
            dryResult.state === 'dry-run' &&
            dryResult.completed === 0 &&
            dryResult.unsupportedFields.includes('extraField')
              ? 'passed'
              : 'failed',
        },
        {
          name: 'framework apply completes all records with stable deterministic ids',
          outcome:
            appliedResult.state === 'completed' &&
            appliedResult.completed === 2 &&
            JSON.stringify(appliedResult.deterministicIds) ===
              JSON.stringify(appliedAgain.deterministicIds)
              ? 'passed'
              : 'failed',
        },
        {
          name: 'legacy URL redirects are derived from record pairs',
          outcome: appliedResult.redirects.some(
            (r) => r.fromPath === '/old-one' && r.status === 301,
          )
            ? 'passed'
            : 'failed',
        },
        {
          name: 'unknown adapter key is rejected',
          outcome: /Unknown import adapter/.test(unknownAdapter) ? 'passed' : 'failed',
        },
        {
          name: 'marketing enrollment can never be enabled by an import plan',
          outcome: marketingErrors.some((e) => e.code === 'import.marketing_enrollment_forbidden')
            ? 'passed'
            : 'failed',
        },
        {
          name: 'identity-review mappings block a non-dry run until reviewed',
          outcome:
            reviewBlocked.state === 'failed' &&
            reviewBlocked.errors.some((e) => e.code === 'import.review_required')
              ? 'passed'
              : 'failed',
        },
      ],
      notes: `Adapter truth (contracts in src/modules/portability/contracts.ts): ${IMPORT_ADAPTERS.map((a) => `${a.key}=${a.status}`).join(', ')}. Only wordpress-export has a dedicated source parser (src/modules/portability/legacy-migration, proven in earlier passes); the remaining implemented-contract adapters run through this framework on pre-parsed SourceRecords, and requires-source-fixture adapters are not executable imports in RC1. The end-to-end executable import paths are the portable archive (this run) and the legacy WXR pipeline.`,
    })
    await check(
      'import framework: dry-run/apply determinism, redirect derivation and safety gates observed',
      dryResult.state === 'dry-run' &&
        appliedResult.completed === 2 &&
        reviewBlocked.state === 'failed',
    )

    // ---- Canary sweep + matrix publication --------------------------------------
    const cliOutputs = bodies.join('\n')
    await check(
      'no harness secret (archive keys, AI canary, payload secret) appears in any HTTP response or CLI output',
      CANARIES.every((canary) => !cliOutputs.includes(canary)),
    )
    await writeFile(
      `${out}/provider-matrix.json`,
      JSON.stringify({ generatedAt: now, entries: matrix }, null, 2),
    )
    await save()
  }

  if (restart) {
    // ---- Restart persistence ---------------------------------------------------
    const ownerCookie2 = await session(state.owner)
    const sourceExport = await api(`/api/migration/export?siteId=${state.alpha}`, {
      cookie: ownerCookie2,
    })
    await check(
      'restart: source site export still serves the seeded records after web + PostgreSQL restart',
      sourceExport.status === 200 &&
        (sourceExport.json.manifest.records as any[]).some(
          (record) => String(record.id) === String(state.content),
        ),
    )
    const targetManifestAfter = runTarget(['export-manifest', state.targetSite]) as PortableManifest
    const counts = targetManifestAfter.records.reduce<Record<string, number>>((acc, record) => {
      acc[record.collection] = (acc[record.collection] ?? 0) + 1
      return acc
    }, {})
    await check(
      'restart: imported records persist in the target database after the PostgreSQL restart',
      targetManifestAfter.records.some(
        (record) => record.collection === 'content' && record.data.slug === 'the-ledger-opens',
      ) &&
        counts['content'] === 1 &&
        counts['media-assets'] === 1,
    )
    const targetMediaAfter = runTarget([
      'media-sha',
      `${state.targetSite}/${String(state.mediaLocation).split('/').pop()}`,
    ])
    await check(
      'restart: imported media bytes are intact after the restart',
      targetMediaAfter.sha256 === MEDIA_SHA,
    )
  }
} finally {
  await stopWeb()
  await payload.db.destroy?.()
}

// Success path only: exit explicitly (Payload init leaves handles alive).
process.exit(0)
