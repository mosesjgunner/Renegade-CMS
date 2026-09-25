import type { CollectionConfig } from 'payload'

// AI records are operated through scoped routes. Payload's generic REST and admin
// collection endpoints must not expose credentials or bypass proposal review.
const denied = () => false

export const AiConnections: CollectionConfig = {
  slug: 'ai-connections',
  admin: { hidden: true },
  access: { create: denied, read: denied, update: denied, delete: denied },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'publication', type: 'relationship', relationTo: 'publications', index: true },
    { name: 'label', type: 'text', required: true },
    { name: 'providerKey', type: 'text', required: true },
    { name: 'endpoint', type: 'text', required: true },
    { name: 'model', type: 'text', required: true },
    { name: 'models', type: 'json', required: true },
    { name: 'capabilities', type: 'json', required: true },
    { name: 'allowedTasks', type: 'json', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'lastError', type: 'text' },
    { name: 'lastTestedAt', type: 'date' },
    { name: 'perTaskUsd', type: 'number', required: true },
    { name: 'monthlyUsd', type: 'number', required: true },
    { name: 'maxInputTokens', type: 'number', required: true },
    { name: 'maxOutputTokens', type: 'number', required: true },
    { name: 'inputUsdPer1k', type: 'number', required: true },
    { name: 'outputUsdPer1k', type: 'number', required: true },
    { name: 'budgetMonth', type: 'text' },
    { name: 'spentMonthUsd', type: 'number', required: true, defaultValue: 0 },
    { name: 'leaseUntil', type: 'date' },
    { name: 'leaseId', type: 'text' },
    { name: 'leasedCostUsd', type: 'number', required: true, defaultValue: 0 },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', required: true },
  ],
}

export const AiCredentials: CollectionConfig = {
  slug: 'ai-credentials',
  admin: { hidden: true },
  access: { create: denied, read: denied, update: denied, delete: denied },
  fields: [
    {
      name: 'connection',
      type: 'relationship',
      relationTo: 'ai-connections' as never,
      required: true,
      unique: true,
    },
    { name: 'envelope', type: 'json', required: true },
  ],
}

export const AiProposals: CollectionConfig = {
  slug: 'ai-proposals',
  admin: { hidden: true },
  access: { create: denied, read: denied, update: denied, delete: denied },
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    {
      name: 'connection',
      type: 'relationship',
      relationTo: 'ai-connections' as never,
      index: true,
    },
    { name: 'task', type: 'text', required: true },
    { name: 'targetCollection', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true, index: true },
    { name: 'targetUpdatedAt', type: 'date', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'original', type: 'json' },
    { name: 'output', type: 'json' },
    { name: 'contextPreview', type: 'json', required: true },
    { name: 'usage', type: 'json' },
    { name: 'auditId', type: 'text', required: true },
    { name: 'requestedBy', type: 'relationship', relationTo: 'users', required: true },
    { name: 'decidedBy', type: 'relationship', relationTo: 'users' },
    { name: 'decidedAt', type: 'date' },
    { name: 'failureCode', type: 'text' },
    { name: 'application', type: 'json' },
  ],
}
