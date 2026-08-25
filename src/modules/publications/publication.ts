export type PublicSite = {
  id: string
  slug: string
  name: string
  description: string | null
}

export const toPublicSite = (site: {
  id: string | number
  slug: string
  name: string
  description?: string | null
}): PublicSite => ({
  id: String(site.id),
  slug: site.slug,
  name: site.name,
  description: site.description ?? null,
})
