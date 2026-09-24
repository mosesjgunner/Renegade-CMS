import config from '@payload-config'
import { getPayload } from 'payload'

import {
  csrfCookie,
  currentMember,
  issueCsrfToken,
  readMemberSession,
} from '@/modules/identity/member-identity'
import { loadConfig } from '@/modules/core/config'
import { communitySiteForHost } from '@/modules/community/site-scope'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const profile = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const siteId = await communitySiteForHost(payload, request.headers.get('host')).catch(() => null)
  const existingCsrf = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === 'renegade-member-csrf')?.[1]
  const csrfToken = existingCsrf ?? issueCsrfToken()
  const rawProfile = profile.docs[0] as unknown as Record<string, unknown> | undefined
  // This authenticated self-service view deliberately flattens only the
  // relationship switches. It does not return member contact or credentials.
  const preferences = rawProfile?.preferences as Record<string, unknown> | undefined
  const memberProfile = rawProfile
    ? {
        ...rawProfile,
        relationshipNotifications:
          (preferences?.relationshipNotifications as Record<string, boolean> | undefined) ?? {},
      }
    : null
  return Response.json(
    { memberId, profile: memberProfile, siteId },
    existingCsrf
      ? undefined
      : { headers: { 'set-cookie': csrfCookie(csrfToken, loadConfig().secureCookies) } },
  )
}
