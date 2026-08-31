import { randomUUID } from 'node:crypto'

import { configuredSecretValues, redact } from '../core/logging'

export const EXECUTION_EVENT_VERSION = 1
export const EXECUTION_QUEUE = 'operations'
export const EXECUTION_MAX_PAYLOAD_BYTES = 32 * 1024

export type ExecutionActor = { kind: 'user' | 'service' | 'system'; id: string | null }
export type ExecutionEvent = {
  id: string
  siteId: string
  tenantId: string
  actor: ExecutionActor
  eventType: `${string}.${string}`
  eventVersion: number
  occurredAt: string
  correlationId: string
  causationId?: string
  idempotencyKey: string
  privacyClass: 'public' | 'internal' | 'restricted'
  payload: Record<string, unknown>
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ExecutionError'
  }
}

const sensitiveKey = /email|phone|address|name|cookie|authorization|password|secret|token/i
const assertSafePayload = (payload: Record<string, unknown>) => {
  const encoded = JSON.stringify(payload)
  if (Buffer.byteLength(encoded) > EXECUTION_MAX_PAYLOAD_BYTES)
    throw new Error(`Execution payload exceeds ${EXECUTION_MAX_PAYLOAD_BYTES} bytes.`)
  const visit = (value: unknown, key = ''): void => {
    if (sensitiveKey.test(key))
      throw new Error(`Execution payload may not include personal data or secrets (${key}).`)
    if (Array.isArray(value)) value.forEach((item) => visit(item))
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([childKey, child]) => visit(child, childKey))
  }
  visit(payload)
}

export function createExecutionEvent(
  input: Omit<ExecutionEvent, 'id' | 'occurredAt' | 'correlationId' | 'eventVersion'> &
    Partial<Pick<ExecutionEvent, 'id' | 'occurredAt' | 'correlationId' | 'eventVersion'>>,
): ExecutionEvent {
  if (!input.siteId || !input.tenantId || !input.actor || !input.eventType || !input.idempotencyKey)
    throw new Error('Execution events require site, tenant, actor, type, and idempotency scope.')
  assertSafePayload(input.payload)
  return {
    ...input,
    id: input.id ?? randomUUID(),
    eventVersion: input.eventVersion ?? EXECUTION_EVENT_VERSION,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    correlationId: input.correlationId ?? randomUUID(),
  }
}

/** A handler must make this check before loading its protected owning record. */
export function assertExecutionScope(
  event: Pick<ExecutionEvent, 'siteId' | 'tenantId'>,
  scope: Pick<ExecutionEvent, 'siteId' | 'tenantId'>,
) {
  if (event.siteId !== scope.siteId || event.tenantId !== scope.tenantId)
    throw new ExecutionError(
      'Execution event scope does not match the owned record.',
      'scope_mismatch',
      false,
    )
}

export const safeExecutionError = (error: unknown) => {
  const value = redact(
    error instanceof Error ? error.message : String(error),
    configuredSecretValues(),
  )
  return typeof value === 'string' ? value.slice(0, 500) : 'Execution failed.'
}
