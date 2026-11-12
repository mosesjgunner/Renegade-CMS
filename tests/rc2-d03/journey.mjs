// RC2-D-03 — Audience journey: public signup -> double opt-in via the captured
// confirmation email -> test send -> campaign send (dispatch sweep) ->
// unsubscribe suppression -> signed bounce webhook suppression -> site
// isolation. Email runs on the development capture adapter (EMAIL_MODE=
// development): captured deliveries with provider receipts are the test
// inbox; no live marketing send is possible in this profile.
// Run: node tests/rc2-d03/journey.mjs
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const seed = JSON.parse(readFileSync('/tmp/d03-seed.json', 'utf8'))
const webhookSecret = readFileSync(
  '/home/hatch/workspace/gui01b-logs/d03-webhook-secret.txt',
  'utf8',
).trim()
const adminA = world.cookies.adminA
const outsiderB = world.cookies.outsiderB
const siteA = seed.siteA
const siteB = seed.siteB
const stamp = Math.random().toString(36).slice(2, 8)
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function req({ host, path, method = 'GET', cookie, json, headers = {} }) {
  return new Promise((resolve, reject) => {
    const body = json ? JSON.stringify(json) : null
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 39071,
        path,
        method,
        headers: {
          ...(host ? { host } : {}),
          ...(cookie ? { cookie: `renegade-passkey=${cookie}` } : {}),
          ...(body
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let parsed = null
          try {
            parsed = JSON.parse(data)
          } catch {}
          resolve({ status: res.statusCode, data: parsed })
        })
      },
    )
    r.on('error', reject)
    if (body) r.write(body)
    r.end()
  })
}
const list = async (collection, where, cookie = adminA) =>
  (await req({ path: `/api/${collection}?${where}&depth=0&limit=50`, cookie })).data?.docs ?? []
const byEmail = (email) => list('subscribers', `where[email][equals]=${encodeURIComponent(email)}`)
const deliveriesFor = (email) =>
  list('email-deliveries', `where[recipientEmail][equals]=${encodeURIComponent(email)}`)
async function poll(fn, want, timeoutMs = 150000, every = 4000) {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < timeoutMs) {
    last = await fn()
    if (want(last)) return last
    await sleep(every)
  }
  return last
}
const design = (text) => ({
  version: 1,
  templateVersion: `d03-${stamp}`,
  locale: 'en',
  tokens: {},
  plainTextStrategy: 'generated',
  personalization: { missingValue: 'fallback', fallbacks: {} },
  blocks: [
    { type: 'text', text },
    {
      type: 'legal',
      address: 'D03 test publication address',
      preferenceUrl: 'http://127.0.0.1:39071/subscribe/preferences',
    },
  ],
})
async function subscribeAndConfirm(email, host, siteId) {
  const sub = await req({
    host,
    path: '/api/subscribers/subscribe',
    method: 'POST',
    json: { email, siteId },
  })
  const deliveries = await poll(
    () => deliveriesFor(email),
    (d) => d.length >= 1 && d[0].messageSnapshot,
    60000,
  )
  const href =
    deliveries?.[0]?.messageSnapshot?.blocks?.find((b) => b.type === 'button')?.href ?? ''
  const token = new URL(href).searchParams.get('token')
  const conf = await req({
    path: '/api/subscribers/confirm',
    method: 'POST',
    json: { token },
  })
  const [row] = await byEmail(email)
  return { sub, conf, subscriber: row }
}
const campaign = (body, cookie = adminA) =>
  req({
    path: `/api/admin/audience/campaign?siteId=${siteA}`,
    method: 'POST',
    cookie,
    json: body,
  })
async function sendCampaign(subject) {
  const r = await campaign({
    action: 'save-and-schedule',
    subject,
    segmentId: seed.segmentId,
    messageDesign: design(subject),
    scheduledFor: new Date(Date.now() + 5000).toISOString(),
  })
  return r
}

// ---- Arc 1: signup -> pending -> captured confirmation -> active ----------
const email1 = `reader1-${stamp}@example.com`
const pending = await req({
  host: 'a.rc2-a04.test',
  path: '/api/subscribers/subscribe',
  method: 'POST',
  json: { email: email1, siteId: siteA },
})
const [pendingRow] = await byEmail(email1)
const confDeliveries = await poll(
  () => deliveriesFor(email1),
  (d) => d.length >= 1 && d[0].status === 'accepted',
  90000,
)
const href = confDeliveries?.[0]?.messageSnapshot?.blocks?.find((b) => b.type === 'button')?.href
const token = href ? new URL(href).searchParams.get('token') : null
const conf = token
  ? await req({ path: '/api/subscribers/confirm', method: 'POST', json: { token } })
  : { status: 0 }
const [activeRow] = await byEmail(email1)
const memberships = await list('audience-memberships', `where[subscriber][equals]=${activeRow?.id}`)
const consentEvents = await list('consent-events', `where[subscriber][equals]=${activeRow?.id}`)
stage(
  'public signup stays pending until the captured confirmation link is used, then activates with consent provenance',
  pending.status === 202 &&
    pendingRow?.status === 'pending' &&
    confDeliveries?.[0]?.providerMessageId?.startsWith('local:') &&
    conf.status === 200 &&
    activeRow?.status === 'active' &&
    Boolean(activeRow?.verifiedAt) &&
    memberships[0]?.status === 'active' &&
    consentEvents.length >= 1,
  `signup=${pending.status} before=${pendingRow?.status} confirm=${conf.status} after=${activeRow?.status} consentEvents=${consentEvents.length}`,
)

// ---- Arc 2: an unconfirmed subscriber is not eligible ----------------------
const email2 = `reader2-${stamp}@example.com`
await req({
  host: 'a.rc2-a04.test',
  path: '/api/subscribers/subscribe',
  method: 'POST',
  json: { email: email2, siteId: siteA },
})
const evaluation = await campaign({ action: 'evaluate-segment', segmentId: seed.segmentId })
const [pendingRow2] = await byEmail(email2)
stage(
  'the pending subscriber stays pending and is not among the eligible recipients',
  evaluation.status === 200 &&
    pendingRow2?.status === 'pending' &&
    !(evaluation.data?.eligibleRecipientsSample ?? evaluation.data?.eligibleRecipients ?? [])
      .map((r) => r.email ?? r.subscriberId)
      .includes(email2) &&
    (evaluation.data?.counts?.eligibleConsented ?? 0) >= 1,
  `eligible=${evaluation.data?.counts?.eligibleConsented} reader2=${pendingRow2?.status}`,
)

// ---- Arc 3: test send delivers exactly once --------------------------------
const opsEmail = `ops-${stamp}@example.com`
const testSend = await campaign({
  action: 'test-send',
  recipientEmail: opsEmail,
  subject: `D03 test ${stamp}`,
  messageDesign: design('test send body'),
})
const testDeliveries = await poll(
  () => deliveriesFor(opsEmail),
  (d) => d.length >= 1 && d[0].status === 'accepted',
  90000,
)
stage(
  'a test send is captured exactly once with a provider receipt',
  testSend.status === 200 &&
    testDeliveries?.length === 1 &&
    testDeliveries[0].providerMessageId?.startsWith('local:'),
  `testSend=${testSend.status} deliveries=${testDeliveries?.length} status=${testDeliveries?.[0]?.status}`,
)

// ---- Arc 4: campaign delivers to the confirmed subscriber only -------------
const c1 = await sendCampaign(`D03 Campaign One ${stamp}`)
const c1Deliveries = await poll(
  () => deliveriesFor(email1),
  (d) => d.filter((x) => String(x.message) === String(c1.data?.messageId)).length >= 1,
  180000,
)
const c1ForSub1 = (c1Deliveries ?? []).filter(
  (x) => String(x.message) === String(c1.data?.messageId),
)
const c1ForPending = (await deliveriesFor(email2)).filter(
  (x) => String(x.message) === String(c1.data?.messageId),
)
stage(
  'the scheduled campaign delivers once to the confirmed subscriber and never to the pending one',
  c1.status === 200 &&
    c1ForSub1.length === 1 &&
    c1ForSub1[0].status === 'accepted' &&
    Boolean(c1ForSub1[0].unsubscribeToken) &&
    c1ForPending.length === 0,
  `campaign=${c1.status} recipients=${c1.data?.recipientCount} toSub1=${c1ForSub1.length} toPending=${c1ForPending.length}`,
)

// ---- Arc 5: unsubscribe suppresses against the next campaign ---------------
const unsub = await req({
  path: '/api/subscribers/unsubscribe',
  method: 'POST',
  json: { token: c1ForSub1[0]?.unsubscribeToken },
})
const suppressions1 = await list('suppressions', `where[site][equals]=${siteA}`)
const c2 = await sendCampaign(`D03 Campaign Two ${stamp}`)
await poll(
  async () =>
    (await req({ path: `/api/email-messages/${c2.data?.messageId}?depth=0`, cookie: adminA })).data,
  (m) => m && m.status !== 'scheduled',
  180000,
)
const c2ForSub1 = (await deliveriesFor(email1)).filter(
  (x) => String(x.message) === String(c2.data?.messageId),
)
const [sub1AfterUnsub] = await byEmail(email1)
stage(
  'unsubscribe records a suppression and the next campaign does not deliver to that address',
  unsub.status === 200 &&
    suppressions1.length >= 1 &&
    c2.status === 200 &&
    c2ForSub1.length === 0 &&
    (sub1AfterUnsub?.status !== 'active' || Boolean(sub1AfterUnsub?.globalUnsubscribedAt)),
  `unsub=${unsub.status} suppressions=${suppressions1.length} c2Deliveries=${c2ForSub1.length} sub1Status=${sub1AfterUnsub?.status}`,
)

// ---- Arc 6: a signed bounce webhook suppresses the address ------------------
const email3 = `reader3-${stamp}@example.com`
const third = await subscribeAndConfirm(email3, 'a.rc2-a04.test', siteA)
const c3 = await sendCampaign(`D03 Campaign Three ${stamp}`)
const c3Deliveries = await poll(
  () => deliveriesFor(email3),
  (d) =>
    d.some(
      (x) =>
        String(x.message) === String(c3.data?.messageId) &&
        x.status === 'accepted' &&
        Boolean(x.providerMessageId),
    ),
  180000,
)
const c3Delivery = (c3Deliveries ?? []).find(
  (x) => String(x.message) === String(c3.data?.messageId),
)
const webhookBody = JSON.stringify({
  siteId: siteA,
  email: email3,
  event: 'bounce',
  provider: 'development-capture',
  providerMessageId: c3Delivery?.providerMessageId,
  providerEventId: `d03-bounce-${stamp}`,
  occurredAt: new Date().toISOString(),
})
const signature = createHmac('sha256', webhookSecret).update(webhookBody).digest('base64url')
const hook = await new Promise((resolve, reject) => {
  const r = http.request(
    {
      hostname: '127.0.0.1',
      port: 39071,
      path: '/api/email/webhook',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(webhookBody),
        'x-audience-signature': signature,
      },
    },
    (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode, data }))
    },
  )
  r.on('error', reject)
  r.write(webhookBody)
  r.end()
})
const badHook = await new Promise((resolve, reject) => {
  const r = http.request(
    {
      hostname: '127.0.0.1',
      port: 39071,
      path: '/api/email/webhook',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(webhookBody),
        'x-audience-signature': 'invalid',
      },
    },
    (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode, data }))
    },
  )
  r.on('error', reject)
  r.write(webhookBody)
  r.end()
})
const c4 = await sendCampaign(`D03 Campaign Four ${stamp}`)
await poll(
  async () =>
    (await req({ path: `/api/email-messages/${c4.data?.messageId}?depth=0`, cookie: adminA })).data,
  (m) => m && m.status !== 'scheduled',
  180000,
)
const c4ForSub3 = (await deliveriesFor(email3)).filter(
  (x) => String(x.message) === String(c4.data?.messageId),
)
stage(
  'a signed provider bounce webhook suppresses the address against later sends; a forged signature is refused',
  third.subscriber?.status === 'active' &&
    hook.status === 200 &&
    badHook.status === 401 &&
    c4ForSub3.length === 0,
  `hook=${hook.status} forged=${badHook.status} c4Deliveries=${c4ForSub3.length}`,
)

// ---- Arc 7: site isolation ---------------------------------------------------
const onB = await req({
  host: 'b.rc2-a04.test',
  path: '/api/subscribers/subscribe',
  method: 'POST',
  json: { email: email1, siteId: siteB },
})
const rowsA = await byEmail(email1)
const rowsB = await list(
  'subscribers',
  `where[email][equals]=${encodeURIComponent(email1)}`,
  outsiderB,
)
const deniedCampaign = await campaign(
  { action: 'evaluate-segment', segmentId: seed.segmentId },
  outsiderB,
)
stage(
  'the same address on Site B is a separate subscriber, and a Site B principal cannot run Site A campaigns',
  onB.status === 202 &&
    rowsA.some((r) => String(r.site) === siteA) &&
    rowsB.some((r) => String(r.site) === siteB) &&
    deniedCampaign.status === 403,
  `subB=${onB.status} rowsA=${rowsA.length} rowsB=${rowsB.length} denied=${deniedCampaign.status}`,
)

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} stages passed`)
process.exit(failed ? 1 : 0)
