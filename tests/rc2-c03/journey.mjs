// RC2-C-03 — SEO metadata, redirects and site-quality actions journey.
// Traces a published page through canonical/meta/Open Graph/structured
// data/sitemap/robots; exercises the Redirect Manager API and its
// request-time firing (validation, duplicates, cross-site, auth); runs
// the rendered audit and MEASURES its scope; inspects a document through
// the operator discovery inspector; and runs the editorial quality gate
// on a draft missing its meta description — blocked, fixed, approved,
// published. Plain .mjs (node:http + fetch). Requires the served RC2
// world and the C-03 seed already run.
import { get as httpGet } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.C03_SHOTS || '/home/hatch/workspace/gui01b-logs/c03-shots'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
const SEED = JSON.parse(readFileSync('/tmp/c03-articles.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const suffix = SEED.suffix
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const adminA = WORLD.cookies.adminA
const editorA = WORLD.cookies.editorA
const outsiderB = WORLD.cookies.outsiderB
const siteA = WORLD.siteA.siteId
const hostA = WORLD.siteA.host
const hostB = WORLD.siteB.host

const rawGet = (host, path, cookie, port = 39071) =>
  new Promise((resolve, reject) => {
    const headers = { host: `${host}:${port}` }
    if (cookie) headers.cookie = `renegade-passkey=${cookie}`
    const req = httpGet({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
const api = async (path, { method = 'GET', cookie, json } = {}) => {
  const headers = {}
  if (cookie) headers.cookie = `renegade-passkey=${cookie}`
  let body
  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const res = await fetch(BASE + path, { method, headers, body })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* not json */
  }
  return { status: res.status, text, data }
}

// --- 1. the page as a crawler sees it ---------------------------------------------------------------
const page = await rawGet(hostA, SEED.tracePath)
const head = page.body
const canonical = head.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? ''
const ogTitle = head.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? ''
const ogUrl = head.match(/<meta property="og:url" content="([^"]+)"/)?.[1] ?? ''
const ldRaw = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
let ldType = ''
try {
  const ld = JSON.parse(ldRaw ?? '{}')
  ldType = String(ld['@type'] ?? (Array.isArray(ld['@graph']) ? ld['@graph'][0]?.['@type'] : ''))
} catch {
  ldType = ''
}
stage(
  'trace page carries title, description, canonical, Open Graph and structured data',
  page.status === 200 &&
    head.includes(`<title>${SEED.traceTitle}</title>`) &&
    head.includes(
      'content="A fully described article used to trace canonical, Open Graph and structured data output."',
    ) &&
    canonical === `https://${hostA}${SEED.tracePath}` &&
    ogTitle === SEED.traceTitle &&
    ogUrl === canonical &&
    ldType.length > 0,
  `canonical=${canonical} ldType=${ldType}`,
)

// --- 2. sitemap + robots, per site ---------------------------------------------------------------------
const smIndex = await rawGet(hostA, '/sitemap.xml')
const smA = await rawGet(hostA, '/sitemaps/1.xml')
const smB = await rawGet(hostB, '/sitemaps/1.xml')
stage(
  'sitemap is generated per site: A lists the article, B does not',
  smIndex.status === 200 &&
    smA.status === 200 &&
    smA.body.includes(SEED.tracePath) &&
    smB.status === 200 &&
    !smB.body.includes(SEED.tracePath),
  `index=${smIndex.status} a=${smA.status} b=${smB.status}`,
)
const robotsA = await rawGet(hostA, '/robots.txt')
stage(
  'robots.txt serves, points at the sitemap, and does not block articles',
  robotsA.status === 200 &&
    robotsA.body.includes('/sitemap.xml') &&
    !robotsA.body.includes('Disallow: /articles'),
  `status=${robotsA.status} body=${robotsA.body.slice(0, 90).replace(/\n/g, ' | ')}`,
)

// --- 3. redirects -----------------------------------------------------------------------------------------
const fromPath = `/c03-legacy-${suffix}-${Date.now().toString(36)}`
const create = await api('/api/admin/redirects', {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA, fromPath, toPath: SEED.tracePath, statusCode: '301' },
})
const fired = await rawGet(hostA, fromPath)
const dup = await api('/api/admin/redirects', {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA, fromPath, toPath: SEED.tracePath, statusCode: '301' },
})
const list = await api(`/api/admin/redirects?site=${siteA}`, { cookie: adminA })
const rulesForPath = (list.data?.rules ?? []).filter((r) => r.fromPath === fromPath)
stage(
  'redirect creates, fires as a 301 to the article, and cannot be duplicated',
  (create.status === 200 || create.status === 201) &&
    Boolean(create.data?.rule?.id) &&
    fired.status === 301 &&
    String(fired.headers.location ?? '').endsWith(SEED.tracePath) &&
    dup.status >= 400 &&
    rulesForPath.length === 1,
  `create=${create.status} fired=${fired.status} dup=${dup.status} rules=${rulesForPath.length}`,
)
const external = await api('/api/admin/redirects', {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA, fromPath: `/c03-ext-${suffix}`, toPath: 'https://example.com/x' },
})
const selfRef = await api('/api/admin/redirects', {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA, fromPath: `/c03-self-${suffix}`, toPath: `/c03-self-${suffix}` },
})
const outCreate = await api('/api/admin/redirects', {
  method: 'POST',
  cookie: outsiderB,
  json: { siteId: siteA, fromPath: `/c03-out-${suffix}`, toPath: SEED.tracePath },
})
const anonList = await api(`/api/admin/redirects?site=${siteA}`, {})
const firedOnB = await rawGet(hostB, fromPath)
stage(
  'invalid, cross-site and anonymous redirect attempts are refused; the rule does not fire on Site B',
  external.status === 400 &&
    selfRef.status === 400 &&
    outCreate.status === 403 &&
    anonList.status === 403 &&
    firedOnB.status !== 301,
  `external=${external.status} self=${selfRef.status} outsider=${outCreate.status} anon=${anonList.status} onB=${firedOnB.status}`,
)

// --- 4. operator surfaces render ----------------------------------------------------------------------------
const redirectsUi = await rawGet('127.0.0.1', '/admin/redirects', adminA)
const qualityUi = await rawGet('127.0.0.1', '/admin/rendered-quality', adminA)
stage(
  'Redirect Manager and Rendered Quality admin surfaces load for staff',
  redirectsUi.status === 200 && qualityUi.status === 200,
  `redirects=${redirectsUi.status} quality=${qualityUi.status}`,
)

// --- 5. rendered audit: run and measure the scope --------------------------------------------------------------
const audit = await api('/api/admin/discovery/audit', {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA },
})
const auditPages = audit.data?.pages?.length ?? -1
const auditIssues = audit.data?.issues?.length ?? -1
stage(
  'rendered audit executes and reports its measured scope (pages/issues/lifecycle recorded)',
  audit.status === 200 && auditPages >= 0 && Boolean(audit.data?.lifecycle),
  `status=${audit.status} pages=${auditPages} issues=${auditIssues} lifecycle=${JSON.stringify(audit.data?.lifecycle ?? {}).slice(0, 120)}`,
)

// --- 6. discovery inspector --------------------------------------------------------------------------------------
const inspect = await api(`/api/admin/discovery?id=${SEED.nodescId}`, { cookie: adminA })
stage(
  'operator discovery inspector resolves the no-description article and its canonical URL',
  inspect.status === 200 &&
    inspect.data?.document?.indexability?.indexable === true &&
    String(inspect.data?.document?.canonicalUrl ?? '').endsWith(SEED.nodescPath) &&
    Boolean(inspect.data?.preview),
  `status=${inspect.status} canonical=${inspect.data?.document?.canonicalUrl}`,
)

// --- 7. the quality gate, warning path: recorded, not blocking ---------------------------------------------------
const submit = await api('/api/admin/workflow/actions', {
  method: 'POST',
  cookie: editorA,
  json: { articleId: SEED.gatedId, action: 'submit' },
})
const approveWarned = await api('/api/admin/workflow/actions', {
  method: 'POST',
  cookie: adminA,
  json: { articleId: SEED.gatedId, action: 'approve', targetStatus: 'published' },
})
const gatedRead = await api(`/api/content/${SEED.gatedId}?depth=0`, { cookie: adminA })
const snapshotJson = JSON.stringify(gatedRead.data ?? {})
stage(
  'missing description is recorded as a gate warning (metadata-description) without blocking approval',
  submit.status === 200 &&
    approveWarned.status === 200 &&
    snapshotJson.includes('metadata-description'),
  `submit=${submit.status} approve=${approveWarned.status} snapshotHasRule=${snapshotJson.includes('metadata-description')}`,
)

// --- 8. the quality gate, blocking path: alt text ------------------------------------------------------------------
const submitB = await api('/api/admin/workflow/actions', {
  method: 'POST',
  cookie: editorA,
  json: { articleId: SEED.gatedBlockId, action: 'submit' },
})
const approveBlocked = await api('/api/admin/workflow/actions', {
  method: 'POST',
  cookie: adminA,
  json: { articleId: SEED.gatedBlockId, action: 'approve', targetStatus: 'published' },
})
const blockRead = await api(`/api/content/${SEED.gatedBlockId}?depth=0`, { cookie: adminA })
const blockJson = JSON.stringify(blockRead.data ?? {}) + JSON.stringify(approveBlocked.data ?? '')
stage(
  'a hero image without alt text BLOCKS approval (media-alt-text, publication_blocking)',
  submitB.status === 200 && approveBlocked.status !== 200 && blockJson.includes('media-alt-text'),
  `submit=${submitB.status} approve=${approveBlocked.status} snapshotHasRule=${blockJson.includes('media-alt-text')}`,
)
const fixAlt = await api(`/api/media/${SEED.noaltId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: { siteId: siteA, altText: 'Alt text added at the gate so approval can proceed' },
})
const approveFixed = await api('/api/admin/workflow/actions', {
  method: 'POST',
  cookie: adminA,
  json: { articleId: SEED.gatedBlockId, action: 'approve', targetStatus: 'published' },
})
const afterRead = await api(`/api/content/${SEED.gatedBlockId}?depth=0`, { cookie: adminA })
stage(
  'after alt text is added, approval succeeds',
  fixAlt.status === 200 && approveFixed.status === 200 && afterRead.data?.status === 'approved',
  `fix=${fixAlt.status} approve=${approveFixed.status} status=${afterRead.data?.status}`,
)
const publish = await api(`/api/content/${SEED.gatedBlockId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: { status: 'published', publishedAt: new Date().toISOString() },
})
const gatedPage = await rawGet(hostA, SEED.gatedBlockPath)
stage(
  'the formerly blocked article publishes and serves publicly',
  publish.status === 200 &&
    gatedPage.status === 200 &&
    gatedPage.body.includes(SEED.gatedBlockTitle),
  `publish=${publish.status} page=${gatedPage.status}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(
  SHOTS + '/results.json',
  JSON.stringify({ suffix, auditPages, auditIssues, results }, null, 2),
)
process.exit(passed === results.length ? 0 : 1)
