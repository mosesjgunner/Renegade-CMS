import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    if (siteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }

    const where = siteId
      ? { site: { equals: siteId } }
      : grant.isGlobalOwner
        ? undefined
        : { site: { in: grant.authorizedSiteIds } }

    const accountsResult = await payload.find({
      collection: 'social-accounts' as never,
      where,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({
      accounts: accountsResult.docs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query social accounts.' },
      { status: 500 },
    )
  }
}
