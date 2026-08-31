import type { CollectionConfig } from 'payload'

const operator = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

/**
 * The durable, privacy-safe handoff between a committed product mutation and
 * asynchronous execution. Payload Jobs is the queue; this collection is its
 * transactional inbox/outbox record and remains the operator audit trail.
 */
export const ExecutionEvents: CollectionConfig = {
  slug: 'execution-events',
  admin: { useAsTitle: 'eventType', group: 'System', hidden: true },
  access: { create: operator, delete: () => false, read: operator, update: operator },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'tenantId', type: 'text', required: true, index: true },
    { name: 'actor', type: 'json', required: true },
    { name: 'eventType', type: 'text', required: true, index: true },
    { name: 'eventVersion', type: 'number', required: true, defaultValue: 1 },
    { name: 'occurredAt', type: 'date', required: true, index: true },
    { name: 'correlationId', type: 'text', required: true, index: true },
    { name: 'causationId', type: 'text', index: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
    {
      name: 'privacyClass',
      type: 'select',
      required: true,
      defaultValue: 'internal',
      options: ['public', 'internal', 'restricted'],
    },
    { name: 'payload', type: 'json', required: true },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'ready',
      options: ['ready', 'dispatched', 'retrying', 'processed', 'dead-letter', 'cancelled'],
      index: true,
    },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0 },
    { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
    { name: 'jobId', type: 'text', index: true, admin: { readOnly: true } },
  ],
  indexes: [
    { fields: ['site', 'state', 'createdAt'] },
    { fields: ['tenantId', 'eventType', 'createdAt'] },
  ],
}
