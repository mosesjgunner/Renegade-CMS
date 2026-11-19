import type { Surface } from './contracts'

/**
 * Domain template adapters (S2-08).
 *
 * A domain content type (article, product, …) is data; a surface is a
 * rendering frame. This registry is the one place that binds the two,
 * together with the domain renderer that owns the type's protected
 * behavior (product actions, profile privacy, podcast media) and the
 * slots a template for the type must provide. Domain behavior stays in
 * the domain renderers — adapters never reimplement it.
 *
 * Generic fallback contract: a content-type key with no registered
 * adapter resolves to the page surface and the generic content renderer,
 * with `rendererStatus: 'fallback'`. Registering an adapter for a new
 * key is the only step a future type needs; nothing else expands.
 */
export type DomainTemplateAdapter = {
  contentTypeKey: string
  surface: Surface
  /** Registered domain renderer identity (module/route that owns rendering). */
  rendererId: string
  rendererStatus: 'registered' | 'fallback'
  /** Slots a template for this type must provide. */
  requiredSlots: string[]
  /** Block component carrying the canonical body, when the type has one. */
  canonicalBlockComponent?: string
  notes: string
}

const adapters = new Map<string, DomainTemplateAdapter>()

export function registerDomainTemplateAdapter(adapter: DomainTemplateAdapter): void {
  if (!adapter.contentTypeKey || adapters.has(adapter.contentTypeKey))
    throw new Error(`Domain template adapter conflict: ${adapter.contentTypeKey}`)
  adapters.set(adapter.contentTypeKey, adapter)
}

export function adapterForContentType(contentTypeKey?: string | null): DomainTemplateAdapter {
  if (contentTypeKey && adapters.has(contentTypeKey)) return adapters.get(contentTypeKey)!
  return {
    contentTypeKey: contentTypeKey ?? 'page',
    surface: 'page',
    rendererId: 'presentation.generic-content',
    rendererStatus: 'fallback',
    requiredSlots: ['main'],
    notes:
      'Generic fallback: no domain adapter is registered for this key, so the ' +
      'page frame and generic content renderer apply until one is registered.',
  }
}

export function registeredContentTypeKeys(): string[] {
  return [...adapters.keys()]
}

registerDomainTemplateAdapter({
  contentTypeKey: 'article',
  surface: 'article',
  rendererId: 'editorial.article-view',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  canonicalBlockComponent: 'publisher.editorial',
  notes:
    'Articles render through the editorial article view. The canonical body ' +
    'lives in the editorial block slot and is never replaced by template sync.',
})
registerDomainTemplateAdapter({
  contentTypeKey: 'page',
  surface: 'page',
  rendererId: 'presentation.layout',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  notes: 'Pages render through the presentation layout pipeline.',
})
registerDomainTemplateAdapter({
  contentTypeKey: 'directory',
  surface: 'page',
  rendererId: 'public.hierarchy-view',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  notes:
    'Directories render through the public hierarchy view (the /browse ' +
    'surface); taxonomy and hierarchy behavior stay in the public layer.',
})
registerDomainTemplateAdapter({
  contentTypeKey: 'product',
  surface: 'page',
  rendererId: 'commerce.product-detail',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  notes:
    'Products render through the commerce product detail view; pricing, ' +
    'entitlement and purchase actions stay in the commerce domain.',
})
registerDomainTemplateAdapter({
  contentTypeKey: 'profile',
  surface: 'page',
  rendererId: 'community.member-profile',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  notes:
    'Profiles render through the member profile route; privacy and ' +
    'relationship behavior stay in the community domain.',
})
registerDomainTemplateAdapter({
  contentTypeKey: 'podcast',
  surface: 'page',
  rendererId: 'media.podcast-show',
  rendererStatus: 'registered',
  requiredSlots: ['main'],
  notes:
    'Podcasts render through the podcast show route; episode media and ' +
    'feed behavior stay in the media domain.',
})
