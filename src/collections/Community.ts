import { APIError, type CollectionConfig } from 'payload'
import { searchProjectionHooks } from '../modules/public/search-projection'
import {
  operatorSiteCreateAccess,
  operatorSiteReadAccess,
  operatorSiteUpdateAccess,
  operatorRelatedSiteAccess,
  preserveRecordRelationshipsAccess,
} from '../modules/operations/operator-grants'

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
import {
  assignRecordSemanticPath,
  assertRecordSemanticPath,
  recordPublishedPathHistory,
} from '../modules/public/semantic-url-service'

export const ForumSections: CollectionConfig = {
  slug: 'forum-sections',
  admin: { useAsTitle: 'name', group: 'Community' },
  access: {
    create: operatorSiteCreateAccess,
    delete: operatorSiteReadAccess,
    read: () => true,
    update: operatorSiteUpdateAccess,
  },
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
  access: {
    create: operatorSiteCreateAccess,
    delete: operatorSiteReadAccess,
    read: () => true,
    update: preserveRecordRelationshipsAccess('forums', ['site'], operatorSiteUpdateAccess),
  },
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const site = String(data?.site ?? originalDoc?.site ?? '')
        const section = await req.payload.findByID({
          collection: 'forum-sections',
          id: String(data?.section ?? originalDoc?.section ?? ''),
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (String(section.site) !== site)
          throw new APIError('Forum section must belong to the same site.', 400)
        let parent = data?.parent === undefined ? originalDoc?.parent : data.parent
        const seen = new Set<string>(originalDoc?.id ? [String(originalDoc.id)] : [])
        while (parent) {
          if (seen.has(String(parent)) || seen.size > 100)
            throw new APIError('Forum hierarchy contains a cycle.', 400)
          seen.add(String(parent))
          const record = await req.payload.findByID({
            collection: 'forums',
            id: String(parent),
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (String(record.site) !== site)
            throw new APIError('Parent forum must belong to the same site.', 400)
          parent = record.parent
        }
        return data
      },
    ],
  },
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
  access: {
    create: operatorSiteCreateAccess,
    delete: operatorSiteReadAccess,
    read: operatorSiteReadAccess,
    update: preserveRecordRelationshipsAccess(
      'discussions',
      ['site', 'owner', 'forum'],
      operatorSiteUpdateAccess,
    ),
  },
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req, context }) => {
        if (data) assertDiscussionShape(data as Parameters<typeof assertDiscussionShape>[0])
        const id = (value: unknown) =>
          typeof value === 'object' && value !== null
            ? String((value as { id?: unknown }).id ?? '')
            : String(value ?? '')
        const site = id(data?.site ?? originalDoc?.site)
        if ((data?.kind ?? originalDoc?.kind) === 'attached') {
          const attached = (data?.attachedTo ?? originalDoc?.attachedTo) as
            | { relationTo?: string; value?: unknown }
            | undefined
          if (
            !attached?.relationTo ||
            !['content', 'media-assets', 'albums'].includes(attached.relationTo)
          )
            throw new APIError('Invalid discussion target.', 400)
          const target = await req.payload
            .findByID({
              collection: attached.relationTo as 'content',
              id: id(attached.value),
              depth: 0,
              overrideAccess: true,
              req,
            })
            .catch(() => null)
          if (!target || id(target.site) !== site)
            throw new APIError('Discussion target must belong to the same site.', 400)
          return data
        }
        const forum = await req.payload
          .findByID({
            collection: 'forums',
            id: id(data?.forum ?? originalDoc?.forum),
            depth: 0,
            overrideAccess: true,
            req,
          })
          .catch(() => null)
        if (!forum || id(forum.site) !== site)
          throw new APIError('Forum must belong to the discussion site.', 400)
        data = (await assignRecordSemanticPath({
          payload: req.payload,
          collection: 'discussions',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
          allowCanonicalPathChange: context?.semanticRouteChange === true,
        })) as typeof data
        await assertRecordSemanticPath({
          payload: req.payload,
          collection: 'discussions',
          data: data as Record<string, unknown> | null | undefined,
          originalDoc: originalDoc as Record<string, unknown> | null | undefined,
        })
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (doc.kind === 'attached') return doc
        await recordPublishedPathHistory({
          collection: 'discussions',
          doc: doc as unknown as Record<string, unknown>,
          previousDoc: previousDoc as unknown as Record<string, unknown>,
          operation: operation as 'create' | 'update',
          payload: req.payload,
        })
        return doc
      },
      ...searchProjectionHooks('discussions').afterChange,
    ],
    afterDelete: searchProjectionHooks('discussions').afterDelete,
  },
  indexes: [{ fields: ['site', 'canonicalPath'], unique: true }],
  fields: [
    ...ownerFields(),
    { name: 'kind', type: 'select', required: true, options: ['attached', 'thread'] },
    { name: 'title', type: 'text', required: true },
    { name: 'pinned', type: 'checkbox', defaultValue: false },
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
    { name: 'canonicalPath', type: 'text', required: true },
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
  access: operatorRelatedSiteAccess('discussion.site', 'discussions'),
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (operation === 'update')
          for (const key of [
            'discussion',
            'authorMember',
            'authorGuest',
            'parent',
            'quote',
            'displayOrder',
            'permalink',
          ]) {
            if (
              data[key] !== undefined &&
              JSON.stringify(data[key]) !== JSON.stringify(originalDoc[key])
            )
              throw new APIError('Post attribution and location cannot be changed.', 400)
          }
        const discussionId = String(data.discussion ?? originalDoc?.discussion ?? '')
        for (const key of ['parent', 'quote']) {
          if (!data[key]) continue
          const parent = await req.payload
            .findByID({
              collection: 'discussion-posts',
              id: String(data[key]),
              depth: 0,
              overrideAccess: true,
              req,
            })
            .catch(() => null)
          if (!parent || String(parent.discussion) !== discussionId)
            throw new APIError('Referenced post must belong to the same discussion.', 400)
        }
        return data
      },
    ],
  },
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
  admin: { useAsTitle: 'title', group: 'Calendar', hidden: true },
  access: { create: () => false, delete: () => false, read: () => false, update: () => false },
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
