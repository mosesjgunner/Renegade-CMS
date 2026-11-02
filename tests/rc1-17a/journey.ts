/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'
import { createServer } from 'node:http'
import { getPayload } from 'payload'
import config from '../../src/payload.config'

const root = 'docs/rc/evidence/rc1/18-pass/17A'
const scratch = 'scratch/rc117a'
const origin = 'http://localhost:39170'
assert.ok(
  [
    '/rc117a_release_acceptance',
    '/rc117a_final_release_acceptance',
    '/rc117a_confirmation_release_acceptance',
    '/rc117a_delivery_release_acceptance',
    '/rc117a_verified_release_acceptance',
  ].includes(new URL(process.env.DATABASE_URL!).pathname),
)
assert.equal(process.env.APP_URL, origin)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
await mkdir(root, { recursive: true })
const payload = await getPayload({ config })
const pool = (payload.db as any).pool
const browser = await chromium.launch({ headless: true })
const trace: any[] = []
const restart = process.argv.includes('--restart')
const resume = process.argv.includes('--resume')
async function check(name: string, action: () => Promise<any>) {
  try {
    const detail = await action()
    trace.push({ name, passed: true, detail })
    console.log(`PASS ${trace.length}: ${name}`)
  } catch (error) {
    trace.push({ name, passed: false, error: String(error) })
    throw error
  } finally {
    await writeFile(
      `${root}/${restart ? 'restart' : 'journey'}.json`,
      JSON.stringify(trace, null, 2),
    )
  }
}
async function actor(storage?: string) {
  const context = await browser.newContext(storage ? { storageState: storage } : {})
  await context.addInitScript('window.__name = (fn) => fn')
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await page.goto(`${origin}/api/setup/readiness`, { waitUntil: 'load', timeout: 180000 })
  return { context, page, cdp, authenticatorId }
}
async function api(
  page: Page,
  path: string,
  data?: any,
  method = data === undefined ? 'GET' : 'POST',
  headers = {},
) {
  return page.evaluate(
    async ({ path, data, method, headers }) => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      })
      const text = await response.text()
      let body: any
      try {
        body = JSON.parse(text)
      } catch {
        body = text.slice(0, 200)
      }
      return { status: response.status, body }
    },
    { path, data, method, headers },
  )
}
async function credential(page: Page, options: any, register: boolean) {
  return page.evaluate(
    async ({ options, register }) => {
      const bytes = (s: string) =>
        Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const b64 = (b: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(b)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      const publicKey = { ...options, challenge: bytes(options.challenge) }
      if (register) publicKey.user = { ...options.user, id: bytes(options.user.id) }
      for (const field of ['allowCredentials', 'excludeCredentials'])
        if (options[field])
          publicKey[field] = options[field].map((c: any) => ({ ...c, id: bytes(c.id) }))
      const c = (
        register
          ? await navigator.credentials.create({ publicKey })
          : await navigator.credentials.get({ publicKey })
      ) as PublicKeyCredential
      const r = c.response as any
      return {
        id: c.id,
        rawId: b64(c.rawId),
        type: c.type,
        clientExtensionResults: c.getClientExtensionResults(),
        response: {
          clientDataJSON: b64(r.clientDataJSON),
          ...(register
            ? { attestationObject: b64(r.attestationObject), transports: r.getTransports() }
            : {
                authenticatorData: b64(r.authenticatorData),
                signature: b64(r.signature),
                userHandle: r.userHandle ? b64(r.userHandle) : undefined,
              }),
        },
      }
    },
    { options, register },
  )
}
const digest = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function protectedState() {
  const state: any = {}
  for (const table of [
    'sites',
    'content',
    'publications',
    'media_assets',
    'media_blobs',
    'profiles',
    'site_settings',
    'users',
    'member_site_roles',
    'passkeys',
    'linked_identities',
  ]) {
    state[table] = (
      await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY id`)
    ).rows.map((r: any) => r.value)
  }
  state.mediaFiles = []
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const path = directory + '/' + entry.name
      if (entry.isDirectory()) await walk(path)
      else
        state.mediaFiles.push({
          path,
          sha256: createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        })
    }
  }
  await walk(process.env.MEDIA_DIR!)
  return digest(state)
}
async function denied(
  page: Page,
  name: string,
  path: string,
  data: any,
  method: string,
  codes: number[],
) {
  await check(name, async () => {
    const before = await protectedState()
    const sessionsBefore = Number(
      (
        await pool.query(
          'SELECT (SELECT count(*) FROM admin_sessions)+(SELECT count(*) FROM member_sessions) n',
        )
      ).rows[0].n,
    )
    const result = await api(page, path, data, method)
    assert.ok(
      codes.includes(result.status),
      `${result.status} ${JSON.stringify(result.body).slice(0, 300)}`,
    )
    const after = await protectedState()
    assert.equal(after, before)
    assert.equal(
      Number(
        (
          await pool.query(
            'SELECT (SELECT count(*) FROM admin_sessions)+(SELECT count(*) FROM member_sessions) n',
          )
        ).rows[0].n,
      ),
      sessionsBefore,
    )
    const requestPayload = data?.credential
      ? { credential: '[REDACTED signed assertion]', challengeToken: '[REDACTED one-use token]' }
      : data?.response?.clientDataJSON
        ? {
            type: data.type,
            clientDataFields: Object.keys(
              JSON.parse(Buffer.from(data.response.clientDataJSON, 'base64url').toString()),
            ),
            credential: '[REDACTED signed assertion]',
          }
        : data
    return {
      method,
      path,
      requestPayload,
      payloadClass: data === undefined ? 'object-id substitution/read' : Object.keys(data),
      status: result.status,
      serverResponse: result.body,
      sessionsBefore,
      before,
      after,
    }
  })
}
try {
  if (restart) {
    const state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
    const owner = await actor(`${scratch}/owner.json`)
    const staff = await actor(`${scratch}/staff.json`)
    await check('restart preserves protected state', async () => {
      assert.equal(await protectedState(), state.digest)
      return { digest: state.digest }
    })
    await check('owner persisted session reads site A after restart', async () => {
      assert.equal((await api(owner.page, `/api/sites/${state.siteA}`)).status, 200)
    })
    await denied(
      staff.page,
      'revoked staff session stays denied after restart',
      '/api/admin/staff/invite',
      { email: 'forbidden@rc117a.test', siteId: state.siteA },
      'POST',
      [403],
    )
    await check('post-restart CSRF denial', async () => {
      const before = await protectedState()
      const result = await owner.context.request.patch(`${origin}/api/sites/${state.siteB}`, {
        headers: { origin: 'http://attacker.test' },
        data: { name: 'forbidden' },
      })
      assert.equal(result.status(), 403)
      assert.equal(await protectedState(), before)
      return { status: 403, before, after: await protectedState() }
    })
    const member = await actor(`${scratch}/member.json`)
    await denied(
      member.page,
      'member revoked cookie remains denied after restart',
      '/api/member-auth/me',
      undefined,
      'GET',
      [401],
    )
    await check(
      'owner real passkey still authenticates after database and web restart',
      async () => {
        const credentials = JSON.parse(await readFile(`${scratch}/owner-credentials.json`, 'utf8'))
        for (const c of credentials.credentials)
          await owner.cdp.send('WebAuthn.addCredential', {
            authenticatorId: owner.authenticatorId,
            credential: c,
          })
        const options = await api(owner.page, '/api/auth/passkey/options', {
          email: 'owner@rc117a.test',
        })
        const signed = await credential(owner.page, options.body.options, false)
        assert.equal((await api(owner.page, '/api/auth/passkey/complete', signed)).status, 200)
        return { status: 200, freshSignedAssertion: true }
      },
    )
  } else {
    const owner = await actor(resume ? `${scratch}/owner.json` : undefined)
    if (!resume)
      await owner.page.goto(`${origin}/setup`, { waitUntil: 'networkidle', timeout: 180000 })
    const logs = await readFile(`${scratch}/web.stderr.log`, 'utf8')
    const token = [
      ...logs.matchAll(/setup token \(expires in 15 minutes; use once\): ([A-Za-z0-9_-]{43})/g),
    ].at(-1)?.[1]
    await owner.page.goto(`${origin}/api/setup/readiness`)
    if (!resume) assert.ok(token, 'bootstrap token from supported operator log')
    if (!resume) {
      await check('ordinary setup API with Chromium CTAP2 creates owner and site', async () => {
        const options = await api(owner.page, '/api/setup/options', {
          email: 'owner@rc117a.test',
          token,
        })
        assert.equal(options.status, 200)
        const c = await credential(owner.page, options.body.options, true)
        const result = await api(owner.page, '/api/setup/complete', {
          credential: c,
          onboarding: {
            name: '17A Alpha',
            slug: 'rc117a-alpha',
            description: '',
            primaryUrl: origin,
            locale: 'en',
            timezone: 'America/Chicago',
            themeId: 'neutral-starter',
            starterType: 'blank-minimal',
            featureProfile: 'Standard',
            optionalConnections: [],
            starterContent: false,
          },
        })
        assert.equal(result.status, 201, JSON.stringify(result.body))
        assert.equal(
          (await pool.query('SELECT count(*)::int AS n FROM admin_sessions')).rows[0].n,
          1,
        )
        await owner.context.storageState({ path: `${scratch}/owner.json` })
        await writeFile(
          `${scratch}/owner-credentials.json`,
          JSON.stringify(
            await owner.cdp.send('WebAuthn.getCredentials', {
              authenticatorId: owner.authenticatorId,
            }),
          ),
        )
        return { status: result.status, persistedSessions: 1 }
      })
    }
    const siteA = (await api(owner.page, '/api/sites?where[slug][equals]=rc117a-alpha&depth=0'))
      .body.docs[0].id
    let siteB: string
    if (resume)
      siteB = (await api(owner.page, '/api/sites?where[slug][equals]=rc117a-beta&depth=0')).body
        .docs[0].id
    else
      await check(
        'owner supported REST creates second site and observes persisted result',
        async () => {
          const result = await api(owner.page, '/api/sites', {
            name: '17A Beta',
            slug: 'rc117a-beta',
            host: 'beta.rc117a.test',
            status: 'active',
          })
          assert.equal(result.status, 201, JSON.stringify(result.body))
          siteB = result.body.doc.id
          assert.equal(
            (await pool.query('SELECT name FROM sites WHERE id=$1', [siteB])).rows[0].name,
            '17A Beta',
          )
          return { status: 201, siteB }
        },
      )
    const staff = await actor(resume ? `${scratch}/staff.json` : undefined)
    let staffId: string
    if (resume) {
      staffId = (
        await payload.find({
          collection: 'users',
          where: { email: { equals: 'staff@rc117a.test' } },
          depth: 0,
        })
      ).docs[0].id
      const credentials = JSON.parse(await readFile(`${scratch}/staff-credentials.json`, 'utf8'))
      for (const c of credentials.credentials)
        await staff.cdp.send('WebAuthn.addCredential', {
          authenticatorId: staff.authenticatorId,
          credential: c,
        })
    } else
      await check('owner invitation, staff browser passkey enrollment and login', async () => {
        const invited = await api(owner.page, '/api/admin/staff/invite', {
          email: 'staff@rc117a.test',
          siteId: siteA,
        })
        assert.equal(invited.status, 201, JSON.stringify(invited.body))
        staffId = invited.body.user.id
        await staff.page.goto(invited.body.enrollmentUrl)
        await staff.page.getByRole('button', { name: /Register Hardware Passkey/ }).click()
        await staff.page
          .getByRole('status')
          .filter({ hasText: 'Passkey registered successfully' })
          .waitFor({ timeout: 180000 })
        await staff.page.goto(`${origin}/api/setup/readiness`)
        const options = await api(staff.page, '/api/auth/passkey/options', {
          email: 'staff@rc117a.test',
        })
        const signed = await credential(staff.page, options.body.options, false)
        assert.equal((await api(staff.page, '/api/auth/passkey/complete', signed)).status, 200)
        await staff.context.storageState({ path: `${scratch}/staff.json` })
        await writeFile(
          `${scratch}/staff-credentials.json`,
          JSON.stringify(
            await staff.cdp.send('WebAuthn.getCredentials', {
              authenticatorId: staff.authenticatorId,
            }),
          ),
        )
        assert.equal(
          (await pool.query('SELECT count(*)::int n FROM passkeys WHERE user_id=$1', [staffId]))
            .rows[0].n,
          1,
        )
        return { persistedPasskeys: 1, staffId }
      })
    // Distinct foreign identity is legitimately invited by the owner, without fabricated sessions.
    const foreign = await api(owner.page, '/api/admin/staff/invite', {
      email: 'foreign@rc117a.test',
      siteId: siteB!,
    })
    assert.equal(foreign.status, 201)
    await check('staff reads authorized site A', async () => {
      assert.equal((await api(staff.page, `/api/sites/${siteA}`)).status, 200)
    })
    await denied(
      staff.page,
      'staff cannot read foreign operator identity',
      `/api/users/${foreign.body.user.id}?depth=0`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      staff.page,
      'staff cannot read foreign site',
      `/api/sites/${siteB!}?depth=0`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      staff.page,
      'staff cannot mutate foreign site',
      `/api/sites/${siteB!}`,
      { name: 'hijacked' },
      'PATCH',
      [403, 404],
    )
    await denied(
      staff.page,
      'staff cannot escalate own role',
      `/api/users/${staffId!}`,
      { role: 'owner' },
      'PATCH',
      [403],
    )
    await denied(
      staff.page,
      'staff cannot invite operator',
      '/api/admin/staff/invite',
      { email: 'evil@rc117a.test', siteId: siteA },
      'POST',
      [403],
    )
    const anon = await actor()
    for (const site of [siteA, siteB!]) {
      await denied(
        anon.page,
        'anonymous cannot enumerate operator site ' + site,
        `/api/sites/${site}`,
        undefined,
        'GET',
        [401, 403, 404],
      )
    }
    await denied(
      anon.page,
      'anonymous cannot mutate foreign site B',
      `/api/sites/${siteB!}`,
      { name: 'hijacked' },
      'PATCH',
      [401, 403],
    )
    await denied(
      anon.page,
      'anonymous cannot read operator',
      `/api/users/${staffId!}`,
      undefined,
      'GET',
      [401, 403, 404],
    )
    await denied(
      anon.page,
      'anonymous cannot mutate settings',
      `/api/sites/${siteA}`,
      { name: 'hijacked' },
      'PATCH',
      [401, 403],
    )
    let privatePublication: string
    await check('owner creates a private draft publication through REST', async () => {
      const result = await api(owner.page, '/api/publications', {
        site: siteB!,
        name: '17A private publication',
        slug: 'private-publication',
        status: 'draft',
        visibility: 'private',
      })
      assert.equal(result.status, 201, JSON.stringify(result.body))
      privatePublication = result.body.doc.id
      assert.equal(
        (await payload.findByID({ collection: 'publications', id: privatePublication, depth: 0 }))
          .visibility,
        'private',
      )
      return { status: 201, publicationId: privatePublication }
    })
    await denied(
      staff.page,
      'foreign private publication id substitution',
      `/api/publications/${privatePublication!}`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      anon.page,
      'anonymous private draft publication',
      `/api/publications/${privatePublication!}`,
      undefined,
      'GET',
      [403, 404],
    )
    await check('public publication stays available while private draft is omitted', async () => {
      const result = await api(anon.page, '/api/publications?depth=0')
      assert.equal(result.status, 200)
      assert.ok(result.body.docs.length >= 2)
      assert.ok(
        result.body.docs.every((p: any) => p.status === 'active' && p.visibility === 'public'),
      )
      assert.ok(!result.body.docs.some((p: any) => p.id === privatePublication!))
      return { status: 200, visiblePublications: result.body.docs.length, privateDraftAbsent: true }
    })
    let draftB: string
    await check('owner creates protected draft through native REST', async () => {
      const result = await api(owner.page, '/api/content', {
        site: siteB!,
        title: '17A private draft',
        slug: `rc117a-private-${Date.now()}`,
        contentType: 'article',
        status: 'draft',
        visibility: 'private',
      })
      assert.equal(result.status, 201, JSON.stringify(result.body))
      draftB = result.body.doc.id
      assert.equal(
        (await payload.findByID({ collection: 'content', id: draftB, depth: 0 })).title,
        '17A private draft',
      )
      return { status: 201, contentId: draftB }
    })
    await denied(
      staff.page,
      'foreign draft id read substitution',
      `/api/content/${draftB!}`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      staff.page,
      'foreign draft write substitution',
      `/api/content/${draftB!}`,
      { site: siteA, title: 'hijacked' },
      'PATCH',
      [403, 404],
    )
    await denied(
      anon.page,
      'anonymous private draft read',
      `/api/content/${draftB!}`,
      undefined,
      'GET',
      [401, 403, 404],
    )
    // Ordinary operator creates actual private resources; hostile clients swap the object id/site hint.
    const assets: string[] = []
    for (const [index, site] of [siteA, siteB!].entries()) {
      await check(`owner uploads private original for site ${index ? 'B' : 'A'}`, async () => {
        const bytes = Buffer.from('%PDF-1.4\n17A private document\n%%EOF')
        const result = await owner.context.request.post(`${origin}/api/media/upload`, {
          multipart: {
            siteId: site,
            title: `17A private ${index}`,
            file: { name: 'private.pdf', mimeType: 'application/pdf', buffer: bytes },
          },
        })
        assert.equal(result.status(), 201, await result.text())
        const body = await result.json()
        assets.push(body.asset.id)
        const persisted = await payload.findByID({
          collection: 'media-assets',
          id: body.asset.id,
          depth: 0,
        })
        assert.equal(persisted.site, site)
        assert.equal(
          persisted.checksum,
          'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        )
        return { status: 201, assetId: body.asset.id, checksum: persisted.checksum }
      })
    }
    await denied(
      staff.page,
      'foreign private media object with authorized site hint',
      `/api/media/${assets[1]}?siteId=${siteA}`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      staff.page,
      'foreign private media metadata substitution',
      `/api/media/${assets[1]}`,
      { siteId: siteA, title: 'hijacked' },
      'PATCH',
      [403, 404],
    )
    await denied(
      staff.page,
      'private media cannot be reassigned across sites',
      `/api/media-assets/${assets[0]}`,
      { site: siteB! },
      'PATCH',
      [403, 404],
    )
    await denied(
      anon.page,
      'anonymous cannot read private media metadata',
      `/api/media/${assets[0]}?siteId=${siteA}`,
      undefined,
      'GET',
      [401, 403, 404],
    )
    await check('authorized owner retrieves exact private original bytes', async () => {
      const response = await owner.context.request.get(`${origin}/media/${assets[1]}`)
      assert.equal(response.status(), 200)
      assert.equal(
        createHash('sha256')
          .update(await response.body())
          .digest('hex'),
        createHash('sha256').update('%PDF-1.4\n17A private document\n%%EOF').digest('hex'),
      )
      assert.match(response.headers()['cache-control'], /private/)
      return { status: 200, bytes: (await response.body()).length }
    })
    await denied(
      staff.page,
      'foreign private original byte substitution',
      `/media/${assets[1]}`,
      undefined,
      'GET',
      [404],
    )
    await denied(
      anon.page,
      'anonymous private original bytes',
      `/media/${assets[1]}`,
      undefined,
      'GET',
      [404],
    )
    const memberActor = await actor()
    await check('member receives local SMTP link and obtains ordinary member session', async () => {
      // Enable ordinary registration through the authenticated operator endpoint.
      assert.equal(
        (
          await api(
            owner.page,
            `/api/sites/${siteA}`,
            { communityRegistrationPolicy: 'open' },
            'PATCH',
          )
        ).status,
        200,
      )
      const requested = await api(memberActor.page, '/api/member-auth/magic-link/request', {
        email: 'member@rc117a.test',
      })
      assert.equal(requested.status, 200)
      const inbox = (await (await fetch('http://127.0.0.1:39172/api/v1/messages')).json()) as any
      const message = inbox.messages.find((m: any) =>
        m.To.some((r: any) => r.Address === 'member@rc117a.test'),
      )
      assert.ok(message, 'local SMTP delivery observed')
      const detail = (await (
        await fetch(`http://127.0.0.1:39172/api/v1/message/${message.ID}`)
      ).json()) as any
      const link = /http:\/\/localhost:39170\/member-auth\/verify\?token=([^\s]+)/.exec(detail.Text)
      assert.ok(link)
      assert.equal(
        (await api(memberActor.page, '/api/member-auth/magic-link/complete', { token: link[1] }))
          .status,
        200,
      )
      assert.equal((await api(memberActor.page, '/api/member-auth/me')).status, 200)
      return { localSmtp: true, status: 200 }
    })
    for (const site of [siteA, siteB!]) {
      await denied(
        memberActor.page,
        'member cannot read operator site ' + site,
        `/api/sites/${site}`,
        undefined,
        'GET',
        [401, 403, 404],
      )
      await denied(
        memberActor.page,
        'member cannot mutate operator site ' + site,
        `/api/sites/${site}`,
        { name: 'hijacked' },
        'PATCH',
        [401, 403],
      )
    }
    await denied(
      memberActor.page,
      'member cannot substitute foreign private object',
      `/api/media/${assets[1]}?siteId=${siteA}`,
      undefined,
      'GET',
      [401, 403, 404],
    )
    await denied(
      memberActor.page,
      'member profile CSRF token omission',
      '/api/member-auth/profile',
      { bio: 'hijacked' },
      'PATCH',
      [403],
    )
    await check('member registers a genuine Chromium passkey through supported API', async () => {
      const csrf = (await memberActor.context.cookies()).find(
        (c) => c.name === 'renegade-member-csrf',
      )!.value
      const options = await api(
        memberActor.page,
        '/api/member-auth/passkey/register/options',
        {},
        'POST',
        { 'x-member-csrf': csrf },
      )
      assert.equal(options.status, 200)
      const signed = await credential(memberActor.page, options.body.options, true)
      const result = await api(
        memberActor.page,
        '/api/member-auth/passkey/register/complete',
        { challengeToken: options.body.challengeToken, credential: signed },
        'POST',
        { 'x-member-csrf': csrf },
      )
      assert.equal(result.status, 200)
      return {
        status: 200,
        persistedIdentities: (
          await payload.count({
            collection: 'linked-identities',
            where: { providerKey: { equals: 'renegade-passkey' } },
          })
        ).totalDocs,
      }
    })
    const memberLogin = async () => {
      const options = await api(memberActor.page, '/api/member-auth/passkey/login/options', {})
      assert.equal(options.status, 200)
      return {
        challengeToken: options.body.challengeToken,
        credential: await credential(memberActor.page, options.body.options, false),
      }
    }
    for (const [name, change] of [
      ['origin', { origin: 'https://attacker.test' }],
      ['challenge', { challenge: 'invalid-challenge' }],
    ] as const) {
      const input = await memberLogin()
      const data = JSON.parse(
        Buffer.from(input.credential.response.clientDataJSON, 'base64url').toString(),
      )
      input.credential.response.clientDataJSON = Buffer.from(
        JSON.stringify({ ...data, ...change }),
      ).toString('base64url')
      await denied(
        memberActor.page,
        `member WebAuthn wrong ${name}`,
        '/api/member-auth/passkey/login/complete',
        input,
        'POST',
        [400],
      )
    }
    const expiredMember = await memberLogin()
    const expiredToken = await pool.query(
      "UPDATE identity_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [createHash('sha256').update(expiredMember.challengeToken).digest('base64url')],
    )
    assert.equal(expiredToken.rowCount, 1)
    await denied(
      memberActor.page,
      'member WebAuthn expired challenge',
      '/api/member-auth/passkey/login/complete',
      expiredMember,
      'POST',
      [400],
    )
    const validMember = await memberLogin()
    await check('member signed login creates a persisted passkey session', async () => {
      assert.equal(
        (await api(memberActor.page, '/api/member-auth/passkey/login/complete', validMember))
          .status,
        200,
      )
      assert.ok(
        Number(
          (await pool.query("SELECT count(*) n FROM member_sessions WHERE created_from='passkey'"))
            .rows[0].n,
        ) > 0,
      )
    })
    await denied(
      memberActor.page,
      'member WebAuthn replay',
      '/api/member-auth/passkey/login/complete',
      validMember,
      'POST',
      [400],
    )
    await check('member revoke-all persists revocation of genuine sessions', async () => {
      const cookies = await memberActor.context.cookies()
      const csrf = cookies.find((c) => c.name === 'renegade-member-csrf')!.value
      await memberActor.context.storageState({ path: `${scratch}/member.json` })
      assert.equal(
        (
          await api(memberActor.page, '/api/member-auth/sessions/revoke-all', {}, 'POST', {
            'x-member-csrf': csrf,
          })
        ).status,
        200,
      )
      await memberActor.context.addCookies(cookies)
      return { status: 200, replayingPreviouslyIssuedCookie: true }
    })
    await denied(
      memberActor.page,
      'member revoked cookie replay',
      '/api/member-auth/me',
      undefined,
      'GET',
      [401],
    )
    // Genuine signed browser assertions, mutated only after the authenticator response.
    const loginOptions = async () =>
      (await api(anon.page, '/api/auth/passkey/options', { email: 'staff@rc117a.test' })).body
        .options
    const creds = await staff.cdp.send('WebAuthn.getCredentials', {
      authenticatorId: staff.authenticatorId,
    })
    for (const c of creds.credentials)
      await anon.cdp.send('WebAuthn.addCredential', {
        authenticatorId: anon.authenticatorId,
        credential: c,
      })
    for (const [name, change] of [
      ['origin', { origin: 'https://attacker.test' }],
      ['challenge', { challenge: 'invalid-challenge' }],
    ] as const) {
      const c = await credential(anon.page, await loginOptions(), false)
      const data = JSON.parse(Buffer.from(c.response.clientDataJSON, 'base64url').toString())
      c.response.clientDataJSON = Buffer.from(JSON.stringify({ ...data, ...change })).toString(
        'base64url',
      )
      await denied(anon.page, `WebAuthn wrong ${name}`, '/api/auth/passkey/complete', c, 'POST', [
        400,
      ])
    }
    const expired = await credential(anon.page, await loginOptions(), false)
    await pool.query(
      "UPDATE passkeys SET login_expires_at=now()-interval '1 second' WHERE user_id=$1",
      [staffId!],
    )
    await denied(
      anon.page,
      'WebAuthn expired challenge',
      '/api/auth/passkey/complete',
      expired,
      'POST',
      [400],
    )
    const valid = await credential(anon.page, await loginOptions(), false)
    assert.equal((await api(anon.page, '/api/auth/passkey/complete', valid)).status, 200)
    await denied(
      anon.page,
      'WebAuthn signed assertion replay',
      '/api/auth/passkey/complete',
      valid,
      'POST',
      [400],
    )
    // API client supplies hostile browser Origin while transmitting the actual owner cookie.
    await check('authenticated cross-origin CSRF leaves state unchanged', async () => {
      const before = await protectedState()
      const response = await owner.context.request.patch(`${origin}/api/sites/${siteB!}`, {
        headers: { origin: 'http://attacker.test' },
        data: { name: 'hijacked' },
      })
      assert.equal(response.status(), 403)
      assert.equal(await protectedState(), before)
      return {
        status: 403,
        before,
        after: await protectedState(),
        payloadClass: 'foreign Origin + valid owner cookie',
      }
    })
    await check('real cross-origin browser sends owner cookie and is denied', async () => {
      const sockets = new Set<import('node:net').Socket>()
      const server = createServer((_request, response) => {
        response.setHeader('content-type', 'text/html')
        response.end('<!doctype html><title>17A local hostile origin</title>')
      })
      server.on('connection', (socket) => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
      })
      await new Promise<void>((resolve) => server.listen(39173, '127.0.0.1', resolve))
      const page = await owner.context.newPage()
      try {
        const before = await protectedState()
        await page.goto('http://localhost:39173')
        const cdp = await owner.context.newCDPSession(page)
        await cdp.send('Network.enable')
        const requests: any[] = []
        const responses: any[] = []
        cdp.on('Network.requestWillBeSentExtraInfo', (e) => requests.push(e))
        cdp.on('Network.responseReceivedExtraInfo', (e) => responses.push(e))
        await page.evaluate(async (origin) => {
          await fetch(origin + '/api/admin/staff/invite', {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'include',
            headers: { 'content-type': 'text/plain' },
            body: '{"email":"evil@rc117a.test"}',
          })
        }, origin)
        const sent = requests.find((e) =>
          Object.entries(e.headers).some(
            ([name, value]) =>
              name.toLowerCase() === 'origin' && value === 'http://localhost:39173',
          ),
        )
        assert.ok(sent, 'CDP observes actual hostile Origin')
        assert.ok(
          Object.entries(sent.headers).some(
            ([name, value]) =>
              name.toLowerCase() === 'cookie' && String(value).includes('renegade-passkey='),
          ),
          'CDP observes actual owner cookie transmission',
        )
        assert.equal(responses.find((e) => e.requestId === sent.requestId)?.statusCode, 403)
        assert.equal(await protectedState(), before)
        return {
          status: 403,
          actualOrigin: 'http://localhost:39173',
          actualCookieTransmitted: true,
          before,
          after: await protectedState(),
          payloadClass:
            'cross-origin same-site browser fetch POST text/plain; credentials include; no-cors',
        }
      } finally {
        await page.close()
        for (const socket of sockets) socket.destroy()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
    const memberId = (await payload.findByID({ collection: 'users', id: staffId!, depth: 0 }))
      .member
    const member = typeof memberId === 'string' ? memberId : memberId!.id
    await check('owner changes staff account to scoped owner through REST', async () => {
      assert.equal(
        (await api(owner.page, `/api/users/${staffId!}`, { role: 'owner' }, 'PATCH')).status,
        200,
      )
      assert.equal(
        (await payload.findByID({ collection: 'users', id: staffId!, depth: 0 })).role,
        'owner',
      )
      assert.equal((await api(staff.page, `/api/sites/${siteA}`)).status, 200)
    })
    await denied(
      staff.page,
      'scoped owner cannot change foreign global account role',
      `/api/users/${foreign.body.user.id}`,
      { role: 'owner' },
      'PATCH',
      [403],
    )
    await denied(
      staff.page,
      'scoped owner cannot grant self foreign site',
      '/api/member-site-roles',
      { member, site: siteB!, role: 'community-manager' },
      'POST',
      [403],
    )
    await denied(
      staff.page,
      'scoped owner cannot delete foreign site',
      `/api/sites/${siteB!}`,
      undefined,
      'DELETE',
      [403, 404],
    )
    await denied(
      staff.page,
      'scoped owner cannot provision another tenant',
      '/api/sites',
      { name: 'hijacked', slug: 'evil-site' },
      'POST',
      [403],
    )
    await check('owner revokes final scoped-owner site grant through REST', async () => {
      const grant = (
        await payload.find({
          collection: 'member-site-roles',
          where: { member: { equals: member } },
          depth: 0,
        })
      ).docs[0]
      assert.equal(
        (await api(owner.page, `/api/member-site-roles/${grant.id}`, undefined, 'DELETE')).status,
        200,
      )
    })
    await denied(
      staff.page,
      'last-grant revocation cannot promote scoped owner to global owner',
      `/api/sites/${siteA}`,
      undefined,
      'GET',
      [403, 404],
    )
    await denied(
      staff.page,
      'revoked scoped owner cannot write global accounts',
      `/api/users/${foreign.body.user.id}`,
      { role: 'owner' },
      'PATCH',
      [403],
    )
    await check(
      'owner regrants only original site and restores staff role through REST',
      async () => {
        assert.equal(
          (
            await api(owner.page, '/api/member-site-roles', {
              site: siteA,
              member,
              role: 'contributor',
            })
          ).status,
          201,
        )
        assert.equal(
          (await api(owner.page, `/api/users/${staffId!}`, { role: 'staff' }, 'PATCH')).status,
          200,
        )
      },
    )
    const grants = await payload.find({
      collection: 'member-site-roles',
      where: { member: { equals: member } },
      depth: 0,
    })
    await check('owner revokes staff site role through REST', async () => {
      const result = await api(
        owner.page,
        `/api/member-site-roles/${grants.docs[0].id}`,
        undefined,
        'DELETE',
      )
      assert.equal(result.status, 200, JSON.stringify(result.body))
      assert.equal(
        (
          await payload.count({
            collection: 'member-site-roles',
            where: { member: { equals: member } },
          })
        ).totalDocs,
        0,
      )
    })
    await denied(
      staff.page,
      'existing staff session loses site access immediately',
      `/api/sites/${siteA}`,
      undefined,
      'GET',
      [403, 404],
    )
    await check('owner supported user revocation invalidates all staff sessions', async () => {
      assert.equal(
        (await api(owner.page, '/api/admin/staff/invite', { userId: staffId }, 'DELETE')).status,
        200,
      )
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int n FROM admin_sessions WHERE user_id=$1 AND revoked_at IS NULL',
            [staffId!],
          )
        ).rows[0].n,
        0,
      )
    })
    await denied(
      staff.page,
      'revoked session cannot invite staff',
      '/api/admin/staff/invite',
      { email: 'evil@rc117a.test', siteId: siteA },
      'POST',
      [403],
    )
    await check('owner deletes staff account through supported REST', async () => {
      const result = await api(owner.page, `/api/users/${staffId!}`, undefined, 'DELETE')
      assert.equal(result.status, 200, JSON.stringify(result.body))
      assert.equal(
        (await pool.query('SELECT count(*)::int n FROM users WHERE id=$1', [staffId!])).rows[0].n,
        0,
      )
      return { status: 200, remainingAccounts: 0 }
    })
    await denied(
      staff.page,
      'deleted user cookie cannot read identities',
      '/api/users',
      undefined,
      'GET',
      [401, 403],
    )
    await denied(
      anon.page,
      'deleted user cannot obtain a new login challenge',
      '/api/auth/passkey/options',
      { email: 'staff@rc117a.test' },
      'POST',
      [400],
    )
    await owner.context.storageState({ path: `${scratch}/owner.json` })
    await staff.context.storageState({ path: `${scratch}/staff.json` })
    await writeFile(
      `${scratch}/state.json`,
      JSON.stringify({ siteA, siteB: siteB!, staffId: staffId!, digest: await protectedState() }),
    )
  }
} finally {
  await browser.close()
  await payload.db.destroy?.()
}
// Payload initialization retains framework handles. Only completed assertions
// reach this success exit; a thrown assertion still exits nonzero.
process.exit(0)
