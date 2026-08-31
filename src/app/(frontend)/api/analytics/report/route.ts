import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

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
  const [events, consent] = await Promise.all([
    payload.find({
      collection: 'analytics-events',
      where: { site: { equals: siteId } },
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
  const recentEvents = events.docs.map((event) => {
    const value = event as unknown as Record<string, unknown>
    return {
      eventType: value.eventType,
      occurredAt: value.occurredAt,
      consentBasis: value.consentBasis,
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
    eventCount: events.totalDocs,
    consentRecordCount: consent.totalDocs,
    recentEvents,
    recentConsent,
  })
}
