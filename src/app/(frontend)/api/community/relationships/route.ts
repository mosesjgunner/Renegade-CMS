import config from '@payload-config'
import { getPayload } from 'payload'
import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { consumeApiRateLimit } from '@/modules/integrations/rate-limit'
import {
  ProfileAccessError,
  relationId,
  setMemberRelation,
} from '@/modules/community/profile-projection'
import { communitySiteForHost } from '@/modules/community/site-scope'

const headers = { 'cache-control': 'private, no-store' }
type Edge = { kind: string; object: unknown }

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId)
    return Response.json({ error: 'Authentication required.' }, { status: 401, headers })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? ''
  const targetMemberId = url.searchParams.get('targetMemberId') ?? ''
  if (!siteId) return Response.json({ error: 'siteId is required.' }, { status: 400, headers })
  try {
    await communitySiteForHost(payload, request.headers.get('host'), siteId)
  } catch {
    return Response.json({ error: 'Site unavailable.' }, { status: 404, headers })
  }
  if (!targetMemberId) {
    const found = await payload.find({
      collection: 'relationships',
      where: {
        and: [
          { site: { equals: siteId } },
          { subject: { equals: memberId } },
          { kind: { in: ['follow', 'block', 'mute'] } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    } as never)
    return Response.json(
      {
        relationships: (found.docs as unknown as Edge[]).map((doc) => ({
          kind: doc.kind,
          targetMemberId: relationId(doc.object),
          siteId,
        })),
      },
      { headers },
    )
  }
  const found = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { site: { equals: siteId } },
        { subject: { equals: memberId } },
        {
          pairKey: {
            in: ['follow', 'block', 'mute'].flatMap((kind) => [
              `${kind}:${siteId}:${memberId}:${targetMemberId}`,
              `${kind}:${memberId}:${targetMemberId}`,
            ]),
          },
        },
        { status: { equals: 'active' } },
      ],
    },
    limit: 3,
    depth: 0,
    overrideAccess: true,
  } as never)
  return Response.json(
    {
      following: (found.docs as unknown as Edge[]).some((doc) => doc.kind === 'follow'),
      blocked: (found.docs as unknown as Edge[]).some((doc) => doc.kind === 'block'),
      muted: (found.docs as unknown as Edge[]).some((doc) => doc.kind === 'mute'),
    },
    { headers },
  )
}

async function mutate(request: Request, active: boolean) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token.' }, { status: 403, headers })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId)
    return Response.json({ error: 'Authentication required.' }, { status: 401, headers })
  const rate = consumeApiRateLimit(`community-relationship:${memberId}`, true)
  if (!rate.allowed)
    return Response.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { ...headers, 'retry-after': String(rate.retryAfter) } },
    )
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { siteId, targetMemberId, kind } = body
  if (
    typeof siteId !== 'string' ||
    typeof targetMemberId !== 'string' ||
    !['follow', 'block', 'mute'].includes(String(kind))
  )
    return Response.json(
      { error: 'siteId, targetMemberId and a supported kind are required.' },
      { status: 400, headers },
    )
  try {
    await communitySiteForHost(payload, request.headers.get('host'), siteId)
  } catch {
    return Response.json({ error: 'Site unavailable.' }, { status: 404, headers })
  }
  try {
    await setMemberRelation(payload, {
      siteId,
      subjectId: memberId,
      targetId: targetMemberId,
      kind: kind as 'follow' | 'block' | 'mute',
      active,
    })
    return Response.json({ success: true }, { headers })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof ProfileAccessError ? error.message : 'Relationship update failed.',
      },
      { status: error instanceof ProfileAccessError ? error.status : 500, headers },
    )
  }
}

export async function POST(request: Request) {
  return mutate(request, true)
}
export async function DELETE(request: Request) {
  return mutate(request, false)
}
