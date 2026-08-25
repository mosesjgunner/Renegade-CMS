import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { toPublicSite } from '@/modules/publications/publication'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const appConfig = loadConfig()
  const suppliedToken = request.headers.get('x-renegade-smoke-token')
  if (!appConfig.enableTestRoutes || suppliedToken !== appConfig.smokeTestToken) {
    return Response.json({ code: 'NOT_FOUND', message: 'Not found.' }, { status: 404 })
  }

  const payload = await getPayload({ config })
  const slug = 'stack-smoke-publication'
  const existing = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  const data = {
    name: 'Stack Smoke Publication',
    slug,
    description: 'Created through Next.js and Payload for the real-stack smoke proof.',
    lifecycle: 'active' as const,
  }
  const document = existing.docs[0]
    ? await payload.update({ collection: 'sites', id: existing.docs[0].id, data })
    : await payload.create({ collection: 'sites', data })

  return Response.json({ status: 'ok', site: toPublicSite(document) })
}
