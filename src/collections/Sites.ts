import type { CollectionConfig } from 'payload'

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: { useAsTitle: 'name' },
  access: { read: () => true },
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
