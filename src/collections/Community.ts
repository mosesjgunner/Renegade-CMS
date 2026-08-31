import type { CollectionConfig } from 'payload'

import {
  canonicalSlug,
  moderationStateOptions,
  ownerFields,
  retentionFields,
  siteScopeFields,
  visibilityOptions,
} from './canonical-shared'
import {
  assertCalendarRange,
  assertDiscussionShape,
} from '../modules/publications/information-architecture'

const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))

export const ForumSections: CollectionConfig = {
  slug: 'forum-sections',
  admin: { useAsTitle: 'name', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    ...siteScopeFields(),
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'description', type: 'textarea' },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
}

export const Forums: CollectionConfig = {
  slug: 'forums',
  admin: { useAsTitle: 'name', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    ...siteScopeFields(),
    { name: 'section', type: 'relationship', relationTo: 'forum-sections', required: true },
    { name: 'parent', type: 'relationship', relationTo: 'forums' },
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, validate: canonicalSlug },
    { name: 'description', type: 'textarea' },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
  ],
  indexes: [{ fields: ['site', 'parent', 'slug'], unique: true }],
}

export const Discussions: CollectionConfig = {
  slug: 'discussions',
  admin: { useAsTitle: 'title', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data) assertDiscussionShape(data as Parameters<typeof assertDiscussionShape>[0])
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    { name: 'kind', type: 'select', required: true, options: ['attached', 'thread'] },
    { name: 'title', type: 'text', required: true },
    {
      name: 'forum',
      type: 'relationship',
      relationTo: 'forums',
      admin: { condition: (_, siblingData) => siblingData.kind === 'thread' },
    },
    {
      name: 'attachedTo',
      type: 'relationship',
      relationTo: ['content', 'media-assets', 'albums'],
      admin: { condition: (_, siblingData) => siblingData.kind === 'attached' },
    },
    { name: 'promotedContent', type: 'relationship', relationTo: 'content' },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'locked', 'archived'],
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    {
      name: 'moderationState',
      type: 'select',
      required: true,
      defaultValue: 'clear',
      options: moderationStateOptions,
    },
    {
      name: 'commentsPolicy',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'members', 'closed'],
    },
    ...retentionFields(),
  ],
}

export const DiscussionPosts: CollectionConfig = {
  slug: 'discussion-posts',
  admin: { useAsTitle: 'permalink', group: 'Community' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  fields: [
    {
      name: 'discussion',
      type: 'relationship',
      relationTo: 'discussions',
      required: true,
      index: true,
    },
    { name: 'authorMember', type: 'relationship', relationTo: 'members' },
    { name: 'authorGuest', type: 'relationship', relationTo: 'authors' },
    { name: 'body', type: 'textarea', required: true },
    { name: 'parent', type: 'relationship', relationTo: 'discussion-posts' },
    { name: 'quote', type: 'relationship', relationTo: 'discussion-posts' },
    { name: 'displayOrder', type: 'number', required: true, defaultValue: 0 },
    {
      name: 'permalink',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Stable post URL key; do not derive it from editable text.' },
    },
    { name: 'paginationAnchor', type: 'text', required: true },
    { name: 'attachments', type: 'relationship', relationTo: 'media-assets', hasMany: true },
    { name: 'sources', type: 'relationship', relationTo: 'sources', hasMany: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'published',
      options: ['draft', 'published', 'hidden', 'removed'],
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'public',
      options: visibilityOptions,
    },
    { name: 'solution', type: 'checkbox', defaultValue: false },
    { name: 'helpful', type: 'checkbox', defaultValue: false },
    {
      name: 'moderationState',
      type: 'select',
      required: true,
      defaultValue: 'clear',
      options: moderationStateOptions,
    },
    ...retentionFields(),
  ],
}

export const CalendarEntries: CollectionConfig = {
  slug: 'calendar-entries',
  admin: { useAsTitle: 'title', group: 'Calendar' },
  access: { create: staffOnly, delete: staffOnly, read: () => true, update: staffOnly },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data) assertCalendarRange(data as Parameters<typeof assertCalendarRange>[0])
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'allDay', type: 'checkbox', defaultValue: false },
    { name: 'startsAt', type: 'date', required: true },
    { name: 'endsAt', type: 'date' },
    {
      name: 'timeZone',
      type: 'text',
      required: true,
      defaultValue: 'UTC',
      admin: { description: 'IANA timezone, for example America/Chicago.' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'scheduled',
      options: ['draft', 'scheduled', 'in-progress', 'completed', 'cancelled', 'archived'],
    },
    {
      name: 'visibility',
      type: 'select',
      required: true,
      defaultValue: 'private',
      options: visibilityOptions,
    },
    { name: 'audience', type: 'json' },
    { name: 'calendarPlacement', type: 'text' },
    {
      name: 'recurrence',
      type: 'json',
      admin: {
        description:
          'One record is a series boundary; external calendar sync is intentionally deferred.',
      },
    },
    {
      name: 'rsvpRegistration',
      type: 'json',
      admin: { description: 'Hook for RSVP or registration modules.' },
    },
    { name: 'conflictMetadata', type: 'json' },
    { name: 'canonicalPath', type: 'text', unique: true },
    { name: 'event', type: 'relationship', relationTo: 'events', index: true },
    { name: 'structuredData', type: 'json' },
    {
      name: 'references',
      type: 'relationship',
      relationTo: ['content', 'publications', 'media-assets', 'events'],
      hasMany: true,
    },
    ...retentionFields(),
  ],
}
