// RC2-H-05 — operations journey: a social dispatch fails terminally at the
// provider, the operator surfaces are inspected mid-failure, and operator
// recovery is attempted before and after the provider is repaired.
// Against the repository's AT-protocol fixture (127.0.0.1:3130): the bad
// account's destination is disabled until /recover is called.
// Run: node tests/rc2-h05/journey.mjs  (needs server + jobs worker up)
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:39071'
const FIXTURE = 'http://127.0.0.1:3130'
const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const adminA = world.cookies.adminA
const outsiderB = world.cookies.outsiderB
const siteA = world.siteA.siteId
const stamp = Math.random().toString(36).slice(2, 8)
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, { method = 'GET', cookie, json } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(cookie ? { cookie: `renegade-passkey=${cookie}` } : {}),
      ...(json ? { 'content-type': 'application/json' } : {}),
      origin: 'http://127.0.0.1:39071',
    },
    body: json ? JSON.stringify(json) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data }
}
const fixtureState = async () => (await (await fetch(FIXTURE + '/state')).json()).creates ?? {}
const getQueue = (id, cookie = adminA) => api(`/api/social-queue-items/${id}?depth=0`, { cookie })
async function pollQueue(id, want, timeoutMs = 150000) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < timeoutMs) {
    const r = await getQueue(id)
    last = r.data
    if (want.includes(last?.status)) return last
    await sleep(3000)
  }
  return last
}

// ---- connect the bad account and schedule a post -------------------------
const conn = await api('/api/admin/social/accounts', {
  method: 'POST',
  cookie: adminA,
  json: {
    action: 'connect',
    siteId: siteA,
    network: 'bluesky',
    displayName: `H05 Bad ${stamp}`,
    mode: 'local-harness',
    credentials: { identifier: 'bad.test', appPassword: 'pw', service: FIXTURE },
  },
})
const badId = conn.data?.account?.id ?? conn.data?.id
const creates0 = await fixtureState()
const created = await api('/api/admin/social/drafts', {
  method: 'POST',
  cookie: adminA,
  json: {
    action: 'create-draft',
    siteId: siteA,
    title: `H05 Failure ${stamp}`,
    sourceContentId: world.siteA.publishedArticleId,
    variants: [{ accountId: badId, network: 'bluesky', text: `H05 failure arc ${stamp}` }],
  },
})
const draftId = created.data?.draft?.id ?? created.data?.id
const act = (action, extra = {}) =>
  api('/api/admin/social/drafts', {
    method: 'POST',
    cookie: adminA,
    json: { action, siteId: siteA, draftId, ...extra },
  })
await act('submit-review')
await act('approve')
const sched = await act('schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const qid = sched.data?.queueItems?.[0]?.id
stage('setup: draft approved and scheduled with a queue item', Boolean(qid), `queue=${qid}`)

// ---- failure: terminal provider refusal ----------------------------------
const failed = await pollQueue(qid, ['failed', 'published'])
stage(
  'dispatch fails terminally with a persisted provider reason and no retry scheduled',
  failed?.status === 'failed' &&
    failed?.deadLetterReason?.providerCode === 'DestinationDisabled' &&
    !failed?.nextAttemptAt,
  `status=${failed?.status} code=${failed?.deadLetterReason?.providerCode} attempts=${failed?.attemptCount}`,
)
const attempts = await api(`/api/social-publish-attempts?where[queueItem][equals]=${qid}&depth=0`, {
  cookie: adminA,
})
stage(
  'the failed attempt is persisted for the operator',
  (attempts.data?.docs?.length ?? 0) >= 1,
  `attempts=${attempts.data?.docs?.length}`,
)

// ---- operator surfaces mid-failure ---------------------------------------
const health = await api('/api/admin/schedule-health', { cookie: adminA })
stage(
  'schedule-health surface answers for staff during the failure',
  health.status === 200,
  `status=${health.status} keys=${Object.keys(health.data ?? {})
    .slice(0, 6)
    .join(',')}`,
)
const outsider = await getQueue(qid, outsiderB)
stage(
  "another site's operator cannot read the failed queue item",
  outsider.status === 403 || outsider.status === 404,
  `outsider read=${outsider.status}`,
)

// ---- operator retry BEFORE provider repair -------------------------------
const retryEarly = await api('/api/admin/social/worker', {
  method: 'POST',
  cookie: adminA,
  json: { action: 'retry-failed', queueItemId: qid },
})
await sleep(4000)
const afterEarly = await getQueue(qid)
stage(
  'operator retry-failed before repair does not fake success',
  afterEarly.data?.status === 'failed',
  `retry http=${retryEarly.status} queue=${afterEarly.data?.status} processed=${JSON.stringify(retryEarly.data ?? {}).slice(0, 120)}`,
)

// ---- repair the provider, then operator recovery -------------------------
await fetch(FIXTURE + '/recover')
const retry = await api('/api/admin/social/worker', {
  method: 'POST',
  cookie: adminA,
  json: { action: 'retry-failed', queueItemId: qid },
})
const recovered = await pollQueue(qid, ['published'], 240000)
const creates1 = await fixtureState()
stage(
  'after provider repair, operator retry recovers the item exactly once',
  recovered?.status === 'published' &&
    (creates1['did:plc:bad'] ?? 0) === (creates0['did:plc:bad'] ?? 0) + 1,
  `retry http=${retry.status} queue=${recovered?.status} creates bad=${creates1['did:plc:bad']} attempts=${recovered?.attemptCount}`,
)

const passed = results.filter((r) => r.ok).length
console.log(`\nH-05 social ops journey: ${passed}/${results.length} stages passed`)
process.exit(passed === results.length ? 0 : 1)
