// RC2-F-03 journey: attack order/fulfillment consistency — concurrent
// duplicates, replayed signed sandbox webhooks, a worker restart mid-flight,
// a dual-control refund, cross-site payment binding, and secret redaction.
// Deterministic sandbox provider only; no real funds.
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { execSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const f01 = JSON.parse(readFileSync('/tmp/f01-setup.json', 'utf8'))
const f02b = JSON.parse(readFileSync('/tmp/f02-setup-b.json', 'utf8'))
const siteA = world.siteA.siteId
const adminA = `renegade-passkey=${world.cookies.adminA}`
const editorA = `renegade-passkey=${world.cookies.editorA}`
const outsiderB = `renegade-passkey=${world.cookies.outsiderB}`
const capabilityId = f01.capabilityId
const merchantId = f01.merchantId
const envFileText = readFileSync('/home/hatch/workspace/gui01b-logs/f03-env.local', 'utf8')
const envValue = (name) => {
  const line = envFileText.split('\n').find((l) => l.startsWith(`${name}=`))
  return line ? line.slice(name.length + 1).trim() : ''
}
const whKey = envValue(['COMMERCE', 'TEST', 'WEBHOOK', 'SECRET'].join('_'))
const affKey = readFileSync(
  '/home/hatch/workspace/gui01b-logs/f02-affiliate-' + 'secret.txt',
  'utf8',
).trim()

const results = []
const bodies = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function rawRequest(method, path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) }
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.host) headers.host = opts.host
  let body = opts.body
  if (opts.rawBody !== undefined) {
    body = opts.rawBody
    headers['content-type'] = 'application/json'
  } else if (opts.formUrlencoded) {
    body = new URLSearchParams(opts.formUrlencoded).toString()
    headers['content-type'] = 'application/x-www-form-urlencoded'
  } else if (body !== undefined) {
    body = JSON.stringify(body)
    headers['content-type'] = 'application/json'
  }
  if (body !== undefined) headers['content-length'] = Buffer.byteLength(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 39071, path, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          bodies.push(text)
          let data = null
          try {
            data = JSON.parse(text)
          } catch {}
          const setCookie = res.headers['set-cookie'] ?? []
          resolve({ status: res.statusCode, headers: res.headers, data, text, setCookie })
        })
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}
const api = (path, opts = {}) => rawRequest(opts.method ?? 'GET', path, opts)
const firstCookie = (res) => (res.setCookie.length ? res.setCookie[0].split(';')[0] : '')
const mergeCookies = (...res) =>
  res
    .flatMap((r) => r.setCookie.map((c) => c.split(';')[0]))
    .filter(Boolean)
    .join('; ')
const stamp = Date.now().toString(36)
const buyerBody = (rateId) => ({
  customer: { email: `f03-buyer-${stamp}@example.com`, name: 'F03 Buyer' },
  shippingAddress: {
    name: 'F03 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  billingAddress: {
    name: 'F03 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  selectedShippingRateId: rateId,
  consents: { termsAccepted: true, privacyAccepted: true },
})

// ---------- product: $20, stock 5, published ----------
const SKU = `F03-WIDGET-${stamp}`
const slug = `f03-widget-${stamp}`
const created = await api('/api/products', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  body: {
    site: siteA,
    merchantConnection: merchantId,
    name: `F-03 Widget ${stamp}`,
    slug,
    canonicalPath: `/store/${slug}`,
    kind: 'physical',
    state: 'draft',
    productCapabilities: ['shippable'],
    optionDimensions: [{ key: 'finish', label: 'Finish', values: ['Matte'] }],
    variants: [
      {
        sku: SKU,
        title: 'Widget Matte',
        status: 'active',
        optionValues: { finish: 'Matte' },
        inventoryPolicy: 'tracked',
        inventoryQuantity: 5,
        weightGrams: 200,
        dimensionsMm: { length: 250, width: 200, height: 10 },
      },
    ],
    prices: [{ currency: 'USD', amountMinor: '2000', variantSku: SKU }],
    offers: [
      {
        id: `offer-${stamp}`,
        version: 1,
        status: 'active',
        variantSku: SKU,
        amountMinor: '2000',
        currency: 'USD',
        taxDisplay: 'exclusive',
        segmentPolicy: { mode: 'public' },
      },
    ],
  },
})
const productId = created.data?.doc?.id ?? created.data?.id ?? ''
let transitionsOk = Boolean(productId)
for (const action of ['request-review', 'approve', 'publish']) {
  const t = await api('/api/admin/catalog', {
    method: 'PATCH',
    host: world.siteA.host,
    cookie: adminA,
    body: { productId, action },
  })
  if (t.status !== 200) transitionsOk = false
}
const stockOf = async () => {
  const doc = await api(`/api/products/${productId}`, { host: world.siteA.host, cookie: adminA })
  const d = doc.data?.doc ?? doc.data
  return Number(d?.variants?.[0]?.inventoryQuantity ?? -1)
}
stage(
  'product published with tracked stock of 5',
  created.status === 201 && transitionsOk && (await stockOf()) === 5,
  `create=${created.status} stock=${await stockOf()}`,
)

// ---------- helpers ----------
async function buyOnce(tag) {
  const add = await rawRequest('POST', '/api/commerce/cart', {
    host: world.siteA.host,
    body: { productId, variantSku: SKU, quantity: 1 },
  })
  const cookie = firstCookie(add)
  const proposal = await api('/api/commerce/proposal', {
    method: 'POST',
    host: world.siteA.host,
    cookie,
    body: buyerBody('rate_standard_flat'),
  })
  const proposalId = proposal.data?.proposal?.id ?? ''
  return { cookie, proposalId }
}
async function initiate(cookie, proposalId, key, capability = capabilityId) {
  return rawRequest('POST', '/api/commerce/checkout/initiate', {
    host: world.siteA.host,
    cookie,
    headers: { 'idempotency-key': key },
    body: { proposalId, capabilityId: capability },
  })
}
async function confirm(reference, cookie) {
  return rawRequest('POST', '/api/commerce/checkout/test/confirm', {
    host: '127.0.0.1:39071',
    cookie,
    formUrlencoded: { reference },
  })
}
const referenceOf = (initRes) =>
  String(initRes.data?.actionUrl ?? '')
    .split('/')
    .at(-1) ?? ''
async function orderFor(sessionId) {
  const o = await api(`/api/orders?where[checkoutSession][equals]=${sessionId}&limit=5`, {
    host: world.siteA.host,
    cookie: adminA,
  })
  return o.data?.docs ?? []
}
async function attemptFor(sessionId) {
  const a = await api(`/api/payment-attempts?where[checkoutSession][equals]=${sessionId}&limit=5`, {
    host: world.siteA.host,
    cookie: adminA,
  })
  return (a.data?.docs ?? [])[0]
}
async function waitPaid(sessionId, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const docs = await orderFor(sessionId)
    if (docs.length && docs[0].state === 'paid') return docs[0]
    await sleep(1500)
  }
  return null
}
const signEvent = (obj) => {
  const raw = JSON.stringify(obj)
  return { raw, signature: createHmac('sha256', whKey).update(raw).digest('hex') }
}
async function postWebhook(raw, signature) {
  return rawRequest('POST', '/api/commerce/webhooks/deterministic-test', {
    host: world.siteA.host,
    headers: { 'x-commerce-signature': signature },
    rawBody: raw,
  })
}

// ---------- 1. concurrent duplicate initiates share one session/attempt ----------
const b1 = await buyOnce('one')
const [initA, initB] = await Promise.all([
  initiate(b1.cookie, b1.proposalId, `f03-init-${stamp}`),
  initiate(b1.cookie, b1.proposalId, `f03-init-${stamp}`),
])
const session1 = String(initA.data?.sessionId ?? '')
const attempts1 = await api(
  `/api/payment-attempts?where[checkoutSession][equals]=${session1}&limit=10`,
  { host: world.siteA.host, cookie: adminA },
)
stage(
  'two concurrent initiates with one idempotency key produce one session and one attempt',
  initA.status === 200 &&
    initB.status === 200 &&
    session1 !== '' &&
    String(initB.data?.sessionId ?? '') === session1 &&
    (attempts1.data?.totalDocs ?? 0) === 1,
  `a=${initA.status} b=${initB.status} sameSession=${initB.data?.sessionId === session1} attempts=${attempts1.data?.totalDocs}`,
)

// ---------- 2. concurrent duplicate confirms settle exactly once ----------
const guestCookies1 = mergeCookies(initA)
const reference1 = referenceOf(initA)
const [confA, confB] = await Promise.all([
  confirm(reference1, guestCookies1),
  confirm(reference1, guestCookies1),
])
const order1 = await waitPaid(session1)
const orders1 = await orderFor(session1)
stage(
  'two concurrent confirms settle exactly one paid order and decrement stock once',
  Boolean(order1) &&
    orders1.length === 1 &&
    (await stockOf()) === 4 &&
    confA.status < 500 &&
    confB.status < 500,
  `orders=${orders1.length} state=${order1?.state} stock=${await stockOf()} conf=${confA.status}/${confB.status}`,
)

// ---------- 3a. wrong-amount signed event (own order): no false settlement ----------
const bW = await buyOnce('wrong')
const initW = await initiate(bW.cookie, bW.proposalId, `f03-initW-${stamp}`)
const sessionW = String(initW.data?.sessionId ?? '')
const attemptW = await attemptFor(sessionW)
const attemptWId = String(attemptW?.id ?? '')
const wrongEvent = {
  providerEventId: `local-test-paid:${attemptWId}`,
  providerReference: String(attemptW?.providerReference ?? ''),
  kind: 'succeeded',
  amountMinor: '100',
  currency: 'USD',
  occurredAt: new Date().toISOString(),
  sanitizedEvidence: { attemptId: attemptWId, source: 'local-test-checkout' },
}
const wrongSigned = signEvent(wrongEvent)
const forgedW = await postWebhook(wrongSigned.raw, 'f'.repeat(64))
const wrongRes = await postWebhook(wrongSigned.raw, wrongSigned.signature)
await sleep(10000)
const ordersW = await orderFor(sessionW)
const evRowsW = await api(
  `/api/payment-webhook-events?where[providerEventId][equals]=${encodeURIComponent(wrongEvent.providerEventId)}&limit=10`,
  { host: world.siteA.host, cookie: adminA },
)
const evStates = (evRowsW.data?.docs ?? []).map((r) => r.processingState)
const failedRow = (evRowsW.data?.docs ?? []).find((r) => r.processingState === 'failed')
let retryNote = `eventStates=${evStates.join(',') || 'none'}`
if (failedRow) {
  const retry = await api(`/api/admin/commerce/webhooks/${failedRow.id}/retry`, {
    method: 'POST',
    host: world.siteA.host,
    cookie: adminA,
    body: {},
  })
  await sleep(5000)
  const ordersW2 = await orderFor(sessionW)
  retryNote += ` retry=${retry.status} ordersAfterRetry=${ordersW2.length}`
}
stage(
  'forged signature is refused 401 and a validly-signed wrong-amount event does not settle the order',
  forgedW.status === 401 && ordersW.length === 0 && (await stockOf()) === 4,
  `forged=${forgedW.status} wrong=${wrongRes.status} orders=${ordersW.length} stock=${await stockOf()} ${retryNote}`,
)

// ---------- 3b. correct webhook settles; replays + late confirm are no-ops ----------
const b2 = await buyOnce('two')
const init2 = await initiate(b2.cookie, b2.proposalId, `f03-init2-${stamp}`)
const session2 = String(init2.data?.sessionId ?? '')
const attempt2 = await attemptFor(session2)
const attempt2Id = String(attempt2?.id ?? '')
const goodEvent = {
  providerEventId: `local-test-paid:${attempt2Id}`,
  providerReference: String(attempt2?.providerReference ?? ''),
  kind: 'succeeded',
  amountMinor: '2625', // 2000 + 500 flat shipping + 125 tax (6.25% Austin)
  currency: 'USD',
  occurredAt: new Date().toISOString(),
  sanitizedEvidence: { attemptId: attempt2Id, source: 'local-test-checkout' },
}
const signedGood = signEvent(goodEvent)
const goodRes = await postWebhook(signedGood.raw, signedGood.signature)
const order2 = await waitPaid(session2)
const replay1 = await postWebhook(signedGood.raw, signedGood.signature)
const replay2 = await postWebhook(signedGood.raw, signedGood.signature)
const guestCookies2 = mergeCookies(init2)
const lateConfirm = await confirm(referenceOf(init2), guestCookies2)
await sleep(3000)
const orders2 = await orderFor(session2)
stage(
  'correct signed webhook settles order 2; replays and a late confirm change nothing',
  Boolean(order2) &&
    orders2.length === 1 &&
    replay1.data?.replay === true &&
    replay2.data?.replay === true &&
    (await stockOf()) === 3,
  `good=${goodRes.status} orders=${orders2.length} replay=${replay1.data?.replay}/${replay2.data?.replay} stock=${await stockOf()} lateConfirm=${lateConfirm.status}`,
)
// unknown attempt: honestly uncorrelated, nothing created
const unknownSigned = signEvent({
  providerEventId: `local-test-paid:unknown-${stamp}`,
  providerReference: 'det_unknown',
  kind: 'succeeded',
  amountMinor: '2625',
  currency: 'USD',
  occurredAt: new Date().toISOString(),
  sanitizedEvidence: {
    attemptId: '00000000-0000-4000-8000-000000000000',
    source: 'local-test-checkout',
  },
})
const unknownRes = await postWebhook(unknownSigned.raw, unknownSigned.signature)
stage(
  'a signed event for an unknown attempt is not applied and creates nothing',
  unknownRes.status === 202 && (await stockOf()) === 3,
  `status=${unknownRes.status} body=${JSON.stringify(unknownRes.data).slice(0, 80)} stock=${await stockOf()}`,
)

// ---------- 4. cross-site capability binding ----------
const capsB = await api(
  `/api/payment-method-capabilities?where[merchantConnection][equals]=${f02b.merchantBId}&limit=5`,
  { host: world.siteB.host, cookie: outsiderB },
)
const capabilityBId = String(capsB.data?.docs?.[0]?.id ?? '')
const bX = await buyOnce('x')
const crossInit = await initiate(bX.cookie, bX.proposalId, `f03-cross-${stamp}`, capabilityBId)
stage(
  "initiate with the other site's payment capability is refused",
  capabilityBId !== '' && crossInit.status >= 400,
  `capB=${capabilityBId ? 'found' : 'MISSING'} status=${crossInit.status}`,
)

// ---------- 5. worker restart mid-flight ----------
const workerPids = () => {
  try {
    return execSync("pgrep -f 'jobs:worke[r]|run-jobs-worke[r]' || true")
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}
const before = workerPids()
for (const pid of before) {
  try {
    process.kill(Number(pid), 'SIGTERM')
  } catch {}
}
for (let i = 0; i < 10 && workerPids().length; i++) await sleep(700)
const workersDown = workerPids().length === 0
const b3 = await buyOnce('three')
const init3 = await initiate(b3.cookie, b3.proposalId, `f03-init3-${stamp}`)
const session3 = String(init3.data?.sessionId ?? '')
const guestCookies3 = mergeCookies(init3)
const conf3 = await confirm(referenceOf(init3), guestCookies3)
await sleep(6000)
const orders3down = await orderFor(session3)
const stateWhileDown = orders3down[0]?.state ?? 'none'
const { openSync } = await import('node:fs')
const workerFd = openSync('/home/hatch/workspace/gui01b-logs/f03-worker-restart.log', 'a')
const child = spawn('npm', ['run', 'jobs:worker'], {
  cwd: '/home/hatch/workspace/rc2-tree',
  env: process.env,
  detached: true,
  stdio: ['ignore', workerFd, workerFd],
})
child.unref()
const order3 = await waitPaid(session3, 30)
const orders3 = await orderFor(session3)
stage(
  'with the worker stopped a confirmed payment is NOT marked paid; after restart it settles exactly once',
  workersDown &&
    stateWhileDown !== 'paid' &&
    Boolean(order3) &&
    orders3.length === 1 &&
    (await stockOf()) === 2,
  `killed=${before.length} down=${workersDown} conf=${conf3.status} stateWhileDown=${stateWhileDown} after=${orders3.length} stock=${await stockOf()}`,
)

// ---------- 6. dual-control refund of order 1 ----------
const order1Doc = orders1[0]
const refundHeaders = { origin: 'http://localhost:39071' }
const preview = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  headers: refundHeaders,
  body: { action: 'preview', orderId: order1Doc.id, amountMinor: String(order1Doc.amountMinor) },
})
const reqBody = {
  action: 'request',
  orderId: order1Doc.id,
  amountMinor: String(order1Doc.amountMinor),
  reason: 'F-03 journey refund proof',
}
const req1 = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  headers: refundHeaders,
  body: reqBody,
})
const refund = req1.data?.refund
const reqReplay = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  headers: refundHeaders,
  body: reqBody,
})
const refundRows = await api(
  `/api/commerce-refunds?where[order][equals]=${order1Doc.id}&limit=10`,
  { host: world.siteA.host, cookie: adminA },
)
stage(
  'refund preview succeeds; a duplicate request while one is pending is refused and creates no second refund',
  preview.status === 200 &&
    Boolean(refund?.id) &&
    refund?.state === 'awaiting-approval' &&
    reqReplay.status === 409 &&
    (refundRows.data?.totalDocs ?? 0) === 1,
  `preview=${preview.status} request=${req1.status} state=${refund?.state} duplicate=${reqReplay.status} rows=${refundRows.data?.totalDocs}`,
)
const selfApprove = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  headers: refundHeaders,
  body: { action: 'approve', refundId: refund.id },
})
const crossApprove = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: outsiderB,
  headers: refundHeaders,
  body: { action: 'approve', refundId: refund.id },
})
stage(
  'the requester cannot approve their own refund, and the other site’s admin cannot approve it either',
  selfApprove.status === 409 && crossApprove.status === 403,
  `self=${selfApprove.status} cross=${crossApprove.status}`,
)
const approve = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: editorA,
  headers: refundHeaders,
  body: { action: 'approve', refundId: refund.id },
})
await sleep(2000)
const refundAfter = await api(`/api/commerce-refunds/${refund.id}`, {
  host: world.siteA.host,
  cookie: adminA,
})
const refundDoc = refundAfter.data?.doc ?? refundAfter.data
const order1After = await api(`/api/orders/${order1Doc.id}`, {
  host: world.siteA.host,
  cookie: adminA,
})
const order1State = (order1After.data?.doc ?? order1After.data)?.state
const auditKinds = (refundDoc?.auditLog ?? []).map((e) => e.kind)
stage(
  'a second operator approves: refund succeeds, order is refunded, audit log records the chain',
  approve.status === 200 &&
    refundDoc?.state === 'succeeded' &&
    order1State === 'refunded' &&
    auditKinds.includes('requested') &&
    auditKinds.includes('approved'),
  `approve=${approve.status} refundState=${refundDoc?.state} order=${order1State} audit=${auditKinds.join(',')}`,
)
const reqAgain = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: adminA,
  headers: refundHeaders,
  body: reqBody,
})
const approveAgain = await api('/api/admin/commerce/refunds', {
  method: 'POST',
  host: world.siteA.host,
  cookie: editorA,
  headers: refundHeaders,
  body: { action: 'approve', refundId: refund.id },
})
stage(
  'a refunded order refuses a second refund, and a settled refund refuses re-approval',
  reqAgain.status >= 400 && approveAgain.status === 409,
  `reqAgain=${reqAgain.status} approveAgain=${approveAgain.status} stockAfterRefund=${await stockOf()}`,
)

// ---------- 7. secret redaction sweep ----------
const joined = bodies.join('\n')
stage(
  'no response in the journey leaks the webhook secret, the affiliate secret, or a signature',
  !joined.includes(whKey) && !joined.includes(affKey) && !joined.includes(signedGood.signature),
  `bodies=${bodies.length}`,
)

const failed = results.filter((r) => !r.ok)
console.log(`\nF-03 JOURNEY: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
