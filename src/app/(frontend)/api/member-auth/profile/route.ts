import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, normalizeHandle, readMemberSession } from '@/modules/identity/member-identity'

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const handle = typeof body.handle === 'string' ? normalizeHandle(body.handle) : undefined
  if (body.handle !== undefined && !handle)
    return Response.json({ error: 'Use lowercase letters, numbers, and single hyphens.' }, { status: 400 })
  const found = await payload.find({ collection: 'profiles', where: { member: { equals: memberId } }, limit: 1, depth: 0, overrideAccess: true } as never)
  const profile = found.docs[0] as { id: string } | undefined
  if (!profile) return Response.json({ error: 'Profile not found.' }, { status: 404 })
  try {
    const updated = await payload.update({
      collection: 'profiles', id: profile.id, overrideAccess: true,
      data: {
        ...(typeof body.displayName === 'string' ? { displayName: body.displayName.trim().slice(0, 120) } : {}),
        ...(handle ? { handle } : {}),
        ...(typeof body.bio === 'string' ? { bio: body.bio.slice(0, 2000) } : {}),
        ...(typeof body.visibility === 'string' && ['public', 'unlisted', 'members', 'friends', 'private'].includes(body.visibility) ? { visibility: body.visibility } : {}),
        ...(body.links && typeof body.links === 'object' ? { links: body.links } : {}),
        ...(body.preferences && typeof body.preferences === 'object' ? { preferences: body.preferences } : {}),
      },
    } as never)
    return Response.json({ profile: updated })
  } catch { return Response.json({ error: 'That handle is unavailable.' }, { status: 409 }) }
}
