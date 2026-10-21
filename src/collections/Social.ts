import { ValidationError, type CollectionConfig } from 'payload'

import { ownerFields } from './canonical-shared'
import {
  operatorSiteCreateAccess,
  operatorSiteReadAccess,
  operatorSiteUpdateAccess,
  operatorRelatedSiteAccess,
} from '../modules/operations/operator-grants'

const states = [
  'draft',
  'review',
  'approved',
  'queued',
  'scheduled',
  'publishing',
  'unknown',
  'published',
  'partially-published',
  'failed',
  'cancelled',
  'deletion-requested',
]
const networks = [
  'activitypub',
  'mastodon',
  'bluesky',
  'x',
  'threads',
  'facebook',
  'instagram',
  'linkedin',
  'youtube',
  'tiktok',
  'pinterest',
  'telegram',
  'discord',
  'manual',
]
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Social Studio' },
  access: {
    create: operatorSiteCreateAccess,
    delete: operatorSiteReadAccess,
    read: operatorSiteReadAccess,
    update: operatorSiteUpdateAccess,
  },
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
    {
      name: 'capabilities',
      type: 'json',
      required: true,
      defaultValue: {},
      admin: {
        description:
          'Provider-declared capabilities only; this is not a promise of every network feature.',
      },
    },
    {
      name: 'credentialHealth',
      type: 'select',
      defaultValue: 'not-configured',
      options: ['healthy', 'expiring', 'expired', 'revoked', 'not-configured'],
    },
    { name: 'credentialExpiresAt', type: 'date' },
    { name: 'connectionReference', type: 'text' },
    { name: 'lastVerifiedAt', type: 'date' },
    {
      name: 'diagnostics',
      type: 'json',
      admin: {
        description:
          'Connection, credential, and provider diagnostics. Secrets are never stored here.',
      },
    },
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
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: states,
      access: { create: () => false, update: () => false },
    },
    { name: 'requiresReview', type: 'checkbox', defaultValue: true },
    { name: 'provenance', type: 'json' },
    { name: 'canonicalUrl', type: 'text' },
    { name: 'createdBy', type: 'relationship', relationTo: 'users' },
  ],
}
export const SocialNetworkVariants: CollectionConfig = {
  ...base('social-network-variants', 'label'),
  access: operatorRelatedSiteAccess('draft.site', 'social-drafts'),
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
    {
      name: 'aiDistributionProposals',
      type: 'ui',
      admin: {
        components: { Field: '@/modules/admin/AiProposalActionField#AiDistributionActionField' },
      },
    },
    { name: 'linkUrl', type: 'text' },
    { name: 'attachments', type: 'relationship', relationTo: 'media-assets', hasMany: true },
    { name: 'validation', type: 'json', defaultValue: [] },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: states,
      access: { create: () => false, update: () => false },
    },
    { name: 'approvalHash', access: { create: () => false, update: () => false }, type: 'text' },
    { name: 'approvedAt', access: { create: () => false, update: () => false }, type: 'date' },
    {
      name: 'approvedBy',
      access: { create: () => false, update: () => false },
      type: 'relationship',
      relationTo: 'users',
    },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
  ],
}
export const SocialQueueItems: CollectionConfig = {
  ...base('social-queue-items', 'idempotencyKey'),
  access: {
    ...operatorRelatedSiteAccess('account.site', 'social-accounts'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
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
    {
      name: 'nextAttemptAt',
      type: 'date',
      admin: {
        description:
          'Next bounded Payload Job retry, including a provider retry-after when supplied.',
      },
    },
    {
      name: 'deadLetterReason',
      type: 'json',
      admin: {
        description:
          'Terminal provider failure. Reconnect-required and manual-handoff messages explain the required action.',
      },
    },
    { name: 'cancelledAt', type: 'date' },
  ],
}
export const SocialPublishAttempts: CollectionConfig = {
  ...base('social-publish-attempts', 'idempotencyKey'),
  access: {
    ...operatorRelatedSiteAccess('variant.draft.site', 'social-network-variants'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
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
  access: {
    ...operatorRelatedSiteAccess('account.site', 'social-accounts'),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
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
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: states,
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: ['public', 'private'],
    },
    { name: 'launchAt', type: 'date' },
    { name: 'startAt', type: 'date' },
    { name: 'endAt', type: 'date' },
    { name: 'timeZone', type: 'text' },
    {
      name: 'goal',
      type: 'json',
      admin: {
        description: 'Canonical goal amount/currency and transparent public progress snapshot.',
      },
    },
    { name: 'goals', type: 'json' },
    { name: 'milestones', type: 'json', defaultValue: [] },
    {
      name: 'updates',
      type: 'json',
      defaultValue: [],
      admin: {
        description:
          'Each update includes visibility; private content must not be exposed by public projections.',
      },
    },
    {
      name: 'tiers',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Reward tiers link existing Products and entitlement/fulfillment references.',
      },
    },
    {
      name: 'progress',
      type: 'json',
      defaultValue: { raisedMinor: '0', supporterCount: 0, history: [] },
    },
    { name: 'calendarEntry', type: 'relationship', relationTo: 'calendar-entries' },
    {
      name: 'supporterVisibility',
      type: 'select',
      defaultValue: 'aggregate',
      options: ['aggregate', 'named-opt-in', 'private'],
    },
    { name: 'newsletterHook', type: 'json' },
    { name: 'productLinks', type: 'json' },
    { name: 'graphics', type: 'relationship', relationTo: 'graphic-documents', hasMany: true },
  ],
}
export const SocialCalendarEntries: CollectionConfig = {
  ...base('calendar-entry-audits', 'action'),
  access: {
    create: () => false,
    update: () => false,
    delete: () => false,
    read: async ({ req }) => {
      const allowed = await operatorSiteReadAccess({ req })
      return allowed === true ? true : allowed ? { actor: { equals: req.user!.id } } : false
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        const record = { ...originalDoc, ...data }
        if (!record.calendarEntry && !record.article)
          throw new ValidationError({
            collection: 'calendar-entry-audits',
            errors: [
              {
                path: 'article',
                message: 'A calendar entry or canonical article source is required.',
              },
            ],
          })
        return data
      },
    ],
  },
  fields: [
    {
      name: 'calendarEntry',
      type: 'relationship',
      relationTo: 'calendar-entries',
      required: false,
      index: true,
    },
    { name: 'article', type: 'relationship', relationTo: 'article-family-content', index: true },
    { name: 'action', type: 'text', required: true },
    { name: 'actor', type: 'relationship', relationTo: 'users' },
    { name: 'before', type: 'json' },
    { name: 'after', type: 'json' },
    { name: 'createdAt', type: 'date', required: true },
  ],
}
