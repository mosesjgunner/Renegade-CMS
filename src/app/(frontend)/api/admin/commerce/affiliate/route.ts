import config from '@payload-config'
import { getPayload } from 'payload'
import { NextRequest, NextResponse } from 'next/server'
import {
  approveSettlementBatch,
  createSettlementBatch,
  generateSettlementExport,
  summarizeCommissionLiabilities,
} from '../../../../../../modules/commerce/settlement-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const user = auth.user as { id?: string | number; role?: string } | null
  if (!['owner', 'administrator', 'staff'].includes(String(user?.role))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const { action } = body
    const siteId = typeof body.siteId === 'string' ? body.siteId : ''
    if (
      !siteId ||
      (user?.role === 'staff' &&
        !(user as unknown as { adminSites?: Array<string | { id: string }> }).adminSites?.some(
          (site) => String(typeof site === 'object' ? site.id : site) === siteId,
        ))
    )
      return NextResponse.json({ error: 'Choose an assigned site.' }, { status: 403 })
    if (body.batch?.siteId && String(body.batch.siteId) !== siteId)
      return NextResponse.json(
        { error: 'Batch site does not match the selected site.' },
        { status: 403 },
      )

    if (
      ['approve-batch', 'export-batch'].includes(action) &&
      !['owner', 'administrator'].includes(String(user?.role))
    ) {
      return NextResponse.json(
        { error: 'Owner or administrator access is required.' },
        { status: 403 },
      )
    }

    // This endpoint operates on caller-supplied projections. It never persists a
    // settlement or verifies an external payout result.
    if (action === 'reconcile-batch') {
      return NextResponse.json(
        { error: 'External settlement results require verified provider evidence.' },
        { status: 409 },
      )
    }

    if (action === 'summarize') {
      const summaries = summarizeCommissionLiabilities(body.ledgers ?? [], siteId)
      return NextResponse.json({ summaries, projectionOnly: true })
    }

    if (action === 'create-batch') {
      const result = createSettlementBatch({
        siteId,
        currency: body.currency ?? 'USD',
        ledgers: body.ledgers ?? [],
        holds: body.holds ?? [],
      })
      return NextResponse.json({ ...result, projectionOnly: true })
    }

    if (action === 'approve-batch') {
      const approved = approveSettlementBatch({
        batch: body.batch,
        operatorUser: { id: String(user?.id), role: String(user?.role) },
      })
      return NextResponse.json({ batch: approved, projectionOnly: true })
    }

    if (action === 'export-batch') {
      const exportData = generateSettlementExport(body.batch, body.ledgers ?? [])
      return NextResponse.json({ ...exportData, projectionOnly: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Operation failed'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
