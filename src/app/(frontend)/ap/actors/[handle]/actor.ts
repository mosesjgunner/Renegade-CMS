import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { actorDocument } from '@/modules/social/activitypub'

export async function publicationActor(handle: string) {
  const app = loadConfig()
  if (!app.networking.enabled) return null
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'publications',
    where: { slug: { equals: handle } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const publication = result.docs[0] as
    | { id: string; name: string; description?: string | null; slug: string }
    | undefined
  const key = process.env.ACTIVITYPUB_PUBLIC_KEY_PEM?.replace(/\\n/g, '\n')
  if (!publication || !key) return null
  const accounts = await payload.find({
    collection: 'social-accounts' as never,
    where: {
      and: [
        { publication: { equals: publication.id } },
        { network: { equals: 'activitypub' } },
        { capabilityState: { in: ['available', 'limited'] } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!accounts.docs[0]) return null
  const id = `${app.appUrl}/ap/actors/${handle}`
  return {
    payload,
    publication,
    account: accounts.docs[0] as unknown as { id: string; [key: string]: unknown },
    document: actorDocument({
      id,
      handle,
      name: publication.name,
      summary: publication.description,
      inbox: `${id}/inbox`,
      outbox: `${id}/outbox`,
      followers: `${id}/followers`,
      following: `${id}/following`,
      publicKeyPem: key,
    }),
  }
}

export const activityJson = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'content-type': 'application/activity+json; charset=utf-8', vary: 'Accept' },
  })
