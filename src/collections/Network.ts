import type { CollectionConfig, GlobalConfig } from 'payload'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
const internal = { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly }
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Network', hidden: true },
  access: internal,
  fields: [],
})
const text = (name: string, required = false) => ({ name, type: 'text' as const, required })

/** Configuration is separate from credentials: private signing keys never enter Payload. */
export const NetworkSettings: GlobalConfig = {
  slug: 'network-settings',
  label: 'Network',
  admin: { group: 'Settings' },
  access: { read: staffOnly, update: ({ req }) => req.user?.role === 'owner' },
  fields: [
    text('canonicalOrigin'),
    { name: 'enabledProtocols', type: 'json', defaultValue: [] },
    {
      name: 'registrationPolicy',
      type: 'select',
      defaultValue: 'closed',
      options: ['closed', 'invite', 'open'],
    },
    {
      name: 'remotePolicy',
      type: 'json',
      defaultValue: { default: 'allow', allowlist: false, hideBlockedReferences: true },
      admin: {
        description:
          'Optional network policy. Blocks take precedence; no automated participation decisions.',
      },
    },
    { name: 'publicContact', type: 'json' },
  ],
}
export const NetworkSigningKeys: CollectionConfig = {
  ...base('network-signing-keys', 'keyId'),
  fields: [
    text('keyId', true),
    text('algorithm', true),
    { name: 'publicKey', type: 'textarea', required: true },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'retiring', 'retired'],
    },
    { name: 'notBefore', type: 'date', required: true },
    { name: 'retiredAt', type: 'date' },
  ],
  indexes: [{ fields: ['keyId'], unique: true }],
}
export const RemoteInstances: CollectionConfig = {
  ...base('remote-instances', 'origin'),
  fields: [
    text('origin', true),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'unknown',
      options: ['unknown', 'active', 'blocked', 'allowed'],
    },
    { name: 'metadata', type: 'json' },
    { name: 'moderationNote', type: 'textarea' },
    { name: 'lastSeenAt', type: 'date' },
  ],
  indexes: [{ fields: ['origin'], unique: true }],
}
export const RemoteActors: CollectionConfig = {
  ...base('remote-actors', 'canonicalId'),
  fields: [
    {
      name: 'instance',
      type: 'relationship',
      relationTo: 'remote-instances' as never,
      required: true,
    },
    text('canonicalId', true),
    text('handle'),
    { name: 'profile', type: 'json' },
    { name: 'moderationNote', type: 'textarea' },
    { name: 'lastFetchedAt', type: 'date' },
  ],
  indexes: [{ fields: ['canonicalId'], unique: true }],
}
export const RemoteObjects: CollectionConfig = {
  ...base('remote-objects', 'canonicalId'),
  fields: [
    {
      name: 'instance',
      type: 'relationship',
      relationTo: 'remote-instances' as never,
      required: true,
    },
    { name: 'actor', type: 'relationship', relationTo: 'remote-actors' as never },
    text('canonicalId', true),
    text('objectType'),
    { name: 'reference', type: 'json' },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'visible',
      options: ['visible', 'hidden', 'removed'],
    },
    { name: 'lastFetchedAt', type: 'date' },
  ],
  indexes: [{ fields: ['canonicalId'], unique: true }],
}
export const NetworkRelationships: CollectionConfig = {
  ...base('network-relationships', 'idempotencyKey'),
  fields: [
    text('localSubjectType', true),
    text('localSubjectId', true),
    {
      name: 'remoteActor',
      type: 'relationship',
      relationTo: 'remote-actors' as never,
      required: true,
    },
    { name: 'kind', type: 'select', required: true, options: ['follow', 'block', 'mute'] },
    {
      name: 'direction',
      type: 'select',
      required: true,
      defaultValue: 'outbound',
      options: ['inbound', 'outbound'],
    },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: ['pending', 'active', 'rejected', 'ended'],
    },
    text('idempotencyKey', true),
    { name: 'remoteActivityId', type: 'text' },
    { name: 'endedAt', type: 'date' },
  ],
  indexes: [{ fields: ['idempotencyKey'], unique: true }],
}
export const InboundNetworkActivities: CollectionConfig = {
  ...base('inbound-network-activities', 'dedupeKey'),
  fields: [
    text('protocol', true),
    { name: 'remoteActor', type: 'relationship', relationTo: 'remote-actors' as never },
    text('remoteActivityId', true),
    text('dedupeKey', true),
    { name: 'receivedAt', type: 'date', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'received',
      options: ['received', 'accepted', 'rejected', 'processed'],
    },
    { name: 'envelope', type: 'json', required: true },
  ],
  indexes: [{ fields: ['dedupeKey'], unique: true }],
}
export const OutboundNetworkDeliveries: CollectionConfig = {
  ...base('outbound-network-deliveries', 'idempotencyKey'),
  fields: [
    text('protocol', true),
    {
      name: 'remoteInstance',
      type: 'relationship',
      relationTo: 'remote-instances' as never,
      required: true,
    },
    text('target', true),
    text('idempotencyKey', true),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'sending', 'delivered', 'failed', 'blocked'],
    },
    { name: 'envelope', type: 'json', required: true },
    { name: 'nextAttemptAt', type: 'date' },
  ],
  indexes: [{ fields: ['idempotencyKey'], unique: true }],
}
export const NetworkDeliveryAttempts: CollectionConfig = {
  ...base('network-delivery-attempts', 'idempotencyKey'),
  fields: [
    {
      name: 'delivery',
      type: 'relationship',
      relationTo: 'outbound-network-deliveries' as never,
      required: true,
    },
    text('idempotencyKey', true),
    { name: 'attempt', type: 'number', required: true },
    { name: 'startedAt', type: 'date', required: true },
    { name: 'finishedAt', type: 'date' },
    { name: 'outcome', type: 'json' },
  ],
}
export const NetworkAccessDecisions: CollectionConfig = {
  ...base('network-access-decisions', 'subject'),
  fields: [
    text('subject', true),
    { name: 'subjectType', type: 'select', required: true, options: ['instance', 'actor'] },
    { name: 'decision', type: 'select', required: true, options: ['allow', 'block'] },
    text('reason'),
    { name: 'expiresAt', type: 'date' },
    { name: 'note', type: 'textarea' },
  ],
  indexes: [{ fields: ['subject'], unique: true }],
}
export const NetworkAuditEvents: CollectionConfig = {
  ...base('network-audit-events', 'action'),
  fields: [
    text('action', true),
    text('subject', true),
    { name: 'actor', type: 'relationship', relationTo: 'users' as never },
    { name: 'details', type: 'json' },
  ],
}
