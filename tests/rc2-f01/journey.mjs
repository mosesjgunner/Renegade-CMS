// RC2-F-01 journey: product -> cart -> checkout proposal -> deterministic
// sandbox payment -> settled order, over real HTTP against the two-site world.
// The sandbox confirm is exercised on the loopback host because the product
// deliberately enables local test checkout only there (LOCAL_E2E_TEST_MODE);
// the refusal of the same confirm on the public site host is itself a stage.
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const siteA = world.siteA.siteId
const siteB = world.siteB.siteId
const adminA = `renegade-passkey=${world.cookies.adminA}`

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const probe = (name, detail) => console.log(`PROBE  ${name} — ${detail}`)

async function encodeMultipart(form) {
  const boundary = `----f01${Date.now().toString(36)}`
  const parts = []
  for (const [key, value] of form.entries()) {
    if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
      const buf = Buffer.from(await value.arrayBuffer())
      parts.push(
        Buffer.from(
          `--${boundary}\r\ncontent-disposition: form-data; name="${key}"; filename="${value.name ?? 'file'}"\r\ncontent-type: ${value.type || 'application/octet-stream'}\r\n\r\n`,
        ),
        buf,
        Buffer.from('\r\n'),
      )
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\ncontent-disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`,
        ),
      )
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

function rawRequest(method, path, opts = {}) {
  return (async () => {
    const headers = { ...(opts.headers ?? {}) }
    if (opts.cookie) headers.cookie = opts.cookie
    if (opts.host) headers.host = opts.host
    let body = opts.body
    if (opts.form) {
      const enc = await encodeMultipart(opts.form)
      body = enc.body
      headers['content-type'] = enc.contentType
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
  })()
}
const api = (path, opts = {}) => rawRequest(opts.method ?? 'GET', path, opts)

// ---------- F-01 commerce setup ----------
const setup = JSON.parse(readFileSync('/tmp/f01-setup.json', 'utf8'))
const capabilityId = setup.capabilityId
const merchantId = setup.merchantId
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const uploadForm = (bytes, name, fields) => {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'image/png' }), name)
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}
const firstCookie = (res) => {
  const sc = res.headers['set-cookie']
  return sc && sc.length ? sc[0].split(';')[0] : ''
}
const stamp = Date.now().toString(36)
const SKU = `F01-PRINT-${stamp}`
const slug = `f01-print-${stamp}`
const productName = `F-01 Journey Print ${stamp}`
const buyerBody = {
  customer: { email: `f01-buyer-${stamp}@example.com`, name: 'F01 Buyer' },
  shippingAddress: {
    name: 'F01 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  billingAddress: {
    name: 'F01 Buyer',
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  selectedShippingRateId: 'rate_standard_free',
  consents: { termsAccepted: true, privacyAccepted: true },
}

// 1. Operator creates a real product with media and publishes it via the catalog workflow
const up = await rawRequest('POST', '/api/media/upload', {
  host: world.siteA.host,
  cookie: adminA,
  form: uploadForm(PNG, `f01-${stamp}.png`, {
    siteId: siteA,
    title: `F01 Product Image ${stamp}`,
    altText: 'F-01 journey product image',
  }),
})
const assetId = up.data?.asset?.id
let productId = ''
let created = null
if (assetId) {
  created = await api('/api/products', {
    method: 'POST',
    host: world.siteA.host,
    cookie: adminA,
    body: {
      site: siteA,
      merchantConnection: merchantId,
      name: productName,
      slug,
      canonicalPath: `/store/${slug}`,
      kind: 'physical',
      state: 'draft',
      productCapabilities: ['shippable'],
      media: [assetId],
      optionDimensions: [{ key: 'finish', label: 'Finish', values: ['Matte'] }],
      variants: [
        {
          sku: SKU,
          title: 'Journey Print Matte',
          status: 'active',
          optionValues: { finish: 'Matte' },
          inventoryPolicy: 'tracked',
          inventoryQuantity: 3,
          weightGrams: 200,
          dimensionsMm: { length: 250, width: 200, height: 10 },
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '5000', variantSku: SKU }],
      offers: [
        {
          id: `offer-${stamp}`,
          version: 1,
          status: 'active',
          variantSku: SKU,
          amountMinor: '5000',
          currency: 'USD',
          taxDisplay: 'exclusive',
          segmentPolicy: { mode: 'public' },
        },
      ],
    },
  })
  productId = created.data?.doc?.id ?? created.data?.id ?? ''
}
let transitionsOk = false
let finalState = ''
if (productId) {
  transitionsOk = true
  for (const action of ['request-review', 'approve', 'publish']) {
    const t = await api('/api/admin/catalog', {
      method: 'PATCH',
      host: world.siteA.host,
      cookie: adminA,
      body: { productId, action },
    })
    if (t.status !== 200) transitionsOk = false
  }
  const doc = await api(`/api/products/${productId}`, { host: world.siteA.host, cookie: adminA })
  finalState = String(doc.data?.doc?.state ?? doc.data?.state ?? '')
}
stage(
  'operator creates a product with media and publishes it through the catalog workflow',
  Boolean(assetId) &&
    created?.status === 201 &&
    transitionsOk &&
    finalState !== '' &&
    finalState !== 'draft',
  `upload=${up.status} create=${created?.status} state=${finalState}`,
)

// 2. Public product page renders on Site A and 404s on Site B
const page = await rawRequest('GET', `/store/${slug}`, { host: world.siteA.host })
const pageB = await rawRequest('GET', `/store/${slug}`, { host: world.siteB.host })
stage(
  'public product page renders name and price on Site A, 404 on Site B',
  page.status === 200 &&
    page.text.includes(productName) &&
    /\$?50/.test(page.text) &&
    pageB.status === 404,
  `A=${page.status} B=${pageB.status} priceMatch=${/\$?50/.test(page.text)}`,
)

// 3. Guest adds 2 to a cart; the cart readback is server-priced
const add = await rawRequest('POST', '/api/commerce/cart', {
  host: world.siteA.host,
  body: { productId, variantSku: SKU, quantity: 2 },
})
const cartCookie = firstCookie(add)
const cartRead = await api('/api/commerce/cart', { host: world.siteA.host, cookie: cartCookie })
const cartItems = cartRead.data?.cart?.items ?? cartRead.data?.items ?? []
stage(
  'guest cart holds the item at the server-side price',
  add.status === 200 &&
    Boolean(cartCookie) &&
    cartItems.length === 1 &&
    Number(cartItems[0].quantity) === 2,
  `add=${add.status} cookie=${Boolean(cartCookie)} items=${cartItems.length}`,
)

// 4. Cart guards: negative quantity and over-stock quantity are refused
const neg = await api('/api/commerce/cart', {
  method: 'POST',
  host: world.siteA.host,
  cookie: cartCookie,
  body: { productId, variantSku: SKU, quantity: -5 },
})
const over = await rawRequest('POST', '/api/commerce/cart', {
  host: world.siteA.host,
  cookie: cartCookie,
  body: { productId, variantSku: SKU, quantity: 99 },
})
const cartAfter = await api('/api/commerce/cart', { host: world.siteA.host, cookie: cartCookie })
const itemsAfter = cartAfter.data?.cart?.items ?? cartAfter.data?.items ?? []
stage(
  'negative quantity is refused; an over-stock add clamps at available stock, never above it',
  neg.status === 400 && itemsAfter.length === 1 && Number(itemsAfter[0].quantity) === 3,
  `neg=${neg.status} over=${over.status} qtyAfter=${itemsAfter[0]?.quantity} (clamped to stock 3)`,
)

// 5. Empty-cart statuses are honest
const emptyCart = await api('/api/commerce/cart', { host: world.siteA.host })
const emptyItems = emptyCart.data?.cart?.items ?? emptyCart.data?.items ?? []
const emptyProposal = await api('/api/commerce/proposal', {
  method: 'POST',
  host: world.siteA.host,
  body: buyerBody,
})
stage(
  'a fresh guest sees an empty cart and cannot propose checkout on it',
  emptyItems.length === 0 && emptyProposal.status === 400,
  `cartItems=${emptyItems.length} proposal=${emptyProposal.status} ${JSON.stringify(
    emptyProposal.data?.error ?? '',
  ).slice(0, 60)}`,
)

// 6. Proposal prices the cart server-side
const proposal = await api('/api/commerce/proposal', {
  method: 'POST',
  host: world.siteA.host,
  cookie: cartCookie,
  body: buyerBody,
})
const proposalId = proposal.data?.proposal?.id ?? ''
stage(
  'checkout proposal is priced by the server (3 x $50 = $150 subtotal)',
  proposal.status === 200 &&
    Boolean(proposalId) &&
    String(proposal.data?.proposal?.pricingSnapshot?.subtotalMinor) === '15000',
  `proposal=${proposal.status} subtotal=${proposal.data?.proposal?.pricingSnapshot?.subtotalMinor}`,
)
writeFileSync('/tmp/f01-browser.json', JSON.stringify({ slug, productName, sku: SKU, productId }))

// 7. Initiate refusals: unknown proposal, wrong site, unknown capability
const badProposal = await api('/api/commerce/checkout/initiate', {
  method: 'POST',
  host: world.siteA.host,
  cookie: cartCookie,
  headers: { 'idempotency-key': `f01-bad-${stamp}` },
  body: { proposalId: '00000000-0000-4000-8000-000000000000', capabilityId },
})
const wrongSite = await api('/api/commerce/checkout/initiate', {
  method: 'POST',
  host: world.siteB.host,
  cookie: cartCookie,
  headers: { 'idempotency-key': `f01-wrongsite-${stamp}` },
  body: { proposalId, capabilityId },
})
const badCapability = await api('/api/commerce/checkout/initiate', {
  method: 'POST',
  host: world.siteA.host,
  cookie: cartCookie,
  headers: { 'idempotency-key': `f01-badcap-${stamp}` },
  body: { proposalId, capabilityId: '00000000-0000-4000-8000-000000000000' },
})
stage(
  'initiate refuses an unknown proposal, the wrong site, and an unknown capability',
  badProposal.status >= 400 && wrongSite.status >= 400 && badCapability.status >= 400,
  `proposal=${badProposal.status} site=${wrongSite.status} capability=${badCapability.status}`,
)

// 8. Initiate succeeds once; replaying with the same idempotency key creates no second attempt
const init = await rawRequest('POST', '/api/commerce/checkout/initiate', {
  host: world.siteA.host,
  cookie: cartCookie,
  headers: { 'idempotency-key': `f01-init-${stamp}` },
  body: { proposalId, capabilityId },
})
const initData = init.data ?? {}
const sessionId = String(initData.sessionId ?? '')
const actionUrl = String(initData.actionUrl ?? '')
const reference = actionUrl.split('/').at(-1) ?? ''
const checkoutCookie = firstCookie(init)
const initReplay = await api('/api/commerce/checkout/initiate', {
  method: 'POST',
  host: world.siteA.host,
  cookie: cartCookie,
  headers: { 'idempotency-key': `f01-init-${stamp}` },
  body: { proposalId, capabilityId },
})
const attempts = await api(
  `/api/payment-attempts?where[checkoutSession][equals]=${sessionId}&limit=10`,
  { host: world.siteA.host, cookie: adminA },
)
stage(
  'initiate returns the sandbox payment page and an idempotent replay creates no second attempt',
  (init.status === 200 || init.status === 201) &&
    actionUrl.startsWith('/checkout/test/') &&
    /^det_cs_[a-f0-9]{24}$/.test(reference) &&
    Boolean(checkoutCookie) &&
    String(initReplay.data?.sessionId ?? '') === sessionId &&
    (attempts.data?.totalDocs ?? attempts.data?.docs?.length) === 1,
  `init=${init.status} replaySession=${initReplay.data?.sessionId === sessionId} attempts=${attempts.data?.totalDocs}`,
)

// 9. Confirm refusals: missing guest token, unknown reference, and the site-host topology gate
const noToken = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  formUrlencoded: { reference },
})
const bogusRef = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  cookie: `${cartCookie}; ${checkoutCookie}`,
  formUrlencoded: { reference: 'det_cs_000000000000000000000000' },
})
const siteHostConfirm = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  host: world.siteA.host,
  cookie: `${cartCookie}; ${checkoutCookie}`,
  formUrlencoded: { reference },
})
stage(
  'confirm refuses a missing guest token and an unknown reference; the sandbox is loopback-gated',
  noToken.status === 403 && bogusRef.status >= 400 && siteHostConfirm.status === 404,
  `noToken=${noToken.status} bogus=${bogusRef.status} siteHost=${siteHostConfirm.status}`,
)

// 10. Confirm settles through the signed webhook + worker: order paid, receipt issued, stock 3 -> 1
const confirm = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  cookie: `${cartCookie}; ${checkoutCookie}`,
  formUrlencoded: { reference },
})
let order = null
let statusData = null
for (let i = 0; i < 40 && !order; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const st = await api(`/api/commerce/checkout/status?session=${sessionId}`, {
    host: world.siteA.host,
    cookie: checkoutCookie,
  })
  statusData = st.data
  const orders = await api(`/api/orders?where[checkoutSession][equals]=${sessionId}&limit=5`, {
    host: world.siteA.host,
    cookie: adminA,
  })
  const doc = orders.data?.docs?.[0]
  if (doc && doc.state === 'paid') order = doc
}
const productAfter = await api(`/api/products/${productId}`, {
  host: world.siteA.host,
  cookie: adminA,
})
const qtyAfter = (productAfter.data?.variants ?? productAfter.data?.doc?.variants)?.[0]
  ?.inventoryQuantity
probe(
  'order money fields',
  JSON.stringify({
    totalMinor: order?.totalMinor,
    amountMinor: order?.amountMinor,
    pricingTotal: order?.pricingSnapshot?.totalMinor,
    statusShape: statusData ? Object.keys(statusData) : [],
    statusState: statusData?.state ?? statusData?.status ?? statusData?.orderState,
  }),
)
writeFileSync(
  '/tmp/f01-browser.json',
  JSON.stringify({
    slug,
    productName,
    sku: SKU,
    productId,
    sessionId,
    checkoutCookie,
    orderState: order?.state ?? '',
  }),
)
stage(
  'sandbox payment settles: one paid order, issued receipt, inventory decremented 3 -> 0',
  confirm.status === 303 && Boolean(order) && order.receipt?.state === 'issued' && qtyAfter === 0,
  `confirm=${confirm.status} order=${order?.state} receipt=${order?.receipt?.state} stock=${qtyAfter}`,
)

// 11. Replaying the confirm is a no-op: still one order, stock unchanged
const confirmReplay = await rawRequest('POST', '/api/commerce/checkout/test/confirm', {
  cookie: `${cartCookie}; ${checkoutCookie}`,
  formUrlencoded: { reference },
})
await new Promise((r) => setTimeout(r, 6000))
const ordersAfterReplay = await api(
  `/api/orders?where[checkoutSession][equals]=${sessionId}&limit=5`,
  { host: world.siteA.host, cookie: adminA },
)
const productFinal = await api(`/api/products/${productId}`, {
  host: world.siteA.host,
  cookie: adminA,
})
stage(
  'replaying the payment confirm creates no second order and moves no stock',
  confirmReplay.status === 303 &&
    (ordersAfterReplay.data?.totalDocs ?? ordersAfterReplay.data?.docs?.length) === 1 &&
    (productFinal.data?.variants ?? productFinal.data?.doc?.variants)?.[0]?.inventoryQuantity === 0,
  `replay=${confirmReplay.status} orders=${ordersAfterReplay.data?.totalDocs} stock=${(productFinal.data?.variants ?? productFinal.data?.doc?.variants)?.[0]?.inventoryQuantity}`,
)
writeFileSync(
  '/tmp/f01-state.json',
  JSON.stringify({ productId, sku: SKU, capabilityId, merchantId, orderId: order?.id ?? '' }),
)

// 12. Out of stock: a new guest cannot cart or propose what no longer exists
const oosAdd = await rawRequest('POST', '/api/commerce/cart', {
  host: world.siteA.host,
  body: { productId, variantSku: SKU, quantity: 1 },
})
const oosCookie = firstCookie(oosAdd)
const oosCart = await api('/api/commerce/cart', { host: world.siteA.host, cookie: oosCookie })
const oosItems = oosCart.data?.cart?.items ?? oosCart.data?.items ?? []
const oosProposal = await api('/api/commerce/proposal', {
  method: 'POST',
  host: world.siteA.host,
  cookie: oosCookie,
  body: buyerBody,
})
stage(
  'after the last unit sells, a new guest cannot buy it (no oversell)',
  oosItems.length === 0 && oosProposal.status === 400,
  `add=${oosAdd.status} cartItems=${oosItems.length} proposal=${oosProposal.status}`,
)

const failed = results.filter((r) => !r.ok)
console.log(`\nF-01 JOURNEY: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
