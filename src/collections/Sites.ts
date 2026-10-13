import type { CollectionConfig } from 'payload'
import { resolveOperatorGrantContext } from '../modules/operations/operator-grants'

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: { useAsTitle: 'name' },
  access: {
    create: ({ req }) => req.user?.role === 'owner',
    delete: ({ req }) => req.user?.role === 'owner',
    read: () => true,
    update: async ({ req }) => {
      if (!['owner', 'administrator'].includes(String(req.user?.role))) return false
      const grant = await resolveOperatorGrantContext(req.payload, req.user)
      if (!grant.authorized) return false
      return grant.isGlobalOwner ? true : { id: { in: grant.authorizedSiteIds } }
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        if (
          !data.commentReactionCodes ||
          !Array.isArray(data.commentReactionCodes) ||
          data.commentReactionCodes.length === 0
        ) {
          if (
            Array.isArray(originalDoc?.commentReactionCodes) &&
            originalDoc.commentReactionCodes.length > 0
          ) {
            data.commentReactionCodes = originalDoc.commentReactionCodes
          } else {
            data.commentReactionCodes = ['thumbs_up', 'heart', 'insightful', 'applause']
          }
        }
        if (!data.communityRegistrationPolicy) {
          data.communityRegistrationPolicy = originalDoc?.communityRegistrationPolicy ?? 'open'
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    {
      name: 'lifecycle',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['draft', 'active', 'archived'],
    },
    {
      name: 'communityRegistrationPolicy',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: ['open', 'invite', 'approval', 'disabled'],
      admin: {
        description:
          'Controls whether new members may register on this site: open sign-up, invite-only, staff approval required, or registration disabled.',
      },
    },
    {
      name: 'commentReactionCodes',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['thumbs_up', 'heart', 'insightful', 'applause'],
      options: ['thumbs_up', 'heart', 'insightful', 'applause'],
      admin: {
        description: 'Reaction codes members may use on canonical comments for this site.',
      },
    },
  ],
}
