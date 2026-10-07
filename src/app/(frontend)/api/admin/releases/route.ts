import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { createRelease } from '@/modules/releases/service'

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
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const requestedSiteId = searchParams.get('siteId')
    if (
      requestedSiteId &&
      !grant.isGlobalOwner &&
      !grant.authorizedSiteIds.includes(requestedSiteId)
    ) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }

    const where: Record<string, any> = {}
    if (requestedSiteId) {
      where.site = { equals: requestedSiteId }
    } else if (!grant.isGlobalOwner) {
      where.site = { in: grant.authorizedSiteIds }
    }
    if (status && status !== 'all') {
      where.status = { equals: status }
    }
    if (search) {
      where.or = [
        { title: { contains: search } },
        { name: { contains: search } },
        { campaign: { contains: search } },
      ]
    }

    const result = await payload.find({
      collection: 'content-releases' as never,
      where,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    return NextResponse.json({ releases: result.docs })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    const grant = await resolveOperatorGrantContext(payload, auth?.user)
    if (!grant.authorized) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = await request.json()
    const targetSiteId = body.siteId || body.site || grant.authorizedSiteIds[0] || 'site-primary'
    if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(targetSiteId)) {
      return NextResponse.json(
        { error: 'Forbidden. You do not have operator access to this site.' },
        { status: 403 },
      )
    }
    const release = await createRelease(payload, {
      name: body.name || body.title,
      purpose: body.purpose || 'Coordinated campaign release',
      ownerId: String(auth.user?.id || 'system'),
      ownerTeam: body.ownerTeam || 'Editorial Operations',
      siteId: targetSiteId,
      publicationId: body.publicationId || body.publication,
      plannedInstant: body.plannedInstant || body.scheduledFor,
      timeZone: body.timeZone || 'UTC',
      labels: body.labels || [],
      campaign: body.campaign,
      dependencies: body.dependencies || [],
    })

    return NextResponse.json({ release })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 },
    )
  }
}
