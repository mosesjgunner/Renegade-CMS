import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  createPortableManifest,
  type PortableRecord,
} from '@/modules/portability/contracts'
import {
  PORTABLE_COLLECTIONS,
} from '@/modules/portability/workflow'

export const runtime = 'nodejs'

const staff = (user: { role?: string } | null | undefined) =>
  user?.role === 'owner' || user?.role === 'administrator' || user?.role === 'staff'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Export requires staff access.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  if (!siteId) {
    return NextResponse.json({ error: 'siteId query parameter is required.' }, { status: 400 })
  }

  return exportSite(payload, siteId)
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!staff(auth.user)) {
    return NextResponse.json({ error: 'Export requires staff access.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { siteId?: string }
  const siteId = body.siteId
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required in request body.' }, { status: 400 })
  }

  return exportSite(payload, siteId)
}

async function exportSite(payload: Awaited<ReturnType<typeof getPayload>>, siteId: string) {
  try {
    const siteDoc = await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
      overrideAccess: true,
    })
    if (!siteDoc) {
      return NextResponse.json({ error: `Site ${siteId} was not found.` }, { status: 404 })
    }

    const records: PortableRecord[] = []
    const { id: sourceId, createdAt: sourceCreatedAt, updatedAt: sourceUpdatedAt, ...sourceData } =
      siteDoc as unknown as Record<string, unknown>

    records.push({
      collection: 'sites',
      id: String(sourceId),
      data: {
        ...sourceData,
        _portableTimestamps: { createdAt: sourceCreatedAt, updatedAt: sourceUpdatedAt },
      },
    })

    for (const collection of PORTABLE_COLLECTIONS) {
      if (collection === 'sites' || collection === 'site-settings') continue
      if (!payload.collections[collection as keyof typeof payload.collections]) continue

      try {
        const docs = await payload.find({
          collection: collection as never,
          limit: 500,
          depth: 0,
          overrideAccess: true,
          where: { site: { equals: siteId } },
        })
        for (const doc of docs.docs) {
          const { id, createdAt, updatedAt, ...data } = doc as Record<string, unknown>
          records.push({
            collection,
            id: String(id),
            data: { ...data, _portableTimestamps: { createdAt, updatedAt } },
          })
        }
      } catch {
        // Skip collections not configured or without site column
      }
    }

    const manifest = createPortableManifest({
      createdAt: new Date().toISOString(),
      records,
      media: [],
    })

    return NextResponse.json({
      manifest,
      recordCount: records.length,
      siteId,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    )
  }
}
