import config from '@payload-config'
import { getPayload } from 'payload'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { normalizeNavigation, validateNavigation } from '@/modules/public/navigation'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const publicationId = searchParams.get('publicationId')
  const siteId = searchParams.get('siteId')

  const pubWhere: Record<string, unknown> = publicationId
    ? { id: { equals: publicationId } }
    : siteId
      ? { site: { equals: siteId } }
      : { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] }

  const publications = await payload.find({
    collection: 'publications',
    where: pubWhere as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const pub = publications.docs[0] as unknown as Record<string, unknown> | undefined
  const navigation = normalizeNavigation(pub?.navigation)

  // Also query published pages and articles for easy target selection
  const site = typeof pub?.site === 'string' ? pub.site : (pub?.site as { id?: string })?.id
  const targetContent = await payload.find({
    collection: 'content',
    where: {
      and: [
        ...(site ? [{ site: { equals: site } }] : []),
        { status: { in: ['published', 'active'] } },
      ],
    } as never,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  return NextResponse.json({
    publicationId: pub?.id ?? null,
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

    const validated = validateNavigation(body.navigation)

    let targetPublicationId = body.publicationId
    if (!targetPublicationId) {
      const pubWhere = body.siteId
        ? { site: { equals: body.siteId } }
        : { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] }
      const pubs = await payload.find({
        collection: 'publications',
        where: pubWhere as never,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      targetPublicationId = pubs.docs[0]?.id ? String(pubs.docs[0].id) : undefined
    }

    if (!targetPublicationId) {
      return NextResponse.json({ error: 'Publication not found.' }, { status: 404 })
    }

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
