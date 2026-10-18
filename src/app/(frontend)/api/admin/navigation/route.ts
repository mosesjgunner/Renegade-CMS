import config from '@payload-config'
import { getPayload } from 'payload'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { normalizeNavigation, validateNavigation } from '@/modules/public/navigation'
import {
  checkOperatorRecordAccess,
  resolveOperatorGrantContext,
} from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'

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

  const { searchParams } = new URL(request.url)
  const publicationId = searchParams.get('publicationId')
  const siteId =
    searchParams.get('siteId') || readCookie(request.headers, 'renegade-active-site')
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (
    !grant.authorized ||
    (siteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId)) ||
    (publicationId &&
      !(await checkOperatorRecordAccess(payload, auth.user, 'publications', publicationId)))
  )
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

  const pubWhere: Record<string, unknown> = publicationId
    ? { id: { equals: publicationId } }
    : siteId
      ? { site: { equals: siteId } }
      : { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] }

  const publications = await payload.find({
    collection: 'publications',
    where: {
      and: [pubWhere, ...(grant.isGlobalOwner ? [] : [{ site: { in: grant.authorizedSiteIds } }])],
    } as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const pub = publications.docs[0] as unknown as Record<string, unknown> | undefined
  const navigation = normalizeNavigation(pub?.navigation)
  if (!pub) return NextResponse.json({ publicationId: null, navigation, targets: [] })

  // Also query published pages and articles for easy target selection
  const site = typeof pub?.site === 'string' ? pub.site : (pub?.site as { id?: string })?.id
  const targetContent = await payload.find({
    collection: 'content',
    where: {
      and: [
        ...(site ? [{ site: { equals: site } }] : []),
        { status: { in: ['published', 'updated'] } },
      ],
    } as never,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

    const resolvedPubSite = pub ? (typeof pub.site === 'string' ? pub.site : (pub.site as { id?: string })?.id) : siteId ?? null
    return NextResponse.json({
      publicationId: pub?.id ?? null,
      siteId: resolvedPubSite,
      navigation,
      targets: targetContent.docs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        canonicalPath: doc.canonicalPath,
        contentType: doc.contentType,
      })),
    })
  }

  export async function POST(request: Request) {
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })
    if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const body = (await request.json()) as {
        publicationId?: string
        siteId?: string
        navigation: unknown
      }
      const effectiveSiteId = body.siteId || readCookie(request.headers, 'renegade-active-site')

      const validated = validateNavigation(body.navigation)
      const grant = await resolveOperatorGrantContext(payload, auth.user)
      if (
        !grant.authorized ||
        (effectiveSiteId && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(effectiveSiteId))
      )
        return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

      let targetPublicationId = body.publicationId
      if (!targetPublicationId) {
        const pubWhere = effectiveSiteId
          ? { site: { equals: effectiveSiteId } }
          : { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] }
      const pubs = await payload.find({
        collection: 'publications',
        where: {
          and: [
            pubWhere,
            ...(grant.isGlobalOwner ? [] : [{ site: { in: grant.authorizedSiteIds } }]),
          ],
        } as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      targetPublicationId = pubs.docs[0]?.id ? String(pubs.docs[0].id) : undefined
    }

    if (!targetPublicationId) {
      return NextResponse.json({ error: 'Publication not found.' }, { status: 404 })
    }
    if (!(await checkOperatorRecordAccess(payload, auth.user, 'publications', targetPublicationId)))
      return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })

    await payload.update({
      collection: 'publications',
      id: targetPublicationId,
      data: {
        navigation: validated,
      },
      overrideAccess: true,
    })

    // Immediate revalidation of frontend layout
    try {
      revalidatePath('/', 'layout')
    } catch {
      // Revalidation may be a no-op in non-standard runtimes
    }

    return NextResponse.json({
      success: true,
      publicationId: targetPublicationId,
      navigation: validated,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid navigation.' },
      { status: 400 },
    )
  }
}
