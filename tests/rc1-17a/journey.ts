/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable PostgreSQL adversarial acceptance */
/**
 * RC1 17A acceptance: adversarial identity, role and tenant security.
 *
 * Proves, against a disposable database, that critical authorization
 * boundaries hold under hostile client requests:
 *  - role/site matrix over the operator API and native Payload REST for
 *    owner / staff (scoped, unscoped) / community member / anonymous
 *    across two sites, including cross-tenant object substitution by id;
 *  - revocation taking effect on live sessions: site-grant removal,
 *    account deletion, logout, direct session revocation, session expiry,
 *    member suspension — plus forged / tampered / row-less JWT sessions;
 *  - CSRF: the admin proxy origin guard (foreign Origin, cross-site
 *    Sec-Fetch-Site, same-origin and non-browser controls) and the member
 *    double-submit CSRF token (missing / mismatched / valid);
 *  - member object substitution: revoking another member's session is
 *    refused and the victim session survives;
 *  - WebAuthn login negatives with a software authenticator (generated
 *    P-256 key, protocol-level assertions): no-challenge, wrong origin,
 *    wrong challenge, expired challenge, unknown credential, replay of a
 *    consumed assertion — and one genuine protocol login as the positive
 *    control. This is protocol proof with a software authenticator, NOT
 *    a genuine hardware/browser passkey ceremony;
 *  - every failed attempt leaves protected business/media/settings state
 *    unchanged (before/after persistence snapshots);
 *  - restart: sessions, revocations and suspensions persist across a web
 *    + PostgreSQL restart.
 *
 * Operator sessions are fixture passkey sessions (createPasskeySession),
 * the same convention as the 15E/16A/16B harnesses; no genuine passkey
 * claim is made for them. The WebAuthn battery separately performs a
 * real protocol login through the operator HTTP path.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { SignJWT } from 'jose'
import { encodeCBOR } from '@levischuck/tiny-cbor'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { digest } from '../../src/modules/identity/member-identity'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc117a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const pool = payload.db.pool
const out = 'docs/rc/evidence/rc1/18-pass/17A'
const base = 'http://127.0.0.1:39068'
const appOrigin = 'http://127.0.0.1:39068'
const restart = process.argv.includes('restart')
const trace: any[] = []
const bodies: string[] = []
const SECRET = String(process.env.PAYLOAD_SECRET ?? '')
const CANARIES = [SECRET]

const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(trace, null, 2),
  )
}

const state: any = await readFile('scratch/rc117a/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () => writeFile('scratch/rc117a/state.json', JSON.stringify(state, null, 2))

let web: ChildProcess | undefined

// ---- HTTP helpers -------------------------------------------------------
async function api(
  path: string,
  options: {
    method?: string
    cookie?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
): Promise<{ status: number; text: string; json: any; setCookie: string | null }> {
  const response = await fetch(`${base}${path}`, {
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
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json, setCookie: response.headers.get('set-cookie') }
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
      '39068',
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

// ---- Fixture sessions ----------------------------------------------------
async function session(id: string, dbExpiresAt?: Date) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(user, SECRET, async (sid, expires) => {
    await pool.query('INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
      sid,
      id,
      dbExpiresAt ?? expires,
    ])
  })
  return `renegade-passkey=${value.token}`
}

/** Valid JWT signature, but no admin_sessions row is ever inserted. */
async function rowlessSession(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(user, SECRET)
  return `renegade-passkey=${value.token}`
}

async function forgedSession(userId: string, secret: string) {
  const token = await new SignJWT({
    collection: 'users',
    email: 'attacker@evil.example',
    id: userId,
    sid: randomBytes(16).toString('hex'),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(secret))
  return `renegade-passkey=${token}`
}

const memberToken = () => randomBytes(24).toString('hex')
async function memberSession(memberId: string, token: string) {
  const doc = await payload.create({
    collection: 'member-sessions',
    data: {
      member: memberId,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      createdFrom: 'magic-link',
      lastSeenAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return String(doc.id)
}

const body17 = {
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
            text: 'Seventeen A protected body text.',
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
}

async function snapshotProtected() {
  const pick = async (collection: string, id: string, fields: string[]) => {
    const doc = await payload
      .findByID({ collection, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!doc) return null
    const out: Record<string, unknown> = {}
    for (const f of fields) out[f] = doc[f] ?? null
    out.updatedAt = doc.updatedAt ?? null
    return out
  }
  return {
    betaArticle: await pick('content', state.betaArticle, ['title', 'status', 'slug']),
    betaDraft: await pick('content', state.betaDraft, ['title', 'status', 'slug']),
    betaMedia: await pick('media-assets', state.betaMedia, ['title', 'checksum']),
    alphaArticle: await pick('content', state.alphaArticle, ['title', 'status', 'slug']),
    betaSite: await pick('sites', state.beta, ['name', 'slug', 'lifecycle']),
    contentCount: (await payload.count({ collection: 'content', overrideAccess: true })).totalDocs,
    mediaCount: (await payload.count({ collection: 'media-assets', overrideAccess: true }))
      .totalDocs,
  }
}

// ---- Software WebAuthn authenticator -------------------------------------
const wa = (() => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as {
    x: string
    y: string
  }
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
  }
})()

function buildAssertion(opts: { challenge: string; origin: string }) {
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

try {
  await mkdir('scratch/rc117a', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!restart) {
    // ---- Fixtures -------------------------------------------------------
    state.alpha = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '17A Alpha', slug: '17a-alpha', lifecycle: 'active' },
        })
      ).id,
    )
    state.beta = String(
      (
        await payload.create({
          collection: 'sites',
          data: { name: '17A Beta', slug: '17a-beta', lifecycle: 'active' },
        })
      ).id,
    )
    const mkUser = async (email: string, role: string) =>
      payload.create({ collection: 'users', data: { email, role } })
    const memberOf = (u: any) => String(typeof u.member === 'object' ? u.member.id : u.member)
    const grant = async (memberId: string, site: string, role: string) =>
      String(
        (
          await payload.create({
            collection: 'member-site-roles',
            data: { member: memberId, site, role },
          })
        ).id,
      )

    const ownerUser = await mkUser('owner@17a.test', 'owner')
    state.owner = String(ownerUser.id)
    const staffAUser = await mkUser('staff-a@17a.test', 'staff')
    state.staffA = String(staffAUser.id)
    state.staffAGrant = await grant(memberOf(staffAUser), state.alpha, 'contributor')
    const staffBUser = await mkUser('staff-b@17a.test', 'staff')
    state.staffB = String(staffBUser.id)
    await grant(memberOf(staffBUser), state.alpha, 'contributor')
    const staffCUser = await mkUser('staff-c@17a.test', 'staff')
    state.staffC = String(staffCUser.id)
    await grant(memberOf(staffCUser), state.alpha, 'contributor')
    const staffNoneUser = await mkUser('staff-none@17a.test', 'staff')
    state.staffNone = String(staffNoneUser.id)
    const waUser = await mkUser('wa@17a.test', 'staff')
    state.waUser = String(waUser.id)
    await grant(memberOf(waUser), state.alpha, 'contributor')

    // Software-authenticator passkey for the WebAuthn battery.
    await pool.query(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
       VALUES ($1, $2, $3, 0, 'single_device', false, 'Harness authenticator', '[]')`,
      [state.waUser, wa.credentialId, wa.publicKeyB64],
    )

    const mkMember = async (email: string, displayName: string) =>
      payload.create({
        collection: 'members',
        data: { email, displayName, status: 'active' },
        overrideAccess: true,
      })
    const memberA = await mkMember('member-a@17a.test', 'Member A')
    state.memberA = String(memberA.id)
    await payload.create({
      collection: 'member-site-roles',
      data: { member: state.memberA, site: state.alpha, role: 'member' },
    })
    const memberB = await mkMember('member-b@17a.test', 'Member B')
    state.memberB = String(memberB.id)
    state.memberAToken1 = memberToken()
    state.memberAToken2 = memberToken()
    state.memberBToken = memberToken()
    state.memberASession1 = await memberSession(state.memberA, state.memberAToken1)
    state.memberASession2 = await memberSession(state.memberA, state.memberAToken2)
    state.memberBSession = await memberSession(state.memberB, state.memberBToken)

    const mkContent = async (site: string, title: string, slug: string, status: string) =>
      String(
        (
          await payload.create({
            collection: 'content',
            data: {
              site,
              title,
              slug,
              summary: `${title} summary.`,
              status,
              contentType: 'article',
              body: body17,
            },
          })
        ).id,
      )
    state.alphaArticle = await mkContent(state.alpha, 'Alpha Ledger', 'alpha-ledger', 'published')
    state.betaArticle = await mkContent(state.beta, 'Beta Ledger', 'beta-ledger', 'published')
    state.betaDraft = await mkContent(state.beta, 'Beta Secret Draft', 'beta-secret-draft', 'draft')
    state.betaMedia = String(
      (
        await payload.create({
          collection: 'media-assets',
          data: {
            site: state.beta,
            title: 'Beta private media',
            kind: 'image',
            storageLocation: 'rc117a-beta.png',
            storageProvider: 'local',
            originalFilename: 'rc117a-beta.png',
            mimeType: 'image/png',
            sizeBytes: 68,
            checksum: 'rc117a-beta-checksum',
          },
          overrideAccess: true,
        } as never)
      ).id,
    )
    state.before = await snapshotProtected()
    await save()
  }

  const ownerCookie = await session(state.owner)
  const staffACookie = await session(state.staffA)
  // staffB is deleted and staffNone is unused during the restart phase;
  // their fixture sessions are minted only in the fresh phase.
  const staffBCookie = restart ? '' : await session(state.staffB)
  const staffNoneCookie = restart ? '' : await session(state.staffNone)
  const memberACookie = `renegade-member=${state.memberAToken1}`
  const memberBCookie = `renegade-member=${state.memberBToken}`
  if (!restart) {
    state.ownerCookie = ownerCookie
    state.staffACookie = staffACookie
    await save()
  }

  const booted = await bootWeb(restart ? 'restart-web.log' : 'web.log')
  await check(
    `${restart ? 'restart: ' : ''}Next.js web process booted on ${base} (anonymous /connections redirects to login)`,
    booted,
  )

  if (!restart) {
    // ---- Positive controls ----------------------------------------------
    const ownerControl = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: ownerCookie,
    })
    const staffControl = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffACookie,
    })
    await check(
      'controls: global owner reads the operator API for Beta (200); Alpha-scoped staff reads it for Alpha (200)',
      ownerControl.status === 200 && staffControl.status === 200,
    )
    const memberControl = await api('/api/member-auth/sessions', { cookie: memberBCookie })
    await check(
      'control: community member session lists its own member sessions (200)',
      memberControl.status === 200 &&
        (memberControl.json?.sessions ?? []).some(
          (s: any) => String(s.id) === String(state.memberBSession),
        ),
    )

    // ---- Anonymous / member / unscoped negatives -------------------------
    const anonAdmin = await api(`/api/admin/integrations?siteId=${state.alpha}`)
    const memberAdmin = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: memberACookie,
    })
    const unscopedAdmin = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffNoneCookie,
    })
    await check(
      'anonymous (403), community-member session (403) and staff with no site grants (403) are all denied the operator API',
      anonAdmin.status === 403 && memberAdmin.status === 403 && unscopedAdmin.status === 403,
    )
    const foreignGet = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: staffACookie,
    })
    const foreignWrite = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: staffACookie,
      body: {
        action: 'create-webhook',
        siteId: state.beta,
        target: 'http://127.0.0.1:39168/hook',
        secretRef: 'rc117a-sub',
        events: ['content.published'],
      },
    })
    const betaSubs = await payload.count({
      collection: 'webhook-subscriptions',
      where: { site: { equals: state.beta } },
      overrideAccess: true,
    })
    await check(
      'Alpha-scoped staff is denied the operator API for Beta on read (403) and on write (403), and no Beta webhook subscription was created',
      foreignGet.status === 403 && foreignWrite.status === 403 && betaSubs.totalDocs === 0,
    )
    const anonUsers = await api('/api/users')
    const memberUsers = await api('/api/users', { cookie: memberACookie })
    const anonDraft = await api(`/api/content/${state.betaDraft}`)
    await check(
      'anonymous and member sessions cannot list operator accounts (401/403) and cannot read a foreign draft by id (403/404)',
      [401, 403].includes(anonUsers.status) &&
        [401, 403].includes(memberUsers.status) &&
        [403, 404].includes(anonDraft.status),
    )

    // ---- Payload REST cross-tenant battery --------------------------------
    const staffDraftRead = await api(`/api/content/${state.betaDraft}`, { cookie: staffACookie })
    const staffMediaRead = await api(`/api/media-assets/${state.betaMedia}`, {
      cookie: staffACookie,
    })
    const staffListForeign = await api(
      `/api/content?where%5Bsite%5D%5Bequals%5D=${state.beta}&limit=100`,
      { cookie: staffACookie },
    )
    const leakedIds = (staffListForeign.json?.docs ?? []).map((d: any) => String(d.id))
    await check(
      'scoped staff cannot read a foreign draft (404) or foreign media (403/404) by id, and a foreign-site list query returns none of Beta\u2019s records',
      staffDraftRead.status === 404 &&
        [403, 404].includes(staffMediaRead.status) &&
        !leakedIds.includes(String(state.betaArticle)) &&
        !leakedIds.includes(String(state.betaDraft)),
    )
    const staffPatchForeign = await api(`/api/content/${state.betaArticle}`, {
      method: 'PATCH',
      cookie: staffACookie,
      body: { title: 'PWNED-17A' },
    })
    const staffCreateForeign = await api('/api/content', {
      method: 'POST',
      cookie: staffACookie,
      body: {
        site: state.beta,
        title: 'Stowaway',
        slug: 'stowaway',
        status: 'draft',
        contentType: 'article',
        body: body17,
      },
    })
    const staffDeleteForeign = await api(`/api/content/${state.betaDraft}`, {
      method: 'DELETE',
      cookie: staffACookie,
    })
    const staffPatchOwner = await api(`/api/users/${state.owner}`, {
      method: 'PATCH',
      cookie: staffACookie,
      body: { role: 'staff' },
    })
    const midSnapshot = await snapshotProtected()
    await check(
      'object substitution fails: scoped staff PATCH foreign content, POST content into a foreign site, DELETE foreign draft and PATCH the owner account are all denied (400/403/404)',
      [400, 403, 404].includes(staffPatchForeign.status) &&
        [400, 403, 404].includes(staffCreateForeign.status) &&
        [400, 403, 404].includes(staffDeleteForeign.status) &&
        [400, 403, 404].includes(staffPatchOwner.status),
    )
    await check(
      'failed cross-tenant attempts leave protected state unchanged (Beta article/draft/media, Alpha article, Beta site, counts identical)',
      JSON.stringify(midSnapshot) === JSON.stringify(state.before),
    )
    const ownerStillOwner = await payload.findByID({
      collection: 'users',
      id: state.owner,
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'owner account role is unchanged after the staff PATCH attempt',
      ownerStillOwner.role === 'owner',
    )

    // ---- CSRF: admin proxy origin guard -----------------------------------
    const csrfForeignOrigin = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      headers: { origin: 'https://evil.example' },
      body: { action: '__csrf_probe__' },
    })
    const csrfSameOrigin = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      headers: { origin: appOrigin },
      body: { action: '__csrf_probe__' },
    })
    const csrfFetchSite = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      headers: { 'sec-fetch-site': 'cross-site' },
      body: { action: '__csrf_probe__' },
    })
    const csrfNonBrowser = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: { action: '__csrf_probe__' },
    })
    await check(
      'CSRF: authenticated mutation with a foreign Origin is blocked by the proxy guard (403, guard message)',
      csrfForeignOrigin.status === 403 &&
        csrfForeignOrigin.text.includes('Cross-origin authenticated mutation'),
    )
    await check(
      'CSRF: authenticated mutation with Sec-Fetch-Site: cross-site and no Origin/Referer is blocked (403, guard message)',
      csrfFetchSite.status === 403 &&
        csrfFetchSite.text.includes('Cross-origin authenticated mutation'),
    )
    await check(
      'CSRF controls: same-origin Origin and header-less non-browser mutations pass the guard and reach the handler (no guard message)',
      !csrfSameOrigin.text.includes('Cross-origin authenticated mutation') &&
        !csrfNonBrowser.text.includes('Cross-origin authenticated mutation'),
    )

    // ---- Member CSRF + object substitution --------------------------------
    const csrfVal = 'rc117a-csrf-token'
    const memberCsrfCookies = (token: string) =>
      `renegade-member=${token}; renegade-member-csrf=${csrfVal}`
    const revokeForeignNoCsrf = await api(
      `/api/member-auth/sessions/${state.memberBSession}/revoke`,
      { method: 'POST', cookie: memberACookie, body: {} },
    )
    const revokeForeignBadCsrf = await api(
      `/api/member-auth/sessions/${state.memberBSession}/revoke`,
      {
        method: 'POST',
        cookie: memberCsrfCookies(state.memberAToken1),
        headers: { 'x-member-csrf': 'wrong-token' },
        body: {},
      },
    )
    await check(
      'member mutation without a CSRF token (403) and with a mismatched CSRF token (403) is refused before any session change',
      revokeForeignNoCsrf.status === 403 && revokeForeignBadCsrf.status === 403,
    )
    const revokeForeign = await api(`/api/member-auth/sessions/${state.memberBSession}/revoke`, {
      method: 'POST',
      cookie: memberCsrfCookies(state.memberAToken1),
      headers: { 'x-member-csrf': csrfVal },
      body: {},
    })
    const victimStillValid = await api('/api/member-auth/sessions', { cookie: memberBCookie })
    await check(
      'object substitution: member A cannot revoke member B\u2019s session (404) and B\u2019s session remains valid afterwards (200)',
      revokeForeign.status === 404 && victimStillValid.status === 200,
    )
    const revokeOwn = await api(`/api/member-auth/sessions/${state.memberASession2}/revoke`, {
      method: 'POST',
      cookie: memberCsrfCookies(state.memberAToken1),
      headers: { 'x-member-csrf': csrfVal },
      body: {},
    })
    const revokedTokenReuse = await api('/api/member-auth/sessions', {
      cookie: `renegade-member=${state.memberAToken2}`,
    })
    await check(
      'control: member A revokes its own second session (200) and the revoked token immediately stops authenticating (401)',
      revokeOwn.status === 200 && revokedTokenReuse.status === 401,
    )

    // ---- WebAuthn battery (software authenticator) --------------------------
    const waEmail = 'wa@17a.test'
    const passkeyRow = async () =>
      (
        await pool.query(`SELECT counter, login_challenge FROM passkeys WHERE credential_id = $1`, [
          wa.credentialId,
        ])
      ).rows[0]
    const noChallenge = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: buildAssertion({
        challenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        origin: appOrigin,
      }),
    })
    await check(
      'WebAuthn: completing sign-in without ever requesting a challenge is refused (400)',
      noChallenge.status === 400,
    )
    const beginOptions = async () => {
      const res = await api('/api/auth/passkey/options', {
        method: 'POST',
        body: { email: waEmail },
      })
      assert.equal(res.status, 200, 'passkey options must issue a challenge')
      return String(res.json.options.challenge)
    }
    const wrongOriginChallenge = await beginOptions()
    const wrongOrigin = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: buildAssertion({ challenge: wrongOriginChallenge, origin: 'https://evil.example' }),
    })
    const wrongChallengeChallenge = await beginOptions()
    const wrongChallenge = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: buildAssertion({
        challenge: 'bogus-challenge-that-was-never-issued-17a',
        origin: appOrigin,
      }),
    })
    await check(
      'WebAuthn: assertions with a foreign origin (400) and with a never-issued challenge (400) are refused; no session cookie is issued',
      wrongOrigin.status === 400 &&
        wrongOrigin.setCookie === null &&
        wrongChallenge.status === 400 &&
        wrongChallenge.setCookie === null &&
        String(wrongChallengeChallenge) !== 'bogus-challenge-that-was-never-issued-17a',
    )
    const expiredChallenge = await beginOptions()
    await pool.query(
      `UPDATE passkeys SET login_expires_at = now() - interval '1 minute' WHERE credential_id = $1`,
      [wa.credentialId],
    )
    const expired = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: buildAssertion({ challenge: expiredChallenge, origin: appOrigin }),
    })
    const unknownCred = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: {
        ...buildAssertion({ challenge: expiredChallenge, origin: appOrigin }),
        id: 'unknown-credential-17a',
        rawId: 'unknown-credential-17a',
      },
    })
    const counterBeforeLogin = Number((await passkeyRow()).counter)
    await check(
      'WebAuthn: an expired challenge (400) and an unknown credential id (400) are refused; the stored sign counter has not moved',
      expired.status === 400 && unknownCred.status === 400 && counterBeforeLogin === 0,
    )
    const sessionsBefore = Number(
      (
        await pool.query(`SELECT count(*)::int AS n FROM admin_sessions WHERE user_id = $1`, [
          state.waUser,
        ])
      ).rows[0].n,
    )
    const goodChallenge = await beginOptions()
    const goodAssertion = buildAssertion({ challenge: goodChallenge, origin: appOrigin })
    const goodLogin = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: goodAssertion,
    })
    const waCookie = (goodLogin.setCookie ?? '').split(';')[0]
    await check(
      'WebAuthn control: a valid software-authenticator assertion completes sign-in (200) and issues the admin session cookie',
      goodLogin.status === 200 && waCookie.startsWith('renegade-passkey='),
    )
    const waControl = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: waCookie,
    })
    const counterAfterLogin = Number((await passkeyRow()).counter)
    await check(
      'the WebAuthn-issued session works on the operator API (200) and the stored sign counter advanced exactly to the assertion counter',
      waControl.status === 200 && counterAfterLogin === wa.counter,
    )
    const replay = await api('/api/auth/passkey/complete', {
      method: 'POST',
      body: goodAssertion,
    })
    const sessionsAfter = Number(
      (
        await pool.query(`SELECT count(*)::int AS n FROM admin_sessions WHERE user_id = $1`, [
          state.waUser,
        ])
      ).rows[0].n,
    )
    await check(
      'WebAuthn replay: resubmitting the consumed assertion is refused (400) and creates no second session',
      replay.status === 400 && sessionsAfter === sessionsBefore + 1,
    )
    state.waCookie = waCookie
    await save()

    // ---- Revocation battery -------------------------------------------------
    const staffBControl = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffBCookie,
    })
    const ownerDeletesStaffB = await api(`/api/users/${state.staffB}`, {
      method: 'DELETE',
      cookie: ownerCookie,
    })
    const staffBAfterDelete = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffBCookie,
    })
    await check(
      'account revocation: staff B works (200), the owner deletes the account (200), and B\u2019s live session immediately stops authenticating (403)',
      staffBControl.status === 200 &&
        ownerDeletesStaffB.status === 200 &&
        staffBAfterDelete.status === 403,
    )
    const ownerRevokesGrant = await api(`/api/member-site-roles/${state.staffAGrant}`, {
      method: 'DELETE',
      cookie: ownerCookie,
    })
    const staffAAfterRevoke = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffACookie,
    })
    const staffARestAfterRevoke = await api(`/api/content/${state.alphaArticle}`, {
      cookie: staffACookie,
    })
    await check(
      'grant revocation: the owner deletes staff A\u2019s only site grant (200) and A\u2019s live session loses the operator API (403) and its own site\u2019s content (404) on the very next requests',
      ownerRevokesGrant.status === 200 &&
        staffAAfterRevoke.status === 403 &&
        [403, 404].includes(staffARestAfterRevoke.status),
    )
    const staffCCookie1 = await session(state.staffC)
    const staffCCookie2 = await session(state.staffC)
    const staffCControl = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffCCookie1,
    })
    const logout = await api('/api/auth/logout', { method: 'POST', cookie: staffCCookie1 })
    const staffCAfterLogout = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffCCookie1,
    })
    await check(
      'session revocation by logout: staff C works (200), logs out (200), and the same cookie is dead afterwards (403)',
      staffCControl.status === 200 && logout.status === 200 && staffCAfterLogout.status === 403,
    )
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [state.staffC],
    )
    const staffCAfterDbRevoke = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: staffCCookie2,
    })
    await check(
      'session revocation by the operator (session rows revoked): staff C\u2019s second live session stops authenticating (403)',
      staffCAfterDbRevoke.status === 403,
    )
    const expiredCookie = await session(state.staffC, new Date(Date.now() - 60_000))
    const expiredSessionRes = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: expiredCookie,
    })
    const rowlessCookie = await rowlessSession(state.owner)
    const rowlessRes = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: rowlessCookie,
    })
    await check(
      'an expired session row (403) and a correctly signed JWT with no session row behind it (403) are both denied',
      expiredSessionRes.status === 403 && rowlessRes.status === 403,
    )
    const forgedOwner = await forgedSession(state.owner, 'attacker-controlled-secret-0123456789')
    const forgedRes = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: forgedOwner,
    })
    const tamperedPayload = await (async () => {
      const [h, p] = staffNoneCookie.replace('renegade-passkey=', '').split('.')
      const decoded = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
      decoded.id = state.owner
      const body = Buffer.from(JSON.stringify(decoded)).toString('base64url')
      return `renegade-passkey=${h}.${body}.invalidsignature`
    })()
    const tamperedRes = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: tamperedPayload,
    })
    const garbageRes = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: 'renegade-passkey=not-a-jwt',
    })
    await check(
      'forged-secret owner token (403), tampered-payload token elevating a staff id to the owner id (403) and a garbage cookie (403) are all denied without a server error',
      forgedRes.status === 403 && tamperedRes.status === 403 && garbageRes.status === 403,
    )
    state.forgedCookie = forgedOwner
    await payload.update({
      collection: 'members',
      id: state.memberB,
      data: { status: 'suspended' },
      overrideAccess: true,
    })
    const memberBAfterSuspend = await api('/api/member-auth/sessions', { cookie: memberBCookie })
    await check(
      'member suspension (operator action): member B\u2019s live member session immediately stops authenticating (401)',
      memberBAfterSuspend.status === 401,
    )

    // ---- Final persistence --------------------------------------------------
    const finalSnapshot = await snapshotProtected()
    await check(
      'after the full negative battery, protected state is unchanged: Beta article/draft/media, Alpha article, Beta site and content/media counts all identical to the pre-battery snapshot',
      JSON.stringify(finalSnapshot) === JSON.stringify(state.before),
    )
    const usersNow = (
      await payload.find({
        collection: 'users',
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
    ).docs.map((u: any) => String(u.id))
    await check(
      'the only account change is the deliberate owner deletion of staff B; owner/staff A/staff C/unscoped staff/WebAuthn accounts all still exist',
      !usersNow.includes(String(state.staffB)) &&
        [state.owner, state.staffA, state.staffC, state.staffNone, state.waUser].every((id) =>
          usersNow.includes(String(id)),
        ),
    )
    await check(
      'secret canary sweep: the harness PAYLOAD_SECRET never appears in any response body',
      bodies.every((text) => !CANARIES.some((canary) => text.includes(canary))),
    )
  }

  if (restart) {
    const ownerAlive = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: state.ownerCookie,
    })
    const waAlive = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: state.waCookie,
    })
    await check(
      'restart: pre-restart owner session and the WebAuthn-issued session still authenticate after the web + PostgreSQL restart (200/200)',
      ownerAlive.status === 200 && waAlive.status === 200,
    )
    const staffAStillRevoked = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: state.staffACookie,
    })
    const memberBStillSuspended = await api('/api/member-auth/sessions', {
      cookie: `renegade-member=${state.memberBToken}`,
    })
    const forgedStillDenied = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: state.forgedCookie,
    })
    await check(
      'restart: the revoked grant (403), the suspended member (401) and the forged token (403) are all still denied after the restart',
      staffAStillRevoked.status === 403 &&
        memberBStillSuspended.status === 401 &&
        forgedStillDenied.status === 403,
    )
    const persistedSnapshot = await snapshotProtected()
    await check(
      'restart: protected state persisted across the restart, identical to the pre-battery snapshot',
      JSON.stringify(persistedSnapshot) === JSON.stringify(state.before),
    )
    await check(
      'restart: secret canary sweep — the harness PAYLOAD_SECRET never appears in any response body',
      bodies.every((text) => !CANARIES.some((canary) => text.includes(canary))),
    )
  }

  await stopWeb()
  console.log(`JOURNEY ${restart ? 'RESTART ' : ''}COMPLETE: ${trace.length} checks passed`)
  process.exit(0)
} catch (error) {
  console.error('JOURNEY FAILED:', error)
  await stopWeb().catch(() => {})
  process.exit(1)
}
