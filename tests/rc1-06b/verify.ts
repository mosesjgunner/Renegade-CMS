/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_06B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5447/rc106b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/06B'
const base = 'http://localhost:38981'
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
const core = process.argv.includes('--core')
const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  status = 200,
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
  })
  assert.equal(response.status, status, `${method} ${route}: ${text.slice(0, 600)}`)
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
const xml = async (route: string) => {
  const result = await api(route)
  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    return {
      error: doc.querySelector('parsererror')?.textContent,
      root: doc.documentElement.localName,
      urls: [...doc.querySelectorAll('url > loc')].map((n) => n.textContent),
      items: [...doc.querySelectorAll('item')].map((item) => ({
        title: item.querySelector('title')?.textContent,
        link: item.querySelector('link')?.textContent,
      })),
    }
  }, result.text)
  check(`${route} parses as XML`, !parsed.error)
  return { ...result, parsed }
}
const snapshot = async (label: string, included: string[], excluded: string[]) => {
  const index = await xml('/sitemap.xml')
  check(`${label}: sitemap index`, index.parsed.root === 'sitemapindex')
  const sitemap = await xml('/sitemaps/1.xml')
  const rss = await xml('/feed.xml')
  const feed = (await api('/feed.json')).json()
  const archive = await api('/articles')
  check(
    `${label}: JSON Feed content fields`,
    feed.items.every((i: any) => typeof i.content_text === 'string'),
  )
  check(`${label}: RSS 2.0`, rss.parsed.root === 'rss' && rss.text.includes('version="2.0"'))
  for (const slug of included) {
    const url = `${base}/articles/${slug}`
    check(
      `${label}: ${slug} in sitemap and both feeds`,
      sitemap.parsed.urls.includes(url) &&
        rss.parsed.items.some((i: any) => i.link === url) &&
        feed.items.some((i: any) => i.url === url),
    )
    const article = await api(`/articles/${slug}`)
    check(`${label}: ${slug} public body`, article.text.includes('BODY-06B'))
  }
  for (const slug of excluded)
    check(
      `${label}: ${slug} excluded from all discovery`,
      !sitemap.text.includes(`/articles/${slug}<`) &&
        !rss.text.includes(`/articles/${slug}<`) &&
        !feed.items.some((i: any) => i.url === `${base}/articles/${slug}`) &&
        !archive.text.includes(`href="/articles/${slug}"`),
    )
  await writeFile(
    `${out}/${label}.json`,
    JSON.stringify({ sitemap: sitemap.parsed, rss: rss.parsed, feed }, null, 2),
  )
  return { sitemap, rss, feed }
}
try {
  await mkdir(out, { recursive: true })
  if (restart || core) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const current = await payload.findByID({ collection: 'content', id: saved.article, depth: 0 })
    check('unpublication persisted', current.status === 'draft')
    const deleted = await payload.findByID({ collection: 'content', id: saved.deleted, depth: 0 })
    check('trash tombstone persisted', deleted.status === 'archived' && deleted.removeFromDiscovery)
    const after = await snapshot(
      core ? 'core' : 'restart',
      ['report-02'],
      [
        'renamed',
        'report-00',
        'secret-draft',
        'secret-members',
        'secret-private',
        'secret-unlisted',
        'secret-foreign',
        'secret-noindex',
        'secret-entitled',
        'report-01',
      ],
    )
    check(
      'published lastmod survives restart',
      after.feed.items.find((i: any) => i.url.endsWith('/report-02')).date_modified ===
        saved.modified,
    )
    check(
      'robots sitemap correct after restart',
      (await api('/robots.txt')).text.includes(`${base}/sitemap.xml`),
    )
    if (core) {
      await api('/events/feed.ics', 'GET', undefined, '', 404)
      check('Events ICS unavailable when Events disabled; core feeds remain working', true)
    } else {
      const heartbeat = JSON.parse(await readFile('scratch/rc106b-20261018/heartbeat.json', 'utf8'))
      check('restarted worker has a new process identity', heartbeat.pid !== saved.workerPid)
      check(
        'restarted worker completed a fresh cycle',
        Date.now() - Date.parse(heartbeat.observedAt) < 20000,
      )
    }
  } else {
    // Fixture bootstrap creates isolated tenants and canonical operator grants. All scoped mutations use native HTTP.
    const site = await payload.create({
      collection: 'sites',
      data: { name: '06B Alpha', slug: 'alpha-06b', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '06B Beta', slug: 'beta-06b', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@rc106b.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@rc106b.test', role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staff.member === 'string' ? staff.member : staff.member.id,
        site: beta.id,
        role: 'contributor',
      },
    })
    const cookie = await session(owner)
    const foreignCookie = await session(staff)
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
        siteName: 'Discovery 06B',
        siteDescription: 'Public reporting',
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [beta.id]: 'http://beta.rc106b.test:38981' },
        launchState: 'live',
        indexingMode: 'index',
        seoNoIndex: false,
      },
      cookie,
    )
    const tag = (
      await api(
        '/api/tags',
        'POST',
        { site: site.id, publication: publication.id, name: '06B News', slug: 'news-06b' },
        cookie,
        201,
      )
    ).json().doc
    const category = (
      await api(
        '/api/categories',
        'POST',
        { site: site.id, publication: publication.id, name: '06B Category', slug: 'category-06b' },
        cookie,
        201,
      )
    ).json().doc
    const create = async (slug: string, extra: any = {}) =>
      (
        await api(
          '/api/content',
          'POST',
          {
            site: site.id,
            publication: publication.id,
            title: slug === 'report-02' ? 'Report <&> 06B' : slug,
            slug,
            contentType: 'article',
            status: 'published',
            visibility: 'public',
            body: body('BODY-06B published original'),
            publishedAt: new Date(Date.now() - 3600000).toISOString(),
            tags: [tag.id],
            categories: [category.id],
            ...extra,
          },
          cookie,
          201,
        )
      ).json().doc
    const records = []
    for (let i = 0; i < 13; i++) records.push(await create(`report-${String(i).padStart(2, '0')}`))
    const article = records[0]
    const persistedArticle = await payload.findByID({
      collection: 'content',
      id: article.id,
      depth: 0,
    })
    check(
      'HTTP creation persisted publication, canonical path and public timestamp',
      persistedArticle.status === 'published' &&
        persistedArticle.canonicalPath === '/articles/report-00' &&
        Number.isFinite(Date.parse(persistedArticle.publicModifiedAt)),
    )
    await create('secret-draft', { status: 'draft' })
    await create('secret-members', { visibility: 'members' })
    await create('secret-private', { visibility: 'private' })
    await create('secret-unlisted', { visibility: 'unlisted' })
    await create('secret-noindex', { seoNoIndex: true })
    await create('secret-entitled', {
      requiredEntitlement: { resource: 'dispatch', capability: 'read' },
    })
    await create('secret-foreign', {
      site: beta.id,
      publication: betaPub.id,
      tags: [],
      categories: [],
    })
    const negative = [
      'secret-draft',
      'secret-members',
      'secret-private',
      'secret-unlisted',
      'secret-noindex',
      'secret-entitled',
      'secret-foreign',
    ]
    const initial = await snapshot('initial', ['report-00'], negative)
    await page.goto(`${base}/articles`)
    check(
      'archive first page has exactly 12 published cards',
      (await page.locator('main article').count()) === 12,
    )
    await page.getByRole('link', { name: 'Next', exact: false }).click()
    check(
      'archive next link reaches page two',
      new URL(page.url()).searchParams.get('page') === '2' &&
        (await page.locator('main article').count()) === 1,
    )
    await page.goto(`${base}/tags/news-06b?page=2`)
    check(
      'tag archive has accessible page two',
      (await page.getByRole('navigation', { name: 'Archive pagination' }).count()) === 1 &&
        (await page.locator('main > ul > li').count()) === 1,
    )
    await page.goto(`${base}/categories/category-06b?page=2`)
    check(
      'category archive filters restricted content before accessible pagination',
      (await page.getByRole('navigation', { name: 'Archive pagination' }).count()) === 1 &&
        (await page.locator('main > ul > li').count()) === 1,
    )
    await page.goto(`${base}/articles`)
    check(
      'RSS and JSON subscription links visible',
      (await page.getByRole('link', { name: 'RSS feed', exact: true }).count()) === 1 &&
        (await page.getByRole('link', { name: 'JSON feed', exact: true }).count()) === 1,
    )
    await page.screenshot({ path: `${out}/archive.png`, fullPage: true })
    check(
      'enabled Events exposes ICS',
      (await api('/events/feed.ics')).text.includes('BEGIN:VCALENDAR'),
    )
    for (const invalid of ['0', '-1', '1.5', 'NaN', '999'])
      await api(`/articles?page=${invalid}`, 'GET', undefined, '', 404)
    check('invalid and beyond-end pages return 404', true)
    await api('/sitemaps/999.xml', 'GET', undefined, '', 404)
    await api('/feed.json', 'GET', undefined, '', 404, { host: 'unknown.rc106b.test' })
    check('unknown host denied feed discovery', true)
    const betaFeed = (
      await api('/feed.json', 'GET', undefined, '', 200, { host: 'beta.rc106b.test:38981' })
    ).json()
    check(
      'second site feed is isolated',
      betaFeed.items.length === 1 && betaFeed.items[0].url.includes('secret-foreign'),
    )
    const robots = await api('/robots.txt', 'GET', undefined, '', 200, {
      host: 'beta.rc106b.test:38981',
    })
    check(
      'robots uses host-specific canonical origin',
      robots.text.includes('http://beta.rc106b.test:38981/sitemap.xml') &&
        !robots.text.includes(`${base}/sitemap.xml`),
    )
    const closed = await api('/robots.txt', 'GET', undefined, '', 200, {
      host: 'unknown.rc106b.test',
    })
    check(
      'unknown robots fails closed',
      closed.text.includes('Disallow: /') && !closed.text.includes('Sitemap:'),
    )
    await api(`/api/content/${article.id}`, 'PATCH', { title: 'DENIED' }, foreignCookie, 403)
    await api(`/api/content/${article.id}`, 'PATCH', { title: 'DENIED' }, '', 403)
    const persisted = await payload.findByID({ collection: 'content', id: article.id, depth: 0 })
    check(
      'denied anonymous and foreign-site mutation leaves persisted title unchanged',
      persisted.title === 'report-00',
    )
    const beforeModified = initial.feed.items.find((i: any) =>
      i.url.endsWith('/report-00'),
    ).date_modified
    await api(
      `/api/content/${article.id}`,
      'PATCH',
      { body: body('BODY-06B SECRET-UNPUBLISHED-06B'), status: 'updated' },
      cookie,
    )
    const editedFeed = (await api('/feed.json'))
      .json()
      .items.find((i: any) => i.url.endsWith('/report-00'))
    check(
      'draft body and editor timestamp do not leak into feed',
      editedFeed.content_text.includes('BODY-06B') &&
        !editedFeed.content_text.includes('SECRET-UNPUBLISHED') &&
        editedFeed.date_modified === beforeModified,
    )
    await api(`/api/content/${article.id}`, 'PATCH', { status: 'published' }, cookie)
    const publishedFeed = (await api('/feed.json'))
      .json()
      .items.find((i: any) => i.url.endsWith('/report-00'))
    check(
      'republish updates body and modified time',
      publishedFeed.content_text.includes('SECRET-UNPUBLISHED') &&
        publishedFeed.date_modified > beforeModified,
    )
    const rss = await xml('/feed.xml')
    check(
      'RSS build date includes updated older article',
      rss.text.includes(new Date(publishedFeed.date_modified).toUTCString()),
    )
    await api(
      `/api/content/${article.id}`,
      'PATCH',
      { seoDescription: 'Live metadata & discovery <updated>' },
      cookie,
    )
    const metadataRecord = await payload.findByID({
      collection: 'content',
      id: article.id,
      depth: 0,
    })
    check(
      'live metadata changes advance persisted public modification time',
      metadataRecord.publicModifiedAt > publishedFeed.date_modified,
    )
    await api(`/api/content/${article.id}`, 'PATCH', { slug: 'renamed' }, cookie)
    const slugRecord = await payload.findByID({ collection: 'content', id: article.id, depth: 0 })
    check(
      'slug mutation persists canonical path and advances public modification time',
      slugRecord.canonicalPath === '/articles/renamed' &&
        slugRecord.publicModifiedAt > metadataRecord.publicModifiedAt,
    )

    const renamed = await snapshot('renamed', ['renamed'], [...negative, 'report-00'])
    await api('/articles/report-00', 'GET', undefined, '', 308)
    check('slug change retains canonical redirect', true)
    await api('/feed.json', 'GET', undefined, '', 304, {
      'if-none-match': (await api('/feed.json')).response.headers.get('etag')!,
    })
    check('unchanged feed validator returns 304', true)
    await api(`/api/content/${article.id}`, 'PATCH', { status: 'draft' }, cookie)
    await api(`/api/content/${records[1].id}`, 'DELETE', undefined, cookie, 400)
    check('history-backed hard delete denied', true)
    await api(
      `/api/content/${records[1].id}`,
      'PATCH',
      { status: 'archived', retentionMode: 'tombstone', removeFromDiscovery: true },
      cookie,
    )
    const unpublished = await payload.findByID({ collection: 'content', id: article.id, depth: 0 })
    check('HTTP unpublication persists draft status', unpublished.status === 'draft')
    await api('/articles/renamed', 'GET', undefined, '', 404)
    await api('/articles/report-01', 'GET', undefined, '', 404)
    const final = await snapshot(
      'final',
      ['report-02'],
      [...negative, 'report-00', 'renamed', 'report-01'],
    )
    await api('/sitemaps/1.xml', 'GET', undefined, '', 200, {
      'if-none-match': renamed.sitemap.response.headers.get('etag')!,
    })
    check(
      'unpublication invalidates prior sitemap validator',
      final.sitemap.response.headers.get('etag') !== renamed.sitemap.response.headers.get('etag'),
    )
    const scoped = (await api(`/feeds/content/${records[2].id}.json`)).json()
    check(
      'scoped JSON feed includes required content and stable ID',
      scoped.items.length === 1 && scoped.items[0].content_text.includes('BODY-06B'),
    )
    await xml(`/feeds/taxonomy/${tag.id}.xml`)
    await api(`/feeds/content/${article.id}.json`, 'GET', undefined, '', 404)
    const heartbeat = JSON.parse(await readFile('scratch/rc106b-20261018/heartbeat.json', 'utf8'))
    check(
      'worker completed cycle during journey',
      Date.now() - Date.parse(heartbeat.observedAt) < 20000,
    )
    await api('/api/globals/site-settings', 'POST', { indexingMode: 'noindex' }, cookie)
    await api('/feed.json', 'GET', undefined, '', 404)
    check('noindex robots fails closed', (await api('/robots.txt')).text.includes('Disallow: /'))
    check(
      'noindex sitemap contains no partitions',
      !(await xml('/sitemap.xml')).text.includes('<sitemap>'),
    )
    await api('/api/globals/site-settings', 'POST', { indexingMode: 'index' }, cookie)
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          article: article.id,
          deleted: records[1].id,
          modified: final.feed.items.find((i: any) => i.url.endsWith('/report-02')).date_modified,
          workerPid: heartbeat.pid,
        },
        null,
        2,
      ),
    )
  }
  console.log(`TOTAL ${checks} passed, 0 failed, 0 skipped`)
  succeeded = true
} catch (error) {
  console.error(error)
} finally {
  await writeFile(
    `${out}/${core ? 'core' : restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checks, trace }, null, 2),
  )
  await browser.close()
  await payload.destroy()
  process.exit(succeeded ? 0 : 1)
}
