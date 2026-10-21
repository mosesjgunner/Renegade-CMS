/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator and browser acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { createEditorialPreviewToken } from '../../src/modules/editorial/persistence'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5463/rc103b_final_release_acceptance',
)
assert.equal(process.env.RC1_03B_DISPOSABLE, 'yes')
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(180000)
const out = 'docs/rc/evidence/rc1/18-pass/03B/recovery'
const base = 'http://localhost:39033'
const trace: any[] = []
let checks = 0,
  cacheFailures = 0,
  completed = false
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
const read = (collection: string, id: string) => payload.findByID({ collection, id, depth: 0 })
const find = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, pagination: false, limit: 0 })).docs
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
const api = async (
  route: string,
  method = 'GET',
  data?: unknown,
  cookie = '',
  expected: number | number[] = 200,
  headers: Record<string, string> = {},
) => {
  const result = await new Promise<{
    status: number
    headers: http.IncomingHttpHeaders
    text: string
  }>((resolve, reject) => {
    const req = http.request(
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
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text }))
        res.on('error', reject)
      },
    )
    req.setTimeout(180000, () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    req.end(data ? JSON.stringify(data) : undefined)
  })
  trace.push({
    route,
    method,
    status: result.status,
    robots: result.headers['x-robots-tag'],
    cacheControl: result.headers['cache-control'],
  })
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(result.status),
    `${method} ${route}: ${result.status} ${result.text.slice(0, 200)}`,
  )
  return { ...result, json: () => JSON.parse(result.text) }
}
const history = async (id: string, cookie: string) =>
  (await api(`/api/admin/workflow/revisions?contentId=${id}`, 'GET', undefined, cookie)).json()
try {
  await mkdir(out, { recursive: true })
  const owner = (await find('users', { role: { equals: 'owner' } }))[0]
  const author = (await find('users', { email: { like: 'author-' } }))[0]
  const outsider = (await find('users', { email: { like: 'outsider-' } }))[0]
  const ungranted = (await find('users', { email: { like: 'ungranted-' } }))[0]
  const site = (await find('sites', { slug: { like: 'editor-alpha-' } }))[0]
  const records = (await find('content', { site: { equals: site.id } })).sort((a: any, b: any) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  assert.equal(records.length, 3)
  assert.equal(records.filter((r: any) => r.contentType === 'article').length, 2)
  assert.equal(records.filter((r: any) => r.contentType === 'page').length, 1)
  const own = await session(owner),
    staff = await session(author),
    other = await session(outsider),
    denied = await session(ungranted)
  const first = records[0],
    h = await history(first.id, own),
    original = h.revisions.find((r: any) => r.sequence === 1).id
  const article = (await find('article-family-content', { content: { equals: first.id } }))[0]
  const before = JSON.stringify({ row: await read('content', first.id), history: h })
  const previews: string[] = []
  for (const doc of records) {
    const minted = (await api('/api/admin/content/preview', 'POST', { id: doc.id }, own)).json()
    previews.push(minted.url)
    const preview = await api(minted.url, 'GET', undefined, own)
    check(
      `authorized unpublished ${doc.contentType} preview renders original blocks and noindex`,
      preview.text.includes('UNPUBLISHED original') &&
        preview.text.includes('Preserved callout original') &&
        String(preview.headers['x-robots-tag']).includes('noindex'),
    )
    // Keep the original no-store requirement as a failing gate while collecting independent negatives.
    try {
      assert.ok(
        String(preview.headers['cache-control']).includes('no-store'),
        'Private preview must send no-store',
      )
    } catch (error) {
      cacheFailures++
      trace.push({ name: `no-store ${doc.id}`, passed: false, error: String(error) })
      console.error(`FAIL cache ${cacheFailures}: ${preview.headers['cache-control']}`)
    }
    check(
      `anonymous ${doc.contentType} URL excludes draft/private text`,
      !(await api(doc.canonicalPath, 'GET', undefined, '', 404)).text.includes(
        'UNPUBLISHED original',
      ),
    )
  }
  await page
    .context()
    .addCookies([
      { name: 'renegade-passkey', value: own.slice('renegade-passkey='.length), url: base },
    ])
  await page.goto(`${base}${previews[0]}`)
  await page.locator('[role="article"] img').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="article"] img')).every(
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    ),
  )
  check(
    'rendered inline media bytes, combined marks and actual Lexical links',
    (await page.locator('[role="article"] img').count()) > 0 &&
      (await page.locator('strong em s u code').count()) > 0 &&
      (await page.getByRole('link', { name: 'Source link' }).count()) > 0,
  )
  const text = await page.locator('body').innerText()
  check(
    'author names render in explicit display order',
    text.includes('Jane Lead') &&
      text.includes('Mark Editor') &&
      text.indexOf('Jane Lead') < text.indexOf('Mark Editor'),
  )
  await page.screenshot({ path: `${out}/unpublished-preview.png`, fullPage: true })
  for (const cookie of ['', other, denied]) await api(previews[0], 'GET', undefined, cookie, 404)
  await api(previews[0] + 'tampered', 'GET', undefined, own, 404)
  await api(previews[0], 'GET', undefined, own, 404, { host: 'beta.rc103b.test:39033' })
  const expired = await createEditorialPreviewToken(payload, {
    articleId: article.id,
    revisionId: original,
    createdBy: owner.id,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  })
  await api(`/preview/article/${expired.token}`, 'GET', undefined, own, 404)
  check('anonymous, foreign creator/site, ungranted, tampered and expired previews denied', true)
  for (const cookie of ['', other, denied]) {
    await api(
      `/api/content/${first.id}`,
      'PATCH',
      { title: 'Unauthorized edit' },
      cookie,
      [403, 404],
    )
    await api(
      '/api/admin/workflow/revisions',
      'POST',
      { contentId: first.id, revisionId: original },
      cookie,
      403,
    )
    await api('/api/admin/content/preview', 'POST', { id: first.id }, cookie, [403, 404])
  }
  await api(
    '/api/admin/workflow/revisions',
    'POST',
    { contentId: first.id, revisionId: (await history(records[1].id, own)).currentRevision },
    own,
    404,
  )
  check(
    'denied edits/restores/previews and foreign revision substitution preserve full content/history',
    before ===
      JSON.stringify({
        row: await read('content', first.id),
        history: await history(first.id, own),
      }),
  )
  const staffPreview = (
    await api('/api/admin/content/preview', 'POST', { id: first.id }, staff)
  ).json().url
  const member = typeof author.member === 'string' ? author.member : author.member.id
  const grant = (
    await find('member-site-roles', {
      and: [{ member: { equals: member } }, { site: { equals: site.id } }],
    })
  )[0]
  await api(`/api/member-site-roles/${grant.id}`, 'DELETE', undefined, own)
  await api(staffPreview, 'GET', undefined, staff, 404)
  check('revoking a creator grant denies its previously issued preview', true)
  const sitemap = await api('/sitemap.xml'),
    feed = await api('/feed.json')
  check(
    'draft/private paths and titles absent from public sitemap/feed',
    records.every(
      (doc: any) => !sitemap.text.includes(doc.canonicalPath) && !feed.text.includes(doc.title),
    ),
  )
  const saved = await Promise.all(records.map((doc: any) => read('content', doc.id)))
  await writeFile(
    `${out}/state.json`,
    JSON.stringify(
      {
        owner: owner.id,
        site: site.id,
        records: saved,
        revisionCount: h.revisions.length,
        preview: previews[0],
      },
      null,
      2,
    ),
  )
  await writeFile(
    `${out}/persistence.json`,
    JSON.stringify(
      { records: saved, history: h, article: await read('article-family-content', article.id) },
      null,
      2,
    ),
  )
  completed = true
} finally {
  await writeFile(
    `${out}/privacy-trace.json`,
    JSON.stringify(
      { checks, cacheFailures, completed, succeeded: completed && cacheFailures === 0, trace },
      null,
      2,
    ),
  )
  await browser.close()
  await payload.db.destroy()
}
console.log(`03B privacy: ${checks} passed; ${cacheFailures} cache failures`)
process.exit(cacheFailures ? 1 : 0)
