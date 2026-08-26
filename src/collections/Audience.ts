import type { CollectionConfig, Field } from 'payload'
import { ownerFields, retentionFields } from './canonical-shared'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
const base = (slug: string, title: string, group = 'Audience'): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [],
})
const scope = () => [...ownerFields()]
const ref = (name: string, relationTo: string | string[], required = false): Field =>
  ({ name, type: 'relationship', relationTo: relationTo as never, required, index: true }) as Field
const status = (name: string, options: string[], defaultValue?: string): Field =>
  ({
    name,
    type: 'select',
    required: true,
    options,
    ...(defaultValue ? { defaultValue } : {}),
  }) as Field

export const FormDefinitions: CollectionConfig = {
  ...base('form-definitions', 'name'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    status(
      'template',
      [
        'contact',
        'newsletter-signup',
        'volunteer',
        'sponsorship-inquiry',
        'advertiser-media-kit',
        'donation-interest',
        'reader-submission',
        'confidential-tip',
        'event-rsvp',
        'survey',
        'poll',
        'application',
        'waitlist',
        'quote-request',
        'product-preorder-interest',
        'custom',
      ],
      'custom',
    ),
    { name: 'publicPath', type: 'text', required: true, unique: true },
    status('visibility', ['public', 'private', 'members'], 'public'),
    { name: 'activeSchema', type: 'relationship', relationTo: 'form-schemas' as never },
    { name: 'settings', type: 'json', required: true, defaultValue: {} },
    ...retentionFields(),
  ],
}
export const FormSchemas: CollectionConfig = {
  ...base('form-schemas', 'version'),
  fields: [
    ref('form', 'form-definitions', true),
    { name: 'version', type: 'number', required: true },
    status('state', ['draft', 'published', 'retired'], 'draft'),
    { name: 'locale', type: 'text', required: true, defaultValue: 'en' },
    { name: 'schema', type: 'json', required: true },
    { name: 'consentText', type: 'textarea' },
    {
      name: 'consentRevision',
      type: 'text',
      admin: { description: 'Immutable reviewed legal/consent revision used by this locale.' },
    },
    status(
      'consentTranslationStatus',
      ['not-required', 'reviewed', 'outdated', 'machine-generated'],
      'not-required',
    ),
    {
      name: 'translationProject',
      type: 'text',
      admin: {
        description:
          'Prompt 2 TranslationProject identifier; legal text is never silently machine substituted.',
      },
    },
    {
      name: 'localeCompleteness',
      type: 'json',
      admin: { description: 'Prompt 2 LocaleCompleteness snapshot for this schema revision.' },
    },
    { name: 'brandSnapshot', type: 'json' },
    { name: 'publishedAt', type: 'date' },
  ],
  indexes: [{ fields: ['form', 'version'], unique: true }],
}
export const FormSubmissions: CollectionConfig = {
  ...base('form-submissions', 'id'),
  fields: [
    ...scope(),
    ref('form', 'form-definitions', true),
    ref('schema', 'form-schemas', true),
    status(
      'status',
      ['received', 'challenged', 'held', 'triaged', 'accepted', 'rejected', 'redacted', 'expired'],
      'received',
    ),
    { name: 'locale', type: 'text', required: true },
    { name: 'values', type: 'json', required: true, access: { read: staffOnly } },
    { name: 'consentSnapshot', type: 'json', access: { read: staffOnly } },
    {
      name: 'privacyClass',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: ['standard', 'sensitive', 'confidential'],
    },
    { name: 'abuse', type: 'json', access: { read: staffOnly } },
    ref('contact', 'contacts'),
    ref('organization', 'organizations'),
    ref('workflowItem', 'workflow-items'),
    { name: 'idempotencyKey', type: 'text', index: true },
    ...retentionFields(),
  ],
}
export const SubmissionAttachments: CollectionConfig = {
  ...base('submission-attachments', 'filename'),
  fields: [
    ref('submission', 'form-submissions', true),
    ref('media', 'media-assets'),
    { name: 'filename', type: 'text', required: true },
    { name: 'contentType', type: 'text' },
    { name: 'size', type: 'number' },
    status('scanStatus', ['pending', 'clean', 'rejected'], 'pending'),
    { name: 'private', type: 'checkbox', defaultValue: true },
  ],
}
export const Contacts: CollectionConfig = {
  ...base('contacts', 'displayName', 'CRM'),
  fields: [
    ...scope(),
    { name: 'displayName', type: 'text', required: true },
    { name: 'email', type: 'email', index: true },
    { name: 'emailHash', type: 'text', index: true },
    ref('member', 'members'),
    status('status', ['lead', 'active', 'inactive', 'blocked', 'archived'], 'lead'),
    { name: 'profile', type: 'json' },
    {
      name: 'mergeState',
      type: 'select',
      defaultValue: 'clear',
      options: ['clear', 'proposed', 'merged'],
    },
    ref('mergedInto', 'contacts'),
    ...retentionFields(),
  ],
}
export const Organizations: CollectionConfig = {
  ...base('organizations', 'name', 'CRM'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    { name: 'domain', type: 'text', index: true },
    status('status', ['lead', 'active', 'inactive', 'archived'], 'lead'),
    { name: 'metadata', type: 'json' },
    ...retentionFields(),
  ],
}
export const RelationshipRecords: CollectionConfig = {
  ...base('relationship-records', 'id', 'CRM'),
  fields: [
    ...scope(),
    ref('contact', 'contacts', true),
    ref('organization', 'organizations'),
    { name: 'role', type: 'text' },
    { name: 'related', type: 'json' },
    { name: 'context', type: 'json' },
  ],
}
export const ContactTags: CollectionConfig = {
  ...base('contact-tags', 'name', 'CRM'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    { name: 'color', type: 'text' },
  ],
  indexes: [{ fields: ['site', 'name'], unique: true }],
}
export const ContactTaggings: CollectionConfig = {
  ...base('contact-taggings', 'id', 'CRM'),
  fields: [
    ref('contact', 'contacts', true),
    ref('tag', 'contact-tags', true),
    { name: 'source', type: 'text' },
  ],
  indexes: [{ fields: ['contact', 'tag'], unique: true }],
}
export const InteractionRecords: CollectionConfig = {
  ...base('interaction-records', 'occurredAt', 'CRM'),
  fields: [
    ...scope(),
    ref('contact', 'contacts'),
    ref('organization', 'organizations'),
    status(
      'kind',
      ['form', 'email', 'call', 'meeting', 'note', 'campaign', 'order', 'contribution'],
      'form',
    ),
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'summary', type: 'textarea' },
    { name: 'references', type: 'json' },
  ],
}
export const RelationshipNotes: CollectionConfig = {
  ...base('relationship-notes', 'id', 'CRM'),
  fields: [
    ...scope(),
    ref('contact', 'contacts'),
    ref('organization', 'organizations'),
    { name: 'body', type: 'textarea', required: true, access: { read: staffOnly } },
    { name: 'private', type: 'checkbox', defaultValue: true },
  ],
}
export const DealsOrOpportunities: CollectionConfig = {
  ...base('deals-opportunities', 'title', 'CRM'),
  fields: [
    ...scope(),
    ref('contact', 'contacts'),
    ref('organization', 'organizations'),
    ref('campaign', 'campaigns'),
    { name: 'title', type: 'text', required: true },
    status(
      'stage',
      ['new', 'qualified', 'proposal', 'creative-approval', 'placement', 'won', 'lost'],
      'new',
    ),
    { name: 'amount', type: 'number' },
    { name: 'currency', type: 'text', defaultValue: 'USD' },
    ref('ownerAssignment', 'owner-assignments'),
    ref('nextAction', 'next-actions'),
  ],
}
export const OwnerAssignments: CollectionConfig = {
  ...base('owner-assignments', 'id', 'CRM'),
  fields: [
    ...scope(),
    ref('assignee', 'users'),
    { name: 'subject', type: 'json', required: true },
    { name: 'assignedAt', type: 'date', required: true },
  ],
}
export const NextActions: CollectionConfig = {
  ...base('next-actions', 'title', 'CRM'),
  fields: [
    ...scope(),
    { name: 'title', type: 'text', required: true },
    { name: 'dueAt', type: 'date' },
    status('status', ['open', 'done', 'cancelled'], 'open'),
    { name: 'subject', type: 'json', required: true },
  ],
}
export const WorkflowItems: CollectionConfig = {
  ...base('workflow-items', 'title', 'Operations'),
  fields: [
    ...scope(),
    { name: 'title', type: 'text', required: true },
    status(
      'type',
      [
        'campaign-launch',
        'sponsor-approval',
        'social-package',
        'event-production',
        'product-launch',
        'media-processing',
        'moderation',
        'outreach',
        'form-intake',
        'partner-follow-up',
        'system-exception',
        'custom',
      ],
      'custom',
    ),
    status(
      'status',
      ['open', 'in-progress', 'blocked', 'completed', 'cancelled', 'reopened'],
      'open',
    ),
    status('priority', ['low', 'normal', 'high', 'urgent'], 'normal'),
    ref('assignee', 'users'),
    { name: 'watchers', type: 'relationship', relationTo: 'users' as never, hasMany: true },
    { name: 'startsAt', type: 'date' },
    { name: 'dueAt', type: 'date' },
    { name: 'checklist', type: 'json', defaultValue: [] },
    { name: 'comments', type: 'json', defaultValue: [] },
    {
      name: 'attachments',
      type: 'relationship',
      relationTo: 'media-assets' as never,
      hasMany: true,
    },
    { name: 'sourceReferences', type: 'json' },
    {
      name: 'dependencies',
      type: 'relationship',
      relationTo: 'workflow-items' as never,
      hasMany: true,
    },
    { name: 'outcome', type: 'json' },
    { name: 'audit', type: 'json', defaultValue: [] },
    ref('calendarEntry', 'calendar-entries'),
  ],
}
export const AudienceLists: CollectionConfig = {
  ...base('audience-lists', 'name'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    status('status', ['active', 'archived'], 'active'),
    { name: 'doubleOptIn', type: 'checkbox', defaultValue: true },
  ],
}
export const AudienceSegments: CollectionConfig = {
  ...base('audience-segments', 'name'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    { name: 'definition', type: 'json', required: true },
    { name: 'consentBasisRequired', type: 'checkbox', defaultValue: true },
    status('status', ['active', 'archived'], 'active'),
  ],
}
export const AudienceMemberships: CollectionConfig = {
  ...base('audience-memberships', 'id'),
  fields: [
    ref('subscriber', 'subscribers', true),
    ref('audienceList', 'audience-lists', true),
    status('status', ['pending', 'active', 'unsubscribed', 'suppressed'], 'pending'),
    { name: 'confirmedAt', type: 'date' },
    { name: 'source', type: 'text', required: true, defaultValue: 'form' },
  ],
  indexes: [{ fields: ['subscriber', 'audienceList'], unique: true }],
}
export const SubscriberConfirmationTokens: CollectionConfig = {
  ...base('subscriber-confirmation-tokens', 'tokenHash'),
  fields: [
    ref('subscriber', 'subscribers', true),
    ref('audienceList', 'audience-lists'),
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'usedAt', type: 'date' },
    { name: 'locale', type: 'text', required: true },
    { name: 'consentWording', type: 'textarea', required: true },
  ],
}
export const Subscribers: CollectionConfig = {
  ...base('subscribers', 'emailHash'),
  fields: [
    ...scope(),
    { name: 'email', type: 'email', required: true, access: { read: staffOnly } },
    { name: 'emailHash', type: 'text', required: true, index: true },
    ref('member', 'members'),
    ref('contact', 'contacts'),
    status('status', ['pending', 'active', 'unsubscribed', 'suppressed'], 'pending'),
    { name: 'verifiedAt', type: 'date' },
    { name: 'globalUnsubscribedAt', type: 'date' },
  ],
  indexes: [{ fields: ['site', 'emailHash'], unique: true }],
}
export const ConsentEvents: CollectionConfig = {
  ...base('consent-events', 'occurredAt'),
  fields: [
    ...scope(),
    ref('subscriber', 'subscribers'),
    ref('contact', 'contacts'),
    ref('formSubmission', 'form-submissions'),
    ref('audienceList', 'audience-lists'),
    status(
      'event',
      [
        'requested',
        'double-opt-in-confirmed',
        'unsubscribe',
        'resubscribe',
        'imported',
        'bounce',
        'complaint',
      ],
      'requested',
    ),
    { name: 'basis', type: 'text', required: true },
    { name: 'wording', type: 'textarea' },
    { name: 'locale', type: 'text' },
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'evidence', type: 'json' },
  ],
}
export const Preferences: CollectionConfig = {
  ...base('preferences', 'id'),
  fields: [
    ref('subscriber', 'subscribers', true),
    ref('audienceList', 'audience-lists'),
    { name: 'preferences', type: 'json', required: true },
  ],
}
export const Suppressions: CollectionConfig = {
  ...base('suppressions', 'emailHash'),
  fields: [
    ...scope(),
    { name: 'emailHash', type: 'text', required: true, index: true },
    status('reason', ['unsubscribe', 'bounce', 'complaint', 'provider'], 'unsubscribe'),
    { name: 'provider', type: 'text' },
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'global', type: 'checkbox', defaultValue: true },
  ],
  indexes: [{ fields: ['site', 'emailHash', 'reason'], unique: true }],
}
export const EmailMessages: CollectionConfig = {
  ...base('email-messages', 'subject', 'Audience'),
  fields: [
    ...scope(),
    { name: 'subject', type: 'text', required: true },
    { name: 'blocks', type: 'json', required: true },
    { name: 'kind', type: 'select', required: true, options: ['transactional', 'bulk', 'digest'] },
    status(
      'status',
      ['draft', 'review', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed'],
      'draft',
    ),
    { name: 'scheduledFor', type: 'date' },
    { name: 'idempotencyKey', type: 'text', unique: true },
    { name: 'tracking', type: 'json' },
    {
      name: 'audience',
      type: 'json',
      admin: { description: 'Lists/segments frozen at review; no hidden personalization.' },
    },
    { name: 'reviewedAt', type: 'date' },
    { name: 'cancelCutoffAt', type: 'date' },
    { name: 'translationProject', type: 'text' },
    { name: 'localeCompleteness', type: 'json' },
  ],
}
export const DeliveryIdentities: CollectionConfig = {
  ...base('delivery-identities', 'emailHash'),
  fields: [
    ...scope(),
    { name: 'emailHash', type: 'text', required: true, index: true },
    { name: 'provider', type: 'text', required: true },
    { name: 'providerRecipientId', type: 'text' },
    { name: 'metadata', type: 'json' },
  ],
}
export const EmailDeliveries: CollectionConfig = {
  ...base('email-deliveries', 'idempotencyKey'),
  fields: [
    ref('message', 'email-messages', true),
    ref('subscriber', 'subscribers'),
    { name: 'recipientEmail', type: 'email', required: true, access: { read: staffOnly } },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
    status(
      'status',
      ['queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'cancelled', 'failed'],
      'queued',
    ),
    { name: 'provider', type: 'text' },
    { name: 'providerMessageId', type: 'text' },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'outcome', type: 'json' },
  ],
}
export const ActivityEvents: CollectionConfig = {
  ...base('activity-events', 'type', 'Notifications'),
  fields: [
    ...scope(),
    { name: 'type', type: 'text', required: true, index: true },
    { name: 'actor', type: 'json' },
    { name: 'object', type: 'json' },
    { name: 'payload', type: 'json', access: { read: staffOnly } },
    { name: 'visibilitySnapshot', type: 'json' },
    { name: 'occurredAt', type: 'date', required: true },
  ],
}
export const Notifications: CollectionConfig = {
  ...base('notifications', 'id', 'Notifications'),
  fields: [
    ref('activityEvent', 'activity-events', true),
    ref('recipientMember', 'members', true),
    status('status', ['unread', 'read', 'archived'], 'unread'),
    { name: 'channels', type: 'json', required: true },
    { name: 'readAt', type: 'date' },
    { name: 'mutedUntil', type: 'date' },
  ],
  indexes: [{ fields: ['activityEvent', 'recipientMember'], unique: true }],
}
export const NotificationPreferences: CollectionConfig = {
  ...base('notification-preferences', 'id', 'Notifications'),
  fields: [
    ref('member', 'members', true),
    { name: 'rules', type: 'json', required: true },
    { name: 'quietHours', type: 'json' },
  ],
}
export const NotificationChannels: CollectionConfig = {
  ...base('notification-channels', 'address', 'Notifications'),
  fields: [
    ref('member', 'members', true),
    status('kind', ['in-app', 'email', 'push'], 'in-app'),
    { name: 'address', type: 'text' },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'verifiedAt', type: 'date' },
  ],
}
export const DigestDefinitions: CollectionConfig = {
  ...base('digest-definitions', 'name', 'Notifications'),
  fields: [
    ...scope(),
    ref('member', 'members'),
    { name: 'name', type: 'text', required: true },
    { name: 'filters', type: 'json', required: true },
    status('cadence', ['immediate', 'daily', 'weekly', 'custom'], 'weekly'),
    { name: 'channels', type: 'json', required: true },
    { name: 'template', type: 'json' },
    { name: 'reviewRequired', type: 'checkbox', defaultValue: false },
  ],
}
export const DigestRuns: CollectionConfig = {
  ...base('digest-runs', 'id', 'Notifications'),
  fields: [
    ref('definition', 'digest-definitions', true),
    { name: 'sourceEventIds', type: 'json', required: true },
    { name: 'frozenAt', type: 'date', required: true },
    status('status', ['draft', 'queued', 'sent', 'failed', 'cancelled'], 'draft'),
    { name: 'outcome', type: 'json' },
  ],
}
export const DeliveryReceipts: CollectionConfig = {
  ...base('delivery-receipts', 'id', 'Notifications'),
  fields: [
    ref('delivery', 'email-deliveries'),
    ref('notification', 'notifications'),
    status('channel', ['email', 'push', 'in-app'], 'in-app'),
    status('status', ['queued', 'sent', 'delivered', 'failed'], 'queued'),
    { name: 'providerEvent', type: 'json' },
  ],
}
export const AutomationDefinitions: CollectionConfig = {
  ...base('automation-definitions', 'name', 'Operations'),
  fields: [
    ...scope(),
    { name: 'name', type: 'text', required: true },
    status('status', ['draft', 'active', 'paused', 'archived'], 'draft'),
    { name: 'trigger', type: 'json', required: true },
    { name: 'conditions', type: 'json', defaultValue: [] },
    { name: 'actions', type: 'json', required: true },
    { name: 'requiresApproval', type: 'checkbox', defaultValue: true },
  ],
}
export const AutomationRuns: CollectionConfig = {
  ...base('automation-runs', 'idempotencyKey', 'Operations'),
  fields: [
    ref('definition', 'automation-definitions', true),
    ref('sourceEvent', 'activity-events'),
    { name: 'idempotencyKey', type: 'text', required: true, unique: true },
    status('status', ['queued', 'running', 'completed', 'failed', 'paused'], 'queued'),
    { name: 'outcome', type: 'json' },
  ],
}
export const AutomationFailures: CollectionConfig = {
  ...base('automation-failures', 'id', 'Operations'),
  fields: [
    ref('run', 'automation-runs', true),
    { name: 'actionIndex', type: 'number', required: true },
    { name: 'error', type: 'json', required: true },
    { name: 'retryable', type: 'checkbox', defaultValue: true },
    { name: 'resolvedAt', type: 'date' },
  ],
}
