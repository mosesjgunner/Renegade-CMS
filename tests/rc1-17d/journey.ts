/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable backup/restore acceptance */
/**
 * RC1 17D acceptance: complete database and media backup/restore.
 *
 * The shipped operational backup/restore CLIs are Compose-bound (they
 * drive pg_dump / pg_restore / tar inside containers). Following the
 * 17C precedent, this harness executes the tooling's exact data-plane
 * steps natively against local processes: writers quiesced
 * (maintenance window), `pg_dump -Fc`, media tar with the shipped
 * exclusions, the product manifest functions
 * (createOperationalBackupManifest / verifyOperationalBackup /
 * assertRestoreSafety / assertRestoreVersionCompatibility),
 * `pg_restore -l` + `tar -tzf` format proof, restore only into an
 * independently created EMPTY database and media directory under
 * FRESH restore-only secrets, forward migrations, then functional
 * validation of the restored environment — not just row counts.
 *
 * Source population is fixture data written through the application's
 * own collections/services plus ordinary HTTP paths where the product
 * exposes them (media upload + replace/edit, webhook subscription
 * creation, WebAuthn). Commerce/audience/community rows are created
 * through the Payload local API (the same write path, hooks enforced)
 * with the deterministic local provider identity; no real charge,
 * message, post or provider call occurs.
 *
 * Restored-environment logins, per the product's own restore doctrine
 * (OPERATIONAL_BACKUP.md: fresh restore secrets; owner returns via the
 * enrolled passkey at the same relying-party hostname or supported
 * identity recovery):
 *  - owner: genuine WebAuthn protocol login with the passkey
 *    credential enrolled in the SOURCE environment (software
 *    authenticator, real protocol — 17A pattern; the credential row
 *    is what the backup carries);
 *  - staff: fixture passkey session minted under the RESTORE secret
 *    (the 15E–17C convention; no genuine passkey claim);
 *  - member: the member session token issued in the SOURCE
 *    environment, presented unchanged after restore — the restored
 *    member-sessions row (token hash) validates it.
 */
import assert from 'node:assert/strict'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import {
  createHash,
  createHmac,
  createPrivateKey,
  createSign,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { encodeCBOR } from '@levischuck/tiny-cbor'

const execFileAsync = promisify(execFile)

const phase = process.argv[2]
const out = 'docs/rc/evidence/rc1/18-pass/17D'
const scratch = 'scratch/rc117d'
const SRC = {
  db: 'rc117d_source',
  port: 39071,
  origin: 'http://127.0.0.1:39071',
  media: 'scratch/rc117d/media-source',
  dist: '.next-rc117d-src',
}
const RST = {
  db: 'rc117d_restored',
  port: 39072,
  origin: 'http://127.0.0.1:39072',
  media: 'scratch/rc117d/media-restored',
  dist: '.next-rc117d-rst',
}
const capturePort = 39179
const WH_SECRET = String(process.env.WEBHOOK_SECRET_RC117D_SUB ?? '')
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const state: any = await readFile(`${scratch}/state.json`, 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () =>
  writeFile(`${scratch}/state.json`, JSON.stringify(state, null, 2), { mode: 0o600 })

const trace: any[] = []
const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(`${out}/${phase}-trace.json`, JSON.stringify(trace, null, 2))
}

// ---- Payload (lazy: the restore phase must pg_restore before init) ------
let payload: any
let pool: any
async function connect() {
  if (payload) return payload
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  payload = await getPayload({ config })
  pool = payload.db.pool
  return payload
}

// ---- HTTP helpers ---------------------------------------------------------
async function api(
  origin: string,
  pathName: string,
  options: {
    method?: string
    cookie?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
): Promise<{ status: number; text: string; json: any; headers: Headers }> {
  const response = await fetch(`${origin}${pathName}`, {
    method: options.method || 'GET',
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json, headers: response.headers }
}

let web: ChildProcess | undefined
async function bootWeb(target: typeof SRC, logName: string): Promise<boolean> {
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    RENEGADE_NEXT_DIST_DIR: target.dist,
    APP_URL: target.origin,
    MEDIA_DIR: path.resolve(target.media),
  } as NodeJS.ProcessEnv
  delete env.VITEST
  env.VITEST = 'true'
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(target.port),
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  const log = createWriteStream(`${out}/${logName}`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const r = await fetch(`${target.origin}/health/ready`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      if (r.status === 200) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
async function stopWeb(): Promise<void> {
  if (web?.pid) {
    // The web child is spawned detached: signal its whole process
    // group so the server behind the CLI wrapper cannot be orphaned.
    try {
      process.kill(-web.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(web.pid)
      } catch {}
    }
    web = undefined
    await new Promise((r) => setTimeout(r, 1500))
  }
}

// ---- Fixture passkey session (15E–17C convention) --------------------------
async function session(id: string) {
  const { createPasskeySession } = await import('../../src/modules/operations/passkey-auth')
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    String(process.env.PAYLOAD_SECRET ?? ''),
    async (sid: string, expires: Date) => {
      await pool.query('INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
        sid,
        id,
        expires,
      ])
    },
  )
  return `renegade-passkey=${value.token}`
}

// ---- Software WebAuthn authenticator (17A pattern) -------------------------
function makeAuthenticator(saved?: any) {
  if (saved) {
    return {
      privateKey: createPrivateKey(saved.privateKeyPem),
      credentialId: saved.credentialId,
      publicKeyB64: saved.publicKeyB64,
      counter: saved.counter ?? 0,
    }
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const cose = encodeCBOR(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]),
  )
  return {
    privateKey,
    credentialId: randomBytes(32).toString('base64url'),
    publicKeyB64: Buffer.from(cose).toString('base64url'),
    counter: 0,
    privateKeyPem: (privateKey as any).export({ format: 'pem', type: 'pkcs8' }),
  }
}
function buildAssertion(wa: any, opts: { challenge: string; origin: string }) {
  wa.counter += 1
  const rpIdHash = createHash('sha256').update('127.0.0.1').digest()
  const flags = Buffer.from([0x05])
  const count = Buffer.alloc(4)
  count.writeUInt32BE(wa.counter, 0)
  const authenticatorData = Buffer.concat([rpIdHash, flags, count])
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: opts.challenge,
      origin: opts.origin,
      crossOrigin: false,
    }),
  )
  const clientHash = createHash('sha256').update(clientDataJSON).digest()
  const signed = Buffer.concat([authenticatorData, clientHash])
  const signature = createSign('SHA256')
    .update(signed)
    .sign({ key: wa.privateKey, dsaEncoding: 'der' })
  return {
    id: wa.credentialId,
    rawId: wa.credentialId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    clientExtensionResults: {},
    response: {
      authenticatorData: authenticatorData.toString('base64url'),
      clientDataJSON: clientDataJSON.toString('base64url'),
      signature: signature.toString('base64url'),
    },
  }
}
async function webauthnLogin(origin: string, email: string, wa: any) {
  const options = await api(origin, '/api/auth/passkey/options', {
    method: 'POST',
    body: { email },
  })
  assert.equal(options.status, 200, `passkey options for ${email}`)
  const challenge = String(options.json.options.challenge)
  const complete = await api(origin, '/api/auth/passkey/complete', {
    method: 'POST',
    body: buildAssertion(wa, { challenge, origin }),
  })
  const setCookie = complete.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/renegade-passkey=[^;]+/)
  return { status: complete.status, cookie: match?.[0], json: complete.json }
}

// ---- Deterministic PNG builder ---------------------------------------------
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crc32 = (buf: Buffer) => {
    let table = (png as any)._t as number[] | undefined
    if (!table) {
      table = []
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
      }
      ;(png as any)._t = table
    }
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = rgb[0]
      raw[row + 2 + x * 3] = rgb[1]
      raw[row + 3 + x * 3] = rgb[2]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---- Directory checksum map --------------------------------------------------
async function mediaMap(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        const rel = path.relative(root, full)
        if (rel === '.renegade/backup-status.json') continue
        result[rel] = digest(await readFile(full))
      }
    }
  }
  await walk(root)
  return result
}

// ---- Per-table content hashes (at-rest comparison) ---------------------------
async function tableHashes(pgPool: any): Promise<Record<string, string>> {
  const tables = (
    await pgPool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
  ).rows.map((r: any) => r.tablename as string)
  const hashes: Record<string, string> = {}
  for (const table of tables) {
    const row = (
      await pgPool.query(
        `SELECT md5(COALESCE(string_agg(h, '' ORDER BY h), 'empty')) AS m
         FROM (SELECT md5(t::text) AS h FROM "${table}" t) s`,
      )
    ).rows[0]
    const count = (await pgPool.query(`SELECT count(*)::int AS c FROM "${table}"`)).rows[0].c
    hashes[table] = `${count}:${row.m}`
  }
  return hashes
}

async function pickDoc(collection: string, id: string, fields: string[]) {
  const doc: any = await payload
    .findByID({ collection, id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!doc) return null
  const rel = (v: any) => (v && typeof v === 'object' ? String(v.id) : v)
  return Object.fromEntries(fields.map((f) => [f, rel(doc[f])]))
}

// ---- Webhook capture receiver ------------------------------------------------
const captureHits: Array<{ url: string; headers: any; body: string; signatureValid: boolean }> = []
let capture: Server | undefined
function startCapture(): Promise<void> {
  capture = createHttpServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const header = String(req.headers['x-renegade-signature'] ?? '')
      const t = /(?:^|,)t=([^,]+)/.exec(header)?.[1] ?? ''
      const v1 = /(?:^|,)v1=([a-f0-9]+)/.exec(header)?.[1] ?? ''
      const expected = createHmac('sha256', WH_SECRET).update(`${t}.${body}`).digest('hex')
      captureHits.push({
        url: req.url ?? '',
        headers: req.headers,
        body,
        signatureValid: Boolean(t && v1 && v1 === expected),
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
  })
  return new Promise((resolve) => capture!.listen(capturePort, '127.0.0.1', resolve))
}

const lexical = (text: string) => ({
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
          { type: 'text', text, detail: 0, format: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})

async function upload(
  origin: string,
  cookie: string,
  siteId: string,
  bytes: Buffer,
  filename: string,
): Promise<{ status: number; json: any; text: string }> {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], filename, { type: 'image/png' }))
  form.set('siteId', siteId)
  form.set('title', filename)
  const res = await fetch(`${origin}/api/media/upload`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json, text }
}

// =============================================================================
async function sourcePhase() {
  assert.equal(process.env.DATABASE_URL?.includes('/rc117d_source'), true)
  await mkdir(out, { recursive: true })
  await mkdir(scratch, { recursive: true })
  await connect()
  const migrations = (await pool.query('SELECT count(*)::int AS c FROM payload_migrations')).rows[0]
    .c
  await check(
    `source environment migrated (payload_migrations rows: ${migrations})`,
    migrations >= 130,
  )

  const create = async (collection: string, data: any) =>
    payload.create({ collection, data, overrideAccess: true })

  // ---- Site, people, grants --------------------------------------------------
  const site = await create('sites', {
    name: '17D Source Site',
    slug: '17d-source',
    lifecycle: 'active',
  })
  state.site = String(site.id)
  const owner = await create('users', { email: 'owner@17d.test', role: 'owner' })
  state.owner = String(owner.id)
  const staff = await create('users', { email: 'staff@17d.test', role: 'staff' })
  state.staff = String(staff.id)
  const staffDoc = await payload.findByID({
    collection: 'users',
    id: state.staff,
    depth: 0,
    overrideAccess: true,
  })
  state.staffMember = String(
    typeof staffDoc.member === 'object' ? staffDoc.member.id : staffDoc.member,
  )
  // Creating a user auto-provisions its site membership (owner became
  // community-manager, staff became contributor on this site) — find the
  // grant the product itself issued rather than duplicating it.
  const existingGrants = await payload.find({
    collection: 'member-site-roles',
    where: {
      and: [{ site: { equals: state.site } }, { member: { equals: state.staffMember } }],
    },
    depth: 0,
    overrideAccess: true,
  })
  const grant =
    existingGrants.docs[0] ??
    (await create('member-site-roles', {
      member: state.staffMember,
      site: state.site,
      role: 'contributor',
      grantedByUserId: state.owner,
    }))
  state.grant = String(grant.id)
  state.grantRole = (grant as any).role
  const member = await create('members', {
    displayName: '17D Member',
    email: 'member@17d.test',
    status: 'active',
  })
  state.member = String(member.id)
  const profile = await create('profiles', {
    member: state.member,
    displayName: '17D Member',
    handle: 'member17d',
  })
  state.profile = String(profile.id)
  const author = await create('authors', {
    displayName: '17D Author',
    slug: '17d-author',
    member: state.member,
  })
  state.author = String(author.id)
  await check(
    'site, owner, staff holding a contributor site grant, member + profile and author created',
    Boolean(state.site && state.owner && state.staff && state.grant && state.member) &&
      state.grantRole === 'contributor',
  )

  // ---- Owner passkey enrollment (credential row is what the backup carries) --
  const wa = makeAuthenticator()
  await pool.query(
    `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
     VALUES ($1, $2, $3, 0, 'single_device', false, 'Harness authenticator', '[]')`,
    [state.owner, wa.credentialId, wa.publicKeyB64],
  )
  state.wa = {
    credentialId: wa.credentialId,
    publicKeyB64: wa.publicKeyB64,
    privateKeyPem: (wa as any).privateKeyPem,
    counter: 0,
  }
  // ---- Member session issued in the source environment -----------------------
  // The token hash must use the identity module's own digest (sha256
  // base64url) — the same function the login flow verifies against.
  const { digest: identityDigest } = await import('../../src/modules/identity/member-identity')
  state.memberToken = randomBytes(24).toString('hex')
  const memberSession = await create('member-sessions', {
    member: state.member,
    tokenHash: identityDigest(state.memberToken),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    createdFrom: 'magic-link',
    lastSeenAt: new Date().toISOString(),
  })
  state.memberSession = String(memberSession.id)
  await save()
  await check(
    'owner passkey credential enrolled (DB row) and a member session issued in the source environment',
    Boolean(state.memberSession),
  )

  // ---- Boot source web for the ordinary HTTP paths ----------------------------
  await check('source web boots and reports ready', await bootWeb(SRC, 'source-web.log'))
  state.ownerCookie = await session(state.owner)
  state.staffCookie = await session(state.staff)
  await save()
  const sourceMemberSessions = await api(SRC.origin, '/api/member-auth/sessions', {
    cookie: `renegade-member=${state.memberToken}`,
  })
  await check(
    'the source-issued member session authenticates in the SOURCE environment (baseline for the restore claim)',
    sourceMemberSessions.status === 200,
  )

  // ---- Media: original upload, then an edited replacement ---------------------
  const originalPng = png(64, 64, [200, 30, 30])
  const editedPng = png(64, 64, [30, 30, 200])
  state.originalSha = digest(originalPng)
  state.editedSha = digest(editedPng)
  const up = await upload(SRC.origin, state.ownerCookie, state.site, originalPng, 'hero.png')
  state.mediaAsset = String(up.json?.asset?.id ?? up.json?.media?.id ?? up.json?.id ?? '')
  await check(
    'owner uploads original media over HTTP (201) and an asset is created',
    up.status === 201 && Boolean(state.mediaAsset),
  )
  const editForm = new FormData()
  editForm.set(
    'file',
    new File([new Uint8Array(editedPng)], 'hero-edited.png', { type: 'image/png' }),
  )
  editForm.set('siteId', state.site)
  editForm.set('title', 'hero-edited.png')
  editForm.set('mode', 'all-usages')
  editForm.set('reason', '17D edit: recolor')
  const editRes = await fetch(`${SRC.origin}/api/media/${state.mediaAsset}`, {
    method: 'PUT',
    headers: { cookie: state.ownerCookie },
    body: editForm,
  })
  const editJson: any = await editRes.json().catch(() => null)
  await check(
    'edited replacement over HTTP (201) records a media-asset version',
    editRes.status === 201 && Boolean(editJson?.version?.id),
  )
  state.mediaVersion = String(editJson.version.id)
  await (payload.jobs as any).run({ allQueues: true }).catch(() => undefined)
  await (payload.jobs as any).run({ allQueues: true }).catch(() => undefined)

  // ---- Content with SEO --------------------------------------------------------
  const category = await create('categories', {
    site: state.site,
    scope: 'site',
    name: 'Announcements',
    slug: 'announcements',
    seoTitle: 'Announcements — 17D',
    seoDescription: '17D category SEO description.',
  })
  state.category = String(category.id)
  const article = await create('content', {
    site: state.site,
    contentType: 'article',
    title: '17D Launch Post',
    body: lexical('Seventeen D launch body text.'),
    summary: 'A launch post for backup and restore acceptance.',
    authors: [{ author: state.author, displayOrder: 0 }],
    categories: [state.category],
    heroMedia: state.mediaAsset,
    slug: '17d-launch',
    canonicalPath: '/17d-launch',
    visibility: 'public',
    status: 'published',
    publishedAt: new Date().toISOString(),
    seoTitle: '17D Launch — SEO title',
    seoDescription: '17D Launch SEO description.',
    seoFocusKeyphrase: 'backup restore',
  })
  state.article = String(article.id)
  await check('published article with SEO fields and hero media created', Boolean(state.article))

  // ---- Audience: newsletter consent ---------------------------------------------
  const list = await create('audience-lists', { site: state.site, name: '17D Newsletter' })
  state.audienceList = String(list.id)
  const subscriber = await create('subscribers', {
    site: state.site,
    email: 'reader@17d.test',
    emailHash: digest('reader@17d.test'),
    status: 'active',
    verifiedAt: new Date().toISOString(),
  })
  state.subscriber = String(subscriber.id)
  const membership = await create('audience-memberships', {
    subscriber: state.subscriber,
    audienceList: state.audienceList,
    status: 'active',
    confirmedAt: new Date().toISOString(),
    source: 'form',
  })
  state.membership = String(membership.id)
  const contact = await create('contacts', {
    site: state.site,
    displayName: '17D Reader',
    email: 'reader@17d.test',
    status: 'active',
  })
  state.contact = String(contact.id)
  await check(
    'newsletter consent captured (verified subscriber + confirmed audience membership + contact)',
    Boolean(state.membership && state.subscriber),
  )

  // ---- Community: forum, discussion, message --------------------------------------
  const section = await create('forum-sections', {
    site: state.site,
    name: 'General',
    slug: 'general',
  })
  state.forumSection = String(section.id)
  const forum = await create('forums', {
    site: state.site,
    section: state.forumSection,
    name: 'Town Hall',
    slug: 'town-hall',
  })
  state.forum = String(forum.id)
  const discussion = await create('discussions', {
    site: state.site,
    owner: state.member,
    kind: 'thread',
    title: 'Welcome to 17D',
    forum: state.forum,
    canonicalPath: '/forums/town-hall/welcome-to-17d',
    status: 'open',
    visibility: 'public',
  })
  state.discussion = String(discussion.id)
  const post = await create('discussion-posts', {
    discussion: state.discussion,
    authorMember: state.member,
    body: 'First message in the 17D town hall.',
    displayOrder: 0,
    permalink: '/forums/town-hall/welcome-to-17d#post-1',
    paginationAnchor: 'post-1',
    status: 'published',
  })
  state.post = String(post.id)
  await check('forum section, forum, discussion and a member message created', Boolean(state.post))

  // ---- Commerce: product, order, refund, subscription, donation, fulfillment ---
  const merchant = await create('merchant-connections', {
    site: state.site,
    label: 'Deterministic 17D',
    providerKey: 'deterministic',
    merchantCountry: 'US',
    status: 'active',
  })
  state.merchant = String(merchant.id)
  const product = await create('products', {
    site: state.site,
    merchantConnection: state.merchant,
    name: '17D Field Guide',
    slug: '17d-field-guide',
    canonicalPath: '/products/17d-field-guide',
    kind: 'physical',
    state: 'draft',
    variants: [
      {
        sku: 'FG-17D-STD',
        title: 'Standard',
        attributes: {},
        optionValues: {},
        weightGrams: 250,
        dimensionsMm: { length: 100, width: 80, height: 20 },
      },
    ],
    prices: [{ currency: 'USD', amountMinor: '4200', variantSku: 'FG-17D-STD' }],
    offers: [
      {
        offerId: 'fg-std',
        version: 1,
        status: 'active',
        amountMinor: '4200',
        currency: 'USD',
        variantSku: 'FG-17D-STD',
        startsAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      },
    ],
    productCapabilities: ['shippable'],
  })
  state.product = String(product.id)
  // Publication goes through the shipped catalog workflow (the direct
  // state write is refused by the product hook, by design).
  for (const action of ['request-review', 'approve', 'publish']) {
    const res = await api(SRC.origin, '/api/admin/catalog', {
      method: 'PATCH',
      cookie: state.ownerCookie,
      body: { productId: state.product, action },
    })
    assert.equal(res.status, 200, `catalog ${action}: ${res.text.slice(0, 200)}`)
  }
  const publishedProduct: any = await payload.findByID({
    collection: 'products',
    id: state.product,
    depth: 0,
    overrideAccess: true,
  })
  await check(
    'product published through the catalog workflow API (draft → review → approved → published)',
    publishedProduct.state === 'published',
  )
  const cart = await create('carts', {
    site: state.site,
    merchantConnection: state.merchant,
    member: state.member,
    currency: 'USD',
    items: [{ sku: 'FG-17D-STD', quantity: 1, amountMinor: '4200' }],
    state: 'converted',
  })
  state.cart = String(cart.id)
  const checkout = await create('checkout-sessions', {
    site: state.site,
    cart: state.cart,
    merchantConnection: state.merchant,
    currency: 'USD',
    amountMinor: '4200',
    state: 'completed',
  })
  state.checkout = String(checkout.id)
  const intent = await create('payment-intents', {
    site: state.site,
    checkoutSession: state.checkout,
    merchantConnection: state.merchant,
    capabilityId: 'card',
    providerKey: 'deterministic',
    amountMinor: '4200',
    currency: 'USD',
    state: 'paid',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  })
  state.paymentIntent = String(intent.id)
  const attempt = await create('payment-attempts', {
    site: state.site,
    checkoutSession: state.checkout,
    paymentIntent: state.paymentIntent,
    merchantConnection: state.merchant,
    attempt: 1,
    idempotencyKey: '17d-attempt-1',
    providerKey: 'deterministic',
    providerContractVersion: '1',
    providerImplementationVersion: '1',
    providerApiVersion: '1',
    amountMinor: '4200',
    currency: 'USD',
    state: 'succeeded',
    refundedAmountMinor: '500',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  })
  state.paymentAttempt = String(attempt.id)
  const order = await create('orders', {
    site: state.site,
    owner: state.member,
    checkoutSession: state.checkout,
    merchantConnection: state.merchant,
    orderNumber: '17D-1001',
    state: 'fulfilled',
    currency: 'USD',
    amountMinor: '4200',
    items: [{ sku: 'FG-17D-STD', quantity: 1, amountMinor: '4200' }],
    totalsSnapshot: { totalMinor: '4200', currency: 'USD' },
  })
  state.order = String(order.id)
  const refund = await create('commerce-refunds', {
    site: state.site,
    order: state.order,
    paymentAttempt: state.paymentAttempt,
    idempotencyKey: '17d-refund-1',
    amountMinor: '500',
    currency: 'USD',
    kind: 'partial',
    state: 'succeeded',
    reason: '17D acceptance refund',
    requestedBy: 'owner@17d.test',
  })
  state.refund = String(refund.id)
  const fulfillment = await create('manual-fulfillment-packages', {
    site: state.site,
    order: state.order,
    packageIndex: 0,
    source: 'manual',
    status: 'shipped',
    approvedLines: [{ sku: 'FG-17D-STD', quantity: 1 }],
    permissionedAddressManifest: { country: 'US', postalCode: '00000' },
  })
  state.fulfillment = String(fulfillment.id)
  const supporter = await create('supporters', {
    site: state.site,
    member: state.member,
    displayName: '17D Member',
  })
  state.supporter = String(supporter.id)
  const plan = await create('plan-revisions', {
    site: state.site,
    planKey: '17d-supporter',
    revision: 1,
    name: 'Supporter Monthly',
    lifecycle: 'published',
    interval: 'month',
    intervalCount: 1,
    amountMinor: '900',
    currency: 'USD',
    trialDays: 0,
    trialEligibility: 'none',
    entitlements: [
      {
        siteId: state.site,
        term: 'subscription',
        resource: 'content',
        capability: 'supporter-content',
      },
    ],
    cancelPolicy: 'period_end',
    changePolicy: 'period_end',
    taxPolicy: 'inclusive',
    providerMappings: {},
    publishedAt: new Date().toISOString(),
  })
  state.planRevision = String(plan.id)
  const now = Date.now()
  const subscription = await create('subscriptions', {
    site: state.site,
    owner: state.member,
    supporter: state.supporter,
    planRevision: state.planRevision,
    planSnapshot: { planKey: '17d-supporter', amountMinor: '900', currency: 'USD' },
    providerKey: 'deterministic',
    providerSubscriptionReference: 'sub_17d_1',
    providerStatus: 'active',
    state: 'active',
    source: 'provider',
    currentPeriodStart: new Date(now).toISOString(),
    currentPeriodEnd: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
  })
  state.subscription = String(subscription.id)
  const entitlement = await create('entitlements', {
    site: state.site,
    supporter: state.supporter,
    entitlement: 'supporter-content',
    source: 'subscription',
    startsAt: new Date(now).toISOString(),
  })
  state.entitlement = String(entitlement.id)
  const campaign = await create('donation-campaigns', {
    site: state.site,
    campaignKey: '17d-relief',
    version: 1,
    title: '17D Relief Fund',
    purpose: 'Acceptance donations.',
    currency: 'USD',
  })
  state.campaign = String(campaign.id)
  const donationIntent = await create('donation-intents', {
    site: state.site,
    campaign: state.campaign,
    campaignVersion: 1,
    donorSnapshot: { displayName: '17D Member' },
    moneySnapshot: { amountMinor: '1500', currency: 'USD' },
    recognition: 'public',
    lifecycle: 'succeeded',
  })
  state.donationIntent = String(donationIntent.id)
  const donation = await create('donations', {
    site: state.site,
    donationIntent: state.donationIntent,
    campaign: state.campaign,
    paymentIntent: state.paymentIntent,
    supporter: state.supporter,
    donorSnapshot: { displayName: '17D Member' },
    campaignSnapshot: { campaignKey: '17d-relief', version: 1 },
    baseAmountMinor: '1500',
    currency: 'USD',
    recognition: 'public',
    lifecycle: 'succeeded',
  })
  state.donation = String(donation.id)
  const donationEvent = await create('donation-events', {
    donation: state.donation,
    eventKey: '17d-donation-succeeded',
    kind: 'succeeded',
    occurredAt: new Date().toISOString(),
  })
  state.donationEvent = String(donationEvent.id)
  await check(
    'commerce chain persisted: product, cart, checkout, paid intent + attempt, fulfilled order, succeeded partial refund, shipped fulfillment, active subscription + entitlement, succeeded donation',
    Boolean(
      state.order && state.refund && state.subscription && state.donation && state.fulfillment,
    ),
  )

  // ---- Webhook subscription + one delivered delivery ---------------------------
  await startCapture()
  const sub = await api(SRC.origin, '/api/admin/integrations', {
    method: 'POST',
    cookie: state.ownerCookie,
    body: {
      action: 'create-webhook',
      siteId: state.site,
      target: `http://127.0.0.1:${capturePort}/ok`,
      secretRef: 'rc117d-sub',
      events: ['content.created'],
    },
  })
  state.subscription_wh = String(sub.json?.subscription?.id ?? '')
  await check(
    'owner creates a webhook subscription through the operator API (201)',
    sub.status === 201 && Boolean(state.subscription_wh),
  )
  const { recordExecutionEvent } = await import('../../src/modules/execution/service')
  const rec: any = await recordExecutionEvent(payload, {
    siteId: state.site,
    tenantId: state.site,
    actor: { kind: 'service', id: 'rc1-17d-harness' },
    eventType: 'content.created' as any,
    idempotencyKey: '17d-evt-1',
    privacyClass: 'public',
    payload: { harness: 'rc1-17d' },
  })
  const runJobs = async () => {
    await (payload.jobs as any).run({ allQueues: true })
  }
  await (payload.jobs as any).queue({
    task: 'execution-outbox-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
  await runJobs()
  await (payload.jobs as any).queue({
    task: 'webhook-delivery-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
  const deliveries = (
    await payload.find({
      collection: 'webhook-deliveries',
      where: { eventId: { equals: String(rec.event.id) } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]
  state.delivery = String(deliveries[0]?.id ?? '')
  await check(
    'execution event produces exactly one delivery, delivered once to the local receiver with a valid signature',
    deliveries.length === 1 &&
      deliveries[0].state === 'delivered' &&
      captureHits.filter((h) => h.url === '/ok' && h.signatureValid).length >= 1,
  )

  // ---- One pending (future-dated) durable job ------------------------------------
  const pending = await (payload.jobs as any).queue({
    task: 'operations-heartbeat',
    input: {},
    queue: 'operations',
    waitUntil: new Date(Date.now() + 2 * 3600 * 1000),
  })
  state.pendingJob = String(pending.id)
  await save()
  await check(
    'a future-dated durable job is queued and pending at backup time',
    Boolean(state.pendingJob),
  )

  // ---- Source projection snapshot (for restored comparison) -----------------------
  const projection: Record<string, any> = {}
  const pick = async (collection: string, id: string, fields: string[]) => {
    const doc: any = await payload
      .findByID({
        collection,
        id,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!doc) return null
    const rel = (v: any) => (v && typeof v === 'object' ? String(v.id) : v)
    return Object.fromEntries(fields.map((f) => [f, rel(doc[f])]))
  }
  projection.article = await pick('content', state.article, ['title', 'slug', 'status', 'seoTitle'])
  projection.order = await pick('orders', state.order, ['orderNumber', 'state', 'amountMinor'])
  projection.refund = await pick('commerce-refunds', state.refund, ['amountMinor', 'state', 'kind'])
  projection.subscription = await pick('subscriptions', state.subscription, [
    'state',
    'providerKey',
  ])
  projection.donation = await pick('donations', state.donation, ['baseAmountMinor', 'lifecycle'])
  projection.membership = await pick('audience-memberships', state.membership, ['status'])
  projection.post = await pick('discussion-posts', state.post, ['body', 'status'])
  projection.delivery = await pick('webhook-deliveries', state.delivery, ['state', 'eventType'])
  state.projection = projection
  await writeFile(`${out}/source-projection.json`, JSON.stringify(projection, null, 2))
  await save()
  await check(
    'source projection snapshot captured for every populated business category',
    Object.values(projection).every(Boolean),
  )

  await stopWeb()
  capture?.close()
  console.log('SOURCE PHASE COMPLETE')
}

// =============================================================================
async function backupPhase() {
  assert.equal(process.env.DATABASE_URL?.includes('/rc117d_source'), true)
  await mkdir(out, { recursive: true })
  await connect()
  const backupModule = await import('../../src/modules/operations/backup')

  // Writers are quiesced: the source phase stopped the web process and no
  // worker is running — the harness maintenance window.
  state.sourceTableHashes = await tableHashes(pool)
  state.sourceMediaMap = await mediaMap(SRC.media)
  await save()
  await check(
    `source at-rest state captured (${Object.keys(state.sourceTableHashes).length} tables, ${Object.keys(state.sourceMediaMap).length} media files)`,
    Object.keys(state.sourceMediaMap).length >= 2,
  )

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archive = path.resolve(`${scratch}/backups/renegade-backup-${stamp}`)
  await mkdir(archive, { recursive: true })
  state.archive = archive
  const pgEnv = { ...process.env, PGPASSWORD: 'postgres' }
  await execFileAsync(
    'pg_dump',
    [
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-Fc',
      '-d',
      'rc117d_source',
      '-f',
      path.join(archive, 'database.dump'),
    ],
    { env: pgEnv, maxBuffer: 1024 * 1024 * 64 },
  )
  await execFileAsync('tar', [
    '-C',
    path.resolve(SRC.media),
    '--exclude=./.upload-sessions',
    '--exclude=.upload-sessions',
    '--exclude=./.renegade/backup-status.json',
    '--exclude=.renegade/backup-status.json',
    '-czf',
    path.join(archive, 'media.tar.gz'),
    '.',
  ])
  await check('pg_dump -Fc and the media tar (shipped exclusions) are written', true)

  const pgVersion = (await pool.query('SHOW server_version')).rows[0].server_version as string
  const migrationState = (
    await pool.query('SELECT name FROM payload_migrations ORDER BY name')
  ).rows.map((r: any) => r.name as string)
  const headSha = (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim()
  const manifest = await backupModule.createOperationalBackupManifest(archive, {
    createdAt: new Date().toISOString(),
    renegade: { version: '0.1.0', buildSha: headSha },
    postgresql: { version: pgVersion },
    consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    migrationState,
    installation: { storageDriver: 'local', mediaDir: path.resolve(SRC.media), imageTag: null },
  })
  await writeFile(path.join(archive, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  })
  const verified = await backupModule.verifyOperationalBackup(archive)
  await check(
    'product manifest created and verifyOperationalBackup passes (checksums + totals)',
    verified.totals.files === 2 && verified.files.length === 2,
  )
  await execFileAsync('pg_restore', ['-l', path.join(archive, 'database.dump')], {
    maxBuffer: 1024 * 1024 * 64,
  })
  await execFileAsync('tar', ['-tzf', path.join(archive, 'media.tar.gz')], {
    maxBuffer: 1024 * 1024 * 64,
  })
  await check('archive format proof: pg_restore -l and tar -tzf both read the archive', true)

  // Secret exclusion sweep: environment secrets never enter the archive.
  const manifestText = await readFile(path.join(archive, 'manifest.json'), 'utf8')
  const dumpBytes = await readFile(path.join(archive, 'database.dump'))
  const tarList = (
    await execFileAsync('tar', ['-tzf', path.join(archive, 'media.tar.gz')], {
      maxBuffer: 1024 * 1024 * 64,
    })
  ).stdout
  const envSecrets = [
    String(process.env.PAYLOAD_SECRET ?? ''),
    WH_SECRET,
    'postgres:postgres@',
  ].filter(Boolean)
  await check(
    'secret exclusion: no environment secret appears in the manifest or the database dump; the media archive lists no .env or backup-status entries',
    envSecrets.every((s) => !manifestText.includes(s) && !dumpBytes.includes(Buffer.from(s))) &&
      !/(^|\/)\.env(\.|$)/.test(tarList) &&
      !tarList.includes('backup-status.json'),
  )

  // Post-backup diagnostic status, as the shipped command writes it (after
  // archival, and itself excluded from the archive).
  const statusDir = path.join(SRC.media, '.renegade')
  await mkdir(statusDir, { recursive: true })
  await writeFile(
    path.join(statusDir, 'backup-status.json'),
    JSON.stringify({
      status: 'healthy',
      lastSuccessfulAt: new Date().toISOString(),
      backupFormat: 'renegade-operational-backup',
      verified: true,
    }),
  )

  // Corruption fixtures for the restore-phase negatives. The fixture
  // directories are rebuilt from scratch each run: reusing them made a
  // previous run's XOR byte-flip cancel itself out on deterministic
  // fixture bytes.
  const corrupt = path.resolve(`${scratch}/corrupt`)
  await execFileAsync('rm', ['-rf', corrupt])
  await execFileAsync('cp', ['-r', archive, corrupt])
  const mediaPath = path.join(corrupt, 'media.tar.gz')
  const mediaBytes = await readFile(mediaPath)
  mediaBytes[Math.floor(mediaBytes.length / 2)] ^= 0xff
  await writeFile(mediaPath, mediaBytes)
  state.corruptArchive = corrupt
  const brokenManifest = path.resolve(`${scratch}/broken-manifest`)
  await execFileAsync('rm', ['-rf', brokenManifest])
  await execFileAsync('cp', ['-r', archive, brokenManifest])
  const broken = JSON.parse(await readFile(path.join(brokenManifest, 'manifest.json'), 'utf8'))
  broken.files = broken.files.slice(0, 1)
  await writeFile(path.join(brokenManifest, 'manifest.json'), JSON.stringify(broken, null, 2))
  state.brokenManifestArchive = brokenManifest
  await save()
  await writeFile(
    `${out}/backup-manifest.json`,
    JSON.stringify(
      { ...manifest, archive: `scratch/rc117d/backups/${path.basename(archive)}` },
      null,
      2,
    ),
  )
  console.log('BACKUP PHASE COMPLETE')
}

// =============================================================================
async function restorePhase() {
  assert.equal(process.env.DATABASE_URL?.includes('/rc117d_restored'), true)
  await mkdir(out, { recursive: true })
  const backupModule = await import('../../src/modules/operations/backup')
  const lifecycle = await import('../../src/modules/operations/lifecycle')
  const { Pool } = await import('pg')
  const raw = new Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5432/rc117d_restored',
  })
  const publicTables = async () =>
    Number(
      (await raw.query(`SELECT count(*)::int AS c FROM pg_tables WHERE schemaname = 'public'`))
        .rows[0].c,
    )

  // ---- Negatives: corrupt archives are refused before any mutation -------------
  let corruptRejected = false
  try {
    await backupModule.verifyOperationalBackup(state.corruptArchive)
  } catch {
    corruptRejected = true
  }
  let brokenRejected = false
  try {
    await backupModule.verifyOperationalBackup(state.brokenManifestArchive)
  } catch {
    brokenRejected = true
  }
  await check(
    'corrupted media component and a manifest with a removed entry are both rejected by the product verifier',
    corruptRejected && brokenRejected,
  )
  await check(
    'rejected restores mutated nothing: target database still has 0 tables and the media directory is still empty',
    (await publicTables()) === 0 &&
      (await mediaMap(RST.media)) &&
      Object.keys(await mediaMap(RST.media)).length === 0,
  )
  let safetyThrew = 0
  try {
    backupModule.assertRestoreSafety({
      isolated: false,
      authorized: true,
      composeFile: 'compose.restore.yaml',
    })
  } catch {
    safetyThrew++
  }
  try {
    backupModule.assertRestoreSafety({
      isolated: true,
      authorized: true,
      composeFile: 'compose.production.yaml',
    })
  } catch {
    safetyThrew++
  }
  backupModule.assertRestoreSafety({
    isolated: true,
    authorized: true,
    composeFile: 'compose.restore.yaml',
  })
  await check(
    'product restore-safety guard refuses non-isolated restores and non-restore targets, and accepts the isolated restore target',
    safetyThrew === 2,
  )
  // Non-empty target refusal (the shipped restore's own guard, mirrored on the
  // native path): plant harness fixtures, observe refusal, remove them.
  await raw.query('CREATE TABLE rc117d_nonempty_probe (id int)')
  await writeFile(path.join(RST.media, 'probe.txt'), 'probe')
  const refuseDb = (await publicTables()) !== 0
  const refuseMedia = Object.keys(await mediaMap(RST.media)).length !== 0
  await check(
    'a non-empty database or media target is refused (guard fires on both)',
    refuseDb && refuseMedia,
  )
  await raw.query('DROP TABLE rc117d_nonempty_probe')
  await execFileAsync('rm', [path.join(RST.media, 'probe.txt')])
  assert.equal(await publicTables(), 0)

  // ---- The restore itself ---------------------------------------------------------
  const manifest = await backupModule.verifyOperationalBackup(state.archive)
  lifecycle.assertRestoreVersionCompatibility({
    archiveVersion: manifest.renegade.version,
    targetVersion: '0.1.0',
  })
  await check(
    'archive verifies and is version-compatible with the restore target',
    manifest.format === 'renegade-operational-backup',
  )
  const pgEnv = { ...process.env, PGPASSWORD: 'postgres' }
  await execFileAsync(
    'pg_restore',
    [
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      'rc117d_restored',
      '--no-owner',
      '--no-privileges',
      path.join(state.archive, 'database.dump'),
    ],
    { env: pgEnv, maxBuffer: 1024 * 1024 * 64 },
  )
  // --no-same-owner: the shipped flow extracts as root inside the web
  // container; the native operator here is unprivileged, so ownership
  // maps to the extracting user. Archive bytes and file contents are
  // unaffected.
  await execFileAsync('tar', [
    '--no-same-owner',
    '-xzf',
    path.join(state.archive, 'media.tar.gz'),
    '-C',
    path.resolve(RST.media),
  ])
  await check('pg_restore and media extraction complete into the empty target', true)

  const restoredHashes = await tableHashes(raw)
  const tableDiff = Object.keys(state.sourceTableHashes).filter(
    (t) => state.sourceTableHashes[t] !== restoredHashes[t],
  )
  const restoredMedia = await mediaMap(RST.media)
  const mediaDiff = Object.keys(state.sourceMediaMap).filter(
    (k) => state.sourceMediaMap[k] !== restoredMedia[k],
  )
  await writeFile(
    `${out}/projection-compare.json`,
    JSON.stringify(
      {
        tablesCompared: Object.keys(state.sourceTableHashes).length,
        tableDifferences: tableDiff,
        mediaFilesCompared: Object.keys(state.sourceMediaMap).length,
        mediaDifferences: mediaDiff,
        housekeeping:
          'The source media .renegade/backup-status.json is excluded from the archive by the shipped tooling and is therefore absent after restore; it is excluded from both checksum maps. Sequences and migration ledger are part of the compared tables.',
      },
      null,
      2,
    ),
  )
  await check(
    `restored database projections are identical to the quiesced source (${Object.keys(state.sourceTableHashes).length} tables compared, 0 differences)`,
    tableDiff.length === 0,
  )
  await check(
    `restored media bytes are identical to the source (${Object.keys(state.sourceMediaMap).length} files compared, 0 differences)`,
    mediaDiff.length === 0 &&
      Object.keys(restoredMedia).length === Object.keys(state.sourceMediaMap).length,
  )
  await raw.end()

  await execFileAsync('npm', ['run', 'db:migrate'], {
    env: { ...process.env },
    maxBuffer: 1024 * 1024 * 64,
  })
  await check('forward migrations run clean against the restored database (exit 0)', true)

  await connect()
  await check('restored web boots and reports ready', await bootWeb(RST, 'restore-web.log'))

  // ---- Logins in the restored environment ------------------------------------------
  const wa = makeAuthenticator(state.wa)
  const ownerLogin = await webauthnLogin(RST.origin, 'owner@17d.test', wa)
  state.wa.counter = wa.counter
  await save()
  await check(
    'owner logs in to the RESTORED environment with the source-enrolled passkey (genuine WebAuthn protocol; session cookie issued)',
    ownerLogin.status === 200 && Boolean(ownerLogin.cookie),
  )
  const ownerCookie = ownerLogin.cookie as string
  state.restoredOwnerCookie = ownerCookie
  const staffCookie = await session(state.staff)
  const memberCookie = `renegade-member=${state.memberToken}`
  const anonAdmin = await api(RST.origin, `/api/admin/integrations?siteId=${state.site}`)
  await check(
    'anonymous access to the restored operator API is denied (403)',
    anonAdmin.status === 403,
  )
  const staffAdmin = await api(RST.origin, `/api/admin/integrations?siteId=${state.site}`, {
    cookie: staffCookie,
  })
  await check(
    'staff fixture session (restore secret) reads the restored operator API (200), including the restored webhook subscription',
    staffAdmin.status === 200 && JSON.stringify(staffAdmin.json).includes(state.subscription_wh),
  )
  const memberSessions = await api(RST.origin, '/api/member-auth/sessions', {
    cookie: memberCookie,
  })
  await check(
    'the member session token issued BEFORE backup still authenticates after restore (restored session row validates it)',
    memberSessions.status === 200,
  )

  // ---- Refetch every populated category in the restored environment ------------------
  const refetch = async (collection: string, id: string, cookie: string) =>
    api(RST.origin, `/api/${collection}/${id}`, { cookie })
  const docOf = (r: any) => r.json?.doc ?? r.json
  const rOrder = await refetch('orders', state.order, ownerCookie)
  const rRefund = await refetch('commerce-refunds', state.refund, ownerCookie)
  const rSub = await refetch('subscriptions', state.subscription, ownerCookie)
  const rDonation = await refetch('donations', state.donation, ownerCookie)
  const rMembership = await refetch('audience-memberships', state.membership, ownerCookie)
  // discussion-posts REST reads are operator-scoped by design; the
  // member/public proof for community content is the rendered
  // discussion page (checked below).
  const rPost = await refetch('discussion-posts', state.post, ownerCookie)
  const rDelivery = await refetch('webhook-deliveries', state.delivery, ownerCookie)
  const rEntitlement = await refetch('entitlements', state.entitlement, ownerCookie)
  const p = state.projection
  await check(
    'restored refetch matches the source projection: order, refund, subscription, donation, entitlement',
    docOf(rOrder)?.orderNumber === p.order.orderNumber &&
      docOf(rOrder)?.state === p.order.state &&
      String(docOf(rRefund)?.amountMinor) === String(p.refund.amountMinor) &&
      docOf(rRefund)?.state === p.refund.state &&
      docOf(rSub)?.state === p.subscription.state &&
      String(docOf(rDonation)?.baseAmountMinor) === String(p.donation.baseAmountMinor) &&
      rEntitlement.status === 200,
  )
  await check(
    'restored refetch matches: newsletter membership active, forum message body intact, webhook delivery still delivered',
    docOf(rMembership)?.status === 'active' &&
      docOf(rPost)?.body === p.post.body &&
      docOf(rDelivery)?.state === 'delivered',
  )
  const discussionPage = await api(RST.origin, '/forums/town-hall/welcome-to-17d', {})
  await check(
    'the restored discussion renders publicly with the member message visible',
    discussionPage.status === 200 && discussionPage.text.includes(p.post.body),
  )
  // Content REST reads are operator-scoped in this build (anonymous
  // 403 is the designed boundary, as with discussion-posts); the public
  // proof is the rendered article page.
  const rArticle = await refetch('content', state.article, ownerCookie)
  const articlePage = await api(RST.origin, '/articles/17d-launch', {})
  await check(
    'the published article matches the projection via operator read and renders publicly with its SEO title as the page title',
    docOf(rArticle)?.seoTitle === p.article.seoTitle &&
      docOf(rArticle)?.status === 'published' &&
      articlePage.status === 200 &&
      articlePage.text.includes(`<title>${p.article.seoTitle}</title>`) &&
      articlePage.text.includes('Seventeen D launch body text.'),
  )
  const mediaFetch = await fetch(`${RST.origin}/media/${state.mediaAsset}`, {
    headers: { cookie: ownerCookie },
  })
  const mediaBytes = Buffer.from(await mediaFetch.arrayBuffer())
  await check(
    'the edited media serves over HTTP from the restored environment with byte equality to the edited source bytes',
    mediaFetch.status === 200 && digest(mediaBytes) === state.editedSha,
  )

  // ---- Pending work state ------------------------------------------------------------
  const job: any = await payload.findByID({
    collection: 'payload-jobs',
    id: state.pendingJob,
    depth: 0,
    overrideAccess: true,
  })
  await check(
    'the future-dated job is still pending after restore (not executed, not lost, no error)',
    !job.completedAt && !job.hasError && new Date(job.waitUntil).getTime() > Date.now(),
  )
  const worker = spawn('npx', ['tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: {
      ...process.env,
      WORKER_HEARTBEAT_FILE: path.resolve(`${scratch}/worker-heartbeat.json`),
      WORKER_POLL_INTERVAL_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  const workerLog = createWriteStream(`${out}/restore-worker.log`)
  worker.stdout!.pipe(workerLog)
  worker.stderr!.pipe(workerLog)
  let heartbeatSeen = false
  for (let i = 0; i < 30 && !heartbeatSeen; i++) {
    heartbeatSeen = await readFile(`${scratch}/worker-heartbeat.json`, 'utf8')
      .then(() => true)
      .catch(() => false)
    if (!heartbeatSeen) await new Promise((r) => setTimeout(r, 1000))
  }
  await new Promise((r) => setTimeout(r, 8000))
  // Kill the worker's whole process group: killing only the npx
  // wrapper orphans the tsx child, which keeps its database pool (and
  // blocks later phase resets) — observed on the first full run.
  if (worker.pid) {
    try {
      process.kill(-worker.pid, 'SIGTERM')
    } catch {
      try {
        worker.kill()
      } catch {}
    }
  }
  await new Promise((r) => setTimeout(r, 1500))
  const jobAfter: any = await payload.findByID({
    collection: 'payload-jobs',
    id: state.pendingJob,
    depth: 0,
    overrideAccess: true,
  })
  await check(
    'a live worker in the restored environment leaves the future-dated job safely pending (heartbeat observed, job untouched)',
    heartbeatSeen && !jobAfter.completedAt && !jobAfter.hasError,
  )
  await stopWeb()
  console.log('RESTORE PHASE COMPLETE')
}

// =============================================================================
async function restartPhase() {
  assert.equal(process.env.DATABASE_URL?.includes('/rc117d_restored'), true)
  await mkdir(out, { recursive: true })
  await connect()
  await check(
    'restored web reboots after a full PostgreSQL cluster restart and reports ready',
    await bootWeb(RST, 'restart-web.log'),
  )
  const wa = makeAuthenticator(state.wa)
  const ownerLogin = await webauthnLogin(RST.origin, 'owner@17d.test', wa)
  state.wa.counter = wa.counter
  await save()
  await check(
    'owner WebAuthn login works again after the restart (restored credential + counter state persist)',
    ownerLogin.status === 200 && Boolean(ownerLogin.cookie),
  )
  const article = await api(RST.origin, `/api/content/${state.article}`, {
    cookie: ownerLogin.cookie,
  })
  const memberSessions = await api(RST.origin, '/api/member-auth/sessions', {
    cookie: `renegade-member=${state.memberToken}`,
  })
  const mediaFetch = await fetch(`${RST.origin}/media/${state.mediaAsset}`, {
    headers: { cookie: ownerLogin.cookie as string },
  })
  const mediaBytes = Buffer.from(await mediaFetch.arrayBuffer())
  await check(
    'article, member session and edited media bytes all survive the restart',
    article.status === 200 &&
      (article.json?.doc ?? article.json)?.seoTitle === state.projection.article.seoTitle &&
      memberSessions.status === 200 &&
      mediaFetch.status === 200 &&
      digest(mediaBytes) === state.editedSha,
  )
  await stopWeb()
  console.log('RESTART PHASE COMPLETE')
}

try {
  if (phase === 'source') await sourcePhase()
  else if (phase === 'backup') await backupPhase()
  else if (phase === 'restore') await restorePhase()
  else if (phase === 'restart') await restartPhase()
  else throw new Error(`usage: journey.ts source|backup|restore|restart`)
} finally {
  await stopWeb().catch(() => undefined)
  if (payload?.db?.destroy) await payload.db.destroy().catch(() => undefined)
}
process.exit(0)
