import config from '@payload-config'
import { getPayload } from 'payload'
import { loadConfig } from '@/modules/core/config'
import { webfinger } from '@/modules/social/activitypub'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const configValue = loadConfig()
  const resource = new URL(request.url).searchParams.get('resource')
  if (!configValue.networking.enabled || !resource)
    return Response.json({ error: 'Resource not found.' }, { status: 404 })
  const expectedHost = new URL(configValue.appUrl).host
  const match = /^acct:([^@]+)@([^@]+)$/i.exec(resource)
  if (!match || match[2].toLowerCase() !== expectedHost.toLowerCase())
    return Response.json({ error: 'Resource not found.' }, { status: 404 })
  const payload = await getPayload({ config })
  const publications = await payload.find({
    collection: 'publications',
    where: { slug: { equals: match[1] } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as { id: string; slug: string } | undefined
  if (!publication) return Response.json({ error: 'Resource not found.' }, { status: 404 })
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
  if (!accounts.docs[0]) return Response.json({ error: 'Resource not found.' }, { status: 404 })
  return Response.json(webfinger(resource, `${configValue.appUrl}/ap/actors/${publication.slug}`), {
    headers: { 'content-type': 'application/jrd+json' },
  })
}
