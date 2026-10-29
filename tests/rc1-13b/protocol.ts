/* eslint-disable @typescript-eslint/no-explicit-any -- isolated provider protocol acceptance */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import { PrintifyPodAdapter } from '../../src/modules/commerce/pod-printify'

assert.equal(process.env.RC1_13B_DISPOSABLE, 'yes')
process.env.RENEGADE_POD_ALLOW_LIVE_CREATION = 'true' // This process routes every request to its own loopback HTTP harness.
await mkdir('scratch/rc113b/protocol', { recursive: true })
const path = 'scratch/rc113b/protocol/state.json'
let state: any
try {
  state = JSON.parse(await readFile(path, 'utf8'))
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e
  state = { calls: [], orders: {} }
}
const runId = randomUUID()
let failNext = false
let loseNext = false
const trace: string[] = []
function check(label: string, value: unknown) {
  assert.ok(value, label)
  trace.push(label)
  console.log(`PASS ${trace.length}: ${label}`)
}
async function save() {
  await writeFile(path, JSON.stringify(state, null, 2))
}
async function boot() {
  const server = createServer(async (req, res) => {
    try {
      const provider = req.url?.startsWith('/printful') ? 'printful' : 'printify'
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const input = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      assert.equal(req.headers.authorization, 'Bearer protocol-local-only-token')
      const requestId = `protocol-${state.calls.length + 1}`
      const send = async (value: any, status = 200) => {
        state.calls.push({
          provider,
          method: req.method,
          path: req.url,
          input,
          response: value,
          requestId,
          status,
          evidenceClass: 'local-protocol-harness',
        })
        await save()
        res
          .writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId })
          .end(JSON.stringify(value))
      }
      const wrap = (value: any) => (provider === 'printful' ? { code: 200, result: value } : value)
      if (req.method === 'POST') {
        if (failNext) {
          failNext = false
          await send({ error: 'local rejection; secret must not be persisted' }, 422)
          return
        }
        assert.ok(input.external_id)
        const key = `${provider}:${input.external_id}`
        state.orders[key] ??= {
          id:
            provider === 'printful'
              ? state.calls.length + 1000
              : `printify-${state.calls.length + 1000}`,
          status: provider === 'printful' ? 'pending' : 'pending',
          external_id: input.external_id,
        }
        if (loseNext) {
          loseNext = false
          state.calls.push({
            provider,
            method: req.method,
            input,
            requestId,
            transport: 'response-lost-after-persist',
            response: state.orders[key],
            evidenceClass: 'local-protocol-harness',
          })
          await save()
          req.socket.destroy()
          return
        }
        await send(wrap(state.orders[key]))
        return
      }
      const url = decodeURIComponent(req.url ?? '')
      if (provider === 'printify' && url.includes('orders.json?')) {
        await send({
          data: Object.entries(state.orders)
            .filter(([k]) => k.startsWith('printify:'))
            .map(([, v]) => v),
        })
        return
      }
      const lookup = url
        .split('/')
        .at(-1)!
        .replace(/\.json$/, '')
      const order = Object.entries(state.orders).find(
        ([key, value]: any) =>
          key.startsWith(`${provider}:`) &&
          (String(value.id) === lookup || `@${value.external_id}` === lookup),
      )?.[1]
      await send(wrap(order ?? {}), order ? 200 : 404)
    } catch (error) {
      console.error(error)
      if (!res.headersSent) res.writeHead(500).end('{}')
    }
  })
  await new Promise<void>((resolve) => server.listen(39027, '127.0.0.1', resolve))
  return server
}
const close = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((e) => (e ? reject(e) : resolve()))
  })
let server = await boot()
const printful = new PrintfulPodAdapter({
  apiKey: 'protocol-local-only-token',
  apiBaseUrl: 'http://127.0.0.1:39027/printful',
  allowLiveCreation: true,
})
const printify = new PrintifyPodAdapter({
  apiKey: 'protocol-local-only-token',
  shopId: 'shop-local',
  allowLiveCreation: true,
  fetchFn: (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api.printify.com')
    return fetch(`http://127.0.0.1:39027/printify${url.pathname}${url.search}`, init)
  },
})
const make = (suffix: string) => ({
  orderId: runId,
  idempotencyKey: `${runId}-${suffix}`,
  recipient: {
    name: 'Protocol Local',
    address1: '1 Test St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    email: 'local@example.test',
  },
  items: [
    {
      variantId: '123',
      remoteProductId: 'existing-shop-product',
      quantity: 1,
      printAreas: [
        {
          area: 'front' as const,
          artworkId: 'local',
          artworkHash: createHash('sha256').update('local').digest('hex'),
          artworkUrl: 'https://example.test/local-only-not-fetched.png',
          placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
        },
      ],
    },
  ],
})
try {
  for (const adapter of [printful, printify]) {
    const input = make(adapter.key)
    const result = await adapter.createOrder(input)
    check(
      `${adapter.key} actual HTTP adapter submission retains provider identity/status/request ID`,
      result.state === 'submitted' &&
        result.providerStatus === 'pending' &&
        Boolean(result.requestId),
    )
    const call = state.calls.at(-1)
    check(
      `${adapter.key} transmits stable request identity in actual protocol body`,
      call.input.external_id === input.idempotencyKey &&
        (adapter.key !== 'printful' || call.input.items[0].variant_id === 123),
    )
    await close(server)
    state = JSON.parse(await readFile(path, 'utf8'))
    server = await boot()
    const after = await adapter.getOrder(result.externalOrderId)
    check(
      `${adapter.key} provider-server restart retains real response identity`,
      after.externalOrderId === result.externalOrderId && after.state === 'submitted',
    )
    state.orders[`${adapter.key}:${input.idempotencyKey}`].status = 'unrecognized-provider-status'
    await save()
    const unknown = await adapter.getOrder(result.externalOrderId)
    check(
      `${adapter.key} actual unknown status cannot manufacture acceptance/shipment`,
      unknown.state === 'exception' && unknown.providerStatus === 'unrecognized-provider-status',
    )
    failNext = true
    await assert.rejects(
      adapter.createOrder(make(`${adapter.key}-reject`)),
      (error: any) => error.outcomeKnown === true && !error.message.includes('secret must'),
    )
    check(`${adapter.key} known HTTP rejection remains redacted and known`, true)
    loseNext = true
    const lost = make(`${adapter.key}-lost`)
    await assert.rejects(adapter.createOrder(lost), (error: any) => error.outcomeKnown === false)
    const recovered = await adapter.findOrderByIdempotencyKey(lost.idempotencyKey)
    check(
      `${adapter.key} actual lost-response order recovered by stable external request identity`,
      recovered?.state === 'submitted' &&
        Object.keys(state.orders).filter((k) => k === `${adapter.key}:${lost.idempotencyKey}`)
          .length === 1,
    )
  }
  await writeFile(
    'docs/rc/evidence/rc1/18-pass/13B/protocol.json',
    JSON.stringify(
      {
        runId,
        passed: trace.length,
        failed: 0,
        skipped: 0,
        checks: trace,
        calls: state.calls.filter(
          (c: any) => c.input.external_id?.startsWith(runId) || c.method === 'GET',
        ),
      },
      null,
      2,
    ),
  )
} finally {
  await close(server)
}
