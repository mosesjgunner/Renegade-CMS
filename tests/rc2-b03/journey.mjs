// RC2-B-03 — Publication identity & archives journey: follow one
// published article across homepage, archive, category archive, feed,
// sitemap and its own page (byline, taxonomy, related links); prove a
// title change propagates everywhere with no orphaned copies; rename
// the slug and check the redirect; empty states; site specificity;
// denied edit. Plain .mjs (playwright-core + node:http).
process.env.NO_PROXY = (process.env.NO_PROXY || '') + ',a.rc2-a04.test,b.rc2-a04.test'
process.env.no_proxy = process.env.NO_PROXY
import { chromium } from 'playwright-core'
import { get as httpGet } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.B03_SHOTS || '/home/hatch/workspace/gui01b-logs/b03-shots'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
const ART = JSON.parse(readFileSync('/tmp/b03-article.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const stamp = Date.now().toString(36)
const NEW_TITLE = `B03 Propagation Article RENAMED ${stamp}`
const NEW_SLUG = `${ART.slug}-renamed-${stamp}`
const NEW_PATH = `/articles/${NEW_SLUG}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const rawGet = (host, path) =>
  new Promise((resolve, reject) => {
    const req = httpGet(
      { hostname: '127.0.0.1', port: 39071, path, headers: { host: `${host}:39071` } },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
const stripTags = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

const hostA = WORLD.siteA.host
const hostB = WORLD.siteB.host

// --- surfaces carrying the article ----------------------------------------
const articlePage = await rawGet(hostA, ART.canonicalPath)
const articleText = stripTags(articlePage.body)
stage(
  'article page shows byline, taxonomy and related reporting',
  articlePage.status === 200 &&
    articleText.includes(`By ${ART.authorName}`) &&
    articleText.includes(`Category: ${ART.categoryName}`) &&
    articleText.includes(`# ${ART.tagName}`) &&
    articleText.includes('Related reporting') &&
    articlePage.body.includes(`href="${ART.relatedPath}"`),
  `status=${articlePage.status}`,
)

const home = await rawGet(hostA, '/')
stage(
  'homepage lists the article and links its canonical path',
  home.status === 200 && home.body.includes(ART.title) && home.body.includes(ART.canonicalPath),
  `status=${home.status}`,
)
const archive = await rawGet(hostA, '/articles')
stage(
  'archive lists the article',
  archive.status === 200 && archive.body.includes(ART.title),
  `status=${archive.status}`,
)
const category = await rawGet(hostA, `/categories/${ART.categorySlug}`)
stage(
  'category archive lists the article',
  category.status === 200 && category.body.includes(ART.title),
  `status=${category.status}`,
)
const feed = await rawGet(hostA, '/feed.xml')
const sitemapIndex = await rawGet(hostA, '/sitemap.xml')
const childPath = (sitemapIndex.body.match(/sitemaps\/\d+\.xml/) || [])[0]
const sitemapChild = childPath ? await rawGet(hostA, `/${childPath}`) : { status: 0, body: '' }
stage(
  'RSS feed and sitemap carry the article at its canonical URL',
  feed.status === 200 &&
    feed.body.includes(ART.title) &&
    feed.body.includes(ART.canonicalPath) &&
    sitemapChild.body.includes(ART.canonicalPath),
  `feed=${feed.status} sitemapChild=${childPath} inSitemap=${sitemapChild.body.includes(ART.canonicalPath)}`,
)

// --- browser for mutations + screenshots -----------------------------------
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', `--host-resolver-rules=MAP ${hostA} 127.0.0.1, MAP ${hostB} 127.0.0.1`],
})
const newAdminPage = async (token) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  await ctx.addCookies([{ name: 'renegade-passkey', value: token, url: BASE + '/' }])
  const page = await ctx.newPage()
  await page.goto(BASE + '/admin', { timeout: 120000, waitUntil: 'domcontentloaded' })
  await sleep(2500)
  return page
}
const adminPage = await newAdminPage(WORLD.cookies.adminA)
const patchAs = (page, body) =>
  page.evaluate(`(async () => {
    const r = await fetch('/api/content/${ART.articleId}', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(${JSON.stringify(body)}),
    })
    return { status: r.status, text: (await r.text()).slice(0, 200) }
  })()`)

const shotCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const shotPage = await shotCtx.newPage()
await shotPage.goto(`http://${hostA}:39071${ART.canonicalPath}`, {
  timeout: 120000,
  waitUntil: 'domcontentloaded',
})
await sleep(3000)
await shotPage.screenshot({ path: SHOTS + '/01-article-page.png' })
await shotPage.goto(`http://${hostA}:39071/categories/${ART.categorySlug}`, {
  timeout: 120000,
  waitUntil: 'domcontentloaded',
})
await sleep(2500)
await shotPage.screenshot({ path: SHOTS + '/02-category-archive.png' })

// --- propagation: rename the title -----------------------------------------
const patchTitle = await patchAs(adminPage, { title: NEW_TITLE })
const surfaces = [
  ['article page', ART.canonicalPath],
  ['homepage', '/'],
  ['archive', '/articles'],
  ['category archive', `/categories/${ART.categorySlug}`],
  ['RSS feed', '/feed.xml'],
]
let propagated = false
let lastSeen = ''
for (let i = 0; i < 10 && !propagated; i++) {
  const checks = []
  for (const [label, path] of surfaces) {
    const r = await rawGet(hostA, path)
    checks.push({ label, hasNew: r.body.includes(NEW_TITLE), hasOld: r.body.includes(ART.title) })
  }
  propagated = checks.every((c) => c.hasNew && !c.hasOld)
  lastSeen = checks
    .map((c) => `${c.label}:${c.hasNew ? 'new' : c.hasOld ? 'OLD' : 'absent'}`)
    .join(' ')
  if (!propagated) await sleep(4000)
}
stage(
  'title change propagates to every surface with no orphaned copies',
  patchTitle.status === 200 && propagated,
  `patch=${patchTitle.status} ${lastSeen}`,
)

// --- slug change + redirect ---------------------------------------------------
const patchSlug = await patchAs(adminPage, { slug: NEW_SLUG })
await sleep(3000)
const oldPathResp = await rawGet(hostA, ART.canonicalPath)
const loc = oldPathResp.headers.location || ''
stage(
  'renamed slug redirects the old canonical URL to the new one',
  patchSlug.status === 200 &&
    oldPathResp.status >= 300 &&
    oldPathResp.status < 400 &&
    loc.includes(NEW_SLUG),
  `patch=${patchSlug.status} oldStatus=${oldPathResp.status} location=${loc}`,
)
const newPathResp = await rawGet(hostA, NEW_PATH)
stage(
  'new canonical URL serves the article',
  newPathResp.status === 200 && newPathResp.body.includes(NEW_TITLE),
  `status=${newPathResp.status}`,
)
// Exact-URL match: the old path is a string prefix of the new one, so a
// plain includes() would false-positive on the renamed URL itself.
const hasExactUrl = (body, path) =>
  new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![-a-zA-Z0-9])').test(body)
let feedFresh = false
for (let i = 0; i < 8 && !feedFresh; i++) {
  const f = await rawGet(hostA, '/feed.xml')
  const idx = await rawGet(hostA, '/sitemap.xml')
  const cp = (idx.body.match(/sitemaps\/\d+\.xml/) || [])[0]
  const child = cp ? await rawGet(hostA, `/${cp}`) : { body: '' }
  feedFresh =
    hasExactUrl(f.body, NEW_PATH) &&
    !hasExactUrl(f.body, ART.canonicalPath) &&
    hasExactUrl(child.body, NEW_PATH) &&
    !hasExactUrl(child.body, ART.canonicalPath)
  if (!feedFresh) await sleep(4000)
}
stage('feed and sitemap follow the rename (new URL only)', feedFresh, '')

// --- missing slug ----------------------------------------------------------------
const missing = await rawGet(hostA, `/articles/no-such-article-${stamp}`)
stage('missing slug is a clean 404', missing.status === 404, `status=${missing.status}`)

// --- empty states + site specificity ----------------------------------------------
const emptyCat = await rawGet(hostA, `/categories/${ART.emptyCategorySlug}`)
const emptyText = stripTags(emptyCat.body)
stage(
  'empty category renders an accessible empty state',
  emptyCat.status === 200 && /No hierarchy entries yet/i.test(emptyText),
  `status=${emptyCat.status} text="...${emptyText.slice(emptyText.indexOf('Browse'), emptyText.indexOf('Browse') + 90)}..."`,
)
const archiveB = await rawGet(hostB, '/articles')
const catOnB = await rawGet(hostB, `/categories/${ART.categorySlug}`)
stage(
  "Site B surfaces carry none of Site A's article or taxonomy",
  archiveB.status === 200 && !archiveB.body.includes(NEW_TITLE) && catOnB.status === 404,
  `archiveB=${archiveB.status} hasTitle=${archiveB.body.includes(NEW_TITLE)} categoryOnB=${catOnB.status}`,
)

// --- denied edit ---------------------------------------------------------------------
const outPage = await newAdminPage(WORLD.cookies.outsiderB)
const denied = await patchAs(outPage, { title: `Hijacked ${stamp}` })
const afterDeny = await rawGet(hostA, NEW_PATH)
stage(
  'role-denied edit is refused and the article is unchanged',
  (denied.status === 401 || denied.status === 403 || denied.status === 404) &&
    afterDeny.body.includes(NEW_TITLE) &&
    !afterDeny.body.includes('Hijacked'),
  `deniedStatus=${denied.status}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(SHOTS + '/results.json', JSON.stringify({ stamp, results }, null, 2))
await browser.close().catch(() => {})
process.exit(passed === results.length ? 0 : 1)
