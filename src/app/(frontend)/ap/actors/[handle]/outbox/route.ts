import { activityForContent } from '@/modules/social/activitypub'
import { activityJson, publicationActor } from '../actor'

export const dynamic = 'force-dynamic'
export async function GET(_: Request, context: { params: Promise<{ handle: string }> }) {
  const actor = await publicationActor((await context.params).handle)
  if (!actor) return Response.json({ error: 'Actor not found.' }, { status: 404 })
  const content = await actor.payload.find({
    collection: 'content',
    where: {
      and: [
        { publication: { equals: actor.publication.id } },
        { status: { in: ['published', 'updated'] } },
        { visibility: { equals: 'public' } },
      ],
    },
    sort: '-publishedAt',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const orderedItems = content.docs.map(
    (item: {
      canonicalPath?: string | null
      title?: string | null
      summary?: string | null
      publishedAt?: string | null
      updatedAtEditorial?: string | null
      status?: string | null
    }) =>
      activityForContent({
        actor: actor.document.id,
        canonicalUrl: `${new URL(actor.document.id).origin}${item.canonicalPath ?? ''}`,
        title: item.title ?? '',
        summary: item.summary,
        publishedAt: item.publishedAt ?? undefined,
        updatedAt: item.updatedAtEditorial ?? undefined,
        action: item.status === 'updated' ? 'Update' : 'Create',
      }),
  )
  return activityJson({
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: actor.document.outbox,
    type: 'OrderedCollection',
    totalItems: orderedItems.length,
    orderedItems,
  })
}
