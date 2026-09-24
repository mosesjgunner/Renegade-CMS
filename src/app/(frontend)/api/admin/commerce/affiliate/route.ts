import { NextRequest, NextResponse } from 'next/server'
import {
  approveSettlementBatch,
  createSettlementBatch,
  generateSettlementExport,
  reconcileSettlementExecution,
  summarizeCommissionLiabilities,
} from '../../../../../../modules/commerce/settlement-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'summarize') {
      const summaries = summarizeCommissionLiabilities(
        body.ledgers ?? [],
        body.siteId ?? 'default-site',
      )
      return NextResponse.json({ summaries })
    }

    if (action === 'create-batch') {
      const result = createSettlementBatch({
        siteId: body.siteId ?? 'default-site',
        currency: body.currency ?? 'USD',
        ledgers: body.ledgers ?? [],
        holds: body.holds ?? [],
      })
      return NextResponse.json(result)
    }

    if (action === 'approve-batch') {
      const approved = approveSettlementBatch({
        batch: body.batch,
        operatorUser: body.operatorUser ?? { id: 'admin-1', role: 'administrator' },
      })
      return NextResponse.json({ batch: approved })
    }

    if (action === 'export-batch') {
      const exportData = generateSettlementExport(body.batch, body.ledgers ?? [])
      return NextResponse.json(exportData)
    }

    if (action === 'reconcile-batch') {
      const result = reconcileSettlementExecution({
        batch: body.batch,
        ledgers: body.ledgers ?? [],
        success: body.success ?? true,
        externalReference: body.externalReference,
        failureReason: body.failureReason,
      })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Operation failed'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
