import config from '@payload-config'
import { getPayload } from 'payload'
import { requestNewsletterSubscription } from '@/modules/audience/service'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'
import { communitySiteForHost } from '@/modules/community/site-scope'
import { normalizeEmailAddress } from '@/modules/audience/contracts'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!takeAudiencePublicRequest(ip, 'subscribe'))
    return Response.json({ error: 'Please try again shortly.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as Record<string, string>
  try {
    const payload = await getPayload({ config })
    if (typeof body.email !== 'string') throw new Error('Enter a valid email address.')
    normalizeEmailAddress(body.email)
    let siteId = await communitySiteForHost(
      payload,
      request.headers.get('host') ?? new URL(request.url).host,
      body.siteId,
    )
    let listId = body.listId

    if (!siteId || !listId) {
      const lists = await payload.find({
        collection: 'audience-lists',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (lists.docs[0]) {
        if (!listId) listId = String(lists.docs[0].id)
      }
    }

    if (!listId && siteId) {
      const activeLists = await payload.find({
        collection: 'audience-lists',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (activeLists.docs[0]) {
        listId = String(activeLists.docs[0].id)
      } else {
        const createdList = (await payload.create({
          collection: 'audience-lists',
          data: {
            site: siteId,
            name: 'Newsletter',
            status: 'active',
            doubleOptIn: true,
          },
          overrideAccess: true,
        })) as { id: string | number }
        listId = String(createdList.id)
      }
    }

    if (listId && !siteId) {
      const listDoc = (await payload.findByID({
        collection: 'audience-lists',
        id: listId,
        depth: 0,
        overrideAccess: true,
      })) as { site?: unknown }
      if (listDoc?.site) {
        const s = listDoc.site
        siteId = typeof s === 'object' && s && 'id' in s ? String(s.id) : String(s)
      }
    }

    const result = await requestNewsletterSubscription(payload, {
      siteId: siteId ?? '',
      listId: listId ?? '',
      email: body.email ?? '',
      locale: body.locale ?? 'en',
      consentWording: 'I consent to receive newsletter updates from this publication.',
      source: 'public-subscribe',
    })
    return Response.json({ status: result.status }, { status: 202 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Subscription unavailable.' },
      { status: 400 },
    )
  }
}
