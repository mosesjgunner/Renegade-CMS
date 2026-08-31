/* eslint-disable @typescript-eslint/no-explicit-any -- Payload's generic store adapter accepts collection-specific request shapes. */
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
) {
  const event = createExecutionEvent(input)
  const existing = await store.find({
    collection: 'execution-events',
    where: { idempotencyKey: { equals: event.idempotencyKey } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0])
    return { event: existing.docs[0] as unknown as ExecutionEvent, duplicate: true }
  const saved = await store.create({
    collection: 'execution-events',
    data: { ...event, site: event.siteId, state: 'ready', attempts: 0 },
    overrideAccess: true,
  })
  return { event: saved as ExecutionEvent, duplicate: false }
}

export type ExecutionHandler = (event: ExecutionEvent) => Promise<void>
const handlers = new Map<string, ExecutionHandler>()

/** Register from a B01–B06 domain startup module; one event type has one owner. */
export function registerExecutionHandler(
  eventType: ExecutionEvent['eventType'],
  handler: ExecutionHandler,
) {
  if (handlers.has(eventType))
    throw new Error(`Execution handler already registered for ${eventType}`)
  handlers.set(eventType, handler)
}
export const executionHandlerFor = (eventType: string) => handlers.get(eventType)
export const resetExecutionHandlersForTest = () => handlers.clear()
