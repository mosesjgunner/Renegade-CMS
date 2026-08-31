/* eslint-disable @typescript-eslint/no-explicit-any -- Payload task request types are collection-polymorphic. */
import type { TaskConfig } from 'payload'
import {
  ExecutionError,
  EXECUTION_QUEUE,
  safeExecutionError,
  type ExecutionEvent,
} from '../execution/contracts'
import { executionHandlerFor } from '../execution/service'
import { deliverWebhook, enqueueWebhookDeliveries } from '../integrations/webhooks'

export const OPERATIONS_QUEUE = 'operations'

type HeartbeatTask = {
  input: Record<string, never>
  output: { observedAt: string; version: string }
}

type ForcedFailureTask = {
  input: { marker: string }
  output: Record<string, never>
}

export const operationalHeartbeatTask: TaskConfig<HeartbeatTask> = {
  slug: 'operations-heartbeat',
  label: 'Operations heartbeat',
  inputSchema: [],
  outputSchema: [
    { name: 'observedAt', type: 'date', required: true },
    { name: 'version', type: 'text', required: true },
  ],
  retries: 0,
  concurrency: () => 'operations.heartbeat',
  schedule: [{ cron: '*/5 * * * *', queue: OPERATIONS_QUEUE }],
  handler: async ({ req }) => {
    const observedAt = new Date().toISOString()
    const version = process.env.APP_VERSION ?? '0.1.0-dev'
    req.payload.logger.info({ event: 'operations.job.heartbeat', observedAt, version })
    return { output: { observedAt, version } }
  },
}

export const forcedFailureTask: TaskConfig<ForcedFailureTask> = {
  slug: 'operations-forced-failure',
  label: 'Operations retry proof',
  inputSchema: [{ name: 'marker', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 100, type: 'exponential' } },
  concurrency: ({ input }) => `operations.forced-failure:${String(input.marker)}`,
  handler: async ({ input, job, req }) => {
    req.payload.logger.warn({
      event: 'operations.job.forced_failure',
      jobId: job.id,
      marker: input.marker,
      attempt: (job.totalTried ?? 0) + 1,
    })
    throw new Error('Intentional operations retry proof failure')
  },
  onFail: async ({ job, req }) => {
    req.payload.logger.error({
      event: 'operations.job.attempt_failed',
      jobId: job.id,
      attempt: (job.totalTried ?? 0) + 1,
    })
  },
}

export const executionOutboxDispatchTask = {
  slug: 'execution-outbox-dispatch',
  label: 'Dispatch durable execution outbox',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: () => 'execution.outbox.dispatch',
  schedule: [{ cron: '*/10 * * * * *', queue: EXECUTION_QUEUE }],
  handler: async ({ req }: { req: any }) => {
    const events = await req.payload.find({
      collection: 'execution-events' as never,
      where: { state: { in: ['ready', 'retrying'] } },
      limit: 100,
      sort: 'createdAt',
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const event of events.docs as unknown as ExecutionEvent[]) {
      const job = await req.payload.jobs.queue({
        task: 'execution-outbox-handle',
        input: { eventId: event.id },
        queue: EXECUTION_QUEUE,
      })
      await req.payload.update({
        collection: 'execution-events' as never,
        id: event.id,
        data: { state: 'dispatched', jobId: job.id } as never,
        overrideAccess: true,
      } as never)
    }
    return { output: {} }
  },
} as unknown as TaskConfig

export const executionOutboxHandleTask = {
  slug: 'execution-outbox-handle',
  label: 'Handle durable execution event',
  inputSchema: [{ name: 'eventId', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: ({ input }: { input: { eventId: string } }) => `execution.event:${input.eventId}`,
  handler: async ({ input, req }: { input: { eventId: string }; req: any }) => {
    const event = (await req.payload.findByID({
      collection: 'execution-events' as never,
      id: input.eventId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as ExecutionEvent & { state: string; attempts: number }
    if (event.state === 'processed' || event.state === 'cancelled' || event.state === 'dead-letter')
      return { output: {} }
    try {
      await enqueueWebhookDeliveries(req.payload, event)
      const handler = executionHandlerFor(event.eventType)
      if (handler) await handler(event)
      await req.payload.update({
        collection: 'execution-events' as never,
        id: event.id,
        data: {
          state: 'processed',
          attempts: Number(event.attempts ?? 0) + 1,
          lastError: null,
        } as never,
        overrideAccess: true,
      } as never)
    } catch (error) {
      const retryable = error instanceof ExecutionError ? error.retryable : true
      await req.payload.update({
        collection: 'execution-events' as never,
        id: event.id,
        data: {
          state: retryable ? 'retrying' : 'dead-letter',
          attempts: Number(event.attempts ?? 0) + 1,
          lastError: safeExecutionError(error),
        } as never,
        overrideAccess: true,
      } as never)
      if (retryable) throw error
    }
    return { output: {} }
  },
} as unknown as TaskConfig

export const webhookDeliveryDispatchTask = {
  slug: 'webhook-delivery-dispatch',
  label: 'Deliver outbound webhooks',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: () => 'integrations.webhooks.dispatch',
  schedule: [{ cron: '*/10 * * * * *', queue: EXECUTION_QUEUE }],
  handler: async ({ req }: { req: any }) => {
    const deliveries = await req.payload.find({
      collection: 'webhook-deliveries' as never,
      where: {
        and: [
          { state: { in: ['queued', 'retrying'] } },
          {
            or: [
              { nextAttemptAt: { exists: false } },
              { nextAttemptAt: { less_than_equal: new Date().toISOString() } },
            ],
          },
        ],
      },
      limit: 100,
      sort: 'createdAt',
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const delivery of deliveries.docs) await deliverWebhook(req.payload, String(delivery.id))
    return { output: {} }
  },
} as unknown as TaskConfig

export const operationsTasks = [
  operationalHeartbeatTask,
  forcedFailureTask,
  executionOutboxDispatchTask,
  executionOutboxHandleTask,
  webhookDeliveryDispatchTask,
]
