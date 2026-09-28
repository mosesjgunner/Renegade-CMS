import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const siteId = new URL(request.url).searchParams.get('siteId')
    if (auth.user?.role === 'staff' && !siteId)
      return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 400 })
    if (siteId && !canManageAdminSite(auth.user, siteId))
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })

    const accountsResult = await payload.find({
      collection: 'social-accounts' as never,
      where: siteId ? { site: { equals: siteId } } : undefined,
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
