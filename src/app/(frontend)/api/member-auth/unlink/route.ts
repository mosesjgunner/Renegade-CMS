import config from '@payload-config'
import { getPayload } from 'payload'

import {
  currentMember,
  readMemberSession,
  unlinkIdentity,
  verifyCsrf,
} from '@/modules/identity/member-identity'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Missing or invalid CSRF token.' }, { status: 403 })
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { identityId?: string }
  if (!body.identityId) return Response.json({ error: 'identityId is required.' }, { status: 400 })
  const result = await unlinkIdentity(payload as never, memberId, body.identityId)
  if (!result.ok) {
    const messages: Record<string, string> = {
      last_recovery_method:
        'This is your last verified sign-in method. Add another before removing it.',
      not_found: 'Identity not found.',
    }
    return Response.json({ error: messages[result.reason] ?? 'Unable to unlink.' }, { status: 409 })
  }
  return Response.json({ status: 'unlinked' })
}
