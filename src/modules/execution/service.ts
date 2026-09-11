/* eslint-disable @typescript-eslint/no-explicit-any -- Payload's generic store adapter accepts collection-specific request shapes. */
import { createHash } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import type { ExecutionEvent } from './contracts'
import { createExecutionEvent } from './contracts'

type Store = {
  create: (args: any) => Promise<unknown>
  find: (args: any) => Promise<{ docs: Array<Record<string, unknown>> }>
  update: (args: any) => Promise<unknown>
  jobs: { queue: (args: any) => Promise<{ id: string }> }
}

/** Persist before publication. The dispatcher later repairs any missed queue call. */
export async function recordExecutionEvent(
  store: Store,
  input: Parameters<typeof createExecutionEvent>[0],
  req?: Partial<PayloadRequest>,
) {
  const event = createExecutionEvent(input)
  // Keep the existing unique database index, but namespace effects by both scopes.
  event.idempotencyKey = createHash('sha256')
    .update(JSON.stringify([event.siteId, event.tenantId, event.idempotencyKey]))
    .digest('hex')
  const existing = await store.find({
    collection: 'execution-events',
    where: { idempotencyKey: { equals: event.idempotencyKey } },
    limit: 1,
    overrideAccess: true,
    req,
  })
  if (existing.docs[0])
    return { event: executionEventFromRecord(existing.docs[0]), duplicate: true }
  const saved = await store.create({
    collection: 'execution-events',
    data: { ...event, site: event.siteId, state: 'ready', attempts: 0 },
    overrideAccess: true,
    req,
  })
  return { event: executionEventFromRecord(saved as Record<string, unknown>), duplicate: false }
}

export type ExecutionHandler = (event: ExecutionEvent) => Promise<void>
const handlers = new Map<string, ExecutionHandler>()

/** Register from a B01–B06 domain startup module; one event type has one owner. */
export function registerExecutionHandler(
  eventType: ExecutionEvent['eventType'],
  handler: ExecutionHandler,
  eventVersion = 1,
) {
  const key = `${eventType}@${eventVersion}`
  if (handlers.has(key)) throw new Error(`Execution handler already registered for ${eventType}`)
  handlers.set(key, handler)
}
export const executionHandlerFor = (eventType: string, eventVersion = 1) =>
  handlers.get(`${eventType}@${eventVersion}`)
export const resetExecutionHandlersForTest = () => handlers.clear()

/** Payload persists `site` as a relationship, not the transport field `siteId`. */
export function executionEventFromRecord(record: Record<string, unknown>): ExecutionEvent {
  const site = record.site
  return {
    ...record,
    siteId: String(
      record.siteId ?? (site && typeof site === 'object' ? (site as { id: unknown }).id : site),
    ),
  } as ExecutionEvent
}
