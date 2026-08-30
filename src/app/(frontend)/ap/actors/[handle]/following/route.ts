import { activityJson, publicationActor } from '../actor'
export const dynamic = 'force-dynamic'
export async function GET(_: Request, context: { params: Promise<{ handle: string }> }) {
  const actor = await publicationActor((await context.params).handle)
  if (!actor) return Response.json({ error: 'Actor not found.' }, { status: 404 })
  const follows = await actor.payload.find({
    collection: 'network-relationships',
    where: {
      and: [
        { localSubjectType: { equals: 'activitypub-actor' } },
        { localSubjectId: { equals: actor.account.id } },
        { kind: { equals: 'follow' } },
        { direction: { equals: 'outbound' } },
        { state: { equals: 'active' } },
      ],
    },
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })
  return activityJson({
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: actor.document.following,
    type: 'OrderedCollection',
    orderedItems: follows.docs.map((follow: { remoteActor?: { canonicalId?: string } | string }) =>
      typeof follow.remoteActor === 'object' ? follow.remoteActor?.canonicalId : follow.remoteActor,
    ),
  })
}
