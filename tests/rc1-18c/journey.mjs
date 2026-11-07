import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { hashRichTextDocument } from '../../src/modules/editorial/contracts.ts'
import { acceptance } from './paths.mjs'

const { root, scratch, project, restoreProject } = acceptance
const origin = 'https://rc118c.example.test:3443'
const phase = process.argv[2] ?? 'setup'
const profileProbe = process.env.RC118C_PROFILE_PROBE ?? ''
const artifactSuffix = profileProbe ? `-${profileProbe}` : ''
const run = `${phase}-${Date.now()}`
await mkdir(scratch, { recursive: true })
await mkdir(root, { recursive: true })
const state = await readFile(`${scratch}/state.json`, 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () =>
  writeFile(`${scratch}/state.json`, JSON.stringify(state, null, 2), { mode: 0o600 })
const checks = []
const events = []
const actorTraces = []
const sql = (query, databaseProject = project) => {
  assert.match(query.trim(), /^select\b/i, 'Journey database access is read-only')
  return execFileSync(
    'docker',
    [
      'exec',
      `${databaseProject}-postgres-1`,
      'psql',
      '-U',
      'renegade',
      '-d',
      'renegade',
      '-tAc',
      query,
    ],
    { encoding: 'utf8' },
  ).trim()
}
const browser = await chromium.launch({
  headless: true,
  args: [
    '--host-resolver-rules=MAP rc118c.example.test 127.0.0.1',
    '--no-proxy-server',
    '--ignore-certificate-errors',
  ],
})
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  ...(phase === 'setup' ? {} : { storageState: `${scratch}/owner-session.json` }),
})
await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
const page = await context.newPage()
page.setDefaultTimeout(60000)
page.on('console', (msg) => events.push({ type: 'console', level: msg.type(), text: msg.text() }))
page.on('pageerror', (error) => events.push({ type: 'pageerror', text: String(error) }))
page.on('response', (response) =>
  events.push({ type: 'response', url: response.url().split('?')[0], status: response.status() }),
)
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
if (state.ownerCredentials)
  for (const credential of state.ownerCredentials)
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential })
async function check(name, action) {
  try {
    const detail = await action()
    checks.push({ name, passed: true, detail, profile: profileProbe || 'Standard/all' })
    await page
      .screenshot({
        path: `${root}/${run}-${checks.length}.png`,
        fullPage: true,
        mask: [page.locator('ul.font-mono'), page.getByLabel('Bootstrap token')],
      })
      .catch(() => {})
    console.log(`PASS ${name}`)
  } catch (error) {
    checks.push({
      name,
      passed: false,
      error: String(error),
      profile: profileProbe || 'Standard/all',
    })
    throw error
  } finally {
    await writeFile(`${root}/${run}-checks.json`, JSON.stringify(checks, null, 2))
  }
}
async function api(path, data, method = data === undefined ? 'GET' : 'POST', target = page) {
  return target.evaluate(
    async ({ path, data, method }) => {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('renegade-member-csrf='))
        ?.split('=')[1]
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', ...(csrf ? { 'x-member-csrf': csrf } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      })
      const text = await response.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = text.slice(0, 600)
      }
      return { status: response.status, body }
    },
    { path, data, method },
  )
}
async function ok(path, data, method, target) {
  const result = await api(path, data, method, target)
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${path}: ${result.status} ${JSON.stringify(result.body).slice(0, 1800)}`,
  )
  return result.body
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const richText = (text) => ({
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [
          { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})
async function actor(name, existing = true) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    ...(existing ? { storageState: `${scratch}/${name}-session.json` } : {}),
  })
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true })
  actorTraces.push({ ctx, name, index: actorTraces.length })
  const tab = await ctx.newPage()
  tab.on('pageerror', (error) =>
    events.push({ actor: name, type: 'pageerror', text: String(error) }),
  )
  tab.on('response', (response) =>
    events.push({
      actor: name,
      type: 'response',
      url: response.url().split('?')[0],
      status: response.status(),
    }),
  )
  tab.setDefaultTimeout(60000)
  const session = await ctx.newCDPSession(tab)
  await session.send('WebAuthn.enable')
  const auth = (
    await session.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
  ).authenticatorId
  if (state[`${name}Credentials`])
    for (const credential of state[`${name}Credentials`])
      await session.send('WebAuthn.addCredential', { authenticatorId: auth, credential })
  await tab.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await tab.waitForLoadState('networkidle')
  return { ctx, tab, session, auth }
}
async function mailFor(email, subject, excluded = new Set()) {
  for (let i = 0; i < 60; i++) {
    const inbox = await (await fetch('http://127.0.0.1:3429/api/v1/messages')).json()
    const message = inbox.messages.find(
      (m) =>
        !excluded.has(m.ID) &&
        m.Subject.includes(subject) &&
        m.To.some((to) => to.Address === email),
    )
    if (message)
      return await (await fetch(`http://127.0.0.1:3429/api/v1/message/${message.ID}`)).json()
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Local SMTP sink did not receive ${subject} for ${email}`)
}
async function memberLogin(tab, email) {
  const existing = await (await fetch('http://127.0.0.1:3429/api/v1/messages')).json()
  await ok('/api/member-auth/magic-link/request', { email }, 'POST', tab)
  const mail = await mailFor(email, 'member sign-in', new Set(existing.messages.map((m) => m.ID)))
  const token = mail.Text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
  assert.ok(token, 'A real local SMTP sign-in message carries the one-use link')
  await ok('/api/member-auth/magic-link/complete', { token }, 'POST', tab)
  return await ok('/api/member-auth/me', undefined, undefined, tab)
}
function peer(path, data) {
  const script =
    "fetch('https://127.0.0.1:3450'+process.argv[1],process.argv[2]?{method:'POST',headers:{'content-type':'application/json'},body:process.argv[2]}:{}).then(async r=>{if(!r.ok)throw Error('peer '+r.status);console.log(await r.text())})"
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'exec',
        `${project}-local-peer-1`,
        'node',
        '-e',
        script,
        path,
        ...(data ? [JSON.stringify(data)] : []),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  )
}
try {
  await page.goto(`${origin}/setup`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  if (phase === 'setup') {
    await check('A production Standard/all boot with test authentication disabled', async () => {
      const info = JSON.parse(
        execFileSync('docker', ['inspect', `${project}-renegade-web-1`], { encoding: 'utf8' }),
      )[0]
      assert.ok(info.Config.Env.includes('LOCAL_E2E_TEST_MODE=false'))
      assert.ok(info.Config.Env.includes('ENABLE_TEST_ROUTES=false'))
      assert.ok(info.Config.Env.includes('NODE_ENV=production'))
      assert.equal(sql('select count(*) from users'), '0')
      assert.equal(sql('select count(*) from sites'), '0')
      return {
        image: info.Image,
        migrations: sql('select count(*) from payload_migrations'),
        readiness: await ok('/health/ready'),
      }
    })
    let token
    await check('B supported local operator token handoff', async () => {
      const command = spawnSync(
        'docker',
        ['exec', `${project}-renegade-web-1`, 'npm', 'run', 'installation:recover'],
        { encoding: 'utf8' },
      )
      assert.equal(command.status, 0, 'Supported bootstrap recovery command succeeds')
      const output = command.stdout + command.stderr
      token = output.match(/setup token[^\n]*?: ([A-Za-z0-9_-]{43})/)?.[1]
      // The logger can emit the supported token line on stderr.
      if (!token) {
        const logs = execFileSync('docker', ['logs', `${project}-renegade-web-1`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        token = [...logs.matchAll(/setup token[^\n]*?: ([A-Za-z0-9_-]{43})/g)].at(-1)?.[1]
      }
      assert.ok(token, 'Supported operator command returned a one-use token')
      return { tokenObtained: true, value: '[withheld]' }
    })
    await check('C owner enrolls real Chromium CTAP2 through setup UI', async () => {
      const before = sql('select count(*) from users')
      const invalid = await api('/api/setup/options', {
        email: 'owner@rc118c.test',
        token: 'invalid-token',
      })
      assert.equal(invalid.status, 400)
      assert.equal(sql('select count(*) from users'), before)
      await page.getByLabel('Bootstrap token').fill(token)
      await page.getByLabel('Owner email').fill('owner@rc118c.test')
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByLabel('Site or publication name').fill('18C Independent Journal')
      await page.getByLabel('Site slug').fill('rc118c-journal')
      await page.getByLabel('Primary URL').fill(origin)
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByLabel('Starter site type').selectOption('blank-minimal')
      const starter = page.getByRole('checkbox', { name: /Create starter pages/ })
      if (await starter.count()) await starter.uncheck()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      const complete = page.waitForResponse((r) => r.url().endsWith('/api/setup/complete'))
      await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
      const response = await complete
      const body = await response.json()
      assert.equal(response.status(), 201, JSON.stringify(body))
      state.recoveryCodes = body.recoveryCodes
      assert.equal(state.recoveryCodes.length, 10)
      state.ownerCredentials = (
        await cdp.send('WebAuthn.getCredentials', { authenticatorId })
      ).credentials
      await context.storageState({ path: `${scratch}/owner-session.json` })
      await save()
      assert.equal(sql('select count(*) from users'), '1')
      assert.equal(sql('select count(*) from passkeys'), '1')
      assert.equal(sql('select count(*) from sites'), '1')
      return { status: 201, users: 1, passkeys: 1, sites: 1, invalidToken: invalid.status }
    })
    await check('D owner enters admin with ordinary enrolled session', async () => {
      await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' })
      assert.match(page.url(), /\/admin/)
      const sites = await ok('/api/sites?depth=0')
      state.site = sites.docs.find((d) => d.slug === 'rc118c-journal').id
      const publications = await ok(`/api/publications?where[site][equals]=${state.site}&depth=0`)
      state.publication = publications.docs[0].id
      await save()
      await page.screenshot({ path: `${root}/D-admin.png`, fullPage: true })
      return { site: state.site, publication: state.publication, admin: page.url() }
    })
  }
  if (phase === 'core') {
    await check('E owner saves site identity and theme through native settings API', async () => {
      await ok('/api/globals/site-settings', {
        siteName: '18C Independent Journal',
        defaultDescription: 'Independent browser acceptance of durable publishing.',
        canonicalOrigin: origin,
        canonicalOriginsBySite: { [state.site]: origin },
        launchState: 'live',
        indexingMode: 'index',
        seoNoIndex: false,
        themeId: 'neutral-starter',
      })
      const stored = await ok('/api/globals/site-settings?depth=0')
      assert.equal(stored.siteName, '18C Independent Journal')
      assert.equal(stored.themeId, 'neutral-starter')
      await page.goto(`${origin}/admin/globals/site-settings`, { waitUntil: 'domcontentloaded' })
      await page.screenshot({ path: `${root}/E-site-settings.png`, fullPage: true })
      return {
        siteName: stored.siteName,
        themeId: stored.themeId,
        persistedName: sql('select site_name from site_settings'),
      }
    })
    await check('F owner builds and publishes homepage and saves navigation', async () => {
      let layout = (
        await ok(
          `/api/page-layouts?where[site][equals]=${state.site}&where[path][equals]=/&depth=0`,
        )
      ).docs[0]
      if (!layout)
        layout = (
          await ok('/api/layouts', { recipeId: 'writer-blogger', siteId: state.site, path: '/' })
        ).layout
      const candidate = {
        ...layout,
        siteId: state.site,
        version: layout.layoutVersion,
        blocks: layout.blocks.map((b, i) =>
          i === 0 ? { ...b, props: { ...b.props, title: '18C Independent Journal' } } : b,
        ),
      }
      const result = await ok(
        `/api/layouts/${layout.id}`,
        { layout: candidate, expectedRevision: layout.revision, publish: true },
        'PATCH',
      )
      state.homeLayout = layout.id
      await ok('/api/admin/navigation', {
        publicationId: state.publication,
        siteId: state.site,
        navigation: {
          primary: [
            { label: 'Home', href: '/', children: [] },
            { label: 'About', href: '/about-18c', children: [] },
            { label: 'Journal', href: '/articles', children: [] },
          ],
          secondary: [],
          footer: [{ label: 'About', href: '/about-18c', children: [] }],
        },
      })
      await save()
      await page.goto(origin, { waitUntil: 'domcontentloaded' })
      await page.screenshot({ path: `${root}/F-homepage.png`, fullPage: true })
      assert.ok((await page.textContent('body')).includes('18C Independent Journal'))
      return {
        layout: layout.id,
        resultKeys: Object.keys(result),
        status: sql(`select status from page_layouts where id='${layout.id}'`),
      }
    })
    await check(
      'G real image uploaded with original SHA-256 and persisted media record',
      async () => {
        const bytes = await readFile('fixtures/renegadeparty-demo/assets/hero-liberty.png')
        state.originalSha256 = digest(bytes)
        const result = await page.evaluate(
          async ({ site, bytes }) => {
            const form = new FormData()
            form.set('siteId', site)
            form.set('title', '18C original liberty image')
            form.set('altText', 'Liberty illustration for independent journal acceptance')
            form.set(
              'file',
              new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], '18c-liberty.png', {
                type: 'image/png',
              }),
            )
            const response = await fetch('/api/media/upload', { method: 'POST', body: form })
            return { status: response.status, body: await response.json() }
          },
          { site: state.site, bytes: bytes.toString('base64') },
        )
        assert.equal(result.status, 201, JSON.stringify(result.body))
        state.media = result.body.asset.id
        state.mediaLocation = result.body.asset.storageLocation
        await save()
        assert.equal(
          sql(`select title from media_assets where id='${state.media}'`),
          '18C original liberty image',
        )
        return {
          status: 201,
          media: state.media,
          bytes: bytes.length,
          originalSha256: state.originalSha256,
        }
      },
    )
    await check(
      'H native REST creates taxonomy, page and article with real body media and SEO',
      async () => {
        const category = (
          await ok('/api/categories', {
            site: state.site,
            scope: 'site',
            name: '18C Reporting',
            slug: '18c-reporting',
            canonicalPath: '/categories/18c-reporting',
          })
        ).doc
        state.category = category.id
        const author = (
          await ok('/api/authors', {
            displayName: 'Independent Reporter',
            slug: '18c-reporter',
            bio: 'Acceptance author for the independent journal.',
          })
        ).doc
        state.author = author.id
        for (const [key, type, slug, title, text] of [
          [
            'page',
            'page',
            'about-18c',
            'About the Independent Journal',
            'Our independent journal documents ordinary supported publishing and durable recovery.',
          ],
          [
            'article',
            'article',
            'independent-18c',
            'Independent Golden Journey 18C',
            'Golden otter semaphore 18C: every ordinary action must persist, render, and survive recovery.',
          ],
        ]) {
          const doc = (
            await ok('/api/content', {
              site: state.site,
              publication: state.publication,
              contentType: type,
              title,
              slug,
              status: 'draft',
              visibility: 'public',
              summary: text,
              body: richText(text),
              heroMedia: state.media,
              categories: [state.category],
              authors: [{ author: state.author, displayOrder: 0, role: 'Author' }],
              seoTitle: `${title} | Independent Journal`,
              seoDescription: text,
              seoImageAlt: 'Liberty illustration',
              structuredDataMode: 'manual',
              structuredDataPrimaryType: type === 'article' ? 'Article' : 'WebPage',
              structuredDataManual: {
                '@context': 'https://schema.org',
                '@type': type === 'article' ? 'Article' : 'WebPage',
                headline: title,
                description: text,
              },
            })
          ).doc
          state[key] = doc.id
          state[`${key}Path`] = doc.canonicalPath
          await save()
          assert.equal(sql(`select status from content where id='${doc.id}'`), 'draft')
        }
        return {
          page: state.page,
          pagePath: state.pagePath,
          article: state.article,
          articlePath: state.articlePath,
          category: state.category,
        }
      },
    )
  }
  if (phase === 'identity') {
    await check('Owner creates a second isolated site through supported native REST', async () => {
      const doc = state.foreignSite
        ? await ok(`/api/sites/${state.foreignSite}`)
        : (
            await ok('/api/sites', {
              name: '18C Foreign Site',
              slug: 'rc118c-foreign',
              host: 'foreign.rc118c.test',
              status: 'active',
            })
          ).doc
      state.foreignSite = doc.id
      await save()
      return { site: doc.id, persisted: sql(`select name from sites where id='${doc.id}'`) }
    })
    for (const role of ['staff', 'administrator'])
      await check(`Invited ${role} enrolls CTAP2 passkey and logs in through UI`, async () => {
        const email = state[`${role}Email`] ?? `${role}-journey@rc118c.test`
        const a = await actor(role, false)
        if (!state[`${role}Id`]) {
          const invited = await ok('/api/admin/staff/invite', { email, role, siteId: state.site })
          await a.tab.goto(invited.enrollmentUrl, { waitUntil: 'domcontentloaded' })
          await a.tab.getByRole('button', { name: /Register Hardware Passkey/ }).click()
          await a.tab
            .getByRole('status')
            .filter({ hasText: 'Passkey registered successfully' })
            .waitFor()
          state[`${role}Id`] = invited.user.id
          state[`${role}Email`] = email
          state[`${role}Credentials`] = (
            await a.session.send('WebAuthn.getCredentials', { authenticatorId: a.auth })
          ).credentials
          await save()
        }
        await a.tab.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
        await a.tab.waitForLoadState('networkidle')
        await a.tab.getByLabel('Owner / Staff Email').fill(email)
        const loginResponse = a.tab.waitForResponse((r) =>
          r.url().endsWith('/api/auth/passkey/complete'),
        )
        await a.tab.getByRole('button', { name: /Authenticate with Passkey/ }).click()
        const response = await loginResponse
        state[`${role}Credentials`] = (
          await a.session.send('WebAuthn.getCredentials', { authenticatorId: a.auth })
        ).credentials
        await save()
        if (response.status() !== 200)
          throw new Error(`Passkey login ${response.status()}: ${await response.text()}`)
        await a.tab.waitForURL(/\/admin/, { timeout: 60000, waitUntil: 'domcontentloaded' })
        state[`${role}Credentials`] = (
          await a.session.send('WebAuthn.getCredentials', { authenticatorId: a.auth })
        ).credentials
        await a.ctx.storageState({ path: `${scratch}/${role}-session.json` })
        await save()
        await a.tab.screenshot({ path: `${root}/${role}-admin.png`, fullPage: true })
        assert.equal(
          sql(`select count(*) from passkeys where user_id='${state[`${role}Id`]}'`),
          '1',
        )
        return { role, user: state[`${role}Id`], passkeys: 1 }
      })
    await check(
      'Staff and administrator foreign-site writes denied with unchanged persisted site',
      async () => {
        const before = sql(
          `select md5(row_to_json(t)::text) from sites t where id='${state.foreignSite}'`,
        )
        const results = []
        for (const role of ['staff', 'administrator']) {
          const a = await actor(role)
          const result = await api(
            `/api/sites/${state.foreignSite}`,
            { name: 'Forbidden mutation' },
            'PATCH',
            a.tab,
          )
          assert.ok([403, 404].includes(result.status), JSON.stringify(result))
          results.push({ role, status: result.status, response: result.body })
        }
        const after = sql(
          `select md5(row_to_json(t)::text) from sites t where id='${state.foreignSite}'`,
        )
        assert.equal(after, before)
        return { results, before, after }
      },
    )
  }
  if (phase === 'publish') {
    const reviewer = await actor('staff')
    await check('I draft preview renders and anonymous publication is denied', async () => {
      const preview = await ok('/api/admin/content/preview', { id: state.article })
      await page.goto(origin + preview.url, { waitUntil: 'domcontentloaded' })
      assert.ok((await page.textContent('body')).includes('Golden otter semaphore 18C'))
      await page.screenshot({ path: `${root}/I-draft-preview.png`, fullPage: true })
      const anon = await actor('anonymous', false)
      const denied = await api(
        '/api/admin/workflow/actions',
        { articleId: state.article, action: 'approve' },
        'POST',
        anon.tab,
      )
      assert.equal(denied.status, 403)
      assert.equal(sql(`select status from content where id='${state.article}'`), 'draft')
      return { previewRendered: true, anonymousApprovalStatus: denied.status }
    })
    await check('I separate staff review approves owner drafts and owner publishes', async () => {
      const outcomes = []
      for (const key of ['page', 'article']) {
        await ok('/api/admin/workflow/actions', {
          articleId: state[key],
          action: 'submit',
          actorSiteId: state.site,
        })
        const self = await api('/api/admin/workflow/actions', {
          articleId: state[key],
          action: 'approve',
          actorSiteId: state.site,
        })
        assert.equal(self.status, 403)
        await ok(
          '/api/admin/workflow/actions',
          {
            articleId: state[key],
            action: 'approve',
            actorSiteId: state.site,
            comment: 'Independent review completed against real body, media, and SEO.',
          },
          'POST',
          reviewer.tab,
        )
        assert.equal(sql(`select status from content where id='${state[key]}'`), 'approved')
        await ok(
          `/api/content/${state[key]}`,
          { status: 'published', publishedAt: new Date().toISOString() },
          'PATCH',
        )
        assert.equal(sql(`select status from content where id='${state[key]}'`), 'published')
        outcomes.push({ id: state[key], status: 'published', selfApprovalDenied: self.status })
      }
      return outcomes
    })
  }
  if (phase === 'public') {
    const visitor = await actor('visitor', false)
    await check(
      'J anonymous rendering metadata schema discovery search and original bytes',
      async () => {
        const response = await visitor.tab.goto(origin + state.articlePath, {
          waitUntil: 'domcontentloaded',
        })
        assert.equal(response.status(), 200)
        assert.ok((await visitor.tab.textContent('body')).includes('Golden otter semaphore 18C'))
        assert.equal(
          await visitor.tab.locator('meta[name="description"]').getAttribute('content'),
          'Golden otter semaphore 18C: every ordinary action must persist, render, and survive recovery.',
        )
        assert.ok(await visitor.tab.locator('script[type="application/ld+json"]').count())
        assert.equal(
          await visitor.tab.locator('link[rel="canonical"]').getAttribute('href'),
          origin + state.articlePath,
        )
        await writeFile(`${root}/J-public-article.html`, await visitor.tab.content())
        await visitor.tab.screenshot({ path: `${root}/J-public-article.png`, fullPage: true })
        const outputs = []
        for (const path of [
          '/sitemap.xml',
          '/sitemaps/1.xml',
          '/robots.txt',
          '/feed.xml',
          '/search?q=Golden%20otter%20semaphore',
        ]) {
          const result = await visitor.tab.evaluate(async (path) => {
            const response = await fetch(path)
            return { status: response.status, text: await response.text() }
          }, path)
          assert.equal(result.status, 200, path)
          if (path === '/sitemap.xml')
            assert.ok(
              result.text.includes('/sitemaps/1.xml'),
              'Sitemap index identifies the actual URL set',
            )
          else if (path !== '/robots.txt')
            assert.ok(
              result.text.includes(path.startsWith('/search') ? 'Golden' : state.articlePath),
              `${path} contains the published article`,
            )
          await writeFile(
            `${root}/J-${path === '/sitemap.xml' ? 'sitemap-index.xml' : path.startsWith('/sitemaps') ? 'sitemap-1.xml' : path.startsWith('/robots') ? 'robots.txt' : path.startsWith('/feed') ? 'feed.xml' : 'search.html'}`,
            result.text,
          )
          outputs.push({ path, status: result.status })
        }
        const original = await visitor.tab.evaluate(async (id) => {
          const response = await fetch(`/media/${id}`)
          return {
            status: response.status,
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
          }
        }, state.media)
        assert.equal(original.status, 200)
        assert.equal(digest(Buffer.from(original.bytes)), state.originalSha256)
        return { outputs, mediaSha256: state.originalSha256, mediaBytes: original.bytes.length }
      },
    )
    await check('K supported slug edit creates durable 308 redirect', async () => {
      state.oldArticlePath = state.articlePath
      const doc = (
        await ok(`/api/content/${state.article}`, { slug: 'independent-18c-renamed' }, 'PATCH')
      ).doc
      state.articlePath = doc.canonicalPath
      await save()
      const response = await visitor.tab.goto(origin + state.oldArticlePath, {
        waitUntil: 'domcontentloaded',
      })
      assert.equal(response.status(), 200)
      assert.equal(new URL(visitor.tab.url()).pathname, state.articlePath)
      const previous = response.request().redirectedFrom()
      assert.ok(previous)
      assert.equal((await previous.response()).status(), 308)
      assert.equal(
        sql(`select to_path from public_redirects where from_path='${state.oldArticlePath}'`),
        state.articlePath,
      )
      return { from: state.oldArticlePath, to: state.articlePath, redirect: 308 }
    })
  }
  if (phase === 'schedule') {
    const reviewer = await actor('staff')
    await check('L supported scheduling executes through actual production worker', async () => {
      let content
      if (state.scheduledArticle) content = await ok(`/api/content/${state.scheduledArticle}`)
      else {
        content = (
          await ok('/api/content', {
            site: state.site,
            publication: state.publication,
            contentType: 'article',
            title: '18C Worker Scheduled Story',
            slug: 'worker-18c',
            status: 'draft',
            visibility: 'public',
            summary: 'The actual worker publishes this reviewed story.',
            body: richText(
              'Copper kestrel relay 18C: this story is published by the production worker after its scheduled time.',
            ),
            heroMedia: state.media,
            authors: [{ author: state.author, displayOrder: 0, role: 'Author' }],
          })
        ).doc
        state.scheduledArticle = content.id
        state.scheduledPath = content.canonicalPath
        await save()
        await ok('/api/admin/workflow/actions', {
          articleId: content.id,
          action: 'submit',
          actorSiteId: state.site,
        })
        await ok(
          '/api/admin/workflow/actions',
          {
            articleId: content.id,
            action: 'approve',
            actorSiteId: state.site,
            comment: 'Ready for actual worker publication.',
          },
          'POST',
          reviewer.tab,
        )
      }
      const companion = (
        await ok(`/api/article-family-content?where[content][equals]=${content.id}&depth=0`)
      ).docs[0]
      state.scheduledCompanion = companion.id
      await save()
      const startsAt = new Date(Date.now() + 20000).toISOString().slice(0, 19)
      const stale = await api('/api/admin/calendar/schedule', {
        action: 'schedule',
        sourceId: companion.id,
        startsAt,
        timeZone: 'UTC',
        expectedSequence: -1,
      })
      assert.equal(stale.status, 409)
      assert.equal(sql(`select status from content where id='${content.id}'`), 'approved')
      const scheduled = await ok('/api/admin/calendar/schedule', {
        action: 'schedule',
        sourceId: companion.id,
        startsAt,
        timeZone: 'UTC',
        expectedSequence: companion.currentRevisionSequence,
      })
      for (let i = 0; i < 90; i++) {
        if (sql(`select status from content where id='${content.id}'`) === 'published') break
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      assert.equal(sql(`select status from content where id='${content.id}'`), 'published')
      const visitor = await actor('visitor', false)
      const publicResponse = await visitor.tab.goto(origin + state.scheduledPath, {
        waitUntil: 'domcontentloaded',
      })
      assert.equal(publicResponse.status(), 200)
      assert.ok((await visitor.tab.textContent('body')).includes('Copper kestrel relay 18C'))
      await visitor.tab.screenshot({ path: `${root}/L-worker-published.png`, fullPage: true })
      return {
        article: content.id,
        scheduled,
        staleSequenceDenied: stale.status,
        persistedStatus: 'published',
      }
    })
  }
  if (phase === 'audience') {
    await check('M visitor subscribes receives local SMTP mail and confirms consent', async () => {
      const visitor = await actor('subscriber', false)
      const email = profileProbe
        ? `reader-${profileProbe.toLowerCase()}@rc118c.test`
        : 'reader-final@rc118c.test'
      const request = await api(
        '/api/subscribers/subscribe',
        { siteId: state.site, email, locale: 'en' },
        'POST',
        visitor.tab,
      )
      assert.equal(request.status, 202, JSON.stringify(request.body))
      const mail = await mailFor(email, 'Confirm your subscription')
      const text = `${mail.Text}\n${mail.HTML}`
      const token = text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
      assert.ok(token)
      await ok('/api/subscribers/confirm', { token }, 'POST', visitor.tab)
      const replay = await api('/api/subscribers/confirm', { token }, 'POST', visitor.tab)
      assert.equal(replay.status, 400)
      const status = sql(`select status from subscribers where email='${email}'`)
      assert.equal(status, 'active')
      const deliveries = await ok('/api/email-deliveries?depth=0')
      const delivery = deliveries.docs.find((d) => d.recipientEmail === email)
      assert.equal(delivery.status, 'accepted')
      state.emailDelivery = delivery.id
      state.confirmationMessageId = mail.ID
      await save()
      await writeFile(
        `${root}/M-local-email${artifactSuffix}.json`,
        JSON.stringify(
          {
            ID: mail.ID,
            From: mail.From,
            To: mail.To,
            Subject: mail.Subject,
            Text: mail.Text.replace(/token=[A-Za-z0-9_-]+/g, 'token=[REDACTED_ONE_USE_TOKEN]'),
            HTML: mail.HTML?.replace(/token=[A-Za-z0-9_-]+/g, 'token=[REDACTED_ONE_USE_TOKEN]'),
          },
          null,
          2,
        ),
      )
      return {
        requested: 202,
        subscriberStatus: status,
        delivery: delivery.id,
        deliveryStatus: delivery.status,
        localSinkMessage: mail.ID,
        confirmationReplayDenied: replay.status,
      }
    })
  }
  if (phase === 'community') {
    const member = await actor('member', Boolean(state.member))
    await check('N ordinary member email sign-in and operator forum creation', async () => {
      if (!state.member || profileProbe) {
        const me = await memberLogin(member.tab, 'member@rc118c.test')
        state.member = me.memberId
        await member.ctx.storageState({ path: `${scratch}/member-session.json` })
        await save()
      }
      if (!state.forum) {
        const section = (
          await ok('/api/forum-sections', {
            site: state.site,
            name: '18C Community',
            slug: '18c-community',
          })
        ).doc
        state.forum = (
          await ok('/api/forums', {
            site: state.site,
            section: section.id,
            name: '18C Reader Forum',
            slug: '18c-readers',
          })
        ).doc.id
        await save()
      }
      return { member: state.member, forum: state.forum, localEmailSignIn: true }
    })
    await check('N member thread reply moderation and notification path persist', async () => {
      const thread = await ok(
        '/api/community/threads',
        {
          siteId: state.site,
          forumId: state.forum,
          title: '18C readers discuss durable publishing',
          body: 'This thread was created by a member using the supported HTTP action.',
        },
        'POST',
        member.tab,
      )
      state.discussion = thread.discussion.id
      state.discussionPath = thread.discussion.canonicalPath
      await save()
      await memberLogin(page, 'owner@rc118c.test')
      const reply = await ok('/api/community/posts', {
        siteId: state.site,
        discussionId: state.discussion,
        body: 'The operator replies through the same member action boundary.',
      })
      state.reply = reply.post.id
      await save()
      const before = sql(`select moderation_state from discussion_posts where id='${state.reply}'`)
      const denied = await api(
        '/api/community/posts',
        {
          siteId: state.site,
          postId: state.reply,
          moderationState: 'removed',
          reason: 'Unprivileged member attempt',
        },
        'PATCH',
        member.tab,
      )
      assert.equal(denied.status, 403)
      assert.equal(
        sql(`select moderation_state from discussion_posts where id='${state.reply}'`),
        before,
      )
      await ok(
        '/api/community/posts',
        {
          siteId: state.site,
          postId: state.reply,
          moderationState: 'removed',
          reason: '18C moderation verification with retained audit.',
        },
        'PATCH',
      )
      assert.equal(
        sql(`select moderation_state from discussion_posts where id='${state.reply}'`),
        'removed',
      )
      const notifications = await ok(
        `/api/community/notifications?siteId=${state.site}`,
        undefined,
        undefined,
        member.tab,
      )
      assert.ok(
        notifications.notifications.length > 0,
        'The real reply/moderation emitted a member notification',
      )
      await member.tab.goto(origin + state.discussionPath, { waitUntil: 'domcontentloaded' })
      assert.ok(
        (await member.tab.textContent('body')).includes('18C readers discuss durable publishing'),
      )
      await member.tab.screenshot({
        path: `${root}/N-community${artifactSuffix}.png`,
        fullPage: true,
      })
      await context.storageState({ path: `${scratch}/owner-session.json` })
      await member.ctx.storageState({ path: `${scratch}/member-session.json` })
      return {
        discussion: state.discussion,
        reply: state.reply,
        moderationState: 'removed',
        deniedMember: denied.status,
        notifications: notifications.notifications.length,
      }
    })
  }
  if (phase === 'commerce') {
    if (profileProbe && !state.profileCheckoutStarted?.includes(profileProbe)) {
      state.priorCheckout = Object.fromEntries(
        ['checkoutSession', 'checkoutUrl', 'paymentAttempt', 'cart', 'order'].map((key) => [
          key,
          state[key],
        ]),
      )
      for (const key of ['checkoutSession', 'checkoutUrl', 'paymentAttempt', 'cart', 'order'])
        delete state[key]
      state.profileCheckoutStarted = [...(state.profileCheckoutStarted ?? []), profileProbe]
      await save()
    }
    await check(
      'O operator configures explicit local-test merchant and publishes reviewed product',
      async () => {
        await ok('/api/globals/site-settings', {
          adminExperience: {
            optionalCapabilities: { commerceCheckout: true, transactionalEmail: true },
          },
        })
        if (!state.merchant) {
          state.merchant = (
            await ok('/api/merchant-connections', {
              site: state.site,
              label: '18C local deterministic sandbox',
              providerKey: 'deterministic-test',
              merchantCountry: 'US',
              status: 'active',
            })
          ).doc.id
          state.capability = (
            await ok('/api/payment-method-capabilities', {
              site: state.site,
              merchantConnection: state.merchant,
              providerKey: 'deterministic-test',
              railKey: '18c-local-card',
              family: 'card',
              flow: 'hosted',
              merchantCountries: ['US'],
              presentmentCurrencies: ['USD'],
              enabled: true,
              health: 'healthy',
            })
          ).doc.id
          await save()
        }
        if (!state.product) {
          const product = (
            await ok('/api/products', {
              site: state.site,
              merchantConnection: state.merchant,
              name: '18C Test Journal',
              slug: '18c-test-journal',
              canonicalPath: '/store/18c-test-journal',
              kind: 'physical',
              state: 'draft',
              catalogContractVersion: 1,
              productCapabilities: ['shippable'],
              variants: [
                {
                  sku: '18c-journal',
                  title: 'Acceptance edition',
                  status: 'active',
                  inventoryPolicy: 'tracked',
                  inventoryQuantity: 10,
                  weightGrams: 100,
                  dimensionsMm: { length: 100, width: 80, height: 10 },
                },
              ],
              offers: [
                {
                  offerId: '18c-usd',
                  version: 1,
                  status: 'active',
                  amountMinor: '1200',
                  currency: 'USD',
                  taxDisplay: 'exclusive',
                },
              ],
            })
          ).doc
          state.product = product.id
          await save()
          for (const action of ['request-review', 'approve', 'publish'])
            await ok('/api/admin/catalog', { productId: product.id, action }, 'PATCH')
        }
        assert.equal(sql(`select state from products where id='${state.product}'`), 'published')
        return {
          product: state.product,
          merchant: state.merchant,
          provider: 'deterministic-test',
          realMoney: false,
        }
      },
    )
    await check(
      'O guest UI cart authoritative quote local confirmation and worker-settled order',
      async () => {
        const guest = await actor('buyer', Boolean(state.checkoutSession))
        if (!state.checkoutSession) {
          await guest.tab.goto(`${origin}/store/18c-test-journal`, {
            waitUntil: 'domcontentloaded',
          })
          const privacy = guest.tab.getByRole('button', {
            name: 'Reject non-essential',
            exact: true,
          })
          if (await privacy.isVisible()) await privacy.click()
          const added = guest.tab.waitForResponse(
            (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
          )
          await guest.tab
            .getByRole('button', { name: 'Add 18C Test Journal to cart', exact: true })
            .click()
          assert.equal((await added).status(), 200)
          const cart = await ok('/api/commerce/cart', undefined, undefined, guest.tab)
          state.cart = cart.cart.id
          await save()
          assert.equal(cart.pricing.grandTotalMinor, '1200')
          const quoteInput = {
            customer: { email: 'buyer@rc118c.test', country: 'US' },
            shippingAddress: {
              name: 'Disposable Test Buyer',
              line1: '100 Acceptance Way',
              city: 'Portland',
              state: 'OR',
              postalCode: '97201',
              country: 'US',
            },
            selectedShippingRateId: 'rate_local_pickup',
            consents: { termsAccepted: true, privacyAccepted: true },
          }
          const forged = await api(
            '/api/commerce/proposal',
            { ...quoteInput, pricingSnapshot: { grandTotalMinor: '1' } },
            'POST',
            guest.tab,
          )
          assert.equal(forged.status, 400)
          const proposal = (await ok('/api/commerce/proposal', quoteInput, 'POST', guest.tab))
            .proposal
          assert.equal(proposal.pricingSnapshot.grandTotalMinor, '1200')
          const checkout = await ok(
            '/api/commerce/checkout/initiate',
            { proposalId: proposal.id, capabilityId: state.capability },
            'POST',
            guest.tab,
          )
          state.checkoutSession = checkout.sessionId
          state.checkoutUrl = checkout.actionUrl
          state.paymentAttempt = checkout.attemptId
          await guest.ctx.storageState({ path: `${scratch}/buyer-session.json` })
          await save()
        }
        const stranger = await actor('checkout-stranger', false)
        const denied = await api(
          `/api/commerce/checkout/status?session=${state.checkoutSession}`,
          undefined,
          'GET',
          stranger.tab,
        )
        assert.equal(denied.status, 403)
        await guest.tab.goto(origin + state.checkoutUrl, { waitUntil: 'domcontentloaded' })
        assert.ok((await guest.tab.textContent('body')).includes('No real money will be charged.'))
        await guest.tab.getByRole('button', { name: 'Confirm test payment' }).click()
        await guest.tab.waitForURL(/\/checkout\/return/, { waitUntil: 'domcontentloaded' })
        for (let i = 0; i < 90; i++) {
          const order = sql(
            `select id from orders where checkout_session_id='${state.checkoutSession}'`,
          )
          if (order) {
            state.order = order
            await save()
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        assert.ok(
          state.order,
          'The actual signed local event was settled into an order by the worker',
        )
        const status = await ok(
          `/api/commerce/checkout/status?session=${state.checkoutSession}`,
          undefined,
          undefined,
          guest.tab,
        )
        assert.equal(
          sql(`select count(*) from orders where checkout_session_id='${state.checkoutSession}'`),
          '1',
        )
        const orderState = sql(`select state from orders where id='${state.order}'`)
        assert.ok(['paid', 'fulfilled'].includes(orderState), orderState)
        await guest.tab.reload({ waitUntil: 'domcontentloaded' })
        await guest.tab.screenshot({
          path: `${root}/O-local-order${artifactSuffix}.png`,
          fullPage: true,
        })
        await guest.ctx.storageState({ path: `${scratch}/buyer-session.json` })
        return {
          order: state.order,
          orderState,
          checkout: state.checkoutSession,
          unauthorizedStatus: denied.status,
          statusKeys: Object.keys(status),
          provider: 'deterministic-test',
          realCharge: false,
        }
      },
    )
  }
  if (phase === 'operations') {
    await check(
      'P operator inspects actual analytics health and bounded provider truth',
      async () => {
        const analytics = await ok(`/api/analytics/report?siteId=${state.site}`)
        const finance = await ok(`/api/admin/commerce/dashboard?siteId=${state.site}`)
        const connections = await ok(`/api/admin/ai/connections?siteId=${state.site}`)
        const schedule = await ok('/api/admin/schedule-health')
        assert.ok(finance.orders.some((order) => order.id === state.order))
        assert.ok(
          finance.health.every((provider) => provider.providerKey === 'deterministic-test'),
          'No configured real payment provider is claimed',
        )
        assert.equal(connections.connections.length, 0)
        assert.equal((await ok('/health/ready')).status, 'ready')
        await writeFile(
          `${root}/P-operator-observations.json`,
          JSON.stringify({ analytics, finance, aiConnections: connections, schedule }, null, 2),
        )
        await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' })
        await page.screenshot({ path: `${root}/P-admin.png`, fullPage: true })
        return {
          analyticsCount: analytics.eventCount,
          orderCount: finance.orders.length,
          paymentProviders: finance.health,
          aiConnections: connections.connections.length,
          ready: true,
        }
      },
    )
    await check(
      'Q actual web and worker restart retains workflows without duplicate side effects',
      async () => {
        for (let i = 0; i < 90; i++) {
          if (sql("select count(*) from form_submissions where status='received'") === '0') break
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        assert.equal(sql("select count(*) from form_submissions where status='received'"), '0')
        const counts = () => ({
          externalPosts: sql('select count(*) from external_posts'),
          publishedSocialDrafts: sql("select count(*) from social_drafts where status='published'"),
          deliveredNetwork: sql(
            "select count(*) from outbound_network_deliveries where status='delivered'",
          ),
          completedReleases: sql("select count(*) from content_releases where status='completed'"),
          triagedForms: sql("select count(*) from form_submissions where status='triaged'"),
          orders: sql(
            `select count(*) from orders where checkout_session_id='${state.checkoutSession}'`,
          ),
          delivery: sql(`select status from email_deliveries where id='${state.emailDelivery}'`),
          schedule: sql(`select status from content where id='${state.scheduledArticle}'`),
          posts: sql(
            `select count(*) from discussion_posts where discussion_id='${state.discussion}'`,
          ),
        })
        const before = counts()
        execFileSync(
          'docker',
          ['restart', `${project}-renegade-web-1`, `${project}-renegade-worker-1`],
          { stdio: 'pipe' },
        )
        let ready = false
        for (let i = 0; i < 90; i++) {
          try {
            if ((await api('/health/ready')).status === 200) {
              ready = true
              break
            }
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        assert.ok(ready)
        await new Promise((resolve) => setTimeout(resolve, 16000))
        execFileSync(
          'docker',
          ['exec', `${project}-renegade-worker-1`, 'node', 'docker/worker-healthcheck.mjs'],
          { stdio: 'pipe' },
        )
        const after = counts()
        assert.deepEqual(after, before)
        assert.equal(after.orders, '1')
        const inbox = await (await fetch('http://127.0.0.1:3429/api/v1/messages')).json()
        assert.equal(inbox.messages.filter((m) => m.ID === state.confirmationMessageId).length, 1)
        return { before, after, ready, localConfirmationCopies: 1 }
      },
    )
    await check(
      'R logout then passkey login from an entirely new clean browser context',
      async () => {
        await ok('/api/auth/logout', {})
        const fresh = await actor('owner', false)
        assert.equal(
          (await fresh.ctx.cookies()).some((c) => c.name === 'renegade-passkey'),
          false,
        )
        await fresh.tab.getByLabel('Owner / Staff Email').fill('owner@rc118c.test')
        const complete = fresh.tab.waitForResponse((r) =>
          r.url().endsWith('/api/auth/passkey/complete'),
        )
        await fresh.tab.getByRole('button', { name: /Authenticate with Passkey/ }).click()
        const response = await complete
        state.ownerCredentials = (
          await fresh.session.send('WebAuthn.getCredentials', { authenticatorId: fresh.auth })
        ).credentials
        await save()
        assert.equal(response.status(), 200)
        await fresh.tab.waitForURL(/\/admin/, { waitUntil: 'domcontentloaded' })
        assert.equal(
          (await api(`/api/sites/${state.site}`, undefined, 'GET', fresh.tab)).status,
          200,
        )
        await fresh.ctx.storageState({ path: `${scratch}/owner-session.json` })
        await fresh.tab.screenshot({ path: `${root}/R-clean-context-admin.png`, fullPage: true })
        return { initiallyNoOperatorCookie: true, realWebAuthn: true, authenticatedAdmin: true }
      },
    )
  }
  if (phase === 'recovery') {
    await check(
      'Authorized local operator recovery rotates codes and recovered owner returns through UI',
      async () => {
        const command = spawnSync(
          'docker',
          [
            'exec',
            `${project}-renegade-web-1`,
            'npm',
            'run',
            'installation:recover',
            '--',
            '--owner-email',
            'owner@rc118c.test',
            '--confirm-rotate-owner-codes',
          ],
          { encoding: 'utf8' },
        )
        assert.equal(command.status, 0, 'Supported local recovery command succeeds')
        const codes = (command.stdout + command.stderr).match(/^[A-F0-9]{20}$/gm)
        assert.equal(codes?.length, 10)
        state.recoveryCodes = codes
        await save()
        const recovery = await actor('recovery', false)
        await recovery.tab
          .getByRole('button', { name: 'Emergency Recovery Code', exact: true })
          .click()
        await recovery.tab.getByLabel('Owner Email', { exact: true }).fill('owner@rc118c.test')
        await recovery.tab.getByLabel('Emergency Recovery Code', { exact: true }).fill(codes[0])
        const complete = recovery.tab.waitForResponse((r) => r.url().endsWith('/api/auth/recovery'))
        await recovery.tab.getByRole('button', { name: /Sign In with Recovery Code/i }).click()
        assert.equal((await complete).status(), 200)
        await recovery.tab.waitForURL(/\/admin/, { waitUntil: 'domcontentloaded' })
        const replay = await api(
          '/api/auth/recovery',
          { email: 'owner@rc118c.test', recoveryCode: codes[0] },
          'POST',
          recovery.tab,
        )
        assert.equal(replay.status, 400)
        await recovery.ctx.storageState({ path: `${scratch}/owner-session.json` })
        return { rotatedCodes: 10, recoveredOwner: true, usedCodeReplayDenied: replay.status }
      },
    )
  }
  if (phase === 'restored') {
    await check(
      'S shipped backup restored complete critical records into independent project',
      async () => {
        const tables = [
          'sites',
          'publications',
          'content',
          'categories',
          'authors',
          'media_assets',
          'media_blobs',
          'products',
          'orders',
          'discussions',
          'discussion_posts',
          'subscribers',
          'consent_events',
          'email_deliveries',
          'events',
          'sources',
          'books',
          'book_chapters',
          'form_definitions',
          'form_schemas',
          'form_submissions',
          'contacts',
          'realtime_events',
          'experiments',
          'experiment_variants',
          'content_releases',
          'social_accounts',
          'social_drafts',
          'external_posts',
          'network_relationships',
          'outbound_network_deliveries',
        ]
        const results = []
        for (const table of tables) {
          const query = `select count(*)||':'||md5(coalesce(json_agg(t order by id)::text,'')) from ${table} t`
          const source = sql(query)
          const restored = sql(query, restoreProject)
          assert.equal(restored, source, `${table} source/restore equality`)
          results.push({ table, countAndContentHash: source })
        }
        const parse = (text) =>
          Object.fromEntries(
            text
              .trim()
              .split('\n')
              .filter((line) => line.includes('='))
              .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
          )
        const sourceEnv = parse(await readFile(`${scratch}/stack.env`, 'utf8'))
        const restoreEnv = parse(await readFile(`${scratch}/restore.env`, 'utf8'))
        assert.notEqual(restoreEnv.PAYLOAD_SECRET, sourceEnv.PAYLOAD_SECRET)
        assert.notEqual(restoreEnv.POSTGRES_PASSWORD, sourceEnv.POSTGRES_PASSWORD)
        const backups = (await readdir(`${scratch}/backups`))
          .filter((name) => name.startsWith('renegade-backup-'))
          .sort()
        const manifestPath = `${scratch}/backups/${backups.at(-1)}/manifest.json`
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        await writeFile(`${root}/S-backup-manifest.json`, JSON.stringify(manifest, null, 2))
        return {
          criticalTables: results,
          independentProject: restoreProject,
          freshSecrets: true,
          migrations: sql('select count(*) from payload_migrations', restoreProject),
        }
      },
    )
    await check(
      'S fresh browser authenticates to restored environment with source-enrolled passkey',
      async () => {
        const fresh = await actor('owner', false)
        assert.equal(
          (await fresh.ctx.cookies()).some((c) => c.name === 'renegade-passkey'),
          false,
        )
        await fresh.tab.getByLabel('Owner / Staff Email').fill('owner@rc118c.test')
        const complete = fresh.tab.waitForResponse((r) =>
          r.url().endsWith('/api/auth/passkey/complete'),
        )
        await fresh.tab.getByRole('button', { name: /Authenticate with Passkey/ }).click()
        const response = await complete
        state.ownerCredentials = (
          await fresh.session.send('WebAuthn.getCredentials', { authenticatorId: fresh.auth })
        ).credentials
        await save()
        assert.equal(response.status(), 200)
        await fresh.tab.waitForURL(/\/admin/, { waitUntil: 'domcontentloaded' })
        assert.equal(
          (await ok(`/api/orders/${state.order}`, undefined, undefined, fresh.tab)).id,
          state.order,
        )
        await fresh.tab.screenshot({ path: `${root}/S-restored-admin.png`, fullPage: true })
        return { status: 200, sourceEnrolledCredential: true, restoredOrderReadable: true }
      },
    )
    await check(
      'T restored public article community and original media byte equality',
      async () => {
        const visitor = await actor('restored-visitor', false)
        for (const [path, text] of [
          [state.articlePath, 'Golden otter semaphore 18C'],
          [state.scheduledPath, 'Copper kestrel relay 18C'],
          [state.discussionPath, '18C readers discuss durable publishing'],
        ]) {
          const response = await visitor.tab.goto(origin + path, { waitUntil: 'domcontentloaded' })
          assert.equal(response.status(), 200, path)
          assert.ok((await visitor.tab.textContent('body')).includes(text), path)
        }
        const media = await visitor.tab.evaluate(async (id) => {
          const response = await fetch(`/media/${id}`)
          return {
            status: response.status,
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
          }
        }, state.media)
        assert.equal(media.status, 200)
        const restoredSha256 = digest(Buffer.from(media.bytes))
        assert.equal(restoredSha256, state.originalSha256)
        await visitor.tab.screenshot({ path: `${root}/T-restored-public.png`, fullPage: true })
        return {
          originalSha256: state.originalSha256,
          restoredSha256,
          bytes: media.bytes.length,
          publicPages: 3,
        }
      },
    )
  }
  if (phase === 'modules-local') {
    await check(
      'Enabled events module native action renders event and iCalendar output',
      async () => {
        const event = state.event
          ? await ok(`/api/events/${state.event}`)
          : (
              await ok('/api/events', {
                site: state.site,
                publication: state.publication,
                title: '18C Local Reader Assembly',
                slug: '18c-reader-assembly',
                status: 'published',
                visibility: 'public',
                startsAt: '2026-11-20T18:00:00.000Z',
                endsAt: '2026-11-20T19:00:00.000Z',
                timeZone: 'America/Chicago',
                venueName: 'Disposable acceptance venue',
                attendanceMode: 'in-person',
                summary: 'A local acceptance event, with no external invitations.',
              })
            ).doc
        if (profileProbe)
          await ok(
            `/api/events/${event.id}`,
            { summary: `Real operator update under ${profileProbe}.` },
            'PATCH',
          )
        state.event = event.id
        await save()
        const visitor = await actor('event-visitor', false)
        assert.equal(
          (
            await visitor.tab.goto(origin + event.canonicalPath, { waitUntil: 'domcontentloaded' })
          ).status(),
          200,
        )
        assert.ok((await visitor.tab.textContent('body')).includes('18C Local Reader Assembly'))
        const ics = await visitor.tab.evaluate(async () => {
          const r = await fetch('/events/feed.ics')
          return { status: r.status, text: await r.text() }
        })
        assert.equal(ics.status, 200)
        assert.ok(ics.text.includes('18C Local Reader Assembly'))
        await writeFile(`${root}/modules-events${artifactSuffix}.ics`, ics.text)
        return {
          event: event.id,
          canonicalPath: event.canonicalPath,
          publicStatus: 200,
          icsStatus: 200,
        }
      },
    )
    await check(
      'Enabled sources module saves source and attaches canonical article bibliography reference',
      async () => {
        const source =
          (await ok('/api/sources?where[title][equals]=18C%20Original%20Reporting%20Notes&depth=0'))
            .docs[0] ??
          (
            await ok('/api/sources', {
              site: state.site,
              title: '18C Original Reporting Notes',
              sourceType: 'report',
              url: `${origin}/about-18c#reporting-notes`,
              publisher: 'Independent Journal',
              excerpt: 'Locally authored verification notes.',
              accessedAt: new Date().toISOString(),
            })
          ).doc
        state.source = source.id
        if (profileProbe)
          await ok(
            `/api/sources/${source.id}`,
            { excerpt: `Reviewed reporting notes under ${profileProbe}.` },
            'PATCH',
          )
        await save()
        const companion = (
          await ok(`/api/article-family-content?where[content][equals]=${state.article}&depth=0`)
        ).docs[0]
        await ok(
          `/api/article-family-content/${companion.id}`,
          {
            sourceReferences: [
              {
                sourceReferenceId: '18c-notes',
                source: source.id,
                bibliographyKey: '18c-report',
                publicVisibility: 'public',
                locator: 'Reporting notes',
              },
            ],
          },
          'PATCH',
        )
        const content = await ok(`/api/article-family-content/${companion.id}?depth=0`)
        assert.equal(content.sourceReferences[0].source, source.id)
        state.source = source.id
        await save()
        return { source: source.id, article: state.article, persistedReference: true }
      },
    )
    await check(
      'Enabled forms and CRM modules: saved schema UI submission executes contact/task intake',
      async () => {
        if (!state.form) {
          const form = (
            await ok('/api/form-definitions', {
              site: state.site,
              name: '18C Reader Intake',
              title: 'Contact the Independent Journal',
              publicPath: '/forms/18c-reader-intake',
              visibility: 'public',
              actions: [
                { type: 'create-contact', emailField: 'email', nameField: 'name' },
                { type: 'create-task', title: '18C follow up with reader' },
              ],
            })
          ).doc
          const schema = (
            await ok('/api/form-schemas', {
              form: form.id,
              version: 1,
              state: 'published',
              locale: 'en',
              consentText: 'Contact me only about this local acceptance request.',
              consentRevision: '18c-v1',
              schema: {
                fields: [
                  { key: 'email', type: 'email', label: 'Email', required: true },
                  { key: 'name', type: 'text', label: 'Name', required: true },
                ],
              },
            })
          ).doc
          await ok(`/api/form-definitions/${form.id}`, { activeSchema: schema.id }, 'PATCH')
          state.form = form.id
          await save()
        }
        const visitor = await actor('form-visitor', false)
        const invalid = await api(
          `/api/forms/${state.form}`,
          { values: { email: 'invalid' }, idempotencyKey: '18c-invalid-answers-001' },
          'POST',
          visitor.tab,
        )
        assert.equal(invalid.status, 422)
        await visitor.tab.goto(`${origin}/forms/18c-reader-intake`, {
          waitUntil: 'domcontentloaded',
        })
        await visitor.tab.getByLabel('Email', { exact: false }).fill('intake-reader@rc118c.test')
        await visitor.tab.getByLabel('Name', { exact: false }).fill('18C Intake Reader')
        const submitted = visitor.tab.waitForResponse(
          (r) => r.url().endsWith(`/api/forms/${state.form}`) && r.request().method() === 'POST',
        )
        await visitor.tab.getByRole('button', { name: 'Submit', exact: true }).click()
        const response = await submitted
        const receipt = await response.json()
        assert.equal(response.status(), 201, JSON.stringify(receipt))
        state.submission = receipt.submissionId
        await save()
        for (let i = 0; i < 90; i++) {
          if (
            sql(`select status from form_submissions where id='${state.submission}'`) === 'triaged'
          )
            break
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        assert.equal(
          sql(`select status from form_submissions where id='${state.submission}'`),
          'triaged',
        )
        assert.equal(
          sql("select count(*) from contacts where email='intake-reader@rc118c.test'"),
          '1',
        )
        const actions = JSON.parse(
          sql(`select action_state from form_submissions where id='${state.submission}'`),
        )
        assert.equal(actions.length, 2)
        assert.ok(actions.every((action) => action.status === 'completed'))
        await visitor.tab.screenshot({
          path: `${root}/modules-form-intake${artifactSuffix}.png`,
          fullPage: true,
        })
        return {
          form: state.form,
          submission: state.submission,
          persistedStatus: 'triaged',
          contacts: 1,
          actions: actions.map(({ type, status, resultId }) => ({ type, status, resultId })),
          invalidAnswersDenied: invalid.status,
        }
      },
    )
    await check(
      'Enabled integrations module issues rotates and revokes a scoped machine credential',
      async () => {
        const issued = await ok('/api/admin/integrations', {
          action: 'create-client',
          siteId: state.site,
          name: '18C disposable machine client',
          scopes: ['content.read'],
        })
        assert.ok(issued.token)
        const firstHash = sql(`select token_hash from api_clients where id='${issued.client.id}'`)
        const rotated = await ok('/api/admin/integrations', {
          action: 'rotate-client-secret',
          clientId: issued.client.id,
        })
        assert.ok(rotated.token)
        assert.notEqual(rotated.token, issued.token)
        assert.notEqual(
          sql(`select token_hash from api_clients where id='${issued.client.id}'`),
          firstHash,
        )
        const scoped = await actor('staff')
        const denied = await api(
          '/api/admin/integrations',
          {
            action: 'create-client',
            siteId: state.foreignSite,
            name: 'Denied foreign client',
            scopes: ['content.read'],
          },
          'POST',
          scoped.tab,
        )
        assert.equal(denied.status, 403)
        await ok('/api/admin/integrations', { action: 'revoke-client', clientId: issued.client.id })
        assert.equal(
          sql(`select revoked_at is not null from api_clients where id='${issued.client.id}'`),
          't',
        )
        return {
          client: issued.client.id,
          rotated: true,
          revoked: true,
          foreignSiteDenied: denied.status,
          tokenValues: '[withheld]',
        }
      },
    )
  }
  if (phase === 'audit-negative') {
    const staff = await actor('staff')
    await check(
      'Foreign-site rendered quality audit is denied before findings can persist',
      async () => {
        const before = sql(
          `select count(*) from quality_scans where site_id='${state.foreignSite}'`,
        )
        const result = await api(
          '/api/admin/discovery/audit',
          { siteId: state.foreignSite, concurrency: 1 },
          'POST',
          staff.tab,
        )
        const after = sql(`select count(*) from quality_scans where site_id='${state.foreignSite}'`)
        await writeFile(
          `${root}/${run}-audit-negative-state.json`,
          JSON.stringify({ status: result.status, response: result.body, before, after }, null, 2),
        )
        assert.equal(
          result.status,
          403,
          JSON.stringify({ before, after, response: result.body }).slice(0, 600),
        )
        assert.equal(after, before)
        return { status: result.status, before, after }
      },
    )
  }
  if (phase === 'audit-positive') {
    await check(
      'Enabled quality module fetches real HTTPS pages and persists rendered findings',
      async () => {
        const audit = await ok('/api/admin/discovery/audit', { siteId: state.site, concurrency: 2 })
        const article = audit.pages.find((p) => new URL(p.url).pathname === state.articlePath)
        assert.ok(article, 'The published article was included in the actual rendered audit')
        assert.equal(article.status, 200)
        assert.ok(article.text.includes('Golden otter semaphore 18C'))
        assert.ok(audit.lifecycle.scanId)
        assert.equal(
          sql(`select status from quality_scans where id='${audit.lifecycle.scanId}'`),
          'completed',
        )
        await writeFile(
          `${root}/quality-rendered-audit${artifactSuffix}.json`,
          JSON.stringify(audit, null, 2),
        )
        return {
          pages: audit.pages.length,
          articleStatus: article.status,
          actualHttpFetch: true,
          scanId: audit.lifecycle.scanId,
          findings: audit.issues.length,
          lifecycle: audit.lifecycle,
        }
      },
    )
  }
  if (phase === 'network-local') {
    await check(
      'Enabled network module: independent local peer signed Follow and actual signed Accept',
      async () => {
        if (!state.networkAccount) {
          state.networkAccount = (
            await ok('/api/social-accounts', {
              site: state.site,
              publication: state.publication,
              displayName: '18C local publication actor',
              network: 'activitypub',
              actorType: 'publication',
              externalAccountId: 'main',
              capabilityState: 'available',
              credentialHealth: 'healthy',
            })
          ).doc.id
          await save()
        }
        const visitor = await actor('network-visitor', false)
        const actorResponse = await ok('/ap/actors/main', undefined, undefined, visitor.tab)
        assert.equal(actorResponse.id, `${origin}/ap/actors/main`)
        const before = sql('select count(*) from inbound_network_activities')
        assert.equal(peer('/send', { invalid: true }).inboxStatus, 401)
        assert.equal(sql('select count(*) from inbound_network_activities'), before)
        const first = peer('/send', {})
        assert.equal(first.inboxStatus, 202, JSON.stringify(first))
        assert.equal(peer('/send', {}).inboxStatus, 202)
        assert.equal(
          sql(
            "select count(*) from network_relationships where direction='inbound' and kind='follow'",
          ),
          '1',
        )
        let stats
        for (let i = 0; i < 90; i++) {
          stats = peer('/stats')
          if (stats.inbox.length) break
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        assert.equal(stats.inbox.length, 1, JSON.stringify(stats))
        assert.equal(stats.inbox[0].verified, true)
        assert.equal(stats.inbox[0].body.type, 'Accept')
        assert.equal(
          sql("select count(*) from outbound_network_deliveries where status='delivered'"),
          '1',
        )
        await writeFile(`${root}/network-local-peer.json`, JSON.stringify(stats, null, 2))
        return {
          localOnly: true,
          badSignature: 401,
          follow: 202,
          replay: 202,
          relationships: 1,
          signedAcceptCopies: 1,
          delivered: 1,
        }
      },
    )
  }
  if (phase === 'social-local') {
    if (!profileProbe && !state.socialAccount)
      await check(
        'Local social connection denies foreign and anonymous operators and persists failed credentials truthfully before retry',
        async () => {
          const staff = await actor('staff')
          const anonymous = await actor('social-anonymous', false)
          const before = sql('select count(*) from social_accounts')
          const request = {
            action: 'connect',
            siteId: state.foreignSite,
            network: 'bluesky',
            mode: 'local-harness',
            externalAccountId: 'did:plc:rc118cpeer',
            credentials: {
              identifier: 'journal.rc118c.test',
              appPassword: 'disposable-local-password',
              service: 'https://127.0.0.1:3450',
            },
          }
          const foreign = await api('/api/admin/social/accounts', request, 'POST', staff.tab)
          assert.equal(foreign.status, 403)
          const denied = await api(
            '/api/admin/social/accounts',
            { ...request, siteId: state.site },
            'POST',
            anonymous.tab,
          )
          assert.equal(denied.status, 403)
          assert.equal(sql('select count(*) from social_accounts'), before)
          const failed = await ok('/api/admin/social/accounts', {
            ...request,
            siteId: state.site,
            credentials: { ...request.credentials, appPassword: 'wrong-local-password' },
          })
          assert.equal(failed.success, false)
          assert.equal(failed.account.credentialHealth, 'revoked')
          assert.equal(failed.account.capabilityState, 'unavailable')
          assert.equal(
            sql(`select credential_health from social_accounts where id='${failed.account.id}'`),
            'revoked',
          )
          assert.equal(peer('/stats').recordCount, 0)
          state.failedSocialAccount = failed.account.id
          await save()
          return {
            foreignSite: foreign.status,
            anonymous: denied.status,
            failedCredentialHealth: 'revoked',
            capability: 'unavailable',
            localPosts: 0,
            account: failed.account.id,
          }
        },
      )
    await check(
      'Enabled social module approved draft is actually published once to isolated Bluesky adapter',
      async () => {
        if (profileProbe) {
          state.profileSocialDrafts ??= { primary: state.socialDraft }
          state.socialDraft = state.profileSocialDrafts[profileProbe]
        }
        if (!state.socialAccount) {
          const connection = await ok('/api/admin/social/accounts', {
            action: 'connect',
            siteId: state.site,
            network: 'bluesky',
            displayName: '18C local adapter account',
            actorType: 'site',
            externalAccountId: 'did:plc:rc118cpeer',
            mode: 'local-harness',
            credentials: {
              identifier: 'journal.rc118c.test',
              appPassword: 'disposable-local-password',
              service: 'https://127.0.0.1:3450',
            },
          })
          assert.equal(connection.account.credentialHealth, 'healthy', JSON.stringify(connection))
          if (state.failedSocialAccount)
            assert.equal(connection.account.id, state.failedSocialAccount)
          state.socialAccount = connection.account.id
          await save()
        }
        if (!state.socialDraft) {
          const created = await ok('/api/admin/social/drafts', {
            action: 'create-draft',
            siteId: state.site,
            title: '18C approved local distribution',
            sourceContentId: state.article,
            variants: [
              {
                accountId: state.socialAccount,
                network: 'bluesky',
                text: '18C independent journal verification. Local adapter acceptance only; no external post.',
              },
            ],
          })
          state.socialDraft = created.draft.id
          state.socialRecordTarget = peer('/stats').recordCount + 1
          if (profileProbe) state.profileSocialDrafts[profileProbe] = state.socialDraft
          await save()
          for (const action of ['submit-review', 'approve'])
            await ok('/api/admin/social/drafts', { action, draftId: state.socialDraft })
          await ok('/api/admin/social/drafts', {
            action: 'schedule',
            draftId: state.socialDraft,
            scheduledFor: new Date(Date.now() + 5000).toISOString(),
            timeZone: 'UTC',
          })
        }
        for (let i = 0; i < 120; i++) {
          if (
            sql(`select status from social_drafts where id='${state.socialDraft}'`) === 'published'
          )
            break
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        const detail = await ok(`/api/admin/social/drafts?draftId=${state.socialDraft}`)
        assert.equal(detail.draft.status, 'published', JSON.stringify(detail).slice(0, 2200))
        const stats = peer('/stats')
        assert.equal(stats.recordCount, state.socialRecordTarget)
        assert.equal(detail.externalPosts.length, 1)
        await writeFile(
          `${root}/social-local-adapter${artifactSuffix}.json`,
          JSON.stringify(
            {
              draft: detail.draft.id,
              status: detail.draft.status,
              externalPosts: detail.externalPosts.map((p) => ({
                id: p.id,
                remotePostId: p.remotePostId,
                remoteUrl: p.remoteUrl,
              })),
              localProviderRecords: stats.recordCount,
            },
            null,
            2,
          ),
        )
        return {
          localOnly: true,
          draft: state.socialDraft,
          status: detail.draft.status,
          providerRecords: stats.recordCount,
          externalPosts: 1,
        }
      },
    )
  }
  if (phase === 'modules-editorial') {
    await check(
      'Enabled media-studio module publishes a book and chapter backed by approved real content',
      async () => {
        const book = (
          await ok('/api/books', {
            site: state.site,
            publication: state.publication,
            title: '18C Durable Publishing Handbook',
            slug: `18c-handbook${profileProbe ? `-${profileProbe.toLowerCase()}` : ''}`,
            description: 'A real local handbook of the independent journal publishing journey.',
            status: 'draft',
            cover: state.media,
            visibility: 'public',
          })
        ).doc
        const chapter = (
          await ok('/api/book-chapters', {
            book: book.id,
            content: state.page,
            title: 'About our independent journal',
            slug: '18c-about',
            canonicalPath: `${book.canonicalPath}/18c-about`,
            displayOrder: 1,
            status: 'published',
            publishedAt: new Date().toISOString(),
          })
        ).doc
        await ok(
          `/api/books/${book.id}`,
          { status: 'published', publishedAt: new Date().toISOString() },
          'PATCH',
        )
        const visitor = await actor('book-visitor', false)
        assert.equal(
          (
            await visitor.tab.goto(origin + book.canonicalPath, { waitUntil: 'domcontentloaded' })
          ).status(),
          200,
        )
        assert.ok(
          (await visitor.tab.textContent('body')).includes('18C Durable Publishing Handbook'),
        )
        await visitor.tab.screenshot({
          path: `${root}/modules-book${artifactSuffix}.png`,
          fullPage: true,
        })
        state.book = book.id
        state.chapter = chapter.id
        await save()
        return {
          book: book.id,
          chapter: chapter.id,
          canonicalPath: book.canonicalPath,
          publicStatus: 200,
        }
      },
    )
    await check(
      'Enabled collaboration module canonical checkpoint emits durable event and rejects stale revision',
      async () => {
        const owner = (await ok('/api/users?where[email][equals]=owner%40rc118c.test&depth=0'))
          .docs[0]
        state.ownerId = owner.id
        const memberships = await ok(
          `/api/team-memberships?where[member][equals]=${owner.member}&where[publication][equals]=${state.publication}&depth=0`,
        )
        if (!memberships.docs.length)
          await ok('/api/team-memberships', {
            site: state.site,
            publication: state.publication,
            scopeKind: 'publication',
            member: owner.member,
            role: 'owner',
            status: 'active',
            grants: [],
          })
        const content = (
          await ok('/api/content', {
            site: state.site,
            publication: state.publication,
            contentType: 'article',
            title: '18C Collaborative Release Story',
            slug: `18c-collaborative-release${profileProbe ? `-${profileProbe.toLowerCase()}` : ''}`,
            status: 'draft',
            visibility: 'public',
            summary: 'A collaborative draft becomes a coordinated release.',
            body: richText('The initial collaborative draft preserves a real canonical body.'),
          })
        ).doc
        const companion = (
          await ok(`/api/article-family-content?where[content][equals]=${content.id}&depth=0`)
        ).docs[0]
        const document = richText(
          '18C collaborative checkpoint: supported editing produced this durable canonical revision.',
        )
        const input = {
          document: {
            format: 'payload-lexical',
            schemaVersion: 1,
            document,
            canonicalHash: hashRichTextDocument(document),
            plainTextProjection:
              '18C collaborative checkpoint: supported editing produced this durable canonical revision.',
            unknownNodePolicy: 'preserve',
          },
          baseRevisionId: companion.currentRevision,
          mutationId: `18c-checkpoint-${companion.id}`,
        }
        const checkpoint = await ok(`/api/realtime/drafts/${companion.id}/checkpoint`, input)
        const stale = await api(`/api/realtime/drafts/${companion.id}/checkpoint`, {
          ...input,
          mutationId: '18c-stale-checkpoint-002',
        })
        assert.equal(stale.status, 409)
        const persisted = await ok(`/api/article-family-content/${companion.id}?depth=0`)
        assert.equal(persisted.currentRevision, checkpoint.currentRevisionId)
        assert.equal(
          sql(
            `select count(*) from realtime_events where article_id='${companion.id}' and kind='draft.checkpointed'`,
          ),
          '1',
        )
        state.releaseArticle = content.id
        state.releaseCompanion = companion.id
        state.releasePath = content.canonicalPath
        await save()
        return {
          content: content.id,
          companion: companion.id,
          revision: checkpoint.currentRevisionId,
          emittedEvents: 1,
          staleRevisionDenied: stale.status,
        }
      },
    )
  }
  if (phase === 'experiences') {
    await check(
      'Enabled experiences and analytics modules measure a real consented form outcome and human winner decision',
      async () => {
        await ok('/api/globals/site-settings', {
          privacy: { analyticsEnabled: true },
          adminExperience: {
            optionalCapabilities: { analyticsReporting: true, experiments: true },
          },
        })
        if (!state.experiment) {
          const experiment = (
            await ok('/api/experiments', {
              site: state.site,
              name: 'Homepage Hero CTA & Reader Onboarding Optimization',
              description: 'Local acceptance experiment; no statistical production claim.',
              state: 'draft',
              conversionForm: state.form,
              assignmentSalt: 'rc118c-disposable-assignment',
              collectionEnabled: true,
            })
          ).doc
          state.experiment = experiment.id
          await save()
          for (const [name, isControl] of [
            ['Control', true],
            ['Treatment', false],
          ])
            await ok('/api/experiment-variants', {
              site: state.site,
              experiment: experiment.id,
              name,
              isControl,
              allocation: 50,
              registeredComponent: isControl ? 'publisher.newsletter-cta' : 'publisher.cta',
            })
          await ok(
            `/api/experiments/${experiment.id}`,
            { state: 'approved', approvedBy: state.ownerId, approvedAt: new Date().toISOString() },
            'PATCH',
          )
          await ok(
            `/api/experiments/${experiment.id}`,
            { state: 'running', startedAt: new Date().toISOString() },
            'PATCH',
          )
        }
        const currentExperiment = await ok(`/api/experiments/${state.experiment}`)
        if (currentExperiment.state === 'paused')
          await ok(
            `/api/experiments/${state.experiment}`,
            { state: 'running', startedAt: new Date().toISOString() },
            'PATCH',
          )
        const visitor = await actor('experiment-visitor', false)
        await ok(
          '/api/analytics/consent',
          {
            siteId: state.site,
            choices: { analytics: true, personalization: true, marketing: false },
          },
          'POST',
          visitor.tab,
        )
        const active = await ok(
          `/api/experiences/active?siteId=${state.site}`,
          undefined,
          undefined,
          visitor.tab,
        )
        assert.equal(active.experiment.configurationStatus, 'configured')
        assert.equal(active.consented, true)
        const variant = active.assignedVariant.id
        const exposuresBefore = Number(
          sql("select count(*) from analytics_events where event_type='experiment_exposure'"),
        )
        const exposed = await api(
          '/api/experiences/exposure',
          { siteId: state.site, experimentId: state.experiment, variantId: variant },
          'POST',
          visitor.tab,
        )
        assert.equal(exposed.status, 201)
        assert.equal(
          Number(
            sql("select count(*) from analytics_events where event_type='experiment_exposure'"),
          ),
          exposuresBefore + 1,
        )
        const exposureReplay = await api(
          '/api/experiences/exposure',
          { siteId: state.site, experimentId: state.experiment, variantId: variant },
          'POST',
          visitor.tab,
        )
        assert.equal(exposureReplay.status, 202)
        assert.equal(
          Number(
            sql("select count(*) from analytics_events where event_type='experiment_exposure'"),
          ),
          exposuresBefore + 1,
        )
        await visitor.tab.goto(`${origin}/forms/18c-reader-intake`, {
          waitUntil: 'domcontentloaded',
        })
        await visitor.tab.waitForLoadState('networkidle')
        await visitor.tab.getByLabel('Email').fill('experiment-reader@rc118c.test')
        await visitor.tab.getByLabel('Name').fill('18C Consented Experiment Reader')
        const submitted = visitor.tab.waitForResponse(
          (r) => r.url().endsWith(`/api/forms/${state.form}`) && r.request().method() === 'POST',
        )
        await visitor.tab.getByRole('button', { name: 'Submit', exact: true }).click()
        const receipt = await (await submitted).json()
        const conversionsBefore = Number(
          sql("select count(*) from analytics_events where event_type='experiment_conversion'"),
        )
        const conversion = await api(
          '/api/experiences/conversion',
          {
            siteId: state.site,
            experimentId: state.experiment,
            variantId: variant,
            submissionId: receipt.submissionId,
          },
          'POST',
          visitor.tab,
        )
        assert.equal(conversion.status, 201, JSON.stringify(conversion))
        assert.equal(
          Number(
            sql("select count(*) from analytics_events where event_type='experiment_conversion'"),
          ),
          conversionsBefore + 1,
        )
        await ok('/api/admin/telemetry/experiment/winner', {
          siteId: state.site,
          experimentId: state.experiment,
          selectedVariantId: variant,
          reason:
            'Explicit local acceptance decision after one real form outcome; no statistical significance claim.',
        })
        assert.equal(
          sql(`select state from experiments where id='${state.experiment}'`),
          'winner-selected',
        )
        await ok('/api/admin/telemetry/experiment/winner', {
          action: 'rollback',
          siteId: state.site,
          experimentId: state.experiment,
          selectedVariantId: variant,
          reason:
            'Return the acceptance experiment to its prior running state after verifying the decision journal.',
        })
        assert.equal(sql(`select state from experiments where id='${state.experiment}'`), 'paused')
        await visitor.tab.screenshot({
          path: `${root}/modules-consented-form${artifactSuffix}.png`,
          fullPage: true,
        })
        const report = await ok(`/api/analytics/report?siteId=${state.site}`)
        assert.ok(
          report.recentEvents.some(
            (event) =>
              event.type === 'experiment_conversion' || event.eventType === 'experiment_conversion',
          ),
        )
        state.experimentSubmission = receipt.submissionId
        await save()
        return {
          experiment: state.experiment,
          selectedVariant: variant,
          canonicalSubmission: receipt.submissionId,
          exposure: exposed.status,
          conversion: conversion.status,
          winnerAndRollbackPersisted: true,
          eventCount: report.eventCount,
        }
      },
    )
  }
  if (phase === 'release') {
    await check(
      'Enabled releases module pins reviewed canonical revision and worker executes it once',
      async () => {
        const reviewer = await actor('staff')
        await ok('/api/admin/workflow/actions', {
          articleId: state.releaseArticle,
          action: 'submit',
          actorSiteId: state.site,
        })
        await ok(
          '/api/admin/workflow/actions',
          {
            articleId: state.releaseArticle,
            action: 'approve',
            actorSiteId: state.site,
            comment: 'Independent release review of the collaborative canonical checkpoint.',
          },
          'POST',
          reviewer.tab,
        )
        const companion = await ok(`/api/article-family-content/${state.releaseCompanion}?depth=0`)
        const scheduledFor = new Date(Date.now() + 20000).toISOString()
        const created = await ok('/api/admin/releases', {
          siteId: state.site,
          publicationId: state.publication,
          name: '18C Coordinated Browser Release',
          purpose: 'Publish the reviewed real collaborative draft through the release worker.',
          ownerTeam: 'Independent editors',
          plannedInstant: scheduledFor,
          timeZone: 'UTC',
        })
        state.release = created.release.id
        await save()
        await ok(`/api/admin/releases/${state.release}`, {
          action: 'pin-artifact',
          artifact: {
            targetType: 'article',
            targetId: companion.id,
            title: '18C Collaborative Release Story',
            canonicalUrl: origin + state.releasePath,
            pinnedRevisionId: companion.currentRevision,
            pinnedRevisionSequence: companion.currentRevisionSequence,
            pinnedHash: companion.document.canonicalHash,
          },
        })
        await ok(`/api/admin/releases/${state.release}`, { action: 'submit-review' })
        await ok(`/api/admin/releases/${state.release}`, {
          action: 'approve',
          comment: 'Approve the exact pinned inputs for isolated worker execution.',
        })
        await ok(`/api/admin/releases/${state.release}`, {
          action: 'schedule',
          scheduledFor,
          timeZone: 'UTC',
          idempotencyKey: '18c-coordinated-release-001',
        })
        for (let i = 0; i < 150; i++) {
          if (
            sql(`select status from content_releases where id='${state.release}'`) === 'completed'
          )
            break
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        const result = await ok(`/api/admin/releases/${state.release}`)
        assert.equal(result.release.status, 'completed', JSON.stringify(result).slice(0, 1800))
        assert.equal(
          sql(`select status from content where id='${state.releaseArticle}'`),
          'published',
        )
        assert.ok(
          result.release.executionItems.every(
            (item) => item.status === 'succeeded' && item.attempts === 1,
          ),
        )
        const visitor = await actor('released-story-visitor', false)
        const rendered = await visitor.tab.goto(origin + state.releasePath)
        assert.equal(rendered.status(), 200)
        assert.ok((await visitor.tab.textContent('body')).includes('18C'))
        await visitor.tab.screenshot({ path: `${root}/${run}-released-story.png`, fullPage: true })
        return {
          release: state.release,
          status: result.release.status,
          publishedArticle: state.releaseArticle,
          executionItems: result.release.executionItems.map(({ id, status, attempts }) => ({
            id,
            status,
            attempts,
          })),
        }
      },
    )
  }
  if (phase === 'profile') {
    assert.match(profileProbe, /^(Lean|Standard)-(default|all)$/)
    await check('Profile federation boundary follows production resource policy', async () => {
      const expected = profileProbe === 'Standard-all' ? 200 : 404
      const response = await api('/ap/actors/main')
      assert.equal(response.status, expected)
      return {
        profile: profileProbe,
        actorStatus: response.status,
        networkingEnabled: expected === 200,
        pendingOrCompletedNetworkRecordsPreserved: sql(
          'select count(*) from network_relationships',
        ),
      }
    })
    await check(
      'Profile core publishing persists through separate review and public rendering',
      async () => {
        const reviewer = await actor('staff')
        const slug = `18c-profile-${profileProbe.toLowerCase()}-${Date.now()}`
        const doc = (
          await ok('/api/content', {
            site: state.site,
            publication: state.publication,
            contentType: 'article',
            title: `18C ${profileProbe} ordinary publishing`,
            slug,
            status: 'draft',
            visibility: 'public',
            body: richText(`Verified ordinary publishing under ${profileProbe}.`),
          })
        ).doc
        await ok('/api/admin/workflow/actions', {
          articleId: doc.id,
          action: 'submit',
          actorSiteId: state.site,
        })
        const self = await api('/api/admin/workflow/actions', {
          articleId: doc.id,
          action: 'approve',
          actorSiteId: state.site,
        })
        assert.equal(self.status, 403)
        await ok(
          '/api/admin/workflow/actions',
          { articleId: doc.id, action: 'approve', actorSiteId: state.site },
          'POST',
          reviewer.tab,
        )
        await ok(
          `/api/content/${doc.id}`,
          { status: 'published', publishedAt: new Date().toISOString() },
          'PATCH',
        )
        assert.equal(sql(`select status from content where id='${doc.id}'`), 'published')
        const visitor = await actor('profile-visitor', false)
        const rendered = await visitor.tab.goto(origin + doc.canonicalPath)
        assert.equal(rendered.status(), 200)
        assert.ok(
          (await visitor.tab.textContent('body')).includes(
            `Verified ordinary publishing under ${profileProbe}.`,
          ),
        )
        await visitor.tab.screenshot({ path: `${root}/${run}-public.png`, fullPage: true })
        const foreignBefore = sql(`select name from sites where id='${state.foreignSite}'`)
        const foreign = await api(
          `/api/sites/${state.foreignSite}`,
          { name: 'Unauthorized profile mutation' },
          'PATCH',
          reviewer.tab,
        )
        assert.equal(foreign.status, 403)
        assert.equal(sql(`select name from sites where id='${state.foreignSite}'`), foreignBefore)
        const denied = await api(
          '/api/admin/workflow/actions',
          { articleId: doc.id, action: 'approve' },
          'POST',
          visitor.tab,
        )
        assert.equal(denied.status, 403)
        return {
          profile: profileProbe,
          article: doc.id,
          canonicalPath: doc.canonicalPath,
          persisted: 'published',
          publicStatus: 200,
          selfApproval: self.status,
          foreignSite: foreign.status,
          anonymousOperator: denied.status,
        }
      },
    )
    if (profileProbe.endsWith('-default'))
      await check(
        'Default profile optional modules stay unavailable without losing stored data',
        async () => {
          const results = {}
          for (const slug of [
            'events',
            'books',
            'social-drafts',
            'form-definitions',
            'products',
            'discussions',
          ]) {
            const response = await api(`/api/${slug}?limit=1`)
            assert.equal(response.status, 404, `${slug}: ${response.status}`)
            results[slug] = response.status
          }
          const commerce = await api('/api/commerce/cart')
          assert.equal(commerce.status, 503)
          const community = await api('/api/community/threads')
          assert.equal(community.status, 503)
          assert.equal(sql(`select status from content where id='${state.article}'`), 'published')
          return {
            native: results,
            commerce: commerce.status,
            community: community.status,
            originalArticlePreserved: true,
          }
        },
      )
  }
  assert.ok(checks.length, `Unknown or unexecuted journey phase: ${phase}`)
} catch (error) {
  console.error(String(error))
  for (const a of actorTraces)
    for (const tab of a.ctx.pages())
      await tab
        .screenshot({ path: `${scratch}/${run}-${a.name}-failure.png`, fullPage: true })
        .catch(() => {})
  await page.screenshot({ path: `${scratch}/${run}-failure.png`, fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  for (const a of actorTraces)
    await a.ctx.tracing
      .stop({ path: `${scratch}/${run}-${a.name}-${a.index}-raw-trace.zip` })
      .catch(() => {})
  await context.tracing.stop({ path: `${scratch}/${run}-raw-trace.zip` })
  await writeFile(`${root}/${run}-browser-events.json`, JSON.stringify(events, null, 2))
  await browser.close()
}
