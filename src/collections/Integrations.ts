import type { CollectionConfig, Field } from 'payload'

const staff = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

const scopeFields: Field[] = [
  { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
  { name: 'publication', type: 'relationship', relationTo: 'publications', index: true },
  { name: 'space', type: 'relationship', relationTo: 'spaces', index: true },
]

const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Integrations' },
  access: { create: staff, delete: staff, read: staff, update: staff },
  fields: [],
})

/** Machine credentials contain a one-way digest only. The clear token is never recoverable. */
export const ApiClients: CollectionConfig = {
  ...base('api-clients', 'name'),
  fields: [
    ...scopeFields,
    { name: 'name', type: 'text', required: true },
    { name: 'tokenPrefix', type: 'text', required: true, unique: true, index: true },
    { name: 'tokenHash', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'scopes', type: 'json', required: true, defaultValue: [] },
    { name: 'expiresAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
  ],
}

/** Webhook secrets resolve from a secret manager reference; they are never returned by Payload. */
export const WebhookSubscriptions: CollectionConfig = {
  ...base('webhook-subscriptions', 'target'),
  fields: [
    ...scopeFields,
    { name: 'events', type: 'json', required: true, defaultValue: [] },
    { name: 'target', type: 'text', required: true },
    { name: 'secretRef', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'disabled'],
    },
    { name: 'failureCount', type: 'number', required: true, defaultValue: 0 },
    { name: 'rotatedAt', type: 'date' },
  ],
}

export const WebhookDeliveries: CollectionConfig = {
  ...base('webhook-deliveries', 'eventId'),
  fields: [
    {
      name: 'subscription',
      type: 'relationship',
      relationTo: 'webhook-subscriptions' as never,
      required: true,
      index: true,
    },
    { name: 'eventId', type: 'text', required: true, index: true },
    { name: 'eventType', type: 'text', required: true },
    /** A privacy-safe, versioned envelope retained solely for retry and manual redelivery. */
    { name: 'payload', type: 'json', required: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'delivered', 'retrying', 'dead-letter'],
    },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0 },
    { name: 'nextAttemptAt', type: 'date' },
    { name: 'redactedResponse', type: 'textarea' },
    { name: 'lastError', type: 'textarea', admin: { readOnly: true } },
  ],
}

export const IntegrationAuditEvents: CollectionConfig = {
  ...base('integration-audit-events', 'action'),
  fields: [
    ...scopeFields,
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'client', type: 'relationship', relationTo: 'api-clients' as never, index: true },
    { name: 'subject', type: 'json' },
    { name: 'outcome', type: 'select', required: true, options: ['allowed', 'denied', 'failed'] },
    { name: 'occurredAt', type: 'date', required: true },
  ],
}

/** Durable API write deduplication. Responses are intentionally public-contract shaped. */
export const ApiRequestRecords: CollectionConfig = {
  ...base('api-request-records', 'idempotencyKey'),
  fields: [
    ...scopeFields,
    { name: 'client', type: 'relationship', relationTo: 'api-clients' as never, required: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'method', type: 'text', required: true },
    { name: 'path', type: 'text', required: true },
    { name: 'responseStatus', type: 'number', required: true },
    { name: 'response', type: 'json', required: true },
  ],
}
