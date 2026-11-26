/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { statementForSite } from '@/modules/monetization/earn-service'
import { statementCsv } from '@/modules/monetization/statements'
import { earnAuth, errorResponse, requireSite } from '@/modules/monetization/route-helpers'

/**
 * Creator statement (CE-03): JSON by default, CSV with ?format=csv.
 * Sources stay separate in both shapes; the CSV is formula-injection
 * safe via the shared CSV renderer (CE-T31).
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await earnAuth(payload, request)
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId')
  const forbidden = requireSite(auth.grant, siteId)
  if (forbidden) return forbidden
  try {
    const statement = await statementForSite(payload as any, siteId!)
    if (url.searchParams.get('format') === 'csv')
      return new NextResponse(statementCsv(statement), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="earn-statement.csv"',
        },
      })
    return NextResponse.json({ statement })
  } catch (error) {
    return errorResponse(error)
  }
}
