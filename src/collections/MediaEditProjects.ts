import type { CollectionConfig } from 'payload'

const internal = {
  admin: { hidden: true },
  lockDocuments: false as const,
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
}

export const MediaEditProjects: CollectionConfig = {
  ...internal,
  slug: 'media-edit-projects',
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'owner', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    { name: 'revision', type: 'number', required: true },
    { name: 'history', type: 'json', required: true },
  ],
}

export const MediaEditExports: CollectionConfig = {
  ...internal,
  slug: 'media-edit-exports',
  fields: [
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'owner', type: 'relationship', relationTo: 'members', required: true, index: true },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'media-edit-projects',
      required: true,
      index: true,
    },
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'projectRevision', type: 'number', required: true },
    { name: 'profile', type: 'text', required: true },
    { name: 'state', type: 'text', required: true, index: true },
    { name: 'snapshot', type: 'json', required: true },
    { name: 'jobId', type: 'text' },
    { name: 'video', type: 'relationship', relationTo: 'media-assets' },
    { name: 'thumbnail', type: 'relationship', relationTo: 'media-assets' },
    { name: 'report', type: 'json' },
    { name: 'error', type: 'text' },
  ],
}
