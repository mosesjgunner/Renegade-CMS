import { chromium } from '@playwright/test'
import nodeHttp from 'node:http'
import assert from 'node:assert/strict'
import { writeFile, readFile } from 'node:fs/promises'
import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { loadContentArchive } from '../../src/modules/public/content-archives'

assert.equal(process.env.RC1_03C_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5436/rc103c_release_acceptance'))
const payload = await getPayload({ config })
const trace: unknown[] = []
let checks = 0
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  console.log(`PASS ${checks}: ${name}`)
  trace.push({ name, passed: true })
}
const out = 'docs/rc/evidence/rc1/18-pass/03C'
const http = async (
  path: string,
  status = 200,
  present?: string,
  absent?: string,
  host = '127.0.0.1:38906',
) => {
  const result = await new Promise<{ status: number; body: string; location?: string }>(
    (resolve, reject) => {
      nodeHttp
        .get(`http://127.0.0.1:38906${path}`, { headers: { host } }, (response) => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            body += chunk
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body,
              location: response.headers.location,
            }),
          )
          response.on('error', reject)
        })
        .on('error', reject)
    },
  )
  const response = new Response(null, {
    status: result.status,
    headers: result.location ? { location: result.location } : {},
  })
  const body = result.body
  trace.push({
    path,
    host,
    status: response.status,
    location: response.headers.get('location'),
    bytes: body.length,
  })
  check(`${path}: HTTP ${status}`, response.status === status)
  if (present) check(`${path}: contains ${present}`, body.includes(present))
  if (absent) check(`${path}: excludes ${absent}`, !body.includes(absent))
  return { body, response }
}
try {
  if (process.argv.includes('--restart')) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const article = await payload.findByID({ collection: 'content', id: saved.article, depth: 0 })
    check('unpublication persisted after restart', article.status === 'draft')
    await http('/articles/renamed-report', 404, undefined, 'PUBLIC-BODY-03C')
    await http('/about-renamed-03c', 200, 'PAGE-BODY-03C')
    await http('/', 200, 'PAGE-BODY-03C')
    await http('/feed.xml', 200, undefined, 'Public Report 03C')
    await http('/search?q=Report', 200, undefined, 'Public Report 03C')
    await http('/authors/author-03c', 404)
    await http('/tags/tag-03c', 404)
    await http('/articles/public-report', 308)
    await http('/about-03c', 308)
    await http('/articles/secret-members', 404)
    await http('/articles/secret-deleted', 404)
    const members = (
      await payload.find({ collection: 'content', where: { slug: { equals: 'secret-members' } } })
    ).docs[0]
    check('members-only visibility persisted after restart', members.visibility === 'members')
    const trashed = (
      await payload.find({ collection: 'content', where: { slug: { equals: 'secret-deleted' } } })
    ).docs[0]
    check(
      'trash removal policy persisted after restart',
      trashed.retentionMode === 'tombstone' && trashed.status === 'archived',
    )
  } else {
    const site = await payload.create({
      collection: 'sites',
      data: { name: '03C Alpha', slug: 'alpha-03c', host: '127.0.0.1', status: 'active' } as never,
    })
    const beta = await payload.create({
      collection: 'sites',
      data: {
        name: '03C Beta',
        slug: 'beta-03c',
        host: 'beta.rc103c.test',
        status: 'active',
      } as never,
    })
    const pub = (
      await payload.find({ collection: 'publications', where: { site: { equals: site.id } } })
    ).docs[0]
    assert.ok(pub)
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@rc103c.test', role: 'owner' } as never,
    })
    const req = await createLocalReq({ user: { ...owner, collection: 'users' } }, payload)
    const foreign = await payload.create({
      collection: 'users',
      data: { email: 'staff@beta.rc103c.test', role: 'staff' } as never,
    })
    const foreignMember = (
      await payload.find({ collection: 'members', where: { email: { equals: foreign.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { member: foreignMember.id, site: beta.id, role: 'contributor' },
    })

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        indexingMode: 'index',
        launchState: 'live',
        canonicalOrigin: 'http://127.0.0.1:38906',
        canonicalOriginsBySite: {
          [site.id]: 'http://127.0.0.1:38906',
          [beta.id]: 'http://beta.rc103c.test:38906',
        },
      } as never,
      overrideAccess: false,
      req,
    })
    const author = await payload.create({
      collection: 'authors',
      data: { displayName: 'Author 03C', slug: 'author-03c' },
      overrideAccess: false,
      req,
    })
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Tag 03C', slug: 'tag-03c', site: site.id, publication: pub.id } as never,
      overrideAccess: false,
      req,
    })
    const category = await payload.create({
      collection: 'categories',
      data: {
        name: 'Category 03C',
        slug: 'category-03c',
        site: site.id,
        publication: pub.id,
      } as never,
      overrideAccess: false,
      req,
    })
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
    const create = (title: string, slug: string, contentType = 'article', visibility = 'public') =>
      payload.create({
        collection: 'content',
        data: {
          title,
          slug,
          site: site.id,
          publication: pub.id,
          contentType,
          status: 'draft',
          visibility,
          authors: [{ author: author.id }],
          tags: [tag.id],
          categories: [category.id],
          body: body(contentType === 'page' ? 'PAGE-BODY-03C' : 'PUBLIC-BODY-03C'),
        } as never,
        overrideAccess: false,
        req,
      })
    const article = await create('Public Report 03C', 'public-report')
    const page = await create('About 03C', 'about-03c', 'page')
    const draft = await create('SECRET-DRAFT-03C', 'secret-draft')
    const members = await create('SECRET-MEMBERS-03C', 'secret-members', 'article', 'members')
    const deleted = await create('SECRET-DELETED-03C', 'secret-deleted')
    const update = (id: string, data: Record<string, unknown>) =>
      payload.update({ collection: 'content', id, data: data as never, overrideAccess: false, req })
    for (const record of [article, page, members, deleted])
      await update(record.id, { status: 'published' })
    await assert.rejects(
      () => payload.delete({ collection: 'content', id: deleted.id, overrideAccess: false, req }),
      /editorial revision history cannot be deleted/,
    )
    check('referenced revision history is protected from hard deletion', true)
    await update(deleted.id, {
      status: 'archived',
      retentionMode: 'tombstone',
      removeFromDiscovery: true,
    })
    const trashed = await payload.findByID({ collection: 'content', id: deleted.id })
    check(
      'supported trash preserves history and persists removal policy',
      trashed.status === 'archived' &&
        trashed.retentionMode === 'tombstone' &&
        trashed.removeFromDiscovery === true,
    )
    check(
      'published content persisted via access-checked native API',
      (await payload.findByID({ collection: 'content', id: article.id })).status === 'published',
    )
    const companion = (
      await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: article.id } },
      })
    ).docs[0]
    check('actual published immutable revision exists', !!companion.latestPublishedRevision)
    await http('/articles/public-report', 200, 'PUBLIC-BODY-03C')
    await http('/about-03c', 200, 'PAGE-BODY-03C')
    await http('/authors/author-03c', 200, 'Public Report 03C', draft.title)
    await http('/tags/tag-03c', 200, 'Public Report 03C', members.title)
    await http(String(category.canonicalPath), 200, 'Public Report 03C', deleted.title)
    for (const path of [
      '/articles/secret-draft',
      '/articles/secret-members',
      '/articles/secret-deleted',
    ])
      await http(path, 404)
    for (const path of ['/', '/articles', '/feed.xml', '/feed.json', '/search?q=SECRET']) {
      const { body: output } = await http(path)
      for (const record of [draft, members, deleted])
        check(`${path}: excludes ${record.title}`, !output.includes(record.title))
    }
    await http('/feed.xml', 200, undefined, article.title, 'beta.rc103c.test:38906')
    await http('/feed.json', 404, undefined, undefined, 'unknown.rc103c.test:38906')
    await http(
      `/search?q=Report&site=${site.id}`,
      404,
      undefined,
      undefined,
      'beta.rc103c.test:38906',
    )
    const before = await payload.findByID({ collection: 'content', id: article.id, depth: 0 })
    for (const user of [
      null,
      { ...foreignMember, collection: 'members' },
      { ...foreign, collection: 'users' },
    ]) {
      await assert.rejects(() =>
        payload.update({
          collection: 'content',
          id: article.id,
          data: { status: 'draft' },
          overrideAccess: false,
          req: { user, payload } as never,
        }),
      )
      check('unauthorized publication change rejected', true)
    }
    check(
      'denied updates preserve persisted row',
      JSON.stringify(
        await payload.findByID({ collection: 'content', id: article.id, depth: 0 }),
      ) === JSON.stringify(before),
    )
    await payload.update({
      collection: 'publications',
      id: pub.id,
      data: {
        navigation: {
          primary: [{ label: 'Report menu', href: '/articles/public-report', children: [] }],
        },
      },
      overrideAccess: false,
      req,
    })
    await update(article.id, { slug: 'renamed-report' })
    check(
      'navigation updates to renamed canonical URL',
      JSON.stringify(
        (await payload.findByID({ collection: 'publications', id: pub.id })).navigation,
      ).includes('/articles/renamed-report'),
    )
    const renamed = await payload.findByID({ collection: 'content', id: article.id })
    check('new canonical path persisted', renamed.canonicalPath === '/articles/renamed-report')
    const redirect = await http('/articles/public-report', 308)
    check(
      'old slug redirects to new canonical',
      redirect.response.headers.get('location') === '/articles/renamed-report',
    )
    await http('/articles/renamed-report', 200, 'PUBLIC-BODY-03C')
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext()
      const browserPage = await context.newPage()
      const scripts = new Set<string>()
      browserPage.on('request', (request) => {
        if (request.resourceType() === 'script') scripts.add(request.url())
      })
      await browserPage.goto('http://127.0.0.1:38906/articles/renamed-report', {
        waitUntil: 'networkidle',
      })
      check(
        'anonymous browser renders published body',
        (await browserPage.locator('body').innerText()).includes('PUBLIC-BODY-03C'),
      )
      await browserPage
        .getByRole('navigation', { name: 'Content archives' })
        .getByRole('link', { name: 'Author 03C' })
        .click()
      await browserPage.getByRole('heading', { name: 'Author 03C' }).waitFor()
      check(
        'anonymous browser follows author archive link',
        browserPage.url().endsWith('/authors/author-03c'),
      )
      await browserPage.screenshot({ path: `${out}/author-archive.png`, fullPage: true })
      for (const script of scripts) {
        const text = await (await context.request.get(script)).text()
        check(
          `public script excludes visual editor: ${new URL(script).pathname}`,
          !['@puckeditor', 'BuilderShell.tsx', 'VisualEditor.tsx'].some((marker) =>
            text.includes(marker),
          ),
        )
      }
      await writeFile(`${out}/public-script-urls.json`, JSON.stringify([...scripts], null, 2))
      for (const route of ['[...path]', 'articles/[slug]']) {
        const manifest = await readFile(
          `.next-rc103c/dev/server/app/(frontend)/${route}/page_client-reference-manifest.js`,
          'utf8',
        )
        check(
          `${route}: client manifest excludes editor`,
          !['@puckeditor', 'BuilderShell.tsx', 'VisualEditor.tsx'].some((marker) =>
            manifest.includes(marker),
          ),
        )
      }
    } finally {
      await browser.close()
    }

    await http('/tags/tag-03c', 200, '/articles/renamed-report', '/articles/public-report')
    await update(page.id, { tags: [], authors: [], categories: [] })
    await update(article.id, { status: 'draft' })
    check(
      'unpublication removes stored navigation link',
      !JSON.stringify(
        (await payload.findByID({ collection: 'publications', id: pub.id })).navigation,
      ).includes('renamed-report'),
    )
    check(
      'unpublication persisted',
      (await payload.findByID({ collection: 'content', id: article.id })).status === 'draft',
    )
    await http('/articles/renamed-report', 404, undefined, 'PUBLIC-BODY-03C')
    await http('/authors/author-03c', 404)
    await http('/tags/tag-03c', 404)
    check(
      'archive service excludes all nonpublic content',
      (await loadContentArchive(payload, site.id, '/tags/tag-03c')) === null,
    )
    const empty = await payload.create({
      collection: 'content',
      data: {
        site: site.id,
        publication: pub.id,
        contentType: 'article',
        title: 'REMOVABLE-03C',
        slug: 'removable-03c',
        status: 'draft',
      } as never,
      overrideAccess: false,
      req,
    })
    await payload.delete({ collection: 'content', id: empty.id, overrideAccess: false, req })
    check(
      'unreferenced hard deletion removes persisted record',
      (await payload.find({ collection: 'content', where: { id: { equals: empty.id } } })).docs
        .length === 0,
    )
    await http('/articles/removable-03c', 404)
    await assert.rejects(
      () => update(page.id, { pathOverride: true, canonicalPath: '/articles/renamed-report' }),
      /already/,
    )
    check(
      'colliding canonical URL rejected with original page unchanged',
      (await payload.findByID({ collection: 'content', id: page.id })).canonicalPath ===
        '/about-03c',
    )
    await update(page.id, { slug: 'about-renamed-03c' })
    await http('/about-03c', 308)
    await http('/about-renamed-03c', 200, 'PAGE-BODY-03C')
    await payload.updateGlobal({
      slug: 'site-settings',
      data: { homepageSelection: { mode: 'page', page: page.id } },
      overrideAccess: false,
      req,
    })
    await http('/', 200, 'PAGE-BODY-03C')
    await http('/', 200, undefined, 'PAGE-BODY-03C', 'beta.rc103c.test:38906')
    await http('/feeds/content/' + members.id + '.json', 404)
    await http('/feeds/content/' + deleted.id + '.json', 404)
    await http('/feeds/content/' + page.id + '.json', 200, page.title)
    await http('/sitemaps/1.xml', 200, undefined, 'secret-members')
    await writeFile(
      `${out}/state.json`,
      JSON.stringify({ article: article.id, page: page.id, site: site.id }, null, 2),
    )
  }
  console.log(`RESULT: ${checks} passed, 0 failed, 0 skipped`)
  await writeFile(
    `${out}/${process.argv.includes('--restart') ? 'restart' : 'journey'}.json`,
    JSON.stringify({ checks, trace }, null, 2),
  )
} finally {
  await payload.db.destroy?.()
}
process.exit(0)
