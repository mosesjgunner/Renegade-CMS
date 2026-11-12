// RC2-D-02 — Distribution journey: social compose -> approve -> schedule ->
// dispatch through the production Bluesky adapter against the repository's
// local AT-protocol fixture (tests/rc03/provider-fixture.mjs on 127.0.0.1:3130,
// allowlisted via SOCIAL_LOCAL_ADAPTER_ORIGINS). Proves truthful receipts,
// per-destination failure isolation, transient backoff + idempotent recovery,
// duplicate prevention, cancellation, and permission gates.
// Run: node tests/rc2-d02/journey.mjs
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:39071'
const FIXTURE = 'http://127.0.0.1:3130'
const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const d01 = JSON.parse(readFileSync('/tmp/d01-content.json', 'utf8'))
const adminA = world.cookies.adminA
const editorA = world.cookies.editorA
const outsiderB = world.cookies.outsiderB
const siteA = world.siteA.siteId
const suffix = world.suffix
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
async function ensureFixture() {
  try {
    await fetch(FIXTURE + '/state')
    return null
  } catch {
    const child = spawn('node', ['tests/rc03/provider-fixture.mjs'], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    await sleep(1500)
    return child
  }
}
async function connect(identifier, name) {
  const r = await api('/api/admin/social/accounts', {
    method: 'POST',
    cookie: adminA,
    json: {
      action: 'connect',
      siteId: siteA,
      network: 'bluesky',
      displayName: name,
      mode: 'local-harness',
      credentials: { identifier, appPassword: 'pw', service: FIXTURE },
    },
  })
  return r.data?.account?.id ?? r.data?.id
}
async function draftFlow({ title, variants, cookie = adminA }) {
  const created = await api('/api/admin/social/drafts', {
    method: 'POST',
    cookie,
    json: {
      action: 'create-draft',
      siteId: siteA,
      title,
      sourceContentId: d01.scheduledId,
      variants,
    },
  })
  const draftId = created.data?.draft?.id ?? created.data?.id
  return { created, draftId }
}
const draftAction = (draftId, action, extra = {}, cookie = adminA) =>
  api('/api/admin/social/drafts', {
    method: 'POST',
    cookie,
    json: { action, siteId: siteA, draftId, ...extra },
  })
const getQueue = (id) => api(`/api/social-queue-items/${id}?depth=0`, { cookie: adminA })
const getDraft = (id) => api(`/api/social-drafts/${id}?depth=0`, { cookie: adminA })
async function pollQueue(id, want, timeoutMs = 120000) {
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

await ensureFixture()
const goodId = await connect('good.test', `D02 Good ${stamp}`)
const badId = await connect('bad.test', `D02 Bad ${stamp}`)
const creates0 = await fixtureState()

// ---- Arc 1: happy path, from an existing published article ----------------
const text1 = `D02 dispatch ${stamp} — new on the site`
const { draftId: draft1 } = await draftFlow({
  title: `D02 One ${stamp}`,
  variants: [{ accountId: goodId, network: 'bluesky', text: text1 }],
})
await draftAction(draft1, 'submit-review')
const approved1 = await draftAction(draft1, 'approve')
const sched1 = await draftAction(draft1, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const q1 = sched1.data?.queueItems?.[0]?.id
const done1 = await pollQueue(q1, ['published', 'failed'])
const attempts1 = await api(`/api/social-publish-attempts?where[queueItem][equals]=${q1}&depth=0`, {
  cookie: adminA,
})
const creates1 = await fixtureState()
const draft1After = await getDraft(draft1)
stage(
  'compose from an article, approve, schedule, and dispatch publishes with a provider receipt',
  approved1.status === 200 &&
    done1?.status === 'published' &&
    String(done1?.idempotencyKey ?? '').startsWith('scheduled:draft:') &&
    (attempts1.data?.docs?.length ?? 0) >= 1 &&
    (creates1['did:plc:good'] ?? 0) === (creates0['did:plc:good'] ?? 0) + 1 &&
    draft1After.data?.status === 'published',
  `queue=${done1?.status} attempts=${attempts1.data?.docs?.length} creates good=${creates1['did:plc:good']} draft=${draft1After.data?.status}`,
)
const reschedule = await draftAction(draft1, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
stage(
  'a published draft cannot be re-scheduled into a duplicate dispatch',
  reschedule.status === 400,
  `reschedule=${reschedule.status}`,
)

// ---- Arc 2: one destination fails, the other still publishes --------------
const { draftId: draft2 } = await draftFlow({
  title: `D02 Mixed ${stamp}`,
  variants: [
    { accountId: goodId, network: 'bluesky', text: `D02 mixed good ${stamp}` },
    { accountId: badId, network: 'bluesky', text: `D02 mixed bad ${stamp}` },
  ],
})
await draftAction(draft2, 'submit-review')
await draftAction(draft2, 'approve')
const sched2 = await draftAction(draft2, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const qGood = sched2.data?.queueItems?.find((q) => q.account === goodId || q.account?.id === goodId)
const qBad = sched2.data?.queueItems?.find((q) => q.account === badId || q.account?.id === badId)
const doneGood = await pollQueue(qGood?.id, ['published', 'failed'])
const doneBad = await pollQueue(qBad?.id, ['published', 'failed'])
const draft2After = await getDraft(draft2)
const creates2 = await fixtureState()
stage(
  'a failing destination fails alone with a persisted reason; the healthy one publishes',
  doneGood?.status === 'published' &&
    doneBad?.status === 'failed' &&
    doneBad?.deadLetterReason?.providerCode === 'DestinationDisabled' &&
    !doneBad?.nextAttemptAt &&
    draft2After.data?.status === 'partially-published' &&
    (creates2['did:plc:good'] ?? 0) === (creates1['did:plc:good'] ?? 0) + 1 &&
    (creates2['did:plc:bad'] ?? 0) === (creates1['did:plc:bad'] ?? 0),
  `good=${doneGood?.status} bad=${doneBad?.status}(${String(doneBad?.deadLetterReason?.message ?? '').slice(0, 40)}) draft=${draft2After.data?.status}`,
)

// ---- Arc 3: lost response -> transient backoff -> idempotent recovery -----
await fetch(FIXTURE + '/recover')
const { draftId: draft3 } = await draftFlow({
  title: `D02 Recovery ${stamp}`,
  variants: [{ accountId: badId, network: 'bluesky', text: `D02 recovery ${stamp}` }],
})
await draftAction(draft3, 'submit-review')
await draftAction(draft3, 'approve')
const sched3 = await draftAction(draft3, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const q3 = sched3.data?.queueItems?.[0]?.id
const done3 = await pollQueue(q3, ['published'], 180000)
const attempts3 = await api(
  `/api/social-publish-attempts?where[queueItem][equals]=${q3}&depth=0&sort=attemptNumber`,
  { cookie: adminA },
)
const creates3 = await fixtureState()
stage(
  'a lost provider response retries with backoff and recovers WITHOUT a duplicate post',
  done3?.status === 'published' &&
    (attempts3.data?.docs?.length ?? 0) === 2 &&
    (creates3['did:plc:bad'] ?? 0) === (creates2['did:plc:bad'] ?? 0) + 1,
  `queue=${done3?.status} attempts=${attempts3.data?.docs?.length} creates bad=${creates3['did:plc:bad']} attempts#=${done3?.attemptCount}`,
)

// ---- Arc 4: disconnected account makes no provider request -----------------
const goneId = await connect('gone.test', `D02 Gone ${stamp}`)
await api('/api/admin/social/accounts', {
  method: 'POST',
  cookie: adminA,
  json: { action: 'disconnect', accountId: goneId },
})
const { draftId: draft4 } = await draftFlow({
  title: `D02 Gone ${stamp}`,
  variants: [{ accountId: goneId, network: 'bluesky', text: `D02 gone ${stamp}` }],
})
await draftAction(draft4, 'submit-review')
await draftAction(draft4, 'approve')
const sched4 = await draftAction(draft4, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const q4 = sched4.data?.queueItems?.[0]?.id
const done4 = await pollQueue(q4, ['failed', 'published'])
const stateAfter4 = await (await fetch(FIXTURE + '/state')).json()
stage(
  'a disconnected account fails as reconnect-required and never reaches the provider',
  done4?.status === 'failed' &&
    done4?.deadLetterReason?.kind === 'reconnect-required' &&
    !(stateAfter4.requests?.['did:plc:gone'] > 0),
  `queue=${done4?.status} kind=${done4?.deadLetterReason?.kind} providerRequests=${stateAfter4.requests?.['did:plc:gone'] ?? 0}`,
)

// ---- Arc 5: decline cancels; nothing is sent -------------------------------
const { draftId: draft5 } = await draftFlow({
  title: `D02 Cancel ${stamp}`,
  variants: [{ accountId: goodId, network: 'bluesky', text: `D02 cancel ${stamp}` }],
})
await draftAction(draft5, 'submit-review')
const declined = await draftAction(draft5, 'decline')
const sched5 = await draftAction(draft5, 'schedule', {
  scheduledFor: new Date(Date.now() + 3000).toISOString(),
})
const draft5After = await getDraft(draft5)
stage(
  'a declined draft is cancelled and cannot be scheduled or sent',
  declined.status === 200 && draft5After.data?.status === 'cancelled' && sched5.status === 400,
  `decline=${declined.status} draft=${draft5After.data?.status} schedule=${sched5.status}`,
)

// ---- Arc 6: permission gates ----------------------------------------------
const deniedCreate = await draftFlow({
  title: `D02 Denied ${stamp}`,
  variants: [{ accountId: goodId, network: 'bluesky', text: 'denied' }],
  cookie: outsiderB,
})
const { draftId: draft6 } = await draftFlow({
  title: `D02 EditorGate ${stamp}`,
  variants: [{ accountId: goodId, network: 'bluesky', text: `D02 editor gate ${stamp}` }],
})
await draftAction(draft6, 'submit-review')
await draftAction(draft6, 'approve')
const editorSchedule = await draftAction(
  draft6,
  'schedule',
  { scheduledFor: new Date(Date.now() + 3000).toISOString() },
  editorA,
)
stage(
  'a Site B principal cannot compose for Site A, and a non-admin cannot schedule',
  deniedCreate.created.status === 403 && editorSchedule.status === 403,
  `create=${deniedCreate.created.status} editorSchedule=${editorSchedule.status}`,
)

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} stages passed`)
process.exit(failed ? 1 : 0)
