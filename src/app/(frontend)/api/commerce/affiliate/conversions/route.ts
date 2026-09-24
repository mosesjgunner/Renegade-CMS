import { NextRequest, NextResponse } from 'next/server'
import {
  importConversionEvidence,
  type RawConversionInput,
} from '../../../../../../modules/commerce/affiliate-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    const siteId = request.headers.get('x-site-id') ?? 'default-site'

    if (contentType.includes('application/json')) {
      const body = await request.json()
      const network = body.network ?? 'custom-network'
      const items: RawConversionInput[] = Array.isArray(body.items)
        ? body.items
        : [
            {
              externalEventId: body.eventId ?? body.id,
              externalOrderId: body.orderId,
              amountMinor: String(body.amountMinor ?? '0'),
              currency: String(body.currency ?? 'USD'),
              commissionAmountMinor: body.commissionMinor
                ? String(body.commissionMinor)
                : undefined,
              attributionHint: body.attributionHint ?? body.subId ?? body.clickToken,
              status: body.status ?? 'pending',
            },
          ]

      const result = importConversionEvidence({
        siteId,
        source: 'webhook',
        network,
        rawPayload: body,
        items,
        existingEvidence: [],
        existingClicks: [],
        existingOffers: [],
      })

      return NextResponse.json({
        success: true,
        importedCount: result.imported.length,
        duplicateCount: result.duplicates.length,
        matchedCount: result.matchedCount,
        unmatchedCount: result.unmatchedCount,
        imported: result.imported,
      })
    }

    if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
      const csvText = await request.text()
      const lines = csvText.split('\n').filter((l) => l.trim().length > 0)
      if (lines.length < 2) {
        return NextResponse.json(
          { error: 'CSV requires header and at least one data row' },
          { status: 400 },
        )
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
      const eventIdIdx = headers.indexOf('event_id')
      const amountIdx = headers.indexOf('amount_minor')
      const currencyIdx = headers.indexOf('currency')
      const subIdIdx = headers.indexOf('sub_id')
      const statusIdx = headers.indexOf('status')

      const items: RawConversionInput[] = []
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < headers.length) continue
        items.push({
          externalEventId: parts[eventIdIdx >= 0 ? eventIdIdx : 0] ?? `csv_${i}`,
          amountMinor: parts[amountIdx >= 0 ? amountIdx : 1] ?? '0',
          currency: parts[currencyIdx >= 0 ? currencyIdx : 2] ?? 'USD',
          attributionHint: parts[subIdIdx >= 0 ? subIdIdx : 3],
          status: (parts[statusIdx >= 0 ? statusIdx : 4] as any) ?? 'approved',
          rawLine: lines[i],
        })
      }

      const result = importConversionEvidence({
        siteId,
        source: 'csv',
        network: 'csv-import',
        rawPayload: csvText,
        items,
        existingEvidence: [],
        existingClicks: [],
        existingOffers: [],
      })

      return NextResponse.json({
        success: true,
        importedCount: result.imported.length,
        duplicateCount: result.duplicates.length,
        matchedCount: result.matchedCount,
        unmatchedCount: result.unmatchedCount,
        imported: result.imported,
      })
    }

    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Import failed'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }
}
