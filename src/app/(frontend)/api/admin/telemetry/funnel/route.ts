import { loadOperatorReport, reportWindow } from '@/modules/analytics/operator-report'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

const isOperator = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  if (!isOperator(auth.user)) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const campaign = url.searchParams.get('campaign') ?? ''
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  const siteId = url.searchParams.get('siteId') ?? grant.authorizedSiteIds[0]
  if (
    !grant.authorized ||
    !siteId ||
    (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
  )
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
  const sites = await payload.find({
    collection: 'sites',
    where: { id: { equals: siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!sites.docs.length)
    return NextResponse.json({ error: 'Choose an available site.' }, { status: 400 })

  let window
  try {
    window = reportWindow(url.searchParams)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  const report = await loadOperatorReport(payload, siteId, window)
  return NextResponse.json({
    siteId,
    dateWindow: window,
    campaigns: report.campaignFunnels.filter((row) => !campaign || row.campaign === campaign),
    unattributedConversions: report.unattributedConversions,
    definitions: report.definitions,
  })
}
