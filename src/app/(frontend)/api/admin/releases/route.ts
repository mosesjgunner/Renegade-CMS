import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { createRelease } from '@/modules/releases/service'

const staffOnly = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'publisher', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  try {
    const payload = await getPayload({ config: configPromise })
    const auth = await payload.auth({ headers: request.headers })
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const where: Record<string, any> = {}
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
    if (!staffOnly(auth.user)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
    }

    const body = await request.json()
    const release = await createRelease(payload, {
      name: body.name || body.title,
      purpose: body.purpose || 'Coordinated campaign release',
      ownerId: String(auth.user?.id || 'system'),
      ownerTeam: body.ownerTeam || 'Editorial Operations',
      siteId: body.siteId || body.site || 'site-primary',
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
