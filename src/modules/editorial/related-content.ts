import { canDiscoverPublic, type PublicState } from '../public/contracts'

type RelatedRecord = PublicState & {
  id?: unknown
  site?: unknown
  title?: unknown
  canonicalPath?: unknown
  requiredEntitlement?: unknown
}
const idOf = (value: unknown): string =>
  value && typeof value === 'object' && 'id' in value ? String(value.id) : String(value ?? '')

/** Populated canonical relationships only; never expose private or cross-site targets. */
export function publicRelatedContent(value: unknown, site: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as RelatedRecord
    if (
      !canDiscoverPublic(record) ||
      idOf(record.site) !== idOf(site) ||
      record.requiredEntitlement ||
      typeof record.title !== 'string' ||
      typeof record.canonicalPath !== 'string' ||
      !record.canonicalPath.startsWith('/') ||
      record.canonicalPath.startsWith('//')
    )
      return []
    return [{ id: idOf(record.id), title: record.title, href: record.canonicalPath }]
  })
}
