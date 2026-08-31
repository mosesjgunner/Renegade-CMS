import type { CollectionConfig } from 'payload'
import { ownerFields, retentionFields } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Analytics' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [],
})
export const AnalyticsEvents: CollectionConfig = {
  ...base('analytics-events', 'eventId'),
  fields: [
    ...ownerFields(),
    { name: 'eventId', type: 'text', required: true, unique: true },
    { name: 'dedupeKey', type: 'text', required: true, unique: true, index: true },
    { name: 'eventType', type: 'text', required: true, index: true },
    { name: 'occurredAt', type: 'date', required: true, index: true },
    { name: 'receivedAt', type: 'date', required: true },
    { name: 'schemaVersion', type: 'number', required: true, defaultValue: 1 },
    {
      name: 'consentBasis',
      type: 'select',
      required: true,
      options: ['necessary', 'analytics-consent', 'server-trusted', 'denied'],
    },
    { name: 'anonymousHash', type: 'text', index: true },
    { name: 'sessionHash', type: 'text', index: true },
    { name: 'member', type: 'relationship', relationTo: 'members' },
    { name: 'context', type: 'json', required: true },
    { name: 'properties', type: 'json' },
    { name: 'trusted', type: 'checkbox', defaultValue: false },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['site', 'occurredAt'] }, { fields: ['site', 'eventType', 'occurredAt'] }],
}
/** Immutable evidence of a browser's versioned choices. This is separate from email consent. */
export const AnalyticsConsentRecords: CollectionConfig = {
  ...base('analytics-consent-records', 'occurredAt'),
  fields: [
    ...ownerFields(),
    { name: 'subjectHash', type: 'text', required: true, index: true },
    { name: 'consentVersion', type: 'text', required: true },
    { name: 'action', type: 'select', required: true, options: ['grant', 'update', 'withdraw'] },
    { name: 'categories', type: 'json', required: true },
    { name: 'occurredAt', type: 'date', required: true, index: true },
    { name: 'source', type: 'text', required: true, defaultValue: 'browser' },
  ],
  indexes: [{ fields: ['site', 'subjectHash', 'occurredAt'] }],
}
export const AnalyticsRollups: CollectionConfig = {
  ...base('analytics-rollups', 'metric'),
  fields: [
    ...ownerFields(),
    { name: 'metric', type: 'text', required: true, index: true },
    { name: 'definition', type: 'textarea', required: true },
    {
      name: 'grain',
      type: 'select',
      required: true,
      options: ['daily', 'campaign', 'content', 'channel', 'goal'],
    },
    { name: 'windowStart', type: 'date', required: true, index: true },
    { name: 'windowEnd', type: 'date', required: true },
    { name: 'dimensions', type: 'json', required: true, defaultValue: {} },
    { name: 'value', type: 'text', required: true },
    { name: 'uniqueCountMethod', type: 'text' },
    { name: 'schemaVersion', type: 'number', required: true, defaultValue: 1 },
    { name: 'lateEventsIncludedUntil', type: 'date' },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['site', 'metric', 'windowStart'] }],
}
export const MetricSnapshots: CollectionConfig = {
  ...base('metric-snapshots', 'metric'),
  fields: [
    ...ownerFields(),
    { name: 'metric', type: 'text', required: true, index: true },
    { name: 'value', type: 'text', required: true },
    { name: 'definition', type: 'textarea', required: true },
    { name: 'provider', type: 'text' },
    {
      name: 'grain',
      type: 'select',
      required: true,
      options: ['event', 'daily', 'campaign', 'order', 'delivery'],
    },
    { name: 'windowStart', type: 'date', required: true },
    { name: 'windowEnd', type: 'date', required: true },
    { name: 'financial', type: 'json' },
    {
      name: 'reconciliationStatus',
      type: 'select',
      required: true,
      options: ['unreconciled', 'reconciled', 'provider-reported', 'estimated'],
    },
    { name: 'sourceReference', type: 'text', unique: true },
    ...retentionFields(),
  ],
}
export const AnalyticsGoals: CollectionConfig = {
  ...base('analytics-goals', 'key'),
  fields: [
    ...ownerFields(),
    { name: 'key', type: 'text', required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'eventTypes', type: 'json', required: true },
    { name: 'definition', type: 'textarea', required: true },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
  ],
  indexes: [{ fields: ['site', 'key'], unique: true }],
}
export const CommandCenterPreferences: CollectionConfig = {
  ...base('command-center-preferences', 'id'),
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true },
    { name: 'hiddenSections', type: 'json', defaultValue: [] },
    { name: 'sectionOrder', type: 'json', defaultValue: [] },
  ],
}
