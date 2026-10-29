/* eslint-disable @typescript-eslint/no-explicit-any -- isolated durable simulator protocol */
import { createServer } from 'node:http'
import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'

assert.equal(process.env.RC1_13C_DISPOSABLE, 'yes')
const folder = resolve('scratch/rc113c/provider')
assert.ok(
  folder.endsWith('scratch\\rc113c\\provider') || folder.endsWith('scratch/rc113c/provider'),
)
const token = process.env.RENEGADE_POD_SIMULATOR_TOKEN!
assert.ok(token?.length >= 20)
await mkdir(folder, { recursive: true })
const file = resolve(folder, 'state.json')
let state: any
try {
  state = JSON.parse(await readFile(file, 'utf8'))
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e
  state = { sequence: 0, calls: [], orders: {}, next: {} }
}
async function save() {
  await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2))
  await rename(`${file}.tmp`, file)
}
let chain = Promise.resolve()
const server = createServer((req, res) => {
  chain = chain
    .then(async () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403).end()
        return
      }
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      const parts = (req.url ?? '').split('/').filter(Boolean)
      const requestId = `sim-request-${++state.sequence}`
      const send = async (value: any, status = 200) => {
        state.calls.push({
          requestId,
          path: req.url,
          inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
          input: body,
          response: value,
          status,
          evidenceClass: 'local-simulator',
        })
        await save()
        res
          .writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId })
          .end(JSON.stringify(value))
      }
      if (parts[0] === 'control') {
        if (body.next) state.next[body.connectionId] = body.next
        if (body.externalOrderId) {
          const stored = Object.values(state.orders).find(
            (o: any) => o.result.externalOrderId === body.externalOrderId,
          ) as any
          assert.ok(stored, 'simulator order exists')
          stored.result = {
            ...stored.result,
            state: body.state,
            providerStatus: `simulated:${body.state}`,
            requestId,
            fulfillments:
              body.state === 'shipped'
                ? [
                    {
                      fulfillmentId: `sim-shipment-${body.externalOrderId}`,
                      status: 'shipped',
                      lineIndices: stored.input.items.map((_: any, i: number) => i),
                      carrier: 'USPS',
                      trackingNumber: 'SIMULATOR13C999',
                      trackingUrl:
                        'https://tools.usps.com/go/TrackConfirmAction?tLabels=SIMULATOR13C999',
                      shippedAt: new Date().toISOString(),
                    },
                  ]
                : [],
          }
        }
        await send({ success: true })
        return
      }
      if (parts[0] !== 'adapter' || !['printful', 'printify', 'pod-emulator'].includes(parts[1])) {
        await send({ error: 'unknown simulator route' }, 404)
        return
      }
      const [, provider, connection, operation] = parts
      const emu = new PodEmulatorAdapter()
      const key = `${provider}:${connection}:${body.idempotencyKey}`
      switch (operation) {
        case 'health':
          await send(await emu.health())
          break
        case 'catalog':
          await send(await emu.getCatalog())
          break
        case 'variants':
          await send(await emu.getVariants(body.productId))
          break
        case 'templates':
          await send(await emu.getTemplates(body.variantId))
          break
        case 'preflight': {
          const result = await emu.preflight(body)
          await send({
            ...result,
            mockupUrl: undefined,
            provenance: { ...result.provenance, source: 'publisher' },
            evidenceClass: 'local-simulator',
          })
          break
        }
        case 'create': {
          const mode = state.next[connection]
          delete state.next[connection]
          if (mode === 'reject') {
            await send({ code: 'invalid-request', retryable: false, outcomeKnown: true }, 422)
            break
          }
          if (
            !body.items?.length ||
            body.items.some((i: any) => !i.printAreas?.length || i.quantity <= 0)
          ) {
            await send({ code: 'invalid-request', retryable: false, outcomeKnown: true }, 422)
            break
          }
          for (const item of body.items)
            for (const area of item.printAreas) {
              const url = new URL(area.artworkUrl)
              assert.equal(url.origin, 'http://localhost:39035')
              const response = await fetch(url)
              assert.equal(response.status, 200, 'actual signed artwork ingestion')
              assert.equal(
                createHash('sha256')
                  .update(Buffer.from(await response.arrayBuffer()))
                  .digest('hex'),
                area.artworkHash.replace(/^sha256:/, ''),
              )
            }
          if (!state.orders[key]) {
            const result = {
              externalOrderId: `sim-13c-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`,
              state: 'submitted',
              providerStatus: 'simulated:submitted',
              requestId,
              fulfillments: [],
              createdAt: new Date().toISOString(),
            }
            state.orders[key] = {
              input: body,
              result,
              provider,
              connection,
              evidenceClass: 'local-simulator',
            }
          }
          if (mode === 'lost-response') {
            state.calls.push({
              requestId,
              path: req.url,
              input: body,
              inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
              response: state.orders[key].result,
              transport: 'response-lost-after-persist',
              evidenceClass: 'local-simulator',
            })
            await save()
            req.socket.destroy()
            break
          }
          await send(state.orders[key].result)
          break
        }
        case 'find':
          await send(state.orders[key]?.result ?? null)
          break
        case 'get': {
          const stored = Object.values(state.orders).find(
            (o: any) =>
              o.provider === provider &&
              o.connection === connection &&
              o.result.externalOrderId === body.externalOrderId,
          ) as any
          await send(
            stored
              ? { ...stored.result, requestId }
              : { code: 'not-found', retryable: false, outcomeKnown: true },
            stored ? 200 : 404,
          )
          break
        }
        case 'cancel':
          await send({
            cancelled: true,
            reason: 'Simulator cancellation approved.',
          })
          break
        default:
          await send({ code: 'invalid-request', outcomeKnown: true, retryable: false }, 400)
      }
    })
    .catch((error) => {
      console.error(error)
      if (!res.headersSent) res.writeHead(500).end('{}')
    })
})
server.listen(39036, '127.0.0.1', () =>
  console.log('13C durable local simulator ready on 127.0.0.1:39036'),
)
