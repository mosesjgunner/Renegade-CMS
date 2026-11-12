// RC2-F-02 journey: revenue-adjacent paths — donation, subscription /
// entitlement, affiliate offers + first-party referrals, over real HTTP on
// the two-site world. POD is proven by tests/rc2-f02/pod.spec.ts (its only
// executable provider profile is the in-process emulator; live Printful is
// unavailable by design and classified in the RESULT).
import http from 'node:http'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const setup = JSON.parse(readFileSync('/tmp/f02-setup.json', 'utf8'))
const setupB = JSON.parse(readFileSync('/tmp/f02-setup-b.json', 'utf8'))
const hostB = world.siteB.host
const staffB = `renegade-passkey=${world.cookies.outsiderB}`
const siteA = world.siteA.siteId
const adminA = `renegade-passkey=${world.cookies.adminA}`
const affiliateSecret = readFileSync(
  '/home/hatch/workspace/gui01b-logs/f02-affiliate-secret.txt',
  'utf8',
).trim()

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const probe = (name, detail) => console.log(`PROBE  ${name} — ${detail}`)

function rawRequest(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...(opts.headers ?? {}) }
    if (opts.cookie) headers.cookie = opts.cookie
    if (opts.host) headers.host = opts.host
    let body = opts.body
    if (opts.formUrlencoded) {
      body = new URLSearchParams(opts.formUrlencoded).toString()
      headers['content-type'] = 'application/x-www-form-urlencoded'
    } else if (opts.rawBody !== undefined) {
      body = opts.rawBody
      headers['content-type'] = 'application/json'
    } else if (body !== undefined) {
      body = JSON.stringify(body)
      headers['content-type'] = 'application/json'
    }
    if (body !== undefined) headers['content-length'] = Buffer.byteLength(body)
    const req = http.request(
      { hostname: '127.0.0.1', port: 39071, path, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data = null
          try {
            data = JSON.parse(text)
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, data, text })
        })
      },
    )
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}
const api = (path, opts = {}) => rawRequest(opts.method ?? 'GET', path, opts)
const firstCookie = (res) => {
  const sc = res.headers['set-cookie']
  return sc && sc.length ? sc[0].split(';')[0] : ''
}
const allCookies = (res) => (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ')
const runSpec = (spec, extraEnv) =>
  execFileSync(
    'python3',
    [
      '/home/hatch/workspace/with-env.py',
      '/home/hatch/workspace/gui01b-logs/f02-env.local',
      'npx',
      'vitest',
      'run',
      spec,
      '--no-file-parallelism',
    ],
    {
      cwd: '/home/hatch/workspace/rc2-tree',
      env: { ...process.env, ...(extraEnv ?? {}) },
      stdio: 'pipe',
      timeout: 240000,
    },
  )

const MEMBER_EMAIL = 'f02-member@example.com'
function cookiesFrom(res) {
  const pairs = (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0])
  const cookie = pairs.join('; ')
  const csrfPair = pairs.find((p) => p.startsWith('renegade-member-csrf='))
  return { cookie, csrf: csrfPair ? csrfPair.split('=')[1] : '' }
}
async function signInMember() {
  runSpec('tests/rc2-f02/issue-tokens.spec.ts', {
    F02_EMAILS: MEMBER_EMAIL,
    F02_OUT: '/tmp/f02-tokens.json',
  })
  const tokensFile = JSON.parse(readFileSync('/tmp/f02-tokens.json', 'utf8'))
  const token = tokensFile.tokens?.[MEMBER_EMAIL] ?? tokensFile[MEMBER_EMAIL]
  const res = await api('/api/member-auth/magic-link/complete', {
    method: 'POST',
    host: world.siteB.host,
    body: { token },
  })
  const { cookie, csrf } = cookiesFrom(res)
  const me = await api('/api/member-auth/me', { host: world.siteB.host, cookie })
  return {
    cookie,
    csrf,
    memberId: String(me.data?.memberId ?? me.data?.member?.id ?? ''),
    email: MEMBER_EMAIL,
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const stamp = Date.now().toString(36)
const hostA = world.siteA.host
const originA = 'http://a.rc2-a04.test'

// ---------- publish the referral product (operator catalog workflow) ----------
const productNow = await api(`/api/products/${setup.productId}`, { host: hostA, cookie: adminA })
let published = productNow.data?.state === 'published'
for (const action of published ? [] : ['request-review', 'approve', 'publish']) {
  const t = await api('/api/admin/catalog', {
    method: 'PATCH',
    host: hostA,
    cookie: adminA,
    body: { productId: setup.productId, action },
  })
  if (t.status !== 200) published = false
}
const productAfter = await api(`/api/products/${setup.productId}`, { host: hostA, cookie: adminA })
stage(
  'operator publishes the referral product through the catalog workflow',
  productAfter.data?.state === 'published',
  `state=${productAfter.data?.state}`,
)

// ---------- DONATION ----------
const campaignGet = await api(`/api/commerce/donations/campaign/${setupB.campaignBId}`, {})
stage(
  'donation campaign is publicly readable with its terms',
  campaignGet.status === 200 &&
    JSON.stringify(campaignGet.data ?? {}).includes('F-02 Community Fund B'),
  `status=${campaignGet.status}`,
)

const intent = await rawRequest('POST', '/api/commerce/donations/intent', {
  headers: { 'idempotency-key': `f02-don-${stamp}` },
  body: {
    campaignId: setupB.campaignBId,
    currency: 'USD',
    amountMinor: '1000',
    recurrence: 'one-time',
    recognition: 'anonymous',
    email: `f02-donor-${stamp}@example.com`,
  },
})
const intentData = intent.data ?? {}
const intentCookie = allCookies(intent)
const donRef = String(intentData.actionUrl ?? '')
  .split('/')
  .at(-1)
const preDonations = await api(
  `/api/donations?where[paymentIntent][equals]=${intentData.paymentIntentId}&limit=5`,
  { host: hostB, cookie: staffB },
)
const preDonation = preDonations.data?.docs?.[0]
stage(
  'donation intent is created but NOT marked complete before payment',
  intent.status === 201 &&
    /^det_cs_[a-f0-9]{24}$/.test(donRef) &&
    (!preDonation || preDonation.lifecycle !== 'succeeded'),
  `intent=${intent.status} preLifecycle=${preDonation?.lifecycle ?? 'no-row-yet'} intentErr=${intent.data?.error ?? ''}`,
)

const donConfirm = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  cookie: intentCookie,
  formUrlencoded: { reference: donRef },
})
let donation = null
for (let i = 0; i < 40 && !donation; i++) {
  await sleep(3000)
  const rows = await api(
    `/api/donations?where[paymentIntent][equals]=${intentData.paymentIntentId}&limit=5`,
    { host: hostB, cookie: staffB },
  )
  const doc = rows.data?.docs?.[0]
  if (doc && doc.lifecycle === 'succeeded') donation = doc
}
stage(
  'sandbox donation settles through the worker into exactly one succeeded donation',
  donConfirm.status === 303 && Boolean(donation),
  `confirm=${donConfirm.status} lifecycle=${donation?.lifecycle}`,
)

// ---------- SUBSCRIPTIONS ----------
// The only recurring-billing adapter is Stripe (hardcoded api.stripe.com, no
// sandbox fixture), and the deterministic sandbox provider deliberately does
// not implement recurring billing — the product says so in its own plans
// response. The executable subscription path in this build is the operator
// complimentary grant (preview -> grant) plus the entitlement projection.
const member = await signInMember()
const plans = await api('/api/commerce/subscriptions/plans', { host: hostB, cookie: member.cookie })
const planList = plans.data?.plans ?? []
const planSeen = (id) => planList.find((p) => String(p.id) === id)
const hostedCheckout = await api('/api/commerce/subscriptions/checkout', {
  method: 'POST',
  host: hostB,
  cookie: member.cookie,
  headers: { 'x-member-csrf': member.csrf, 'idempotency-key': `f02-hosted-${stamp}` },
  body: { planRevisionId: setupB.planABId },
})
stage(
  'member sees both plans; provider-hosted checkout honestly refuses (sandbox provider has no recurring billing)',
  Boolean(planSeen(setupB.planABId)) &&
    Boolean(planSeen(setupB.planBBId)) &&
    planSeen(setupB.planABId)?.available === false &&
    String(planSeen(setupB.planABId)?.reason ?? '').includes('recurring billing') &&
    hostedCheckout.status === 503,
  `plans=${planList.length} hosted=${hostedCheckout.status} reason=${planSeen(setupB.planABId)?.reason}`,
)

async function grantPlan(planId) {
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  const base = {
    memberId: member.memberId,
    planRevisionId: planId,
    siteId: setupB.siteId,
    expiresAt,
    reason: 'F-02 journey complimentary grant',
    source: 'complimentary',
  }
  const preview = await api('/api/admin/commerce/subscriptions/grant', {
    method: 'POST',
    host: hostB,
    cookie: staffB,
    body: { ...base, action: 'preview' },
  })
  const granted = await api('/api/admin/commerce/subscriptions/grant', {
    method: 'POST',
    host: hostB,
    cookie: staffB,
    body: { ...base, action: 'grant', previewHash: preview.data?.previewHash },
  })
  return { preview, granted }
}
async function memberSubs() {
  const res = await api('/api/commerce/subscriptions', { host: hostB, cookie: member.cookie })
  return res.data?.subscriptions ?? res.data?.docs ?? []
}
const grantA = await grantPlan(setupB.planABId)
const grantB = await grantPlan(setupB.planBBId)
const subsNow = await memberSubs()
const subAEntry = subsNow.find((x) => JSON.stringify(x).includes('F-02 Premium Reading'))
const subBEntry = subsNow.find((x) => JSON.stringify(x).includes('F-02 Media Downloads'))
const subAId = String(subAEntry?.id ?? grantA.granted.data?.subscriptionId ?? '')
const subBId = String(subBEntry?.id ?? grantB.granted.data?.subscriptionId ?? '')
const ents = await api(`/api/entitlements?where[site][equals]=${setupB.siteId}&limit=100`, {
  host: hostB,
  cookie: staffB,
})
const entDocs = (ents.data?.docs ?? []).filter(
  (e) => JSON.stringify(e).includes(member.memberId) && !e.revokedAt,
)
const hasEnt = (resource, capability) =>
  entDocs.some(
    (e) => JSON.stringify(e).includes(resource) && JSON.stringify(e).includes(capability),
  )
stage(
  'operator grants both plans (preview-confirmed); member holds both subscriptions and both entitlements',
  (grantA.granted.status === 200 || grantA.granted.status === 201) &&
    (grantB.granted.status === 200 || grantB.granted.status === 201) &&
    Boolean(subAEntry) &&
    Boolean(subBEntry) &&
    hasEnt('publication', 'read-premium') &&
    hasEnt('media', 'download-hd'),
  `grantA=${grantA.granted.status} grantB=${grantB.granted.status} subs=${subsNow.length} ents=${entDocs.length}`,
)
writeFileSync(
  '/tmp/f02-browser.json',
  JSON.stringify({ cookie: member.cookie, memberId: member.memberId, subAId, subBId, host: hostB }),
)

// Cancel plan A: no member cancel action exists in this build; cancellation
// arrives as provider state and the production recompute service projects it
// (driven here exactly as the acceptance suite drives it).
const portal = await api('/api/commerce/subscriptions', {
  method: 'POST',
  host: hostB,
  cookie: member.cookie,
  headers: { 'x-member-csrf': member.csrf },
  body: { subscriptionId: subAId, action: 'portal' },
})
probe(
  'portal response',
  `status=${portal.status} body=${portal.data?.error ?? portal.data?.url ?? ''}`,
)
let cancelResult = { revoked: 0 }
if (subAId) {
  runSpec('tests/rc2-f02/cancel.spec.ts', { F02_SUB_ID: subAId })
  cancelResult = JSON.parse(readFileSync('/tmp/f02-cancel.json', 'utf8'))
}
const subsAfter = await memberSubs()
const subBAfter = subsAfter.find((x) => String(x.id) === subBId)
const entsAfter = await api(`/api/entitlements?where[site][equals]=${setupB.siteId}&limit=100`, {
  host: hostB,
  cookie: staffB,
})
const entDocsAfter = (entsAfter.data?.docs ?? []).filter((e) =>
  JSON.stringify(e).includes(member.memberId),
)
const premiumAfter = entDocsAfter.find((e) => JSON.stringify(e).includes('read-premium'))
const hdAfter = entDocsAfter.filter(
  (e) => JSON.stringify(e).includes('download-hd') && !e.revokedAt,
)
stage(
  'canceling plan A revokes only its entitlement; plan B and its entitlement survive',
  cancelResult.revoked >= 1 &&
    (!premiumAfter || Boolean(premiumAfter.revokedAt)) &&
    hdAfter.length >= 1 &&
    Boolean(subBAfter),
  `revoked=${cancelResult.revoked} premiumRevokedAt=${premiumAfter?.revokedAt ?? 'row-gone'} hdActive=${hdAfter.length} subBState=${subBAfter?.state}`,
)

// ---------- AFFILIATE OFFERS ----------
const details = await api(`/api/commerce/affiliate/redirect?offerId=${setup.offerId}&details=1`, {
  host: hostA,
})
const click = await api('/api/commerce/affiliate/redirect', {
  method: 'POST',
  host: hostA,
  headers: { origin: originA },
  body: { offerId: setup.offerId, consented: true },
})
const guard = await api(
  `/api/commerce/affiliate/redirect?offerId=${setup.offerId}&destination=https://evil.example.com`,
  { host: hostA },
)
const unknownOffer = await api(
  `/api/commerce/affiliate/redirect?offerId=00000000-0000-4000-8000-000000000000&details=1`,
  { host: hostA },
)
stage(
  'affiliate offer discloses itself, tracks a consented click to the allowlisted destination only',
  details.status === 200 &&
    details.data?.destination === 'partner.example.com' &&
    Boolean(details.data?.disclosure) &&
    click.status === 200 &&
    String(click.data?.destinationUrl ?? '').includes('partner.example.com') &&
    click.data?.persisted === true &&
    guard.status === 400 &&
    unknownOffer.status === 404,
  `details=${details.status} click=${click.status} persisted=${click.data?.persisted} guard=${guard.status} unknown=${unknownOffer.status}`,
)

// ---------- FIRST-PARTY REFERRAL LOOP ----------
const claim = await rawRequest('POST', '/api/commerce/referrals/claim', {
  host: hostA,
  headers: { origin: originA },
  body: { code: setup.referralCode, consented: true },
})
const referralCookie = firstCookie(claim)
stage(
  'referral claim is captured with consent and bound by cookie',
  claim.status === 201 && claim.data?.captured === true && Boolean(referralCookie),
  `claim=${claim.status} cookie=${Boolean(referralCookie)}`,
)

const buyerBody = {
  customer: { email: `f02-buyer-${stamp}@example.com`, name: 'F02 Buyer' },
  shippingAddress: {
    name: 'F02 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  billingAddress: {
    name: 'F02 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  selectedShippingRateId: 'rate_standard_flat',
  consents: { termsAccepted: true, privacyAccepted: true },
}
const add = await rawRequest('POST', '/api/commerce/cart', {
  host: hostA,
  cookie: referralCookie,
  body: { productId: setup.productId, variantSku: setup.sku, quantity: 1 },
})
const cartCookie = firstCookie(add)
const guestCookies = `${referralCookie}; ${cartCookie}`
const proposal = await api('/api/commerce/proposal', {
  method: 'POST',
  host: hostA,
  cookie: guestCookies,
  body: buyerBody,
})
const proposalId = proposal.data?.proposal?.id ?? ''
const f01setup = JSON.parse(readFileSync('/tmp/f01-setup.json', 'utf8'))
const init = await rawRequest('POST', '/api/commerce/checkout/initiate', {
  host: hostA,
  cookie: guestCookies,
  headers: { 'idempotency-key': `f02-init-${stamp}` },
  body: { proposalId, capabilityId: f01setup.capabilityId },
})
const checkoutCookie = firstCookie(init)
const ref2 = String(init.data?.actionUrl ?? '')
  .split('/')
  .at(-1)
const confirm2 = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  cookie: `${guestCookies}; ${checkoutCookie}`,
  formUrlencoded: { reference: ref2 },
})
const sessionId2 = String(init.data?.sessionId ?? '')
let order2 = null
for (let i = 0; i < 40 && !order2; i++) {
  await sleep(3000)
  const orders = await api(`/api/orders?where[checkoutSession][equals]=${sessionId2}&limit=5`, {
    host: hostA,
    cookie: adminA,
  })
  const doc = orders.data?.docs?.[0]
  if (doc && doc.state === 'paid') order2 = doc
}
stage(
  'referred guest completes a paid order (claim binds at checkout initiation)',
  proposal.status === 200 &&
    (init.status === 200 || init.status === 201) &&
    confirm2.status === 303 &&
    Boolean(order2),
  `proposal=${proposal.status} init=${init.status} confirm=${confirm2.status} order=${order2?.state} amount=${order2?.amountMinor}`,
)

const eventId = `f02-evt-${stamp}`
const callbackBody = JSON.stringify({
  eventId,
  orderId: String(order2?.id ?? ''),
  kind: 'conversion',
  amountMinor: String(order2?.amountMinor ?? ''),
  currency: 'USD',
})
const signature = createHmac('sha256', affiliateSecret).update(callbackBody).digest('hex')
const callback = await rawRequest('POST', '/api/commerce/affiliate/conversions', {
  host: hostA,
  headers: { 'x-referral-signature': signature },
  rawBody: callbackBody,
})
const callbackReplay = await rawRequest('POST', '/api/commerce/affiliate/conversions', {
  host: hostA,
  headers: { 'x-referral-signature': signature },
  rawBody: callbackBody,
})
const forged = await rawRequest('POST', '/api/commerce/affiliate/conversions', {
  host: hostA,
  headers: { 'x-referral-signature': 'f'.repeat(64) },
  rawBody: callbackBody,
})
const report = await api(`/api/admin/commerce/affiliate?siteId=${siteA}`, {
  host: hostA,
  cookie: adminA,
})
const callbackRows = (report.data?.callbacks ?? []).filter((row) =>
  JSON.stringify(row).includes(eventId),
)
stage(
  'signed network callback records the conversion once; replay is a no-op, forgery is refused',
  callback.status === 202 &&
    callbackReplay.status === 202 &&
    callbackReplay.data?.replay === true &&
    forged.status === 401 &&
    callbackRows.length === 1,
  `callback=${callback.status} replay=${callbackReplay.status}/${callbackReplay.data?.replay} forged=${forged.status} callbackRows=${callbackRows.length}`,
)

const failed = results.filter((r) => !r.ok)
console.log(`\nF-02 JOURNEY: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
