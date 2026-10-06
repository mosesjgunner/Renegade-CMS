import config from '@payload-config'
import { getPayload } from 'payload'

import {
  currentMember,
  exportMemberData,
  readMemberSession,
} from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return Response.json({ error: 'Authentication required.' }, { status: 401 })
  const requestedMemberId = new URL(request.url).searchParams.get('memberId')
  if (requestedMemberId && requestedMemberId !== memberId)
    return Response.json(
      { error: 'Export ownership required.' },
      { status: 403, headers: { 'cache-control': 'private, no-store' } },
    )
  const data = await exportMemberData(payload as never, memberId)
  return Response.json(data, {
    headers: {
      'content-disposition': 'attachment; filename="member-data-export.json"',
      'cache-control': 'private, no-store',
    },
  })
}
