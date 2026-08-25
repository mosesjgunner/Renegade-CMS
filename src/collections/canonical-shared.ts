import type { Field } from 'payload'

export const visibilityOptions = ['public', 'unlisted', 'members', 'friends', 'private']

export const publicationStatusOptions = ['draft', 'active', 'suspended', 'archived']

export const moderationStateOptions = ['clear', 'review', 'restricted', 'removed']

export const canonicalSlug = (value: unknown): true | string => {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return 'Use lowercase letters, numbers, and single hyphens.'
  }

  return true
}

export const capabilityFields = (): Field[] => [
  {
    name: 'capabilities',
    type: 'array',
    fields: [
      { name: 'key', type: 'text', required: true },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'enabled',
        options: ['enabled', 'disabled'],
      },
    ],
  },
  { name: 'quotaPolicy', type: 'json', admin: { description: 'Reserved for quota enforcement.' } },
]

export const retentionFields = (): Field[] => [
  {
    name: 'retentionMode',
    type: 'select',
    required: true,
    defaultValue: 'permanent',
    options: ['permanent', 'expire-at', 'manual-burn', 'archive', 'tombstone'],
  },
  { name: 'retentionExpiresAt', type: 'date' },
  {
    name: 'retentionHold',
    type: 'select',
    required: true,
    defaultValue: 'none',
    options: ['none', 'legal', 'moderation'],
  },
  {
    name: 'removeFromDiscovery',
    type: 'checkbox',
    defaultValue: true,
    admin: {
      description: 'Removes expired or burned records from routes, search, feeds, and sitemaps.',
    },
  },
  {
    name: 'tombstoneLabel',
    type: 'text',
    admin: { condition: (_, data) => data.retentionMode === 'tombstone' },
  },
]

export const seoFields = (): Field[] => [
  { name: 'seoTitle', type: 'text' },
  { name: 'seoDescription', type: 'textarea' },
  { name: 'seoCanonicalURL', type: 'text' },
  { name: 'seoImageAlt', type: 'text' },
  { name: 'seoKeywords', type: 'json' },
  { name: 'seoFocusKeyphrase', type: 'text' },
  { name: 'seoNoIndex', type: 'checkbox', defaultValue: false },
]

export const structuredDataSourceFields = (): Field[] => [
  {
    name: 'structuredDataMode',
    type: 'select',
    required: true,
    defaultValue: 'none',
    options: ['none', 'manual', 'inherit-source', 'event-derived', 'timeline-derived'],
  },
  { name: 'structuredDataPrimaryType', type: 'text' },
  {
    name: 'structuredDataSourceCollection',
    type: 'select',
    options: ['content', 'events', 'timelines', 'sources', 'calendar-entries'],
  },
  { name: 'structuredDataSourceIdentifier', type: 'text' },
  { name: 'structuredDataManual', type: 'json' },
  { name: 'structuredDataVersion', type: 'number', min: 1, defaultValue: 1 },
]

export const knowledgeGraphProjectionFields = (): Field[] => [
  {
    name: 'knowledgeGraphProjectionStatus',
    type: 'select',
    required: true,
    defaultValue: 'disabled',
    options: ['disabled', 'pending', 'projected', 'failed'],
  },
  { name: 'knowledgeGraphNodeKey', type: 'text' },
  {
    name: 'knowledgeGraphProjectionBoundary',
    type: 'json',
    admin: {
      description:
        'Optional Neo4j / knowledge-graph projection contract. PostgreSQL remains canonical.',
    },
  },
]

export const importExportHookFields = (): Field[] => [
  { name: 'importSourceSystem', type: 'text' },
  { name: 'importSourceIdentifier', type: 'text' },
  { name: 'importSourceChecksum', type: 'text' },
  { name: 'exportFormatVersion', type: 'number', min: 1, defaultValue: 1 },
  { name: 'exportOwnership', type: 'json' },
]

export const publicRenderHookFields = (kind: 'event' | 'timeline'): Field[] => [
  {
    name: 'publicRenderStrategy',
    type: 'select',
    required: true,
    defaultValue: 'default',
    options:
      kind === 'event'
        ? ['default', 'event-page', 'event-card-list']
        : ['default', 'timeline-page'],
  },
  { name: 'publicRenderVariant', type: 'text' },
  { name: 'publicRenderContext', type: 'json' },
]

export const milestoneSixPresentationHookFields = (): Field[] => [
  { name: 'eventCardVariant', type: 'text' },
  { name: 'eventListVariant', type: 'text' },
  { name: 'timelineEmbedVariant', type: 'text' },
  { name: 'timelineBlockVariant', type: 'text' },
]

export function isDiscoverable(record: Record<string, unknown>, now = new Date()): boolean {
  if (record.deletedAt || record.retentionMode === 'tombstone') return false
  if (record.retentionHold && record.retentionHold !== 'none') return true
  if (record.retentionMode === 'expire-at' && record.retentionExpiresAt) {
    return new Date(String(record.retentionExpiresAt)) > now
  }

  return record.retentionMode !== 'manual-burn'
}

export const siteScopeFields = (): Field[] => [
  { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
  { name: 'publication', type: 'relationship', relationTo: 'publications', index: true },
  { name: 'space', type: 'relationship', relationTo: 'spaces', index: true },
]

export const ownerFields = (): Field[] => [
  ...siteScopeFields(),
  { name: 'owner', type: 'relationship', relationTo: 'members', index: true },
]
