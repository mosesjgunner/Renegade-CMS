import type { CollectionConfig } from 'payload'
import { ownerFields } from './canonical-shared'
const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
export const ContentReleases: CollectionConfig = {
  slug: 'content-releases',
  admin: { useAsTitle: 'title', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'content', type: 'relationship', relationTo: 'content' },
    { name: 'article', type: 'relationship', relationTo: 'article-family-content' },
    { name: 'product', type: 'relationship', relationTo: 'products' as never },
    {
      name: 'productRevision',
      type: 'text',
      admin: {
        description:
          'Approved Product revision pinned for storefront release; never a payment instruction.',
      },
    },
    { name: 'scheduledFor', type: 'date', index: true },
    { name: 'timeZone', type: 'text', defaultValue: 'UTC' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: ['draft', 'scheduled', 'released', 'cancelled'],
    },
    { name: 'lastScheduleMutationId', type: 'text' },
    { name: 'scheduleAudit', type: 'json', defaultValue: [] },
  ],
}
