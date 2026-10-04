import type { Payload } from 'payload'
import type { PresentationDocument } from './contracts'
import { canDiscoverPublic } from '../public/contracts'
import { isRegisteredCollection } from '../public/registered-collections'
import type { PublishedPresentation } from './snapshots'

export async function hydratePublicLayoutRecord(payload: Payload, record: Record<string, unknown>) {
  const snapshot = record.publishedPresentation as PublishedPresentation | undefined
  if (!snapshot) return record
  const site = typeof record.site === 'string' ? record.site : (record.site as { id?: string })?.id
  if (snapshot.document.siteId !== site) throw new Error('Published presentation scope mismatch.')
  return { ...record, publishedPresentation: { ...snapshot,
    document: await hydratePublicQueries(payload, snapshot.document),
  } }
}

/** Resolve public query blocks on a copy, never in the stored presentation. */
export async function hydratePublicQueries(payload: Payload, document: PresentationDocument) {
  const next = structuredClone(document)
  for (const blocks of Object.values(next.slots)) {
    for (const block of blocks ?? []) {
      if (block.hidden || !['publisher.article-list', 'publisher.feature-grid', 'publisher.article-grid', 'publisher.event-list'].includes(block.component)) continue
      const query = block.props.query && typeof block.props.query === 'object'
        ? block.props.query as Record<string, unknown> : {}
      const collection = String(query.collection ?? (block.component === 'publisher.event-list' ? 'events' : 'content'))
      block.props.queryResults = []
      if (!['content', 'events', 'albums', 'discussions'].includes(collection) || !isRegisteredCollection(payload, collection)) continue
      const limit = Math.min(24, Math.max(1, Math.trunc(Number(query.limit)) || 6))
      const statuses = collection === 'content' ? ['published', 'updated', 'scheduled']
        : collection === 'events' ? ['published', 'scheduled']
        : collection === 'discussions' ? ['open'] : undefined
      const result = await payload.find({
        collection,
        where: { and: [{ site: { equals: document.siteId } }, ...(statuses ? [{ status: { in: statuses } }] : [])] },
        limit: limit * 4,
        sort: query.sort === 'oldest' ? 'createdAt' : query.sort === 'title' ? 'title' : '-createdAt',
        depth: 1,
        overrideAccess: true,
      } as never)
      block.props.queryResults = (result.docs as unknown as Record<string, unknown>[])
        .filter((row) => {
          const site = typeof row.site === 'string' ? row.site : (row.site as { id?: string })?.id
          const forum = row.forum && typeof row.forum === 'object' ? row.forum as Record<string, unknown> : undefined
          return site === document.siteId && canDiscoverPublic(row) && !row.requiredEntitlement &&
            (!forum || canDiscoverPublic(forum)) && typeof row.canonicalPath === 'string' &&
            row.canonicalPath.startsWith('/') && !row.canonicalPath.startsWith('//')
        })
        .slice(0, limit)
        .map((row) => ({ id: String(row.id), title: String(row.title ?? row.name), href: row.canonicalPath }))
    }
  }
  return next
}
