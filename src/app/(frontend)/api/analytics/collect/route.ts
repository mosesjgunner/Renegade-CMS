import { campaignParameters } from '@/modules/analytics/operator-report'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  ANALYTICS_SCHEMA_VERSION,
  isBotOrInternal,
  type EventType,
} from '@/modules/analytics/contracts'
import { PayloadAnalyticsEventStore } from '@/modules/analytics/service'
import {
  browserPrivacySignals,
  isInternalAnalyticsActor,
  privacyPolicyFromSettings,
  readConsent,
  hasCurrentAnalyticsConsent,
  analyticsSubjectHash,
} from '@/modules/analytics/privacy'
import { loadConfig } from '@/modules/core/config'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'

const allowed = new Set<EventType>([
  'page_view',
  'click_internal',
  'click_outbound',
  'site_search',
  'read_depth',
])
export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => null)) as {
    id?: string
    siteId?: string
    eventType?: EventType
    path?: string
    occurredAt?: string
    sessionId?: string
    anonymousId?: string
  } | null
  if (
    !body ||
    typeof body.siteId !== 'string' ||
    !body.siteId ||
    !body.eventType ||
    !allowed.has(body.eventType) ||
    typeof body.path !== 'string' ||
    !body.path.startsWith('/') ||
    body.path.length > 2048 ||
    typeof body.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(body.id) ||
    (body.occurredAt !== undefined &&
      (typeof body.occurredAt !== 'string' || !Number.isFinite(Date.parse(body.occurredAt))))
  )
    return NextResponse.json({ error: 'Invalid minimal analytics event.' }, { status: 400 })
  const eventId = body.id
  const eventType = body.eventType
  const path = body.path
  const siteId = await publicSiteForHost(
    payload,
    request.headers.get('host') ?? new URL(request.url).host,
  )
  if (!siteId || body.siteId !== siteId)
    return NextResponse.json(
      { error: 'Analytics site does not match this publication.' },
      { status: 404 },
    )
  if (!(await samePublicOrigin(payload, request, false)))
    return NextResponse.json({ error: 'Origin access denied.' }, { status: 403 })
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const consent = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(request.headers)
  if (!consent)
    return NextResponse.json({ accepted: false, reason: 'consent-required' }, { status: 202 })
  return withExecutionLock(payload, `analytics.subject:${siteId}:${consent.subject}`, async () => {
    if (await isInternalAnalyticsActor(payload, request))
      return NextResponse.json({ accepted: false, reason: 'internal-actor' }, { status: 202 })
    if (
      !(await hasCurrentAnalyticsConsent(
        payload,
        consent,
        siteId,
        runtime.payloadSecret,
        policy,
        signals,
      ))
    )
      return NextResponse.json({ accepted: false, reason: 'consent-required' }, { status: 202 })
    if (
      isBotOrInternal({
        userAgent: request.headers.get('user-agent') ?? undefined,
        internal: request.headers.get('x-renegade-internal') === '1',
      })
    )
      return NextResponse.json({ accepted: false, reason: 'bot-or-internal' }, { status: 202 })
    const sites = await payload.find({
      collection: 'sites',
      where: { id: { equals: body.siteId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (!sites.docs.length) return new NextResponse(null, { status: 204 })
    const now = new Date().toISOString()
    if (
      body.occurredAt &&
      (Date.parse(body.occurredAt) < Date.now() - 7 * 86400000 ||
        Date.parse(body.occurredAt) > Date.now() + 60000)
    )
      return NextResponse.json({ error: 'Event outside collection window.' }, { status: 400 })
    const event = {
      id: eventId,
      eventType,
      occurredAt: body.occurredAt ?? now,
      receivedAt: now,
      identity: { anonymousId: analyticsSubjectHash(consent, siteId, runtime.payloadSecret) },
      context: {
        siteId,
        utm: campaignParameters(path),
        referrer: undefined,
        sourceEventId: eventId,
        path: path.split(/[?#]/)[0],
      },
      consentBasis: 'analytics-consent' as const,
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      trusted: false,
      dedupeKey: '',
      properties: { source: 'browser', grain: 'client-observation', reconciliation: 'unverified' },
    }
    const result = await new PayloadAnalyticsEventStore(payload).record(
      event,
      policy.rawEventRetentionDays,
    )
    return NextResponse.json(
      { accepted: !result.deduplicated, deduplicated: result.deduplicated },
      { status: result.deduplicated ? 202 : 201 },
    )
  })
}
