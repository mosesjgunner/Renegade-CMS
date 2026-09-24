import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { loadProfileProjection, ProfileAccessError } from '@/modules/community/profile-projection'
import { saveMemberProfile } from '@/modules/community/profile-service'
import { communitySiteForHost } from '@/modules/community/site-scope'

const noStore = { 'cache-control': 'private, no-store' }

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const payload = await getPayload({ config })
  const siteId =
    new URL(request.url).searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? ''
  const viewerId = await currentMember(payload as never, readMemberSession(request.headers))
  try {
    const scopedSiteId = await communitySiteForHost(payload, request.headers.get('host'), siteId)
    const result = await loadProfileProjection(
      payload,
      (await params).handle,
      scopedSiteId,
      viewerId ?? undefined,
    )
    return Response.json(result, { headers: noStore })
  } catch (error) {
    return Response.json(
      { error: error instanceof ProfileAccessError ? error.message : 'Profile unavailable.' },
      { status: error instanceof ProfileAccessError ? error.status : 500, headers: noStore },
    )
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  try {
    const saved = await saveMemberProfile(payload, memberId, body, (await params).handle)
    return Response.json({ profile: saved }, { headers: noStore })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Profile update failed.' },
      { status: error instanceof ProfileAccessError ? error.status : 400, headers: noStore },
    )
  }
}
