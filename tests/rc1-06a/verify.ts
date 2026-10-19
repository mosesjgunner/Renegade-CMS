/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator verification across polymorphic collections */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { localMediaStorage } from '../../src/modules/media/storage'

assert.equal(process.env.RC1_06A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5446/rc106a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const payload: any = await getPayload({ config })
const base = 'http://localhost:38980'
const out = 'docs/rc/evidence/rc1/18-pass/06A'
const checks: string[] = []
const rendered: Record<string, unknown> = {}
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const restart = process.argv.includes('--restart')

const api = async (
  route: string,
  cookie = '',
  method = 'GET',
  data?: any,
  extraHeaders: Record<string, string> = {},
) => {
  const headers: Record<string, string> = { origin: base, ...extraHeaders }
  if (cookie) headers.cookie = cookie
  if (
    data &&
    !(data instanceof FormData) &&
    !(data instanceof Uint8Array) &&
    !Buffer.isBuffer(data)
  ) {
    headers['content-type'] = 'application/json'
  }
  const body =
    data instanceof FormData
      ? data
      : data instanceof Uint8Array || Buffer.isBuffer(data)
        ? new Uint8Array(data)
        : data !== undefined
          ? JSON.stringify(data)
          : undefined
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(180000),
  })
  if (method === 'GET' && !route.startsWith('/api/')) {
    const html = await response.clone().text()
    const key = route.startsWith('/preview/')
      ? `preview-${cookie ? 'authenticated' : 'anonymous'}`
      : route
    rendered[key] = {
      status: response.status,
      robotsHeader: response.headers.get('x-robots-tag'),
      tags: html.match(
        /<(?:title\b[^>]*>[^<]*<\/title|meta\b[^>]*|link\b[^>]*rel="canonical"[^>]*)>/g,
      ),
      schemas: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
        (match) => JSON.parse(match[1]),
      ),
    }
    await writeFile(
      path.join(out, restart ? 'restart-rendered.json' : 'rendered.json'),
      JSON.stringify(rendered, null, 2),
    )
  }
  return response
}

const json = async (
  route: string,
  cookie: string,
  method = 'GET',
  data?: any,
  expectedStatus = 200,
  extraHeaders: Record<string, string> = {},
) => {
  const response = await api(route, cookie, method, data, extraHeaders)
  const text = await response.text()
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${route} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 1500)}`,
  )
  return text ? JSON.parse(text) : {}
}

const createSessionCookie = async (user: any) => {
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
  return { cookie: `renegade-passkey=${result.token}`, token: result.token }
}

const record = async (collection: string, id: any) =>
  payload.findByID({
    collection: collection as never,
    id: typeof id === 'object' ? id.id : id,
    depth: 0,
    overrideAccess: true,
  }) as Promise<any>

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

async function main() {
  try {
    await mkdir(out, { recursive: true })
    const storage = localMediaStorage(process.env.MEDIA_DIR!)

    if (restart) {
      console.log('--- RESTART PERSISTENCE AUDIT ---')
      const restartChecks: string[] = []

      // 1. Check Homepage Rendered HTML
      const homeRes = await api('/')
      assert.equal(homeRes.status, 200)
      const homeHtml = await homeRes.text()
      assert.match(homeHtml, /<title>Renegade Flagship — Independent Journalism<\/title>/)
      assert.match(
        homeHtml,
        /<meta name="description" content="Frontline investigations and dispatch coverage from Renegade\."\/>/,
      )
      assert.match(homeHtml, /<link rel="canonical" href="http:\/\/localhost:38980\/"\/>/)
      assert.match(homeHtml, /<meta name="robots" content="index, follow"\/>/)
      assert.match(homeHtml, /http:\/\/localhost:38980\/media\/[a-f0-9-]+\?variant=og/)
      restartChecks.push('Homepage persisted custom SEO and schema across restart')

      // 2. Check Article Rendered HTML
      const articleRes = await api('/articles/investigation-the-waterfront-deal')
      assert.equal(articleRes.status, 200)
      const articleHtml = await articleRes.text()
      assert.match(
        articleHtml,
        /<title>The Waterfront Deal: In-Depth Investigation \| Renegade<\/title>/,
      )
      assert.match(
        articleHtml,
        /<meta name="description" content="A 6-month investigative probe into docklands rezoning."\/>/,
      )
      assert.match(
        articleHtml,
        /<link rel="canonical" href="http:\/\/localhost:38980\/articles\/investigation-the-waterfront-deal"\/>/,
      )
      assert.match(
        articleHtml,
        /<meta property="og:title" content="Social Card: Docklands Rezoning Exposed"\/>/,
      )
      assert.match(
        articleHtml,
        /"headline":\s*"The Waterfront Deal: In-Depth Investigation \| Renegade"/,
      )
      restartChecks.push('Article persisted custom SEO and schema across restart')

      // 3. Check Category Rendered HTML
      const catRes = await api('/categories/investigations')
      assert.equal(catRes.status, 200)
      const catHtml = await catRes.text()
      assert.match(catHtml, /<title>Investigations Archive \| Deep Dives<\/title>/)
      assert.match(
        catHtml,
        /<meta name="description" content="All investigative reports and financial forensic files\."\/>/,
      )
      assert.match(
        catHtml,
        /<link rel="canonical" href="http:\/\/localhost:38980\/categories\/investigations"\/>/,
      )
      restartChecks.push('Category persisted custom SEO across restart')

      // 4. Check Restricted Page HTTP Header
      const loginRes = await api('/login')
      assert.equal(loginRes.status, 200)
      assert.equal(loginRes.headers.get('x-robots-tag'), 'noindex, nofollow')
      const loginHtml = await loginRes.text()
      assert.match(loginHtml, /<meta name="robots" content="noindex, nofollow"\/>/)
      assert.doesNotMatch(loginHtml, /<link rel="canonical"/)
      restartChecks.push('Restricted route persisted noindex nofollow headers and robots tag')

      await writeFile(
        path.join(out, 'restart.json'),
        JSON.stringify({ timestamp: new Date().toISOString(), restartChecks, ok: true }, null, 2),
        'utf8',
      )
      console.log(`RESTART PERSISTENCE VERIFIED (${restartChecks.length} checks)`)
      return
    }

    console.log('--- RC1-06A SEO, SCHEMA & INDEXING VERIFICATION ---')

    // Step 1: Provision Operator Users and Sites
    const stamp = Date.now()
    const siteAlpha = await payload.create({
      collection: 'sites' as never,
      data: {
        name: 'Renegade Alpha',
        slug: `alpha-${stamp}`,
        lifecycle: 'active',
        commentReactionCodes: ['thumbs_up', 'heart'],
        communityRegistrationPolicy: 'open',
      } as any,
      overrideAccess: true,
    })
    check('siteAlpha provisioned', siteAlpha.id)

    const siteBeta = await payload.create({
      collection: 'sites' as never,
      data: {
        name: 'Renegade Beta',
        slug: `beta-${stamp}`,
        lifecycle: 'active',
        commentReactionCodes: ['thumbs_up'],
        communityRegistrationPolicy: 'open',
      } as any,
      overrideAccess: true,
    })
    check('siteBeta provisioned', siteBeta.id)

    const alphaOwner = await payload.create({
      collection: 'users' as never,
      data: {
        email: `owner-alpha-seo-${stamp}@renegade.local`,
        role: 'owner',
      } as any,
      overrideAccess: true,
    })
    const betaStaff = await payload.create({
      collection: 'users' as never,
      data: {
        email: `staff-beta-seo-${stamp}@renegade.local`,
        role: 'staff',
      } as any,
      overrideAccess: true,
    })
    const betaMemberId =
      typeof betaStaff.member === 'string' ? betaStaff.member : (betaStaff.member as any)?.id
    if (betaMemberId) {
      await payload.create({
        collection: 'member-site-roles' as never,
        data: { member: betaMemberId, site: siteBeta.id, role: 'contributor' } as any,
        overrideAccess: true,
      })
    }
    const alphaSession = await createSessionCookie(alphaOwner)
    const betaSession = await createSessionCookie(betaStaff)
    check(
      'Owner & beta staff passkey sessions generated',
      alphaSession.cookie && betaSession.cookie,
    )

    const publication = (
      await payload.find({
        collection: 'publications' as never,
        where: { site: { equals: siteAlpha.id } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]!
    check('Publication found for siteAlpha', publication.id)

    // Step 2: Upload OG / Hero Image Fixture
    const heroPngBytes = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 180, g: 20, b: 20, alpha: 1 },
      },
    })
      .png()
      .toBuffer()

    const form = new FormData()
    form.set('siteId', siteAlpha.id)
    form.set('title', 'Renegade Flagship OG Banner')
    form.set('altText', 'Renegade investigations banner')
    form.set('caption', 'Frontline investigative reporting banner')
    form.set(
      'file',
      new File([new Uint8Array(heroPngBytes)], 'renegade-flagship-og.png', { type: 'image/png' }),
    )

    const uploadResult = await json('/api/media/upload', alphaSession.cookie, 'POST', form, 201)
    const mediaRecord = uploadResult.asset
    check('Media fixture with OG variant created via /api/media/upload', mediaRecord.id)

    const operator = {
      create: async ({ collection, data }: any) =>
        (await json(`/api/${collection}`, alphaSession.cookie, 'POST', data, 201)).doc,
      update: async ({ collection, id, data }: any) =>
        (await json(`/api/${collection}/${id}`, alphaSession.cookie, 'PATCH', data)).doc,
      updateGlobal: async ({ slug, data }: any) =>
        (await json(`/api/globals/${slug}`, alphaSession.cookie, 'POST', data)).result,
    }

    // Step 3: Admin UI / Operator updates for Homepage SEO (SiteSettings)
    const homeSettings = await operator.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: 'Renegade Flagship',
        siteDescription: 'Frontline investigations and dispatch coverage from Renegade.',
        canonicalOrigin: base,
        canonicalOriginsBySite: {
          [siteAlpha.id]: base,
          [siteBeta.id]: 'http://beta.renegade.local:38980',
        },
        launchState: 'live',
        themeId: 'neutral-starter',
        seoTitle: 'Renegade Flagship — Independent Journalism',
        seoDescription: 'Frontline investigations and dispatch coverage from Renegade.',
        seoCanonicalURL: 'http://localhost:38980/',
        seoImageAlt: 'Renegade investigations banner',
        seoNoIndex: false,
        indexingMode: 'index',
        defaultSocialImage: mediaRecord.id,
        discoveryOverrides: {
          socialTitle: 'Renegade Flagship — Frontline Journalism',
          socialDescription: 'Unfiltered frontline reports and investigative files.',
          socialImage: mediaRecord.id,
        },
      } as any,
    })
    check('SiteSettings updated with custom SEO fields', homeSettings.seoTitle)

    // Step 4: Admin UI / Operator updates for Taxonomy (Category Investigations)
    const catRecord = await operator.create({
      collection: 'categories' as never,
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        name: 'Investigations',
        slug: 'investigations',
        description: 'All investigative reports and financial forensic files.',
        seoTitle: 'Investigations Archive | Deep Dives',
        seoDescription: 'All investigative reports and financial forensic files.',
        seoCanonicalURL: 'http://localhost:38980/categories/investigations',
        seoNoIndex: false,
        discoveryOverrides: {
          socialTitle: 'Renegade Investigations Archive',
          socialDescription: 'Deep investigative reporting archive.',
          socialImage: mediaRecord.id,
        },
      } as any,
    })
    check('Category Investigations created with custom SEO fields', catRecord.id)

    // Step 5: Admin UI / Operator updates for Articles
    // 5a: Published indexable article
    const articlePublished = await operator.create({
      collection: 'content' as never,
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'The Waterfront Deal',
        slug: 'investigation-the-waterfront-deal',
        contentType: 'article',
        status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        categories: [catRecord.id],
        body: {
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
                  {
                    type: 'text',
                    version: 1,
                    text: 'Full exposé on the waterfront rezoning scandal.',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        },
        excerpt: 'Investigation into docklands development.',
        heroMedia: mediaRecord.id,
        seoTitle: 'The Waterfront Deal: In-Depth Investigation | Renegade',
        seoDescription: 'A 6-month investigative probe into docklands rezoning.',
        seoCanonicalURL: 'http://localhost:38980/articles/investigation-the-waterfront-deal',
        seoNoIndex: false,
        discoveryOverrides: {
          socialTitle: 'Social Card: Docklands Rezoning Exposed',
          socialDescription: 'How millions shifted hands in harbor redevelopment.',
          socialImage: mediaRecord.id,
        },
      } as any,
    })
    check('Published article with custom SEO & OG created', articlePublished.id)

    // 5b: Draft article (must NOT be indexable or emit public metadata)
    const articleDraft = await operator.create({
      collection: 'content' as never,
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'Secret Draft Article',
        slug: 'secret-draft-unreleased',
        contentType: 'article',
        status: 'draft',
        body: {
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
                  {
                    type: 'text',
                    version: 1,
                    text: 'Confidential unpublished findings.',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        },
        seoTitle: 'Super Secret Leaked Document',
        seoDescription: 'Should never appear in search engines.',
        seoCanonicalURL: 'http://localhost:38980/articles/secret-draft-unreleased',
      } as any,
    })
    check('Draft article created', articleDraft.id)

    // 5c: Private article with requiredEntitlement (must NOT emit indexable public metadata)
    const articlePrivate = await operator.create({
      collection: 'content' as never,
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'Exclusive Vault Document',
        slug: 'exclusive-vault-document',
        contentType: 'article',
        status: 'published',
        publishedAt: new Date(Date.now() - 1800000).toISOString(),
        visibility: 'private',
        body: {
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
                  {
                    type: 'text',
                    version: 1,
                    text: 'Subscribers-only insider brief.',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        },
        seoTitle: 'VIP Vault Briefing',
        seoDescription: 'Confidential insider briefing.',
      } as any,
    })
    check('Private entitlement article created', articlePrivate.id)

    // 5d: Explicit seoNoIndex: true article
    const articleNoIndex = await operator.create({
      collection: 'content' as never,
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'Internal Notice Board',
        slug: 'internal-notice-board',
        contentType: 'article',
        status: 'published',
        publishedAt: new Date(Date.now() - 600000).toISOString(),
        body: {
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
                  {
                    type: 'text',
                    version: 1,
                    text: 'Not for search indexing.',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        },
        seoNoIndex: true,
      } as any,
    })
    check('Explicit seoNoIndex article created', articleNoIndex.id)

    // Step 6: Rendered HTML & Headers Inspection via HTTP GET
    // 6a: Homepage ('/')
    const homeRes = await api('/')
    check('Homepage returns HTTP 200', homeRes.status === 200)
    const homeHtml = await homeRes.text()
    check(
      'Homepage title matches seoTitle',
      homeHtml.includes('<title>Renegade Flagship — Independent Journalism</title>'),
    )
    check(
      'Homepage description matches seoDescription',
      homeHtml.includes(
        '<meta name="description" content="Frontline investigations and dispatch coverage from Renegade."/>',
      ),
    )
    check(
      'Homepage canonical URL is exact',
      homeHtml.includes('<link rel="canonical" href="http://localhost:38980/"/>'),
    )
    check(
      'Homepage robots is index, follow',
      homeHtml.includes('<meta name="robots" content="index, follow"/>'),
    )
    check(
      'Homepage og:title uses social override',
      homeHtml.includes(
        '<meta property="og:title" content="Renegade Flagship — Frontline Journalism"/>',
      ),
    )
    check(
      'Homepage og:description uses social override',
      homeHtml.includes(
        '<meta property="og:description" content="Unfiltered frontline reports and investigative files."/>',
      ),
    )
    check(
      'Homepage og:image uses media variant url',
      homeHtml.includes('?variant=og&amp;format=jpeg') ||
        homeHtml.includes('?variant=og&format=jpeg'),
    )
    check(
      'Homepage twitter:card is summary_large_image',
      homeHtml.includes('<meta name="twitter:card" content="summary_large_image"/>'),
    )
    check(
      'Homepage has WebSite Schema.org JSON-LD',
      homeHtml.includes('"@type": "WebSite"') || homeHtml.includes('"@type":"WebSite"'),
    )
    check(
      'Homepage has Organization Schema.org JSON-LD',
      homeHtml.includes('"@type": "Organization"') || homeHtml.includes('"@type":"Organization"'),
    )

    // 6b: Article ('/articles/investigation-the-waterfront-deal')
    const articleRes = await api('/articles/investigation-the-waterfront-deal')
    check('Published article returns HTTP 200', articleRes.status === 200)
    const articleHtml = await articleRes.text()
    check(
      'Article title matches custom seoTitle',
      articleHtml.includes('<title>The Waterfront Deal: In-Depth Investigation | Renegade</title>'),
    )
    check(
      'Article description matches custom seoDescription',
      articleHtml.includes(
        '<meta name="description" content="A 6-month investigative probe into docklands rezoning."/>',
      ),
    )
    check(
      'Article canonical URL matches custom seoCanonicalURL',
      articleHtml.includes(
        '<link rel="canonical" href="http://localhost:38980/articles/investigation-the-waterfront-deal"/>',
      ),
    )
    check(
      'Article robots is index, follow',
      articleHtml.includes('<meta name="robots" content="index, follow"/>'),
    )
    check(
      'Article og:title uses socialTitle override',
      articleHtml.includes(
        '<meta property="og:title" content="Social Card: Docklands Rezoning Exposed"/>',
      ),
    )
    check(
      'Article og:description uses socialDescription override',
      articleHtml.includes(
        '<meta property="og:description" content="How millions shifted hands in harbor redevelopment."/>',
      ),
    )
    check(
      'Article Schema.org has Article node with headline',
      articleHtml.includes(
        '"headline": "The Waterfront Deal: In-Depth Investigation | Renegade"',
      ) ||
        articleHtml.includes('"headline":"The Waterfront Deal: In-Depth Investigation | Renegade"'),
    )
    check(
      'Article Schema.org has BreadcrumbList node',
      articleHtml.includes('"@type": "BreadcrumbList"') ||
        articleHtml.includes('"@type":"BreadcrumbList"'),
    )

    // 6c: Category ('/categories/investigations')
    const catRes = await api('/categories/investigations')
    check('Category returns HTTP 200', catRes.status === 200)
    const catHtml = await catRes.text()
    check(
      'Category title matches custom seoTitle',
      catHtml.includes('<title>Investigations Archive | Deep Dives</title>'),
    )
    check(
      'Category description matches custom seoDescription',
      catHtml.includes(
        '<meta name="description" content="All investigative reports and financial forensic files."/>',
      ),
    )
    check(
      'Category canonical URL is exact',
      catHtml.includes(
        '<link rel="canonical" href="http://localhost:38980/categories/investigations"/>',
      ),
    )
    check(
      'Category has CollectionPage JSON-LD schema',
      catHtml.includes('"@type": "CollectionPage"') || catHtml.includes('"@type":"CollectionPage"'),
    )

    // 6d: Restricted Client Routes (/login, /members/settings)
    const loginRes = await api('/login')
    check('Login returns HTTP 200', loginRes.status === 200)
    check(
      'Login has X-Robots-Tag: noindex, nofollow header',
      loginRes.headers.get('x-robots-tag') === 'noindex, nofollow',
    )
    const loginHtml = await loginRes.text()
    check(
      'Login has <meta name="robots" content="noindex, nofollow"/>',
      loginHtml.includes('<meta name="robots" content="noindex, nofollow"/>'),
    )
    check(
      'Login does NOT emit indexable canonical tag',
      !loginHtml.includes('<link rel="canonical"'),
    )

    const memberRes = await api('/members/settings')
    check(
      'Members settings has X-Robots-Tag: noindex, nofollow header',
      memberRes.headers.get('x-robots-tag') === 'noindex, nofollow',
    )
    const memberHtml = await memberRes.text()
    check(
      'Members settings has noindex robots tag',
      memberHtml.includes('<meta name="robots" content="noindex, nofollow"/>'),
    )

    // 6e: Draft & Private Articles (Must NOT be publicly indexable)
    const draftRes = await api('/articles/secret-draft-unreleased')
    check('Draft article returns HTTP 404 to unauthenticated public user', draftRes.status === 404)
    const draftHtml = await draftRes.text()
    check(
      'Draft 404 page does not leak draft title',
      !draftHtml.includes('Super Secret Leaked Document'),
    )
    check(
      'Draft 404 page does not emit indexable canonical',
      !draftHtml.includes(
        '<link rel="canonical" href="http://localhost:38980/articles/secret-draft-unreleased"',
      ),
    )

    const privateRes = await api('/articles/exclusive-vault-document')
    check(
      'Private article returns 200 or 404 without public indexable canonical',
      privateRes.status === 200 || privateRes.status === 404,
    )
    const privateHtml = await privateRes.text()
    check(
      'Private article emits noindex or 404',
      privateHtml.includes('noindex') || privateRes.status === 404,
    )

    const noIndexRes = await api('/articles/internal-notice-board')
    check('seoNoIndex article returns HTTP 200', noIndexRes.status === 200)
    const noIndexHtml = await noIndexRes.text()
    check(
      'seoNoIndex article emits <meta name="robots" content="noindex',
      noIndexHtml.includes('<meta name="robots" content="noindex'),
    )

    // 6f: Sitemap & Feed exclusion check
    const sitemapIndexRes = await api('/sitemap.xml')
    check('Sitemap index returns HTTP 200', sitemapIndexRes.status === 200)
    const sitemapRes = await api('/sitemaps/1.xml')
    check('Sitemap chunk returns HTTP 200', sitemapRes.status === 200)
    const sitemapXml = await sitemapRes.text()
    check(
      'Sitemap includes published indexable article',
      sitemapXml.includes('/articles/investigation-the-waterfront-deal'),
    )
    check(
      'Sitemap includes category hierarchy page',
      sitemapXml.includes('/categories/investigations'),
    )
    check('Sitemap excludes draft article', !sitemapXml.includes('secret-draft-unreleased'))
    check('Sitemap excludes private article', !sitemapXml.includes('exclusive-vault-document'))
    check('Sitemap excludes seoNoIndex article', !sitemapXml.includes('internal-notice-board'))

    for (const [label, html] of [
      ['home', homeHtml],
      ['article', articleHtml],
      ['category', catHtml],
    ]) {
      check(
        `${label} emits exactly one canonical`,
        (html.match(/<link rel="canonical"/g) ?? []).length === 1,
      )
    }
    const preview = await json('/api/admin/content/preview', alphaSession.cookie, 'POST', {
      id: articleDraft.id,
    })
    const previewRes = await api(preview.url, alphaSession.cookie)
    const previewHtml = await previewRes.text()
    check('Authenticated saved draft preview renders', previewRes.status === 200)
    check(
      'Preview response forbids indexing in headers and metadata',
      previewRes.headers.get('x-robots-tag') === 'noindex, nofollow' &&
        previewHtml.includes('<meta name="robots" content="noindex, nofollow"/>'),
    )
    check(
      'Preview omits canonical and social cards',
      !/<link rel="canonical"|<meta property="og:/.test(previewHtml),
    )
    const anonymousPreview = await api(preview.url)
    check(
      'Anonymous preview denied without leaking draft',
      anonymousPreview.status === 404 &&
        !(await anonymousPreview.text()).includes('Super Secret Leaked Document'),
    )
    const foreignPreview = await api(preview.url, betaSession.cookie)
    check('Foreign-site preview denied', foreignPreview.status === 404)
    for (const canonical of [
      `${base}/articles/investigation-the-waterfront-deal#fragment`,
      `${base}/articles/exclusive-vault-document`,
    ]) {
      await assert.rejects(() =>
        operator.update({
          collection: 'content',
          id: articlePublished.id,
          data: { seoCanonicalURL: canonical },
        }),
      )
      check(`Invalid canonical rejected: ${canonical}`, true)
    }

    // Step 7: Negative Validation (Canonical Conflicts & Origin Boundary Protection)
    console.log('--- NEGATIVE CANONICAL VALIDATION CHECKS ---')

    await assert.rejects(() =>
      operator.update({
        collection: 'content',
        id: articlePublished.id,
        data: {
          seoCanonicalURL: '',
          discoveryOverrides: { canonical: 'https://foreign.example/article' },
        },
      }),
    )
    check('Cleared ordinary canonical cannot bypass JSON override validation over HTTP', true)

    // 7a: Reject cross-origin canonical URL
    await assert.rejects(
      async () => {
        await operator.update({
          collection: 'content' as never,
          id: articlePublished.id,
          data: {
            seoCanonicalURL: 'https://evil-cross-site-phishing.com/stolen-article',
          } as any,
        })
      },
      (err: any) => {
        assert.match(String(err?.message || ''), /expected 200, got 400/)
        return true
      },
      'Should reject cross-origin canonical URL',
    )
    check('Cross-origin canonical URL rejected', true)

    // 7b: Reject canonical URL with query string
    await assert.rejects(
      async () => {
        await operator.update({
          collection: 'content' as never,
          id: articlePublished.id,
          data: {
            seoCanonicalURL:
              'http://localhost:38980/articles/investigation-the-waterfront-deal?utm_source=ad',
          } as any,
        })
      },
      (err: any) => {
        assert.match(String(err?.message || ''), /expected 200, got 400/)
        return true
      },
      'Should reject canonical with query params',
    )
    check('Canonical URL with query params rejected', true)

    // 7c: Reject canonical URL targeting draft or non-indexable target
    await assert.rejects(
      async () => {
        await operator.update({
          collection: 'content' as never,
          id: articlePublished.id,
          data: {
            seoCanonicalURL: 'http://localhost:38980/articles/secret-draft-unreleased',
          } as any,
        })
      },
      (err: any) => {
        assert.match(String(err?.message || ''), /expected 200, got 400/)
        return true
      },
      'Should reject canonical URL targeting draft content',
    )
    check('Canonical URL targeting draft rejected', true)

    // 7d: Cross-site operator unauthorized update rejection
    const crossSiteUpdateAttempt = await api(
      `/api/content/${articlePublished.id}`,
      betaSession.cookie,
      'PATCH',
      { seoTitle: 'Hacked Title' },
    )
    check(
      'Beta staff cannot update Alpha content (HTTP 403 or 404)',
      crossSiteUpdateAttempt.status === 403 || crossSiteUpdateAttempt.status === 404,
    )
    const anonymousUpdate = await api(`/api/content/${articlePublished.id}`, '', 'PATCH', {
      seoTitle: 'Anonymous overwrite',
    })
    check('Anonymous metadata update denied', [401, 403].includes(anonymousUpdate.status))
    const persistedAfterDenial = await record('content', articlePublished.id)
    check(
      'Denied writes leave persisted title and canonical intact',
      persistedAfterDenial.seoTitle === articlePublished.seoTitle &&
        persistedAfterDenial.seoCanonicalURL === articlePublished.seoCanonicalURL,
    )

    // Step 8: Metadata Preservation across Theme Switches and Content Revisions
    console.log('--- THEME SWITCH & REVISION PERSISTENCE CHECKS ---')

    // 8a: Switch theme on site-settings to 'renegade-party'
    await operator.updateGlobal({
      slug: 'site-settings',
      data: { themeId: 'renegade-party' } as any,
    })
    const switchedThemeHome = await api('/')
    const switchedHtml = await switchedThemeHome.text()
    check(
      'Theme switch preserves Homepage SEO title',
      switchedHtml.includes('<title>Renegade Flagship — Independent Journalism</title>'),
    )
    check(
      'Theme switch preserves Homepage canonical',
      switchedHtml.includes('<link rel="canonical" href="http://localhost:38980/"/>'),
    )
    check(
      'Theme switch preserves WebSite JSON-LD',
      switchedHtml.includes('"@type": "WebSite"') || switchedHtml.includes('"@type":"WebSite"'),
    )

    // Switch back to neutral-starter
    await operator.updateGlobal({
      slug: 'site-settings',
      data: { themeId: 'neutral-starter' } as any,
    })
    check('Theme switched back to neutral-starter cleanly', true)

    // 8b: Create content revision and assert metadata survives
    const updatedArticle = await operator.update({
      collection: 'content' as never,
      id: articlePublished.id,
      data: {
        body: {
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
                  {
                    type: 'text',
                    version: 1,
                    text: 'Updated full exposé with newly uncovered financial records.',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                  },
                ],
              },
            ],
          },
        },
      } as any,
    })
    const recAfterRevision = await record('content', updatedArticle.id)
    check(
      'Revision preserved seoTitle',
      recAfterRevision.seoTitle === 'The Waterfront Deal: In-Depth Investigation | Renegade',
    )
    check(
      'Revision preserved seoDescription',
      recAfterRevision.seoDescription === 'A 6-month investigative probe into docklands rezoning.',
    )
    check(
      'Revision preserved seoCanonicalURL',
      recAfterRevision.seoCanonicalURL ===
        'http://localhost:38980/articles/investigation-the-waterfront-deal',
    )
    check(
      'Revision preserved discoveryOverrides',
      recAfterRevision.discoveryOverrides?.socialTitle ===
        'Social Card: Docklands Rezoning Exposed',
    )
    const revisedHtml = await (await api('/articles/investigation-the-waterfront-deal')).text()
    check(
      'Rendered metadata survives revision',
      revisedHtml.includes(
        '<title>The Waterfront Deal: In-Depth Investigation | Renegade</title>',
      ) &&
        revisedHtml.includes(
          '<meta property="og:title" content="Social Card: Docklands Rezoning Exposed"/>',
        ),
    )

    const gated = await operator.create({
      collection: 'content',
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'Entitlement Gated Brief',
        slug: 'entitlement-gated-brief',
        contentType: 'article',
        status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        visibility: 'public',
        requiredEntitlement: { resource: 'vault', capability: 'read' },
        body: articleDraft.body,
      },
    })
    const gatedRes = await api('/articles/entitlement-gated-brief')
    const gatedHtml = await gatedRes.text()
    check(
      'Entitlement-gated page emits no indexable metadata',
      [200, 404].includes(gatedRes.status) &&
        gatedHtml.includes('noindex') &&
        !gatedHtml.includes('<link rel="canonical"'),
    )
    await assert.rejects(() =>
      operator.update({
        collection: 'content',
        id: articlePublished.id,
        data: { seoCanonicalURL: `${base}/articles/entitlement-gated-brief` },
      }),
    )
    check('Entitlement-gated canonical target rejected over HTTP', true)
    const alias = await operator.create({
      collection: 'content',
      data: {
        site: siteAlpha.id,
        publication: publication.id,
        title: 'Waterfront Syndicated Copy',
        slug: 'waterfront-syndicated-copy',
        contentType: 'article',
        status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
        body: articleDraft.body,
        seoCanonicalURL: articlePublished.seoCanonicalURL,
      },
    })
    const aliasHtml = await (await api('/articles/waterfront-syndicated-copy')).text()
    check(
      'Alias emits exactly one canonical pointing to primary article',
      (aliasHtml.match(/<link rel="canonical"/g) ?? []).length === 1 &&
        aliasHtml.includes(`<link rel="canonical" href="${articlePublished.seoCanonicalURL}"/>`),
    )
    for (const data of [
      { requiredEntitlement: { resource: 'vault', capability: 'read' } },
      { seoNoIndex: true },
      { seoCanonicalURL: `${base}/categories/investigations` },
    ]) {
      await assert.rejects(() =>
        operator.update({ collection: 'content', id: articlePublished.id, data }),
      )
      check(`Referenced canonical target change rejected: ${JSON.stringify(data)}`, true)
    }
    const finalSitemap = await (await api('/sitemaps/1.xml')).text()
    check(
      'Sitemap excludes syndicated alias and entitlement-gated page',
      !finalSitemap.includes('waterfront-syndicated-copy') &&
        !finalSitemap.includes('entitlement-gated-brief'),
    )
    const finalPersisted = await record('content', articlePublished.id)
    check(
      'Rejected target changes leave persisted public metadata intact',
      !finalPersisted.seoNoIndex &&
        !finalPersisted.requiredEntitlement &&
        finalPersisted.seoCanonicalURL === articlePublished.seoCanonicalURL,
    )
    const persistedSettings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    const persistedCategory = await record('categories', catRecord.id)
    check(
      'Fresh database reads confirm homepage and category SEO saves',
      persistedSettings.seoTitle === homeSettings.seoTitle &&
        persistedCategory.seoTitle === catRecord.seoTitle,
    )
    check(
      'Private and draft pages omit canonicals and social metadata',
      !/<link rel="canonical"|<meta property="og:/.test(privateHtml + draftHtml),
    )
    check(
      'Persisted alias and entitlement fixtures match operator request',
      (await record('content', alias.id)).seoCanonicalURL === articlePublished.seoCanonicalURL &&
        (await record('content', gated.id)).requiredEntitlement?.resource === 'vault',
    )

    await assert.rejects(
      () =>
        operator.updateGlobal({
          slug: 'site-settings',
          data: { seoCanonicalURL: articleDraft.seoCanonicalURL },
        }),
      /expected 200, got 400/,
    )
    check('Homepage canonical cannot target a draft or another content path', true)
    await operator.updateGlobal({ slug: 'site-settings', data: { seoNoIndex: true } })
    const noindexHome = await (await api('/')).text()
    const noindexSettings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
    check(
      'Homepage noindex field persists and synchronizes indexing mode',
      noindexSettings.seoNoIndex === true && noindexSettings.indexingMode === 'noindex',
    )
    check(
      'Homepage noindex field affects rendered robots',
      noindexHome.includes('<meta name="robots" content="noindex, nofollow"/>'),
    )
    await operator.updateGlobal({ slug: 'site-settings', data: { seoNoIndex: false } })
    const reindexedHome = await (await api('/')).text()
    check(
      'Homepage indexing restored through the same admin field',
      reindexedHome.includes('<meta name="robots" content="index, follow"/>') &&
        reindexedHome.includes(`<title>${homeSettings.seoTitle}</title>`),
    )

    // Step 9: Playwright UI Screenshot Proof of Admin Controls & Public Render
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // 9a: Render Homepage in browser
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: path.join(out, 'screenshot-homepage-render.png'),
      fullPage: false,
    })
    check('Playwright screenshot of rendered Homepage captured', true)

    // 9b: Render Article in browser
    await page.goto(`${base}/articles/investigation-the-waterfront-deal`, {
      waitUntil: 'networkidle',
    })
    await page.screenshot({
      path: path.join(out, 'screenshot-article-render.png'),
      fullPage: false,
    })
    check('Playwright screenshot of rendered Article captured', true)

    // 9c: Render Category in browser
    await page.goto(`${base}/categories/investigations`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: path.join(out, 'screenshot-category-render.png'),
      fullPage: false,
    })
    check('Playwright screenshot of rendered Category captured', true)

    // Step 10: Write State & Journey Evidence
    const stateSummary = {
      timestamp: new Date().toISOString(),
      siteAlpha: { id: siteAlpha.id, theme: 'neutral-starter' },
      siteBeta: { id: siteBeta.id },
      homeSettingsSeo: {
        seoTitle: homeSettings.seoTitle,
        seoDescription: homeSettings.seoDescription,
        seoCanonicalURL: homeSettings.seoCanonicalURL,
        seoImageAlt: homeSettings.seoImageAlt,
        seoNoIndex: homeSettings.seoNoIndex,
        indexingMode: homeSettings.indexingMode,
        discoveryOverrides: homeSettings.discoveryOverrides,
      },
      catRecordSeo: {
        id: catRecord.id,
        title: catRecord.title,
        seoTitle: catRecord.seoTitle,
        seoDescription: catRecord.seoDescription,
        seoCanonicalURL: catRecord.seoCanonicalURL,
      },
      articlePublishedSeo: {
        id: articlePublished.id,
        title: articlePublished.title,
        seoTitle: articlePublished.seoTitle,
        seoDescription: articlePublished.seoDescription,
        seoCanonicalURL: articlePublished.seoCanonicalURL,
        discoveryOverrides: articlePublished.discoveryOverrides,
      },
      articleDraft: { id: articleDraft.id, status: articleDraft.status },
      articlePrivate: {
        id: articlePrivate.id,
        requiredEntitlement: articlePrivate.requiredEntitlement,
      },
      articleNoIndex: { id: articleNoIndex.id, seoNoIndex: articleNoIndex.seoNoIndex },
      totalChecksPassed: checks.length,
    }

    await writeFile(path.join(out, 'state.json'), JSON.stringify(stateSummary, null, 2), 'utf8')
    await writeFile(
      path.join(out, 'journey.json'),
      JSON.stringify({ checks, timestamp: new Date().toISOString(), ok: true }, null, 2),
      'utf8',
    )

    console.log(`\n========================================`)
    console.log(`ALL 06A CHECKS PASSED: ${checks.length}/${checks.length}`)
    console.log(`========================================\n`)
  } catch (error) {
    console.error('VERIFICATION FAILED:', error)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close()
    await payload.db.destroy?.()
  }
}
await main()
process.exit(process.exitCode ?? 0)
