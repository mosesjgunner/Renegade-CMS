import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { aggregateAnalytics } from '@/modules/social/analytics'
import type { NormalizedAnalytics, SocialNetwork } from '@/modules/social/contracts'

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
    const canonicalPostId = searchParams.get('canonicalPostId')

    const where: Record<string, any> = {}
    if (canonicalPostId) {
      where.canonicalPostId = { equals: canonicalPostId }
    }

    const externalPostsResult = await payload.find({
      collection: 'external-posts' as never,
      where,
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })

    const reports: Array<{ network: SocialNetwork; analytics: NormalizedAnalytics }> = []
    for (const doc of externalPostsResult.docs as any[]) {
      if (doc.network) {
        reports.push({
          network: doc.network as SocialNetwork,
          analytics: {
            deliveryId: String(doc.id),
            remotePostId: String(doc.remoteId || doc.id),
            retrievedAt: new Date(doc.updatedAt || Date.now()),
            metrics: {
              impressions: Number(doc.metrics?.impressions || 0),
              reach: Number(doc.metrics?.reach || 0),
              views: Number(doc.metrics?.views || 0),
              clicks: Number(doc.metrics?.clicks || 0),
              likes: Number(doc.metrics?.likes || 0),
              comments: Number(doc.metrics?.comments || 0),
              shares: Number(doc.metrics?.shares || 0),
              saves: Number(doc.metrics?.saves || 0),
              engagementRate: Number(doc.metrics?.engagementRate || 0),
            },
            rawPlatformMetrics: (doc.metrics as Record<string, unknown>) || {},
          },
        })
      }
    }

    const aggregated = aggregateAnalytics(reports)

    return NextResponse.json({
      canonicalPostId,
      trackedDeliveriesCount: reports.length,
      aggregate: aggregated,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query social analytics.' },
      { status: 500 },
    )
  }
}
