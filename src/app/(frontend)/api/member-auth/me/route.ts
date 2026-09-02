import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const profile = await payload.find({
    collection: 'profiles', where: { member: { equals: memberId } }, limit: 1, depth: 0, overrideAccess: true,
  } as never)
  return Response.json({ memberId, profile: profile.docs[0] ?? null })
}
