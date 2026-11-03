/* eslint-disable @typescript-eslint/no-explicit-any -- disposable interruption harness */
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '@payload-config'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'

assert.equal(process.env.RC117E_PAYMENT_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:55421/rc117epayment_release_acceptance',
)
const payload: any = await getPayload({ config })
const update = payload.update.bind(payload)
payload.update = async (args: any) => {
  const result = await update(args)
  if (args.collection === 'payment-attempts' && args.data?.state === 'succeeded') {
    console.log('ATTEMPT_PERSISTED')
    await new Promise(() => {})
  }
  return result
}
await (processPaymentEventTask.handler as any)({
  input: { webhookEventId: process.argv[2] },
  req: { payload },
})
throw new Error('Expected interruption before completion')
