import config from '@payload-config'
import { getPayload } from 'payload'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { consumeApiRateLimit } from '@/modules/integrations/rate-limit'
import { loadProfileProjection, ProfileAccessError } from '@/modules/community/profile-projection'
import { communitySiteForHost } from '@/modules/community/site-scope'

const headers = { 'cache-control': 'private, no-store' }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? ''
  const query = (url.searchParams.get('q') ?? '').trim()
  const page = Number(url.searchParams.get('page') ?? '1')
  if (
    !siteId ||
    query.length > 60 ||
    (query && (query.length < 2 || !/^[\p{L}\p{N} -]+$/u.test(query))) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 20
  )
    return Response.json({ error: 'Invalid directory query.' }, { status: 400, headers })
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rate = consumeApiRateLimit(`community-directory:${key}`, false)
  if (!rate.allowed)
    return Response.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { ...headers, 'retry-after': String(rate.retryAfter) } },
    )
  const payload = await getPayload({ config })
  try {
    await communitySiteForHost(payload, request.headers.get('host'), siteId)
  } catch {
    return Response.json({ error: 'Site unavailable.' }, { status: 404, headers })
  }
  const viewerId = await currentMember(payload as never, readMemberSession(request.headers))
  const where = {
    and: [
      { visibility: { equals: 'public' } },
      { discoveryOptOut: { not_equals: true } },
      ...(query
        ? [
            {
              or: [
                { handle: { contains: query.toLowerCase() } },
                { displayName: { contains: query } },
              ],
            },
          ]
        : []),
    ],
  }
  const found = await payload.find({
    collection: 'profiles',
    where,
    limit: 20,
    page,
    sort: 'handle',
    depth: 0,
    overrideAccess: true,
  } as never)
  const profiles = []
  for (const item of found.docs) {
    try {
      const projected = await loadProfileProjection(
        payload,
        String((item as unknown as { handle: string }).handle),
        siteId,
        viewerId ?? undefined,
      )
      if (projected.profile.discoverable) profiles.push(projected.profile)
    } catch (error) {
      if (!(error instanceof ProfileAccessError)) throw error
    }
  }
  return Response.json({ profiles, page, hasNextPage: found.hasNextPage }, { headers })
}
