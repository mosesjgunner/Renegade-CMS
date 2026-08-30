import type { Payload, TaskConfig } from 'payload'
import { NetworkKeyManager } from './key-management'
import { safeFetch } from '../core/external-boundary'
import { digestForBody } from '../social/activitypub'

const MAX_ATTEMPTS = 3
const keyManager = () => {
  const privateKeyPem = process.env.ACTIVITYPUB_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n')
  const keyId = process.env.ACTIVITYPUB_KEY_ID
  if (!privateKeyPem || !keyId) throw new Error('ActivityPub delivery signing is not configured.')
  return new NetworkKeyManager([{ keyId, algorithm: 'rsa-sha256', privateKeyPem }])
}

export const networkDeliveryTask = {
  slug: 'network-delivery',
  label: 'Network delivery',
  inputSchema: [{ name: 'deliveryId', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: MAX_ATTEMPTS - 1, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: ({ input }: { input: { deliveryId: string } }) =>
    `network.delivery:${input.deliveryId}`,
  handler: async ({ input, req }: { input: { deliveryId: string }; req: { payload: Payload } }) => {
    const delivery = (await req.payload.findByID({
      collection: 'outbound-network-deliveries',
      id: input.deliveryId,
      depth: 1,
      overrideAccess: true,
    })) as {
      id: string
      status: string
      target: string
      envelope: unknown
      idempotencyKey: string
    }
    if (['delivered', 'blocked', 'failed'].includes(delivery.status)) return { output: {} }
    const decisions = await req.payload.find({
      collection: 'network-access-decisions',
      where: { subject: { equals: new URL(delivery.target).origin } },
      limit: 1,
      overrideAccess: true,
    })
    if (decisions.docs[0]?.decision === 'block') {
      await req.payload.update({
        collection: 'outbound-network-deliveries',
        id: delivery.id,
        data: { status: 'blocked' },
        overrideAccess: true,
      })
      return { output: {} }
    }
    const attempt =
      Number(
        (
          await req.payload.find({
            collection: 'network-delivery-attempts',
            where: { delivery: { equals: delivery.id } },
            limit: 100,
            overrideAccess: true,
          })
        ).totalDocs,
      ) + 1
    const startedAt = new Date().toISOString()
    await req.payload.update({
      collection: 'outbound-network-deliveries',
      id: delivery.id,
      data: { status: 'sending' },
      overrideAccess: true,
    })
    try {
      const body = JSON.stringify(delivery.envelope)
      const target = new URL(delivery.target)
      const date = new Date().toUTCString(),
        digest = digestForBody(body)
      const signing = `(request-target): post ${target.pathname}${target.search}\nhost: ${target.host}\ndate: ${date}\ndigest: ${digest}`
      const signed = keyManager().sign(signing)
      const response = await safeFetch(
        delivery.target,
        {
          method: 'POST',
          body,
          headers: {
            accept: 'application/activity+json',
            'content-type': 'application/activity+json',
            host: target.host,
            date,
            digest,
            signature: `keyId="${signed.keyId}",algorithm="${signed.algorithm}",headers="(request-target) host date digest",signature="${signed.signature}"`,
          },
        },
        { allowPrivate: process.env.NETWORK_ALLOW_PRIVATE_DEVELOPMENT === 'true', retries: 0 },
      )
      await req.payload.create({
        collection: 'network-delivery-attempts',
        data: {
          delivery: delivery.id,
          idempotencyKey: delivery.idempotencyKey,
          attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: { status: response.status },
        },
        overrideAccess: true,
      })
      if (!response.ok) throw new Error(`Remote inbox returned ${response.status}.`)
      await req.payload.update({
        collection: 'outbound-network-deliveries',
        id: delivery.id,
        data: { status: 'delivered', nextAttemptAt: null },
        overrideAccess: true,
      })
      return { output: {} }
    } catch (error) {
      const terminal = attempt >= MAX_ATTEMPTS
      await req.payload.create({
        collection: 'network-delivery-attempts',
        data: {
          delivery: delivery.id,
          idempotencyKey: delivery.idempotencyKey,
          attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          outcome: { error: String(error).slice(0, 500) },
        },
        overrideAccess: true,
      })
      await req.payload.update({
        collection: 'outbound-network-deliveries',
        id: delivery.id,
        data: {
          status: terminal ? 'failed' : 'queued',
          nextAttemptAt: terminal ? null : new Date(Date.now() + 1000 * 2 ** attempt).toISOString(),
        },
        overrideAccess: true,
      })
      if (!terminal) throw error
      return { output: {} }
    }
  },
} as unknown as TaskConfig

export const networkTasks = [networkDeliveryTask]
