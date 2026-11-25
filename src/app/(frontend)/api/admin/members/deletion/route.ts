import config from '@payload-config'
import { getPayload } from 'payload'
import { finalizeMemberDeletion } from '@/modules/identity/member-identity'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Operator finalize for a member-requested deletion. Only an owner or
 * administrator may finalize, and only for a member who is currently
 * deletion-pending; finalizeMemberDeletion() anonymizes the member and
 * profile, revokes entitlements, sessions, and linked identities, and
 * writes the member.deletion.finalized audit event.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload as never, auth?.user as never)
  if (!grant.authorized)
    return Response.json({ error: 'Unauthorized. Staff role required.' }, { status: 403 })
  if (grant.user.role !== 'owner' && grant.user.role !== 'administrator')
    return Response.json(
      { error: 'Forbidden. Only an owner or administrator may finalize a deletion.' },
      { status: 403 },
    )
  const body = (await request.json().catch(() => null)) as { memberId?: unknown } | null
  const memberId = typeof body?.memberId === 'string' ? body.memberId : ''
  if (!memberId) return Response.json({ error: 'memberId is required.' }, { status: 400 })
  const member = (await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { status?: string } | null
  if (!member) return Response.json({ error: 'Member not found.' }, { status: 404 })
  if (member.status !== 'deletion-pending')
    return Response.json(
      { error: 'Member has not requested deletion; finalize refused.' },
      { status: 409 },
    )
  await finalizeMemberDeletion(payload as never, memberId)
  const anonymized = (await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })) as { displayName?: string; email?: string | null; status?: string }
  return Response.json({
    memberId,
    status: anonymized.status,
    displayName: anonymized.displayName,
    email: anonymized.email ?? null,
  })
}
