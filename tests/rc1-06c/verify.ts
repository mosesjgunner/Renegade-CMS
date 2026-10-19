/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_06C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5448/rc106c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/06C'
const base = 'http://localhost:38982'
const trace: any[] = []
let checks = 0
let succeeded = false
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const restart = process.argv.includes('--restart')
const controls = process.argv.includes('--controls')

const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  status: number | number[] = 200,
  headers: Record<string, string> = {},
) => {
  const raw = await new Promise<{ status: number; headers: Headers; text: string }>(
    (resolve, reject) => {
      const request = http.request(
        `${base}${route}`,
        {
          method,
          headers: {
            origin: base,
            ...(cookie ? { cookie } : {}),
            ...(data ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
        },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              headers: new Headers(
                Object.entries(response.headers).flatMap(([key, value]) =>
                  value === undefined ? [] : [[key, String(value)] as [string, string]],
                ),
              ),
              text,
            }),
          )
          response.on('error', reject)
        },
      )
      request.setTimeout(180000, () => request.destroy(new Error('request timed out')))
      request.on('error', reject)
      request.end(data ? JSON.stringify(data) : undefined)
    },
  )
  const response = { status: raw.status, headers: raw.headers }
  const text = raw.text
  trace.push({
    route,
    method,
    status: response.status,
    bytes: text.length,
    etag: response.headers.get('etag'),
    location: response.headers.get('location'),
    contentType: response.headers.get('content-type'),
    robots: response.headers.get('x-robots-tag'),
  })
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${method} ${route}: ${text.slice(0, 600)}`,
  )
  return { response, text, json: () => JSON.parse(text) }
}
const session = async (user: any) => {
  const result = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${result.token}`
}
const body = (text: string) => ({
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
const search = async (query: string, extra = '') =>
  (await api(`/search?q=${encodeURIComponent(query)}${extra}`)).text
const rows = async () =>
  (
    await payload.db.pool.query(
      'SELECT collection, canonical_id, path, title, body FROM search_documents ORDER BY path',
    )
  ).rows
try {
  await mkdir(out, { recursive: true })
  if (controls) {
    const missing = await page.goto(`${base}/secret-page`)
    await page
      .getByRole('heading', { name: 'This published page was not found.', exact: true })
      .waitFor({ state: 'visible' })
    check(
      'anonymous protected-page UI visibly renders safe 404',
      missing?.status() === 404 &&
        !(await page.locator('body').innerText()).includes('PAGESECRET-06C'),
    )
    await page.screenshot({ path: `${out}/protected-page-visible.png`, fullPage: true })
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const retained = await payload.findByID({ collection: 'content', id: state.retained, depth: 0 })
    const owner = (
      await payload.find({ collection: 'users', where: { email: { equals: 'owner@rc106c.test' } } })
    ).docs[0]
    const cookie = await session(owner)
    const [name, value] = cookie.split('=')
    await page.context().addCookies([
      { name, value, url: base },
      { name: 'renegade-active-site', value: retained.site, url: base },
    ])
    await page.goto(`${base}/admin/indexing`, { timeout: 180000 })
    await page.getByRole('button', { name: 'Reconcile search projection', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Search rebuilt:' }).waitFor()
    check('Indexing Center real button invokes scoped POST and reports completion', true)
    const beta = (
      await payload.find({ collection: 'sites', where: { slug: { equals: 'beta-06c' } } })
    ).docs[0]
    const healthText = await page.locator('main table').first().textContent()
    check(
      'Indexing Center search health excludes foreign tenant',
      healthText?.includes(retained.site) && !healthText.includes(beta.id),
    )
    check(
      'UI reindex retains persisted public match',
      (await rows()).some((r: any) => r.canonical_id === state.retained),
    )
    await page.screenshot({ path: `${out}/indexing-controls.png`, fullPage: true })
  } else if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const html = await search('quartzprobe')
    check('restart: retained public match', html.includes('href="/articles/retained"'))
    check(
      'restart: deleted and nonpublic links suppressed',
      !html.includes('href="/articles/removed"') &&
        !html.includes('href="/articles/revised"') &&
        !html.includes('href="/articles/secret'),
    )
    check(
      'restart: republished body removed by later unpublication',
      !(await search('draftonlyprobe')).includes('href="/articles/revised-final"'),
    )
    await api('/articles/removed', 'GET', undefined, '', 404)
    await api('/secret-page', 'GET', undefined, '', 404)
    const projection = await rows()
    check(
      'restart: deleted projection absent',
      !projection.some((r: any) => r.canonical_id === state.removed),
    )
    check(
      'restart: publication/access persisted',
      (await payload.findByID({ collection: 'content', id: state.revised })).status === 'draft',
    )
    const redirect = await api('/old-06c?ref=restart', 'GET', undefined, '', 308)
    check(
      'restart: redirect destination retained',
      redirect.response.headers.get('location')?.endsWith('/articles/retained?ref=restart'),
    )
    await page.goto(`${base}/search?q=quartzprobe`)
    await page.getByRole('link', { name: 'Quartzprobe retained' }).waitFor({ state: 'visible' })
    check(
      'restart: anonymous browser match',
      (await page.getByRole('link', { name: 'Quartzprobe retained' }).count()) === 1,
    )
    await page.screenshot({ path: `${out}/restart-search.png`, fullPage: true })
  } else {
    const site = await payload.create({
      collection: 'sites',
      data: { name: '06C Alpha', slug: 'alpha-06c', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '06C Beta', slug: 'beta-06c', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@rc106c.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@rc106c.test', role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staff.member === 'string' ? staff.member : staff.member.id,
        site: beta.id,
        role: 'contributor',
      },
    })
    const cookie = `${await session(owner)}; renegade-active-site=${site.id}`
    const denied = `${await session(staff)}; renegade-active-site=${beta.id}`
    const publication = (
      await payload.find({ collection: 'publications', where: { site: { equals: site.id } } })
    ).docs[0]
    const betaPub = (
      await payload.find({ collection: 'publications', where: { site: { equals: beta.id } } })
    ).docs[0]
    await api(
      '/api/globals/site-settings',
      'POST',
      {
        siteName: '06C Search',
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [beta.id]: 'http://beta.rc106c.test:38982' },
        launchState: 'live',
        indexingMode: 'index',
        seoNoIndex: false,
      },
      cookie,
    )
    const create = async (slug: string, extra: any = {}) =>
      (
        await api(
          '/api/content',
          'POST',
          {
            site: site.id,
            publication: publication.id,
            slug,
            title: `Quartzprobe ${slug}`,
            contentType: 'article',
            status: 'published',
            visibility: 'public',
            body: body('bodyprobe Quartzprobe public original'),
            publishedAt: new Date().toISOString(),
            ...extra,
          },
          cookie,
          201,
        )
      ).json().doc
    const retained = await create('retained')
    await create('secondary', { title: 'Secondary note', body: body('quartzprobe in body only') })
    const revised = await create('revised')
    const removed = await create('removed', { status: 'draft' })
    await api(`/api/content/${removed.id}`, 'PATCH', { status: 'published' }, cookie)
    const exclusions = [
      await create('secret-draft', { status: 'draft', body: body('DRAFTSECRET-06C') }),
      await create('secret-private', { visibility: 'private', body: body('PRIVATESECRET-06C') }),
      await create('secret-members', { visibility: 'members' }),
      await create('secret-noindex', { seoNoIndex: true }),
      await create('secret-entitled', {
        requiredEntitlement: { resource: 'dispatch', capability: 'read' },
      }),
      await create('secret-foreign', { site: beta.id, publication: betaPub.id }),
    ]
    const protectedPage = await create('secret-page', {
      contentType: 'page',
      visibility: 'private',
      body: body('PAGESECRET-06C'),
    })
    const initial = await search('quartzprobe')
    check(
      'HTTP search matches canonical public links',
      ['retained', 'revised', 'removed'].every((slug) =>
        initial.includes(`href="/articles/${slug}"`),
      ),
    )
    check(
      'draft/private/noindex/entitled/foreign absent',
      exclusions.every((r) => !initial.includes(`href="${r.canonicalPath}"`)),
    )
    check(
      'body search matches published revision',
      (await search('bodyprobe')).includes('href="/articles/retained"'),
    )
    check(
      'date filter includes entire last day',
      (await search('quartzprobe', `&to=${retained.publishedAt.slice(0, 10)}`)).includes(
        'href="/articles/retained"',
      ),
    )
    check(
      'author/topic filters reach PostgreSQL',
      !(await search('quartzprobe', '&author=absent&topic=absent')).includes(
        'href="/articles/retained"',
      ),
    )
    check(
      'type filter suppresses articles',
      !(await search('quartzprobe', '&type=page')).includes('href="/articles/retained"'),
    )
    for (const invalid of [
      'page=0',
      'page=1.5',
      'page=999',
      'q=a&q=b',
      'from=2026-02-30',
      'from=bad',
      'from=2026-10-19&to=2026-10-18',
    ])
      await api(`/search?q=quartzprobe&${invalid}`, 'GET', undefined, '', 404)
    check('invalid filters and page boundaries fail safely', true)
    for (const slug of [
      'secret-draft',
      'secret-private',
      'secret-members',
      'secret-entitled',
      'missing-06c',
    ]) {
      const missing = await api(`/articles/${slug}`, 'GET', undefined, '', 404)
      check(
        `${slug}: safe raw 404 without protected body`,
        !missing.text.includes('DRAFTSECRET-06C') && !missing.text.includes('PRIVATESECRET-06C'),
      )
    }
    const privateHtml = await api(protectedPage.canonicalPath, 'GET', undefined, '', 404)
    check(
      'access-controlled page raw 404 has no private body',
      !privateHtml.text.includes('PAGESECRET-06C'),
    )
    await page.goto(`${base}${protectedPage.canonicalPath}`)
    check(
      'anonymous browser protected page displays safe 404',
      !(await page.content()).includes('PAGESECRET-06C') && (await page.content()).includes('404'),
    )
    await page.screenshot({ path: `${out}/protected-page.png`, fullPage: true })
    await api('/search?q=quartzprobe', 'GET', undefined, '', 404, { host: 'unknown.rc106c.test' })
    await api(`/search?q=quartzprobe&site=${beta.id}`, 'GET', undefined, '', 404)
    const betaSearch = await api('/search?q=quartzprobe', 'GET', undefined, '', 200, {
      host: 'beta.rc106c.test:38982',
    })
    check(
      'second tenant isolated',
      betaSearch.text.includes('href="/articles/secret-foreign"') &&
        !betaSearch.text.includes('href="/articles/retained"'),
    )
    await page.goto(`${base}/search`)
    await page.getByRole('searchbox').fill('quartzprobe')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.getByRole('link', { name: 'Quartzprobe retained' }).waitFor()
    check(
      'anonymous search form produces real results',
      (await page.locator('main article').count()) === 4,
    )
    check(
      'weighted title matches precede body-only hit',
      !(await page.locator('main article').first().textContent())?.includes('Secondary note'),
    )
    await page.getByRole('link', { name: 'Quartzprobe retained' }).click()
    check(
      'anonymous result link renders published body',
      (await page.locator('main').textContent())?.includes('bodyprobe'),
    )
    await page.goto(`${base}/search?q=quartzprobe`)
    await page.getByText('Filter results', { exact: true }).click()
    await page.getByLabel('Content type filter').fill('page')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page.getByText('No public results found', { exact: false }).waitFor()
    check(
      'anonymous filter UI submits and suppresses articles',
      (await page.locator('main article').count()) === 0,
    )
    await page.screenshot({ path: `${out}/search-filter.png`, fullPage: true })
    // All editorial mutations remain native authenticated HTTP, never status SQL.
    await api(
      `/api/content/${revised.id}`,
      'PATCH',
      { body: body('draftonlyprobe unpublished body'), status: 'updated' },
      cookie,
    )
    check(
      'draft-only edit not searchable before republish',
      !(await search('draftonlyprobe')).includes('href="/articles/revised"'),
    )
    await api(`/api/content/${revised.id}`, 'PATCH', { status: 'published' }, cookie)
    check(
      'republish updates projection and public match',
      (await search('draftonlyprobe')).includes('href="/articles/revised"'),
    )
    await api(`/api/content/${revised.id}`, 'PATCH', { slug: 'revised-new' }, cookie)
    check(
      'slug update repairs search link',
      (await search('draftonlyprobe')).includes('href="/articles/revised-new"'),
    )
    await api(`/api/content/${revised.id}`, 'PATCH', { slug: 'revised-final' }, cookie)
    const renamed = await api('/articles/revised', 'GET', undefined, '', 308)
    check(
      'repeat rename keeps earlier alias direct',
      renamed.response.headers.get('location')?.endsWith('/articles/revised-final'),
    )
    await api(`/api/content/${revised.id}`, 'PATCH', { status: 'draft' }, cookie)
    await api(`/api/content/${removed.id}`, 'DELETE', undefined, cookie, 400)
    await api(
      `/api/content/${removed.id}`,
      'PATCH',
      { status: 'archived', removeFromDiscovery: true },
      cookie,
    )
    check(
      'unpublish and supported trash suppress search',
      !(await search('quartzprobe')).includes('href="/articles/removed"') &&
        !(await search('draftonlyprobe')).includes('href="/articles/revised-final"'),
    )
    const disposable = await create('delete-draft', { status: 'draft' })
    await api(`/api/content/${disposable.id}`, 'DELETE', undefined, cookie, 400)
    check(
      'history-backed draft hard deletion refused and projection absent',
      !(await rows()).some((r: any) => r.canonical_id === disposable.id),
    )
    await api('/api/admin/indexing/search/reconcile', 'GET', undefined, cookie, 405)
    await api('/api/admin/indexing/search/reconcile', 'POST', undefined, '', 403)
    await api(
      `/api/admin/indexing/search/reconcile?site=${site.id}`,
      'POST',
      undefined,
      denied,
      403,
    )
    const reindex = (
      await api('/api/admin/indexing/search/reconcile', 'POST', undefined, cookie)
    ).json()
    check(
      'authorized reindex persists only eligible site projections',
      reindex.result.processed >= 8 && reindex.health.every((r: any) => r.site_id === site.id),
    )
    check(
      'reindex preserves search matches and suppression',
      (await search('quartzprobe')).includes('href="/articles/retained"') &&
        !(await rows()).some((r: any) => [removed.id, revised.id].includes(r.canonical_id)),
    )
    await api('/api/globals/site-settings', 'POST', { indexingMode: 'noindex' }, cookie)
    check(
      'site noindex immediately suppresses stale projections',
      !(await search('quartzprobe')).includes('href="/articles/retained"'),
    )
    await api('/api/globals/site-settings', 'POST', { indexingMode: 'index' }, cookie)
    // Real admin React form with a persisted supported session; no test auth mode.
    const context = await browser.newContext()
    const [name, value] = cookie.split(';')[0].split('=')
    await context.addCookies([
      { name, value, url: base },
      { name: 'renegade-active-site', value: site.id, url: base },
    ])
    const admin = await context.newPage()
    await admin.goto(`${base}/admin/redirects`, { timeout: 180000 })
    await admin.getByPlaceholder('/old-path', { exact: true }).fill('/old-06c')
    await admin.getByPlaceholder('/new-path', { exact: true }).fill('/articles/retained')
    await admin.locator('select').nth(0).selectOption('308')
    const savedResponse = admin.waitForResponse(
      (r) => r.url().endsWith('/api/admin/redirects') && r.request().method() === 'POST',
      { timeout: 180000 },
    )
    await admin.locator('button[type="submit"]').first().click({ timeout: 180000 })
    check('real admin form creates 308 rule', (await savedResponse).status() === 201)
    const persisted = (
      await payload.find({
        collection: 'public-redirects',
        where: { fromPath: { equals: '/old-06c' } },
        depth: 0,
      })
    ).docs[0]
    check(
      'form redirect persisted in PostgreSQL',
      persisted.toPath === '/articles/retained' && persisted.statusCode === '308',
    )
    await admin.screenshot({ path: `${out}/redirect-admin.png`, fullPage: true })
    await admin.getByPlaceholder('/old-path', { exact: true }).fill('/articles/retained')
    await admin.getByPlaceholder('/new-path', { exact: true }).fill('/old-06c')
    const refused = admin.waitForResponse(
      (r) => r.url().endsWith('/api/admin/redirects') && r.request().method() === 'POST',
      { timeout: 180000 },
    )
    await admin.locator('button[type="submit"]').first().click({ timeout: 180000 })
    check('admin refuses loop with visible error', (await refused).status() === 400)
    await admin.getByText('Circular redirect detected.', { exact: true }).waitFor()
    await admin.screenshot({ path: `${out}/redirect-loop.png`, fullPage: true })
    await context.close()
    await api('/old-06c', 'GET', undefined, '', 404, { host: 'beta.rc106c.test:38982' })
    check('redirect source does not cross tenant boundary', true)
    const redirect = await api('/old-06c?ref=raw', 'GET', undefined, '', 308)
    check(
      'raw HTTP 308 preserves query and destination',
      redirect.response.headers.get('location')?.endsWith('/articles/retained?ref=raw'),
    )
    await page.goto(`${base}/old-06c`)
    check(
      'anonymous browser follows persisted redirect',
      page.url().endsWith('/articles/retained') &&
        (await page.locator('main').textContent())?.includes('bodyprobe'),
    )
    for (const code of ['301', '302', '307', '308']) {
      await api(
        '/api/admin/redirects',
        'POST',
        {
          fromPath: `/code-${code}`,
          toPath: '/articles/retained',
          statusCode: code,
          preserveQuery: false,
        },
        cookie,
        201,
      )
      const result = await api(`/code-${code}?discard=yes`, 'GET', undefined, '', Number(code))
      check(
        `exact ${code} and query removal`,
        result.response.headers.get('location')?.endsWith('/articles/retained'),
      )
    }
    for (const rule of [
      { fromPath: '/chain', toPath: '/old-06c' },
      { fromPath: '/articles/retained', toPath: '/other' },
      { fromPath: '/bad', toPath: '//evil.test' },
      { fromPath: '/bad', toPath: '/%2e%2e/secret' },
    ])
      await api('/api/admin/redirects', 'POST', rule, cookie, 400)
    check('chains both directions and unsafe paths rejected', true)
    await api('/api/admin/redirects', 'POST', { fromPath: '/anon', toPath: '/target' }, '', 403)
    await api(
      '/api/admin/redirects',
      'POST',
      { id: persisted.id, siteId: site.id, fromPath: '/old-06c', toPath: '/tampered' },
      denied,
      403,
    )
    await api(
      '/api/public-redirects',
      'POST',
      { site: site.id, fromPath: '/native-chain', toPath: '/old-06c' },
      cookie,
      400,
    )
    check(
      'anonymous/foreign mutation and native chain denied without persistence',
      (await payload.findByID({ collection: 'public-redirects', id: persisted.id })).toPath ===
        '/articles/retained',
    )
    const race = await Promise.all([
      api(
        '/api/admin/redirects',
        'POST',
        { fromPath: '/race-a', toPath: '/race-b' },
        cookie,
        [201, 400],
      ),
      api(
        '/api/admin/redirects',
        'POST',
        { fromPath: '/race-b', toPath: '/race-a' },
        cookie,
        [201, 400],
      ),
    ])
    check(
      'concurrent reverse redirect writes cannot persist a loop',
      race
        .map((r) => r.response.status)
        .sort()
        .join(',') === '201,400' &&
        (
          await payload.find({
            collection: 'public-redirects',
            where: { fromPath: { in: ['/race-a', '/race-b'] } },
          })
        ).docs.length === 1,
    )
    const transactionID = await payload.db.beginTransaction()
    assert.ok(transactionID)
    await payload.update({
      collection: 'content',
      id: retained.id,
      data: { status: 'draft' },
      req: { transactionID },
    })
    await payload.db.rollbackTransaction(transactionID)
    check(
      'rollback preserves canonical publication and search projection together',
      (await payload.findByID({ collection: 'content', id: retained.id })).status === 'published' &&
        (await rows()).some((row: any) => row.canonical_id === retained.id),
    )
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        { retained: retained.id, revised: revised.id, removed: removed.id, redirect: persisted.id },
        null,
        2,
      ),
    )
    await writeFile(`${out}/projection.json`, JSON.stringify(await rows(), null, 2))
  }
  console.log(`TOTAL ${checks} passed, 0 failed, 0 skipped`)
  succeeded = true
} catch (error) {
  console.error(error)
  let index = 0
  for (const context of browser.contexts())
    for (const failedPage of context.pages()) {
      await failedPage
        .screenshot({ path: `${out}/failure-${index++}.png`, fullPage: true })
        .catch(() => undefined)
    }
} finally {
  await writeFile(
    `${out}/${controls ? 'controls' : restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checks, trace }, null, 2),
  )
  await browser.close()
  await payload.destroy()
  process.exit(succeeded ? 0 : 1)
}
