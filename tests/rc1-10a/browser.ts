/* eslint-disable @typescript-eslint/no-explicit-any -- isolated browser acceptance */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { getPayload } from 'payload'
import { Client } from 'pg'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { sink, sockets, messages } from '../rc1-09d/smtp-sink'
const expect = playwrightExpect.configure({ timeout: 60000 })

assert.equal(process.env.RC1_10A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5454/rc110a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/10A'
const base = 'http://localhost:39010'
const payload: any = await getPayload({ config })
let payloadClosed = false
async function closeVerificationPayload() {
  const pool = payload.db.pool
  // The pinned adapter's connectWithReconnect reserves a probe client without
  // releasing it. End only this isolated harness's quiescent, checked-out clients.
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients]) {
    if (idle.has(client)) continue
    assert.ok(!client.activeQuery, 'No verification query may be active during teardown')
    client.release(true)
  }
  await pool.end()
  assert.equal(pool.totalCount, 0)
  await payload.destroy()
  payloadClosed = true
}
if (process.argv.includes('--test-pool-close')) {
  await closeVerificationPayload()
  console.log('Isolated adapter pool teardown passed; zero connected clients.')
  process.exit(0)
}
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
async function until(name: string, fn: () => Promise<any>) {
  const end = Date.now() + 180000
  while (Date.now() < end) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out: ${name}`)
}
let web: ChildProcess | undefined
const nextEnv = await readFile('next-env.d.ts')
function startWeb(name: string) {
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      ...(process.env.RC1_10A_COMPILED === 'yes' ? ['start'] : ['dev', '--webpack']),
      '--hostname',
      '127.0.0.1',
      '--port',
      '39010',
    ],
    {
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const log = createWriteStream(`${out}/${name}.log`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
}
async function stopWeb() {
  if (!web || web.exitCode !== null) return
  const exited = new Promise<void>((r) => web!.once('exit', () => r()))
  await new Promise<void>((r) =>
    spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).once('exit', () => r()),
  )
  await exited
}
async function command(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (b) => {
      output += b
    })
    child.stderr.on('data', (b) => {
      output += b
    })
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(output))))
  })
}
const browser = await chromium.launch({ headless: true })
let activePage: any
const identities: any[] = []
let developmentReloadRetries = 0
const marker = Date.now().toString(36)
async function csrf(context: any) {
  return (await context.cookies()).find((c: any) => c.name === 'renegade-member-csrf')!.value
}
async function post(context: any, route: string, data: any, method = 'POST') {
  return context.request.fetch(`${base}${route}`, {
    method,
    data,
    headers: { 'x-member-csrf': await csrf(context), origin: base },
  })
}
try {
  const alpha = await payload.create({
    collection: 'sites',
    overrideAccess: true,
    data: {
      name: '10A Alpha',
      slug: `alpha10a-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
  })
  const beta = await payload.create({
    collection: 'sites',
    overrideAccess: true,
    data: {
      name: '10A Beta',
      slug: `beta10a-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'disabled',
    },
  })
  await payload.updateGlobal({
    slug: 'site-settings',
    overrideAccess: true,
    data: {
      canonicalOrigin: base,
      canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.example.test' },
    },
  })
  await new Promise<void>((r) => sink.listen(3142, '127.0.0.1', r))
  startWeb('web')
  await until('Next boot', async () => {
    try {
      return (await fetch(`${base}/api/health`)).status !== 502
    } catch {
      return false
    }
  })
  for (const route of [
    '/member-auth',
    '/member-auth/verify',
    '/members/settings',
    '/members',
    '/members/missing10a',
    '/api/member-auth/me',
    '/api/member-auth/profile',
    '/api/member-auth/export',
    '/api/member-auth/logout',
    '/api/member-auth/deactivate',
    '/api/member-auth/delete',
    '/api/member-auth/magic-link/request',
    '/api/member-auth/magic-link/complete',
    '/api/member-auth/passkey/register/options',
    '/api/member-auth/passkey/register/complete',
    '/api/member-auth/passkey/login/options',
    '/api/member-auth/passkey/login/complete',
    '/api/community/directory',
    '/api/community/profiles/missing10a',
    '/api/community/relationships',
    '/api/community/conversations',
    '/api/community/messages',
    '/api/community/comments',
    '/api/profiles',
    '/api/analytics/consent',
  ]) {
    const response = await fetch(`${base}${route}`)
    await response.arrayBuffer()
  }
  async function emailLogin(page: any, email: string) {
    const before = messages.length
    await page.goto(`${base}/member-auth`)
    await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeEnabled()
    const reject = page.getByRole('button', { name: /Reject|Necessary only/i })
    if (await reject.count()) await reject.first().click()
    await page.getByLabel('Email address', { exact: true }).fill(email)
    const response = page.waitForResponse(
      (r: any) => r.url().endsWith('/magic-link/request') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    assert.equal((await response).status(), 200)
    await until('local SMTP member link', async () =>
      messages.slice(before).some((m) => m.to === email),
    )
    const mime = messages
      .slice(before)
      .find((m) => m.to === email)!
      .raw.replace(/=\r\n/g, '')
      .replace(/=3D/g, '=')
    const token = /[?&]token=([^\s"<>]+)/.exec(mime)?.[1]
    assert.ok(token)
    await page.goto(`${base}/member-auth/verify?token=${encodeURIComponent(token)}`)
    await expect(page.getByRole('status')).toHaveText('Signed in.', { timeout: 60000 })
    await page.getByRole('link', { name: 'Member settings' }).click()
    await expect(page.getByRole('textbox', { name: 'Handle', exact: true })).toHaveValue(/member-/)
    return token
  }
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    activePage = page
    page.setDefaultTimeout(90000)
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
    const email = `rc110a-${marker}-${i}@example.test`
    const token = await emailLogin(page, email)
    const me = await (
      await context.request.get(`${base}/api/member-auth/me`, { timeout: 120000 })
    ).json()
    identities.push({ context, page, memberId: me.memberId, handle: me.profile.handle, email })
    check(
      `member ${i + 1}: ordinary email UI and captured SMTP link create a private canonical identity`,
      me.profile.visibility === 'private',
    )
    const replay = await context.request.post(`${base}/api/member-auth/magic-link/complete`, {
      data: { token },
    })
    check(`member ${i + 1}: consumed email link replay denied`, replay.status() === 400)
    await page
      .getByRole('textbox', { name: 'Display name', exact: true })
      .fill(`RC110A ${marker} ${i}`)
    await page
      .getByRole('textbox', { name: 'Bio', exact: true })
      .fill(`Private story ${marker} ${i}`)
    await page
      .getByLabel('Visibility', { exact: true })
      .selectOption(i === 2 ? 'private' : 'public')
    await page
      .getByLabel('Bio audience')
      .selectOption(i === 0 ? 'followers' : i === 1 ? 'private' : 'members')
    if (i === 1) await page.getByLabel('Do not list my profile in member search').check()
    await page.getByLabel('Locale', { exact: true }).fill('en-US')
    await page.getByLabel('Locale audience').selectOption('private')
    const saved = page.waitForResponse(
      (r: any) => r.url().endsWith('/member-auth/profile') && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    assert.equal((await saved).status(), 200)
    const own = await payload.find({
      collection: 'profiles',
      where: { member: { equals: me.memberId } },
      overrideAccess: true,
      depth: 0,
    })
    check(
      `member ${i + 1}: UI edits persist privacy, bio and locale with exactly one profile`,
      own.totalDocs === 1 &&
        own.docs[0].bio === `Private story ${marker} ${i}` &&
        own.docs[0].fieldAudience.locale === 'private',
    )
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Bio', exact: true })).toHaveValue(
      `Private story ${marker} ${i}`,
    )
    check(`member ${i + 1}: refetch renders persisted profile`, true)
    const enrolled = page.waitForResponse((r: any) =>
      r.url().endsWith('/passkey/register/complete'),
    )
    await page.getByRole('button', { name: 'Add a passkey' }).click()
    const registration = await enrolled
    assert.equal(registration.status(), 200, await registration.text())
    const badEnroll = await post(
      context,
      '/api/member-auth/passkey/register/complete',
      registration.request().postDataJSON(),
    )
    check(
      `member ${i + 1}: WebAuthn enrollment verified and challenge replay denied`,
      badEnroll.status() === 400,
    )
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(`${base}/member-auth`)
    check(
      `member ${i + 1}: ordinary sign-out revokes access`,
      (await context.request.get(`${base}/api/member-auth/me`)).status() === 401,
    )
    const loggedIn = page.waitForResponse((r: any) => r.url().endsWith('/passkey/login/complete'))
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    const login = await loggedIn
    assert.equal(login.status(), 200, await login.text())
    await expect(page).toHaveURL(`${base}/members/settings`)
    const returned = await (await context.request.get(`${base}/api/member-auth/me`)).json()
    const badLogin = await context.request.post(`${base}/api/member-auth/passkey/login/complete`, {
      data: login.request().postDataJSON(),
    })
    check(
      `member ${i + 1}: WebAuthn login returns same identity; challenge replay denied`,
      returned.memberId === me.memberId && badLogin.status() === 400,
    )
    const links = await payload.find({
      collection: 'linked-identities',
      where: { member: { equals: me.memberId } },
      overrideAccess: true,
      depth: 0,
    })
    check(
      `member ${i + 1}: email and passkey link to one member without admin cookies`,
      links.totalDocs === 2 &&
        !(await context.cookies()).some((c: any) => c.name === 'renegade-passkey'),
    )
  }
  const [a, b, c] = identities
  // Compile the valid profile's client boundary before directory result assertions.
  await b.page.goto(`${base}/members/${a.handle}`)
  await expect(b.page.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled()
  await b.page.goto(`${base}/members/settings`)
  await expect(b.page.getByRole('textbox', { name: 'Handle', exact: true })).toHaveValue(b.handle)
  const anon = await browser.newContext()
  const profileRoute = (handle: string, site = alpha.id) =>
    `${base}/api/community/profiles/${handle}?siteId=${site}`
  for (const [label, ctx] of [
    ['anonymous', anon],
    ['unrelated member', c.context],
  ] as const) {
    const response = await ctx.request.get(profileRoute(a.handle))
    const body = await response.json()
    check(
      `${label}: follower bio and private locale omitted`,
      response.status() === 200 && !('bio' in body.profile) && !('locale' in body.profile),
    )
    check(
      `${label}: private profile unavailable`,
      (
        await (label === 'anonymous' ? ctx : a.context).request.get(profileRoute(c.handle))
      ).status() === 404,
    )
    const onlyMe = await (await ctx.request.get(profileRoute(b.handle))).json()
    check(`${label}: public profile still hides only-me bio`, !('bio' in onlyMe.profile))
    check(
      `${label}: raw profiles unavailable`,
      (await ctx.request.get(`${base}/api/profiles?limit=1`)).status() === 403,
    )
  }
  check(
    'anonymous export requires authentication',
    (await anon.request.get(`${base}/api/member-auth/export`)).status() === 401,
  )
  check(
    'foreign member export denied',
    (
      await c.context.request.get(`${base}/api/member-auth/export?memberId=${a.memberId}`)
    ).status() === 403,
  )
  check(
    'cross-site profile request denied',
    (await c.context.request.get(profileRoute(a.handle, beta.id))).status() === 404,
  )
  check(
    'profile mutation without CSRF denied',
    (
      await a.context.request.patch(`${base}/api/member-auth/profile`, { data: { bio: 'forged' } })
    ).status() === 403,
  )
  check(
    'invalid profile link rejected',
    (
      await post(
        a.context,
        '/api/member-auth/profile',
        { links: [{ label: 'bad', url: 'javascript:alert(1)' }] },
        'PATCH',
      )
    ).status() === 400,
  )
  const directory = await anon.newPage()
  activePage = directory
  await directory.goto(`${base}/members`)
  await directory.getByLabel('Search members').fill(`RC110A ${marker}`)
  await directory.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(
    directory.getByRole('link', { name: `RC110A ${marker} 0`, exact: true }),
  ).toBeVisible()
  check(
    'directory UI lists public member while opt-out/private members are absent',
    (await directory.getByRole('link', { name: `RC110A ${marker} 1`, exact: true }).count()) ===
      0 &&
      (await directory.getByRole('link', { name: `RC110A ${marker} 2`, exact: true }).count()) ===
        0,
  )
  await directory.route('**/api/community/directory?**', (route: any) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Directory unavailable.' }),
    }),
  )
  await directory.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(directory.getByRole('status')).toHaveText('Directory unavailable.')
  check(
    'directory service error clears previous results',
    (await directory.getByRole('link', { name: `RC110A ${marker} 0`, exact: true }).count()) === 0,
  )
  await directory.unroute('**/api/community/directory?**')
  await directory.getByLabel('Search members').fill('nobody110a')
  await directory.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(async () => {
    if (
      (await directory.getByRole('status').textContent()) === 'Search by handle or display name.' &&
      (await directory.getByLabel('Search members').inputValue()) === '' &&
      developmentReloadRetries === 0
    ) {
      developmentReloadRetries++
      console.log('Retrying the same directory read once after development page reload.')
      await directory.getByLabel('Search members').fill('nobody110a')
      await directory.getByRole('button', { name: 'Search', exact: true }).click()
    }
    await expect(directory.getByRole('status')).toHaveText('No listed members found.', {
      timeout: 1000,
    })
  }).toPass({ timeout: 60000 })
  check('directory empty state is truthful', true)
  await b.page.goto(`${base}/members/${a.handle}`)
  await b.page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(b.page.getByRole('status')).toHaveText('Follow enabled.')
  const followed = await (await b.context.request.get(profileRoute(a.handle))).json()
  check(
    'ordinary follow UI authorizes follower bio',
    followed.profile.bio === `Private story ${marker} 0`,
  )
  const cross = await b.context.request.get(profileRoute(a.handle, beta.id), {
    headers: { host: 'beta.example.test' },
  })
  check(
    'same member on another host cannot reuse site-local follower permission',
    cross.status() === 200 && !('bio' in (await cross.json()).profile),
  )
  // Operator fixture session is used only for staff authorization negatives, never member enrollment.
  for (const [label, siteId] of [
    ['same-site staff', alpha.id],
    ['foreign-site staff', beta.id],
  ]) {
    const staffMember = await payload.create({
      collection: 'members',
      overrideAccess: true,
      data: { displayName: label, status: 'active' },
    })
    await payload.create({
      collection: 'member-site-roles',
      overrideAccess: true,
      data: { member: staffMember.id, site: siteId, role: 'community-manager' },
    })
    await payload.create({
      collection: 'member-site-roles',
      overrideAccess: true,
      data: { member: a.memberId, site: siteId, role: 'member' },
    })
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${label.replaceAll(' ', '-')}-${marker}@example.test`,
        role: 'staff',
        member: staffMember.id,
      },
    })
    const session = await createPasskeySession(
      user,
      process.env.PAYLOAD_SECRET!,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, user.id, expiresAt],
        )
      },
    )
    const headers = { cookie: `renegade-passkey=${session.token}; renegade-active-site=${siteId}` }
    const raw = await fetch(`${base}/api/profiles?limit=1`, { headers })
    const projected = await (await fetch(profileRoute(a.handle), { headers })).json()
    check(
      `${label}: raw profile denied even with target membership; projection omits private fields`,
      raw.status === 403 && !('bio' in projected.profile) && !('locale' in projected.profile),
    )
  }
  // Supported member API creates real conversation/message records for export, using no status mutation.
  const conv = await post(a.context, '/api/community/conversations', {
    siteId: alpha.id,
    targetMemberId: c.memberId,
  })
  assert.equal(conv.status(), 201, await conv.text())
  const conversation = (await conv.json()).conversation
  const msg = await post(a.context, '/api/community/messages', {
    siteId: alpha.id,
    conversationId: conversation.id,
    body: `Export message ${marker}`,
    idempotencyKey: `10a-${marker}`,
  })
  assert.equal(msg.status(), 201, await msg.text())
  const messageId = (await msg.json()).message.id
  const persistedMessage = await payload.db.pool.query(
    'SELECT body_html FROM messages WHERE id=$1',
    [messageId],
  )
  check(
    'supported message API persists actual authored content',
    persistedMessage.rows[0].body_html.includes(`Export message ${marker}`),
  )
  check(
    'unrelated member cannot read conversation',
    (
      await b.context.request.get(
        `${base}/api/community/messages?siteId=${alpha.id}&conversationId=${conversation.id}`,
      )
    ).status() === 403,
  )
  // A commentable content fixture supplies the target; the member action uses the supported API.
  const article = await payload.create({
    collection: 'content',
    overrideAccess: true,
    data: {
      site: alpha.id,
      title: `10A comment fixture ${marker}`,
      slug: `comment10a-${marker}`,
      contentType: 'article',
      status: 'draft',
      commentsPolicy: 'members',
    },
  })
  const comment = await post(a.context, '/api/community/comments', {
    siteId: alpha.id,
    attachedToId: article.id,
    attachedToCollection: 'content',
    body: `Export contribution ${marker}`,
  })
  assert.equal(comment.status(), 201, await comment.text())
  check(
    'supported comment API creates an owned contribution',
    Boolean((await comment.json()).comment),
  )
  await a.page.goto(`${base}/members/settings`)
  await expect(a.page.getByRole('textbox', { name: 'Handle', exact: true })).toHaveValue(a.handle)
  activePage = a.page
  const download = a.page.waitForEvent('download')
  await a.page.getByRole('button', { name: 'Export my data (JSON)' }).click()
  const downloaded = await download
  const exported = JSON.parse(await readFile((await downloaded.path())!, 'utf8'))
  check(
    'ordinary export UI downloads authored message and contribution',
    JSON.stringify(exported.conversations.messages).includes(`Export message ${marker}`) &&
      JSON.stringify(exported.legacyContributions).includes(`Export contribution ${marker}`),
  )
  const credentials = await payload.find({
    collection: 'linked-identities',
    where: { member: { equals: a.memberId } },
    overrideAccess: true,
    depth: 0,
  })
  const sessions = await payload.find({
    collection: 'member-sessions',
    where: { member: { equals: a.memberId } },
    overrideAccess: true,
    depth: 0,
  })
  const secrets = [
    ...credentials.docs.flatMap((doc: any) => [doc.externalSubject, doc.metadata?.publicKey]),
    ...sessions.docs.map((doc: any) => doc.tokenHash),
  ].filter(Boolean)
  const exportText = JSON.stringify(exported)
  check(
    'export excludes credential material and private storage keys',
    exported.scope.privateStorageKeys === 'not-included' &&
      !/tokenHash|publicKey|externalSubject|privateStorageKey/.test(
        JSON.stringify({ ...exported, scope: undefined }),
      ) &&
      secrets.length > 0 &&
      secrets.every((secret: string) => !exportText.includes(secret)),
  )
  check(
    'export and self-profile responses are private no-store',
    (await a.context.request.get(`${base}/api/member-auth/export`)).headers()['cache-control'] ===
      'private, no-store' &&
      (await a.context.request.get(`${base}/api/member-auth/me`)).headers()['cache-control'] ===
        'private, no-store',
  )
  await a.page.screenshot({ path: `${out}/member-settings.png`, fullPage: true })
  // Recovery by delivered email must reuse the enrolled identity.
  await a.page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(a.page).toHaveURL(`${base}/member-auth`)
  await emailLogin(a.page, a.email)
  check(
    'email recovery returns same member and one profile',
    (await (await a.context.request.get(`${base}/api/member-auth/me`)).json()).memberId ===
      a.memberId &&
      (
        await payload.find({
          collection: 'profiles',
          where: { member: { equals: a.memberId } },
          overrideAccess: true,
        })
      ).totalDocs === 1,
  )
  await c.page.goto(`${base}/members/settings`)
  await expect(c.page.getByRole('textbox', { name: 'Handle', exact: true })).toHaveValue(c.handle)
  await c.page.getByRole('button', { name: 'Deactivate account', exact: true }).click()
  await until(
    'deactivation persisted',
    async () =>
      (await payload.findByID({ collection: 'members', id: c.memberId, overrideAccess: true }))
        .status === 'deactivated',
  )
  check(
    'ordinary deactivation revokes self access and hides profile',
    (await c.context.request.get(`${base}/api/member-auth/me`)).status() === 401 &&
      (await anon.request.get(profileRoute(c.handle))).status() === 404,
  )
  check(
    'permanent deletion is explicitly unavailable and preserves records',
    (await anon.request.post(`${base}/api/member-auth/delete`)).status() === 410 &&
      (await payload.findByID({ collection: 'members', id: c.memberId, overrideAccess: true }))
        .status === 'deactivated',
  )
  const beforeRestart = await payload.db.pool.query(
    'SELECT id,member_id,handle,bio,visibility,field_audience FROM profiles ORDER BY id',
  )
  await stopWeb()
  await closeVerificationPayload()
  await command(['restart', 'rc110a-20261026'])
  await until('PostgreSQL restarted', async () => {
    try {
      await command(['exec', 'rc110a-20261026', 'pg_isready', '-U', 'postgres'])
      return true
    } catch {
      return false
    }
  })
  startWeb('web-restart')
  await until('Next restart', async () => {
    try {
      return (await fetch(`${base}/api/health`)).status !== 502
    } catch {
      return false
    }
  })
  const restartedDatabase = new Client({ connectionString: process.env.DATABASE_URL })
  await restartedDatabase.connect()
  const afterRestart = await restartedDatabase.query(
    'SELECT id,member_id,handle,bio,visibility,field_audience FROM profiles ORDER BY id',
  )
  await restartedDatabase.end()
  check(
    'actual PostgreSQL restart retains all three profiles and privacy settings exactly',
    JSON.stringify(beforeRestart.rows) === JSON.stringify(afterRestart.rows),
  )
  await a.page.goto(`${base}/members/settings`)
  await expect(a.page.getByRole('textbox', { name: 'Bio', exact: true })).toHaveValue(
    `Private story ${marker} 0`,
  )
  check('web restart retains authenticated UI access to owned profile', true)
  const restartedExport = await (
    await a.context.request.get(`${base}/api/member-auth/export`)
  ).json()
  check(
    'restart retains supported export and authored message',
    JSON.stringify(restartedExport.conversations.messages).includes(`Export message ${marker}`),
  )
  check(
    'restart retains deactivated account denial',
    (await c.context.request.get(`${base}/api/member-auth/me`)).status() === 401,
  )
  await a.page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(a.page).toHaveURL(`${base}/member-auth`)
  await a.page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  await expect(a.page).toHaveURL(`${base}/members/settings`)
  check(
    'fresh WebAuthn login after web/database restart returns the same member',
    (await (await a.context.request.get(`${base}/api/member-auth/me`)).json()).memberId ===
      a.memberId,
  )
  await c.page.goto(`${base}/member-auth`)
  const disabledLogin = c.page.waitForResponse((r: any) =>
    r.url().endsWith('/passkey/login/complete'),
  )
  await c.page.getByRole('button', { name: 'Sign in with a passkey' }).click()
  check(
    'deactivated member cannot use an enrolled passkey after restart',
    (await disabledLogin).status() === 400 &&
      (await c.context.request.get(`${base}/api/member-auth/me`)).status() === 401,
  )
  await b.page.goto(`${base}/members/${a.handle}`)
  await b.page.getByRole('button', { name: 'Block', exact: true }).click()
  await until(
    'block projection denial',
    async () => (await b.context.request.get(profileRoute(a.handle))).status() === 404,
  )
  const blockedDirectory = await (
    await b.context.request.get(`${base}/api/community/directory?siteId=${alpha.id}&q=RC110A`)
  ).json()
  check(
    'ordinary block UI hides profile and directory entry',
    !blockedDirectory.profiles.some((p: any) => p.memberId === a.memberId),
  )
  await writeFile(
    `${out}/state.json`,
    JSON.stringify(
      {
        alpha: alpha.id,
        beta: beta.id,
        members: identities.map(({ memberId, handle }) => ({ memberId, handle })),
        conversationId: conversation.id,
        messageId,
        marker,
        authMode:
          'test auth disabled; real WebAuthn protocol with Chromium virtual CTAP2 authenticator',
        delivery: 'loopback SMTP only',
        smtpDeliveries: messages.length,
        developmentReloadRetries,
      },
      null,
      2,
    ),
  )
} catch (error) {
  trace.push({ passed: false, error: String(error) })
  console.error(error)
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(`${out}/trace.json`, JSON.stringify(trace, null, 2))
  await browser.close()
  await stopWeb()
  for (const socket of sockets) socket.destroy()
  if (sink.listening) await new Promise<void>((r) => sink.close(() => r()))
  // Restore only the dev-generated declaration, conditional on its known isolated path.
  const generated = await readFile('next-env.d.ts', 'utf8')
  if (generated.includes('.next-rc110a')) await writeFile('next-env.d.ts', nextEnv)
  if (!payloadClosed) await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
