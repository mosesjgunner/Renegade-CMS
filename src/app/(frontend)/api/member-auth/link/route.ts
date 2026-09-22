import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const identities = await payload.find({
    collection: 'linked-identities',
    where: { member: { equals: memberId } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  } as never)
  return Response.json({
    identities: (identities as unknown as { docs: Array<Record<string, unknown>> }).docs.map(
      (identity) => ({
        id: identity.id,
        kind: identity.kind,
        verifiedAt: identity.verifiedAt ?? null,
        revokedAt: identity.revokedAt ?? null,
      }),
    ),
  })
}
