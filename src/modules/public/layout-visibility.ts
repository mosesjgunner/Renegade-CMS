/** Reusable presentation assets are not independently routable public pages. */
export function isPublicPageLayout(record: Record<string, unknown>): boolean {
  return (
    (!record.surface || record.surface === 'page') &&
    typeof record.path === 'string' &&
    !/^\/?__(?:global|pattern|template)__\//.test(record.path)
  )
}
