import type { CollectionBeforeChangeHook } from 'payload'
import { canDiscoverPublic } from './contracts'

// Editor saves are not public modifications. Public metadata is live, while
// body changes become public only on publication of the editorial revision.
const publicFields = [
  'site',
  'publication',
  'title',
  'subtitle',
  'summary',
  'excerpt',
  'slug',
  'canonicalPath',
  'contentType',
  'publishedAt',
  'authors',
  'sections',
  'categories',
  'topics',
  'tags',
  'series',
  'collections',
  'heroMedia',
  'seoTitle',
  'seoDescription',
  'seoCanonicalURL',
  'seoImage',
  'seoImageAlt',
  'discoveryOverrides',
]

export const trackPublicModification: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const next = { ...originalDoc, ...data }
  const visible = (record: Record<string, unknown>) =>
    canDiscoverPublic(record) && !record.seoNoIndex && !record.requiredEntitlement
  const metadataChanged = publicFields.some(
    (field) =>
      Object.hasOwn(data, field) &&
      JSON.stringify(data[field]) !== JSON.stringify(originalDoc?.[field]),
  )
  const publishedBodyChanged =
    next.status === 'published' &&
    (originalDoc?.status !== 'published' ||
      (Object.hasOwn(data, 'body') &&
        JSON.stringify(data.body) !== JSON.stringify(originalDoc?.body)))
  data.publicModifiedAt =
    visible(next) &&
    (!originalDoc || !visible(originalDoc) || metadataChanged || publishedBodyChanged)
      ? new Date().toISOString()
      : (originalDoc?.publicModifiedAt ?? null)
  return data
}
