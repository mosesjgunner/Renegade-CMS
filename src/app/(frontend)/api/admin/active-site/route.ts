import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  checkOperatorSiteAccess,
  resolveOperatorGrantContext,
} from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'renegade-active-site'

function readCookie(headers: Headers, name: string): string | undefined {
  const cookieHeader = headers.get('cookie')
  if (!cookieHeader) return undefined
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === name)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (!grant.authorized) {
    return NextResponse.json({ error: 'Operator access required.' }, { status: 403 })
  }

  const allSites = await payload.find({
    collection: 'sites',
    where: { lifecycle: { equals: 'active' } },
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })

  const authorizedSites = grant.isGlobalOwner
    ? allSites.docs
    : allSites.docs.filter((s) => grant.authorizedSiteIds.includes(String(s.id)))

  if (!authorizedSites.length) {
    return NextResponse.json({ error: 'No authorized sites available.' }, { status: 404 })
  }

  const cookieSiteId = readCookie(request.headers, COOKIE_NAME)
  const activeSite =
    authorizedSites.find((s) => String(s.id) === cookieSiteId) ?? authorizedSites[0]

  return NextResponse.json(
    {
      activeSiteId: String(activeSite.id),
      sites: authorizedSites.map((s) => ({
        id: String(s.id),
        name: s.name,
        slug: s.slug,
      })),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  )
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { siteId?: string }
    const siteId = body.siteId ? String(body.siteId).trim() : ''
    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 })
    }

    const hasAccess = await checkOperatorSiteAccess(payload, auth.user, siteId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Insufficient site authority.' }, { status: 403 })
    }

    const res = NextResponse.json({ ok: true, activeSiteId: siteId })
    res.headers.set(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(siteId)}; Path=/; SameSite=Lax; Max-Age=2592000`,
    )
    return res
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request.' },
      { status: 400 },
    )
  }
}
