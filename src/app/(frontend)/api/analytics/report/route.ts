import { reportableAnalyticsRows } from '@/modules/analytics/reporting'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

const operator = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))
/** Basic proof-of-collection view; detailed reporting remains in the private Payload collections. */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!operator(auth.user))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
  if (!(await checkOperatorSiteAccess(payload, auth.user, siteId)))
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
  const [events, consent] = await Promise.all([
    payload.find({
      collection: 'analytics-events',
      where: {
        and: [
          { site: { equals: siteId } },
          { retentionExpiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
      limit: 20,
      sort: '-occurredAt',
      depth: 0,
      overrideAccess: true,
    } as never),
    payload.find({
      collection: 'analytics-consent-records',
      where: { site: { equals: siteId } },
      limit: 20,
      sort: '-occurredAt',
      depth: 0,
      overrideAccess: true,
    } as never),
  ])
  const eligible = await reportableAnalyticsRows(payload, siteId, events.docs)
  const recentEvents = eligible.map((event) => {
    const value = event as unknown as Record<string, unknown>
    return {
      eventType: value.eventType,
      occurredAt: value.occurredAt,
      consentBasis: value.consentBasis,
      eventId: value.eventId,
      receivedAt: value.receivedAt,
      context: value.context,
      provenance: value.properties ?? null,
      trusted: value.trusted === true,
      expiresAt: value.retentionExpiresAt,
      identityLinkage: value.anonymousHash ? 'consent-subject' : 'unknown',
    }
  })
  const recentConsent = consent.docs.map((record) => {
    const value = record as unknown as Record<string, unknown>
    return {
      action: value.action,
      consentVersion: value.consentVersion,
      occurredAt: value.occurredAt,
    }
  })
  return NextResponse.json({
    siteId,
    eventCount: events.hasNextPage ? null : eligible.length,
    sampleTruncated: events.hasNextPage,
    countBasis:
      'Retained events with current site-scoped consent; legacy or unlinked records excluded.',
    consentRecordCount: consent.totalDocs,
    recentEvents,
    recentConsent,
  })
}
