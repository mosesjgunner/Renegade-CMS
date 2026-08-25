export type PublicChange =
  | 'publish'
  | 'update'
  | 'unpublish'
  | 'discussion-post'
  | 'discussion-move'
  | 'discussion-merge'
  | 'taxonomy-move'
  | 'theme-change'
  | 'redirect-change'
  | 'navigation-change'
export function cacheTagsFor(change: PublicChange, id: string, publicationId?: string) {
  const base = [`public:${id}`, publicationId ? `publication:${publicationId}` : 'site:global']
  const surfaces: Record<PublicChange, string[]> = {
    publish: ['archives', 'search', 'sitemap', 'feed', 'metadata'],
    update: ['archives', 'search', 'sitemap', 'feed', 'metadata'],
    unpublish: ['archives', 'search', 'sitemap', 'feed', 'metadata'],
    'discussion-post': ['thread', 'forum', 'search', 'sitemap'],
    'discussion-move': ['thread', 'forum', 'search', 'sitemap', 'redirects'],
    'discussion-merge': ['thread', 'forum', 'search', 'sitemap', 'redirects'],
    'taxonomy-move': ['archives', 'search', 'sitemap', 'redirects'],
    'theme-change': ['theme', 'pages'],
    'redirect-change': ['redirects', 'sitemap'],
    'navigation-change': ['navigation', 'pages'],
  }
  return [...new Set([...base, ...surfaces[change].map((surface) => `surface:${surface}`)])]
}
