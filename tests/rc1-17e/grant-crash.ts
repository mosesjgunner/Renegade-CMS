/* eslint-disable @typescript-eslint/no-explicit-any -- disposable interruption harness */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { POST } from '../../src/app/(frontend)/api/commerce/webhooks/[provider]/route'

assert.equal(process.env.RC117E_GRANT_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:55422/rc117egrant_release_acceptance',
)
const payload: any = await getPayload({ config })
const create = payload.create.bind(payload)
payload.create = async (args: any) => {
  const result = await create(args)
  if (args.collection === 'entitlements') {
    console.log('GRANT_WRITTEN_IN_TRANSACTION')
    await new Promise(() => {})
  }
  return result
}
const raw = await readFile('scratch/rc117egrant/interrupted-event.json', 'utf8')
const time = Math.floor(Date.now() / 1000)
const signature = createHmac('sha256', process.env.COMMERCE_STRIPE_TEST_WEBHOOK_SECRET!)
  .update(`${time}.${raw}`)
  .digest('hex')
await POST(
  new Request('http://localhost:39423/api/commerce/webhooks/stripe-test', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${time},v1=${signature}` },
    body: raw,
  }),
  { params: Promise.resolve({ provider: 'stripe-test' }) },
)
throw new Error('Expected interruption during grant transaction')
