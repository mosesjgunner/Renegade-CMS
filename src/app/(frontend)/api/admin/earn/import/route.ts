/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { parseCsv } from '@/modules/monetization/csv'
import { previewImport, type EvidenceMapping } from '@/modules/monetization/import'
import { commitEvidenceImport } from '@/modules/monetization/earn-service'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Generic external-revenue import (CE-04, contract §5.3):
 * action "preview" parses + maps + classifies without writing;
 * action "commit" re-runs the same preview and transactionally
 * ingests only the accepted rows, so what was previewed is exactly
 * what lands. Duplicates change no totals; conflicts are reported,
 * never overwritten.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as any
  const forbidden = requireSite(auth.grant, body.siteId ?? null)
  if (forbidden) return forbidden
  try {
    const mapping = body.mapping as EvidenceMapping
    if (!mapping?.mappingVersion || !mapping?.columns)
      return NextResponse.json({ error: 'A mapping with a version is required.' }, { status: 400 })
    const table = parseCsv(String(body.csv ?? ''))
    const existingDocs = (
      await (payload as any).find({
        collection: 'external-revenue-evidence',
        where: {
          and: [
            { site: { equals: body.siteId } },
            { providerId: { equals: String(body.providerId ?? '') } },
          ],
        },
        limit: 10000,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as any[]
    const existing = new Map(
      existingDocs.map((doc) => [String(doc.providerEventId), String(doc.sourceHash ?? '')]),
    )
    const preview = previewImport(table, mapping, existing)
    if (body.action === 'preview') return NextResponse.json({ preview })
    if (body.action === 'commit') {
      const result = await commitEvidenceImport(payload as any, body.siteId, {
        providerId: String(body.providerId ?? ''),
        accountRef: body.accountRef ?? null,
        sourceType: 'csv',
        mappingVersion: mapping.mappingVersion,
        rows: preview.accepted,
      })
      return NextResponse.json({
        inserted: result.inserted,
        // Duplicates are caught twice by design: the preview
        // classifies them, and the commit re-checks inside ingestion.
        // Report the total so a repeat import reads as fully skipped.
        skippedDuplicates: result.skippedDuplicates + preview.duplicates.length,
        duplicates: preview.duplicates.length,
        rejected: preview.rejected.length,
        conflicts: preview.conflicts.length,
      })
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}
