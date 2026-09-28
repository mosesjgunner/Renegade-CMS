import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'
import {
  defaultNeo4jAdapter,
  rebuildKnowledgeGraph,
  detectOrphanPages,
  detectWeakTopicClusters,
  detectMissingHubRelationships,
  detectLinkOpportunities,
  applyLinkOpportunity,
  rollbackLinkExecution,
  bulkReviewLinkOpportunities,
  type BulkReviewItem,
} from '@/modules/intelligence/graph'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const view = url.searchParams.get('view') || 'all'

  if (!siteId) {
    return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 })
  }

  if (!canManageAdminSite(auth.user, siteId)) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }

  try {
    const store = defaultNeo4jAdapter.getStore()

    // If graph has not been built yet, perform initial lightweight build
    if (store.getNodeCounts().contentCount === 0) {
      await rebuildKnowledgeGraph(payload, { siteId })
    }

    const status = defaultNeo4jAdapter.getStatus()

    if (view === 'status') {
      return NextResponse.json({ siteId, status })
    }

    const orphanPages = detectOrphanPages(store)
    const weakTopicClusters = detectWeakTopicClusters(store)
    const missingHubRelationships = detectMissingHubRelationships(store)
    const linkOpportunities = await detectLinkOpportunities(store, payload, { siteId })

    return NextResponse.json({
      siteId,
      status,
      orphanPages,
      weakTopicClusters,
      missingHubRelationships,
      linkOpportunities,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query graph intelligence.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const action = String(body.action || '')
    const siteId = String(body.siteId || '')

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 })
    }

    if (!canManageAdminSite(auth.user, siteId)) {
      return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
    }

    switch (action) {
      case 'rebuild': {
        const status = await rebuildKnowledgeGraph(payload, { siteId })
        return NextResponse.json({ success: true, status })
      }

      case 'apply-link': {
        const sourceContentId = String(body.sourceContentId || '')
        const targetContentId = String(body.targetContentId || '')
        const expectedRevision = String(body.expectedRevision || '')
        const anchorText = String(body.anchorText || '')
        const opportunityId = body.opportunityId ? String(body.opportunityId) : undefined

        if (!sourceContentId || !targetContentId || !anchorText) {
          return NextResponse.json(
            { error: 'sourceContentId, targetContentId, and anchorText are required.' },
            { status: 400 },
          )
        }

        const result = await applyLinkOpportunity(payload, {
          sourceContentId,
          targetContentId,
          expectedRevision,
          anchorText,
          userId: String(auth.user.id),
          opportunityId,
        })

        // Rebuild graph incrementally to refresh edges
        await rebuildKnowledgeGraph(payload, { siteId })

        return NextResponse.json(result)
      }

      case 'rollback-link': {
        const executionId = String(body.executionId || '')
        if (!executionId) {
          return NextResponse.json({ error: 'executionId is required.' }, { status: 400 })
        }

        const result = await rollbackLinkExecution(payload, executionId, String(auth.user.id))

        // Rebuild graph incrementally to refresh edges
        await rebuildKnowledgeGraph(payload, { siteId })

        return NextResponse.json(result)
      }

      case 'bulk-review': {
        const items = (body.items || []) as BulkReviewItem[]
        if (!Array.isArray(items) || items.length === 0) {
          return NextResponse.json({ error: 'items array is required.' }, { status: 400 })
        }

        const result = await bulkReviewLinkOpportunities(payload, items, String(auth.user.id))
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}. Valid actions: rebuild, apply-link, rollback-link, bulk-review`,
          },
          { status: 400 },
        )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Graph operation failed.' },
      { status: 500 },
    )
  }
}
