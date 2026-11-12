// RC2-C-02 — Search indexing and consistent discovery journey.
// Follows the C-02 seeded token articles through the public search page:
// title/body full-text hits, taxonomy + author filters, exclusion of
// draft / embargoed / members-visibility content, cross-site exclusion,
// rename propagation with measured lag, durability across a server
// restart, operator reconcile after manual projection loss, and
// unpublish removal. The projection is a Postgres table
// (search_documents) maintained by collection hooks inside the write
// transaction; queries re-authorize every hit against canonical state.
// Plain .mjs (node:http + fetch). Requires the served RC2 world, the
// C-02 seed (tests/rc2-c02/seed-articles.spec.ts) already run, and psql
// access for the projection-loss stage.
import { get as httpGet } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.C02_SHOTS || '/home/hatch/workspace/gui01b-logs/c02-shots'
const DB = process.env.C02_DB || 'b01_release_acceptance'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
const SEED = JSON.parse(readFileSync('/tmp/c02-articles.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const suffix = SEED.suffix
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const adminA = WORLD.cookies.adminA
const editorA = WORLD.cookies.editorA
const siteA = WORLD.siteA.siteId
const hostA = WORLD.siteA.host
const hostB = WORLD.siteB.host
const newToken = `virelia${suffix}`
const newTitle = `Virelia${suffix} Field Report`

const rawGet = (host, path, cookie) =>
  new Promise((resolve, reject) => {
    const headers = { host: `${host}:39071` }
    if (cookie) headers.cookie = `renegade-passkey=${cookie}`
    const req = httpGet({ hostname: '127.0.0.1', port: 39071, path, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
      )
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
const searchHtml = async (host, params) => {
  const qs = new URLSearchParams(params).toString()
  return rawGet(host, `/search?${qs}`)
}
const hitCount = (html) => html.split(`href="${SEED.mainPath}"`).length - 1
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

// --- 1. title + body full-text ----------------------------------------------------------------------
const byTitle = await searchHtml(hostA, { q: SEED.titleToken })
stage(
  'published article is findable by its title token, exactly once',
  byTitle.status === 200 && hitCount(byTitle.body) === 1 && byTitle.body.includes(SEED.mainTitle),
  `status=${byTitle.status} hits=${hitCount(byTitle.body)}`,
)
const byBody = await searchHtml(hostA, { q: SEED.bodyToken })
stage(
  'the same article is findable by a body-only token',
  byBody.status === 200 && hitCount(byBody.body) === 1,
  `status=${byBody.status} hits=${hitCount(byBody.body)}`,
)

// --- 2. filters --------------------------------------------------------------------------------------
const topicHit = await searchHtml(hostA, { q: SEED.titleToken, topic: SEED.categoryName })
const topicMiss = await searchHtml(hostA, { q: SEED.titleToken, topic: 'zzznomatchtopic' })
stage(
  'taxonomy filter narrows: matching topic keeps the hit, foreign topic removes it',
  hitCount(topicHit.body) === 1 && hitCount(topicMiss.body) === 0,
  `match=${hitCount(topicHit.body)} foreign=${hitCount(topicMiss.body)}`,
)
const authorHit = await searchHtml(hostA, { q: SEED.titleToken, author: SEED.authorName })
const authorMiss = await searchHtml(hostA, { q: SEED.titleToken, author: 'Somebody Else' })
stage(
  'author filter narrows the same way',
  hitCount(authorHit.body) === 1 && hitCount(authorMiss.body) === 0,
  `match=${hitCount(authorHit.body)} foreign=${hitCount(authorMiss.body)}`,
)

// --- 3. exclusions -------------------------------------------------------------------------------------
const draftSearch = await searchHtml(hostA, { q: SEED.draftToken })
const embargoSearch = await searchHtml(hostA, { q: SEED.embargoToken })
const membersSearch = await searchHtml(hostA, { q: SEED.membersToken })
stage(
  'draft, embargoed, and members-visibility articles never appear',
  !draftSearch.body.includes(`Draftonly${suffix}`) &&
    !embargoSearch.body.includes(`Embargoed${suffix}`) &&
    !membersSearch.body.includes(`Privateonly${suffix}`),
  `draft=${draftSearch.status} embargo=${embargoSearch.status} members=${membersSearch.status}`,
)
const crossSite = await searchHtml(hostB, { q: SEED.titleToken })
stage(
  "Site A's article does not exist in Site B's search",
  crossSite.status === 200 && !crossSite.body.includes(SEED.mainTitle),
  `status=${crossSite.status}`,
)

// --- 4. rename propagation + lag -----------------------------------------------------------------------
const t0 = Date.now()
const rename = await api(`/api/content/${SEED.mainId}`, {
  method: 'PATCH',
  cookie: editorA,
  json: { title: newTitle },
})
let lagMs = -1
for (let i = 0; i < 30; i++) {
  const probe = await searchHtml(hostA, { q: newToken })
  if (hitCount(probe.body) === 1) {
    lagMs = Date.now() - t0
    break
  }
  await sleep(2000)
}
const oldGone = await searchHtml(hostA, { q: SEED.titleToken })
const bodyStill = await searchHtml(hostA, { q: SEED.bodyToken })
stage(
  'rename propagates: new token finds exactly one row, old token is gone, body token still finds it',
  rename.status === 200 &&
    lagMs >= 0 &&
    hitCount(oldGone.body) === 0 &&
    hitCount(bodyStill.body) === 1,
  `patch=${rename.status} lagMs=${lagMs}`,
)

// --- 5. restart durability ------------------------------------------------------------------------------
try {
  execSync('fuser -k 39071/tcp || true', { stdio: 'ignore' })
} catch {
  /* already down */
}
await sleep(2000)
const server = spawn('bash', ['/home/hatch/workspace/gui01b-logs/b01-start.sh'], {
  detached: true,
  stdio: 'ignore',
})
server.unref()
let backUp = false
for (let i = 0; i < 36 && !backUp; i++) {
  try {
    const r = await fetch(BASE + '/admin')
    backUp = r.status === 200
  } catch {
    backUp = false
  }
  if (!backUp) await sleep(5000)
}
const afterRestart = await searchHtml(hostA, { q: newToken })
stage(
  'search still finds the article after a server restart (projection is durable)',
  backUp && hitCount(afterRestart.body) === 1,
  `serverUp=${backUp} hits=${hitCount(afterRestart.body)}`,
)

// --- 6. projection loss + operator reconcile --------------------------------------------------------------
execSync(
  `sudo -u postgres psql -d ${DB} -t -c "DELETE FROM search_documents WHERE canonical_id = '${SEED.mainId}'"`,
  { stdio: 'pipe' },
)
const afterWipe = await searchHtml(hostA, { q: newToken })
const reconcile = await api(`/api/admin/indexing/search/reconcile?site=${siteA}`, {
  method: 'POST',
  cookie: adminA,
})
const afterReconcile = await searchHtml(hostA, { q: newToken })
stage(
  'a wiped projection row is rebuilt by the operator reconcile and search recovers',
  hitCount(afterWipe.body) === 0 && reconcile.status === 200 && hitCount(afterReconcile.body) === 1,
  `wiped=${hitCount(afterWipe.body)} reconcile=${reconcile.status} recovered=${hitCount(afterReconcile.body)}`,
)

// --- 7. unpublish removal -----------------------------------------------------------------------------------
const unpublish = await api(`/api/content/${SEED.mainId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: { status: 'draft' },
})
const afterUnpublish = await searchHtml(hostA, { q: newToken })
const pageAfter = await rawGet(hostA, SEED.mainPath)
stage(
  'unpublishing removes the article from search and from the public site',
  unpublish.status === 200 &&
    hitCount(afterUnpublish.body) === 0 &&
    !afterUnpublish.body.includes(newTitle) &&
    pageAfter.status === 404,
  `patch=${unpublish.status} hits=${hitCount(afterUnpublish.body)} page=${pageAfter.status}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(SHOTS + '/results.json', JSON.stringify({ suffix, lagMs, results }, null, 2))
process.exit(passed === results.length ? 0 : 1)
