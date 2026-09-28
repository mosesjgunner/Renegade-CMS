import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canManageAdminSite } from '@/modules/admin/site-access'
import {
  runContentIntelligenceAnalysis,
  approveIntelligenceRecommendation,
  executeApprovedRecommendation,
} from '@/modules/intelligence/analysis-service'
import { importIntelligenceJson, importIntelligenceCsv } from '@/modules/intelligence/ingestion'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const contentId = url.searchParams.get('contentId')

  if (!siteId) {
    return NextResponse.json({ error: 'Site ID is required.' }, { status: 400 })
  }

  if (!canManageAdminSite(auth.user, siteId)) {
    return NextResponse.json({ error: 'Site access denied.' }, { status: 403 })
  }

  try {
    const whereClause = contentId
      ? { and: [{ site: { equals: siteId } }, { targetId: { equals: contentId } }] }
      : { site: { equals: siteId } }

    const analyses = await payload.find({
      collection: 'intelligence-analyses' as never,
      where: whereClause as never,
      limit: 20,
      sort: '-timestamp',
      overrideAccess: true,
    })

    const findings = await payload.find({
      collection: 'intelligence-findings' as never,
      where: whereClause as never,
      limit: 50,
      overrideAccess: true,
    })

    const recommendations = await payload.find({
      collection: 'intelligence-recommendations' as never,
      where: whereClause as never,
      limit: 50,
      overrideAccess: true,
    })

    return NextResponse.json({
      siteId,
      contentId,
      analyses: analyses.docs,
      findings: findings.docs,
      recommendations: recommendations.docs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query intelligence.' },
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
      case 'analyze': {
        const contentId = String(body.contentId || '')
        if (!contentId) {
          return NextResponse.json({ error: 'Content ID is required.' }, { status: 400 })
        }
        const force = Boolean(body.force)
        const runAi = Boolean(body.runAi)
        const result = await runContentIntelligenceAnalysis(payload, {
          contentId,
          siteId,
          force,
          runAi,
        })
        return NextResponse.json(result)
      }

      case 'import-json': {
        const payloadData = (body.payload || body.data) as never
        const dryRun = Boolean(body.dryRun)
        const result = await importIntelligenceJson(payload, {
          siteId,
          payload: payloadData,
          dryRun,
        })
        return NextResponse.json(result)
      }

      case 'import-csv': {
        const csvContent = String(body.csvContent || '')
        const importType = (body.type || body.importType) as 'entities' | 'claims' | 'citations'
        const dryRun = Boolean(body.dryRun)
        if (!csvContent || !importType) {
          return NextResponse.json(
            { error: 'csvContent and type (entities|claims|citations) are required.' },
            { status: 400 },
          )
        }
        const result = await importIntelligenceCsv(payload, {
          siteId,
          csvContent,
          type: importType,
          dryRun,
        })
        return NextResponse.json(result)
      }

      case 'approve-recommendation': {
        const recommendationId = String(body.recommendationId || '')
        const decision = body.decision as 'approved' | 'rejected'
        const rejectionReason = body.rejectionReason as string | undefined
        if (!recommendationId || !['approved', 'rejected'].includes(decision)) {
          return NextResponse.json(
            { error: 'recommendationId and decision (approved|rejected) are required.' },
            { status: 400 },
          )
        }
        const result = await approveIntelligenceRecommendation(payload, {
          recommendationId,
          decision,
          userId: String(auth.user.id),
          rejectionReason,
        })
        return NextResponse.json(result)
      }

      case 'execute-recommendation': {
        const recommendationId = String(body.recommendationId || '')
        if (!recommendationId) {
          return NextResponse.json({ error: 'recommendationId is required.' }, { status: 400 })
        }
        const result = await executeApprovedRecommendation(payload, {
          recommendationId,
          userId: String(auth.user.id),
        })
        return NextResponse.json(result)
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}. Valid actions: analyze, import-json, import-csv, approve-recommendation, execute-recommendation`,
          },
          { status: 400 },
        )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Intelligence operation failed.' },
      { status: 500 },
    )
  }
}
