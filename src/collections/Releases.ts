import type { CollectionConfig } from 'payload'
import { ownerFields } from './canonical-shared'
const staffOnly = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
export const ContentReleases: CollectionConfig = {
  slug: 'content-releases',
  admin: { useAsTitle: 'title', group: 'Publishing' },
  access: { create: staffOnly, delete: staffOnly, read: staffOnly, update: staffOnly },
  fields: [
    ...ownerFields(),
    { name: 'title', type: 'text', required: true },
    { name: 'name', type: 'text' },
    { name: 'purpose', type: 'textarea' },
    { name: 'ownerTeam', type: 'text' },
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
    { name: 'plannedInstant', type: 'date', index: true },
    { name: 'scheduledFor', type: 'date', index: true },
    { name: 'timeZone', type: 'text', defaultValue: 'UTC' },
    { name: 'labels', type: 'json', defaultValue: [] },
    { name: 'campaign', type: 'text' },
    { name: 'dependencies', type: 'json', defaultValue: [] },
    { name: 'releaseRevision', type: 'number', defaultValue: 1 },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        'draft',
        'in-review',
        'approved',
        'scheduled',
        'executing',
        'completed',
        'partially-failed',
        'failed',
        'cancelled',
        'rolled-back',
        // Legacy compatibility
        'released',
        'blocked',
        'partial-failure',
      ],
    },
    { name: 'lastScheduleMutationId', type: 'text' },
    { name: 'artifacts', type: 'json', defaultValue: [] },
    { name: 'gateSnapshot', type: 'json' },
    { name: 'approvals', type: 'json', defaultValue: [] },
    { name: 'sagaSteps', type: 'json', defaultValue: [] },
    { name: 'resultingUrls', type: 'json', defaultValue: [] },
    { name: 'leaseOwner', type: 'text' },
    { name: 'leaseExpiresAt', type: 'date' },
    { name: 'scheduleAudit', type: 'json', defaultValue: [] },
    {
      name: 'executionJob',
      type: 'relationship',
      relationTo: 'payload-jobs',
      admin: { readOnly: true },
    },
    { name: 'executionItems', type: 'json', defaultValue: [], admin: { readOnly: true } },
    { name: 'executionAudit', type: 'json', defaultValue: [], admin: { readOnly: true } },
  ],
}
