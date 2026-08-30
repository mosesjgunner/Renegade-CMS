import type { CollectionConfig, Field } from 'payload'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

const scopeFields = (): Field[] => [
  { name: 'scopeKind', type: 'select', required: true, options: ['site', 'publication', 'space'] },
  { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
  { name: 'publication', type: 'relationship', relationTo: 'publications', index: true },
  { name: 'space', type: 'relationship', relationTo: 'spaces', index: true },
  { name: 'scopeKey', type: 'text', required: true, index: true, admin: { readOnly: true } },
]

const scopeKeyHook = ({ data }: { data?: Record<string, unknown> }) => {
  if (!data) return data
  const value = (key: 'site' | 'publication' | 'space') => {
    const item = data[key]
    return typeof item === 'string' ? item : (item as { value?: string } | undefined)?.value
  }
  const scopeKind = data.scopeKind as 'site' | 'publication' | 'space' | undefined
  if (!scopeKind || !value(scopeKind))
    throw new Error('A matching team scope relationship is required.')
  data.scopeKey = `${scopeKind}:${value(scopeKind)}`
  return data
}

const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Team' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  hooks: { beforeValidate: [scopeKeyHook] },
  fields: [],
})

export const TeamMemberships: CollectionConfig = {
  ...base('team-memberships', 'scopeKey'),
  fields: [
    ...scopeFields(),
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: ['owner', 'administrator', 'editor', 'author', 'moderator', 'commerce-operator'],
    },
    { name: 'grants', type: 'json', required: true, defaultValue: [] },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'suspended', 'revoked'],
    },
    { name: 'acceptedAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
  ],
  indexes: [{ fields: ['scopeKey', 'member'], unique: true }],
}

export const TeamInvitations: CollectionConfig = {
  ...base('team-invitations', 'scopeKey'),
  fields: [
    ...scopeFields(),
    {
      name: 'emailHash',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'SHA-256 of normalized email; no invitation token or email is retained.',
      },
    },
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: ['owner', 'administrator', 'editor', 'author', 'moderator', 'commerce-operator'],
    },
    { name: 'grants', type: 'json', required: true, defaultValue: [] },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'acceptedAt', type: 'date' },
    { name: 'acceptedBy', type: 'relationship', relationTo: 'members' },
    { name: 'revokedAt', type: 'date' },
    { name: 'createdBy', type: 'relationship', relationTo: 'members' },
  ],
}

export const TeamAuditEvents: CollectionConfig = {
  ...base('team-audit-events', 'action'),
  fields: [
    ...scopeFields(),
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'actorMember', type: 'relationship', relationTo: 'members', index: true },
    { name: 'subjectMember', type: 'relationship', relationTo: 'members', index: true },
    { name: 'details', type: 'json', required: true, defaultValue: {} },
    { name: 'occurredAt', type: 'date', required: true, index: true },
  ],
}

export const EditorialAssignments: CollectionConfig = {
  ...base('editorial-assignments', 'title'),
  fields: [
    ...scopeFields(),
    { name: 'content', type: 'relationship', relationTo: 'content', required: true, index: true },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      index: true,
    },
    {
      name: 'revision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
      index: true,
    },
    { name: 'title', type: 'text', required: true },
    { name: 'assignee', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'assignedBy', type: 'relationship', relationTo: 'members', required: true },
    { name: 'dueAt', type: 'date', index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'in-progress', 'completed', 'cancelled'],
    },
    { name: 'metadata', type: 'json', defaultValue: {} },
  ],
}

export const EditorialDiscussions: CollectionConfig = {
  ...base('editorial-discussions', 'subject'),
  fields: [
    ...scopeFields(),
    { name: 'content', type: 'relationship', relationTo: 'content', required: true, index: true },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'article-family-content' as never,
      index: true,
    },
    {
      name: 'revision',
      type: 'relationship',
      relationTo: 'revision-records' as never,
      index: true,
    },
    { name: 'subject', type: 'text', required: true },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'resolved'],
    },
    { name: 'openedBy', type: 'relationship', relationTo: 'members', required: true },
    { name: 'resolvedBy', type: 'relationship', relationTo: 'members' },
    { name: 'resolvedAt', type: 'date' },
  ],
}

export const EditorialComments: CollectionConfig = {
  ...base('editorial-comments', 'id'),
  fields: [
    ...scopeFields(),
    {
      name: 'discussion',
      type: 'relationship',
      relationTo: 'editorial-discussions' as never,
      required: true,
      index: true,
    },
    { name: 'author', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'mentions', type: 'relationship', relationTo: 'members', hasMany: true },
    { name: 'replyTo', type: 'relationship', relationTo: 'editorial-comments' as never },
  ],
}

export const WorkConversations: CollectionConfig = {
  ...base('work-conversations', 'title'),
  fields: [
    ...scopeFields(),
    { name: 'title', type: 'text', required: true },
    {
      name: 'participants',
      type: 'relationship',
      relationTo: 'members',
      hasMany: true,
      required: true,
    },
    { name: 'content', type: 'relationship', relationTo: 'content' },
    { name: 'article', type: 'relationship', relationTo: 'article-family-content' as never },
    { name: 'revision', type: 'relationship', relationTo: 'revision-records' as never },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'closed'],
    },
    {
      name: 'privateOnly',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      admin: {
        description:
          'Staff-only; intentionally excluded from ActivityPub and public discussion transport.',
      },
    },
  ],
}

export const WorkMessages: CollectionConfig = {
  ...base('work-messages', 'id'),
  fields: [
    ...scopeFields(),
    {
      name: 'conversation',
      type: 'relationship',
      relationTo: 'work-conversations' as never,
      required: true,
      index: true,
    },
    { name: 'author', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'mentions', type: 'relationship', relationTo: 'members', hasMany: true },
  ],
}
