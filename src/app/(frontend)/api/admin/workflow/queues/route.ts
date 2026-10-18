import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getWorkflowQueuesForUser } from '@/modules/editorial/cmos-persistence'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') || undefined
  const now = url.searchParams.get('now') || undefined

  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (
    !grant.authorized ||
    (siteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
  ) {
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
  }

  const effectiveSiteId = siteId || (grant.isGlobalOwner ? undefined : grant.authorizedSiteIds[0])

  const userId = String(auth.user.id)
  const userRole =
    String(auth.user.role) === 'owner' || String(auth.user.role) === 'administrator'
      ? 'publisher'
      : 'editor'

  try {
    const queues = await getWorkflowQueuesForUser(payload, {
      userId,
      role: userRole,
      siteId: effectiveSiteId,
      now,
    })

    return NextResponse.json({ queues })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve workflow queues.' },
      { status: 400 },
    )
  }
}
