import type { CollectionConfig } from 'payload'

import { ownerFields } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
const states = [
  'draft',
  'review',
  'approved',
  'queued',
  'scheduled',
  'publishing',
  'published',
  'partially-published',
  'failed',
  'cancelled',
  'deletion-requested',
]
const networks = [
  'activitypub',
  'bluesky',
  'x',
  'threads',
  'facebook',
  'instagram',
  'linkedin',
  'youtube',
  'tiktok',
  'manual',
]
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Social Studio' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [],
})

export const SocialAccounts: CollectionConfig = {
  ...base('social-accounts', 'displayName'),
  fields: [
    ...ownerFields(),
    { name: 'displayName', type: 'text', required: true },
    { name: 'network', type: 'select', required: true, options: networks },
    {
      name: 'actorType',
      type: 'select',
      required: true,
      options: ['site', 'publication', 'space'],
    },
    { name: 'externalAccountId', type: 'text', required: true },
    {
      name: 'capabilityState',
      type: 'select',
      required: true,
      defaultValue: 'manual-handoff',
      options: ['available', 'limited', 'approval-required', 'manual-handoff', 'unavailable'],
    },
    { name: 'capabilities', type: 'json', required: true, defaultValue: {} },
    {
      name: 'credentialHealth',
      type: 'select',
      defaultValue: 'not-configured',
      options: ['healthy', 'expiring', 'expired', 'revoked', 'not-configured'],
    },
    { name: 'credentialExpiresAt', type: 'date' },
    { name: 'connectionReference', type: 'text' },
    { name: 'lastVerifiedAt', type: 'date' },
    { name: 'diagnostics', type: 'json' },
  ],
  indexes: [{ fields: ['site', 'network', 'externalAccountId'], unique: true }],
}
export const SocialDrafts: CollectionConfig = {
  ...base('social-drafts', 'title'),
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'sourceContent', type: 'relationship', relationTo: 'content' },
    { name: 'sourceRevision', type: 'relationship', relationTo: 'revision-records' },
    { name: 'campaign', type: 'relationship', relationTo: 'campaigns' as never },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', options: states },
    { name: 'requiresReview', type: 'checkbox', defaultValue: true },
    { name: 'provenance', type: 'json' },
    { name: 'canonicalUrl', type: 'text' },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}
export const SocialNetworkVariants: CollectionConfig = {
  ...base('social-network-variants', 'label'),
  fields: [
    {
      name: 'draft',
      type: 'relationship',
      relationTo: 'social-drafts' as never,
      required: true,
      index: true,
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'social-accounts' as never,
      required: true,
      index: true,
    },
    { name: 'label', type: 'text', required: true },
    { name: 'network', type: 'select', required: true, options: networks },
    { name: 'text', type: 'textarea', required: true },
    { name: 'linkUrl', type: 'text' },
    { name: 'attachments', type: 'relationship', relationTo: 'media-assets', hasMany: true },
    { name: 'validation', type: 'json', defaultValue: [] },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', options: states },
    { name: 'approvalHash', type: 'text' },
    { name: 'approvedAt', type: 'date' },
    { name: 'approvedBy', type: 'relationship', relationTo: 'users' },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
  ],
}
export const SocialQueueItems: CollectionConfig = {
  ...base('social-queue-items', 'idempotencyKey'),
  fields: [
    {
      name: 'variant',
      type: 'relationship',
      relationTo: 'social-network-variants' as never,
      required: true,
      index: true,
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'social-accounts' as never,
      required: true,
      index: true,
    },
    { name: 'scheduledFor', type: 'date', required: true, index: true },
    { name: 'timeZone', type: 'text', required: true },
    { name: 'status', type: 'select', required: true, defaultValue: 'scheduled', options: states },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
    { name: 'leaseUntil', type: 'date' },
    { name: 'leaseOwner', type: 'text' },
    { name: 'attemptCount', type: 'number', defaultValue: 0 },
    { name: 'nextAttemptAt', type: 'date' },
    { name: 'deadLetterReason', type: 'json' },
    { name: 'cancelledAt', type: 'date' },
  ],
}
export const SocialPublishAttempts: CollectionConfig = {
  ...base('social-publish-attempts', 'idempotencyKey'),
  fields: [
    {
      name: 'queueItem',
      type: 'relationship',
      relationTo: 'social-queue-items' as never,
      required: true,
      index: true,
    },
    {
      name: 'variant',
      type: 'relationship',
      relationTo: 'social-network-variants' as never,
      required: true,
    },
    { name: 'idempotencyKey', type: 'text', required: true, index: true },
    { name: 'attemptNumber', type: 'number', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['started', 'published', 'failed', 'unknown'],
    },
    { name: 'request', type: 'json' },
    { name: 'response', type: 'json' },
    { name: 'error', type: 'json' },
    { name: 'startedAt', type: 'date', required: true },
    { name: 'finishedAt', type: 'date' },
  ],
}
export const ExternalPosts: CollectionConfig = {
  ...base('external-posts', 'remoteId'),
  fields: [
    {
      name: 'variant',
      type: 'relationship',
      relationTo: 'social-network-variants' as never,
      required: true,
      unique: true,
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'social-accounts' as never,
      required: true,
    },
    { name: 'remoteId', type: 'text', required: true },
    { name: 'remoteUrl', type: 'text' },
    {
      name: 'remoteState',
      type: 'select',
      defaultValue: 'published',
      options: ['published', 'deleted', 'tombstoned', 'unknown', 'moderated'],
    },
    { name: 'publishedAt', type: 'date', required: true },
    { name: 'deleteRequestedAt', type: 'date' },
  ],
}
export const Campaigns: CollectionConfig = {
  ...base('campaigns', 'title'),
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'sourceContent', type: 'relationship', relationTo: 'content' },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', options: states },
    { name: 'launchAt', type: 'date' },
    { name: 'timeZone', type: 'text' },
    { name: 'goals', type: 'json' },
    { name: 'newsletterHook', type: 'json' },
    { name: 'productLinks', type: 'json' },
    { name: 'graphics', type: 'relationship', relationTo: 'graphic-documents', hasMany: true },
  ],
}
export const SocialCalendarEntries: CollectionConfig = {
  ...base('calendar-entry-audits', 'action'),
  fields: [
    {
      name: 'calendarEntry',
      type: 'relationship',
      relationTo: 'calendar-entries',
      required: true,
      index: true,
    },
    { name: 'action', type: 'text', required: true },
    { name: 'actor', type: 'relationship', relationTo: 'users' },
    { name: 'before', type: 'json' },
    { name: 'after', type: 'json' },
    { name: 'createdAt', type: 'date', required: true },
  ],
}
