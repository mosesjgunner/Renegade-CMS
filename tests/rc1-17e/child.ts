/* eslint-disable @typescript-eslint/no-explicit-any -- isolated crash-induction child actions */
// Child-process actions for RC1 17E. Each action runs one real product
// entrypoint in its own process so the parent journey can SIGKILL it at a
// precise interruption boundary (lease held, dispatch in flight, settlement
// transaction open, provider submission unanswered) and then verify how the
// surviving system recovers without duplicating the business effect.
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '@payload-config'
import { executeScheduledPublishJob } from '../../src/modules/editorial/scheduler'
import { executePodOperatorAction } from '../../src/modules/commerce/pod-operator'
import { reconcileBillingSubscription } from '../../src/modules/commerce/subscription-reconciliation'
import { reconcilePaymentsTask } from '../../src/modules/commerce/tasks'
import { emailDeliveryTask } from '../../src/modules/audience/tasks'

assert.equal(process.env.RC117E_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc117e_release_acceptance'))

const [action, ...args] = process.argv.slice(2)
const payload: any = await getPayload({ config })

try {
  if (action === 'publish-job') {
    const [jobId, workerId, leaseSeconds] = args
    const result = await executeScheduledPublishJob(payload, jobId, {
      workerId,
      leaseDurationSeconds: Number(leaseSeconds),
    })
    console.log(JSON.stringify({ action, result }))
  } else if (action === 'pod-submit') {
    const [jobId] = args
    const result = await executePodOperatorAction(
      payload,
      jobId,
      'submit-pod-job',
      'operator-17e-child',
      () => undefined,
    )
    console.log(JSON.stringify({ action, success: result.success }))
  } else if (action === 'reconcile-subscription') {
    const [subscriptionId] = args
    const result = await reconcileBillingSubscription(payload, subscriptionId)
    console.log(JSON.stringify({ action, result }))
  } else if (action === 'reconcile-payments') {
    await (reconcilePaymentsTask.handler as any)({ req: { payload }, input: {} })
    console.log(JSON.stringify({ action, done: true }))
  } else if (action === 'email-handler') {
    const [deliveryId] = args
    await (emailDeliveryTask.handler as any)({ input: { deliveryId }, req: { payload } })
    console.log(JSON.stringify({ action, done: true }))
  } else {
    throw new Error(`Unknown child action "${action}"`)
  }
  process.exit(0)
} catch (error) {
  console.log(
    JSON.stringify({
      action,
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    }),
  )
  process.exit(0)
}
