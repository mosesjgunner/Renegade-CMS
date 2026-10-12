import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  if (!grant.authorized)
    return NextResponse.json({ error: 'Editor access required.' }, { status: 403 })
  const where = grant.isGlobalOwner ? undefined : { id: { in: grant.authorizedSiteIds } }
  const sites = await payload.find({
    collection: 'sites',
    where,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json({
    canConfigure: ['owner', 'administrator'].includes(String(auth.user?.role)),
    sites: sites.docs.map((site) => ({ id: site.id, name: site.name })),
  })
}
