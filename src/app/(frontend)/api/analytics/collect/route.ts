import { createHash, randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  ANALYTICS_SCHEMA_VERSION,
  analyticsAllowed,
  isBotOrInternal,
  type EventType,
} from '@/modules/analytics/contracts'
import { PayloadAnalyticsEventStore } from '@/modules/analytics/service'
import {
  browserPrivacySignals,
  privacyPolicyFromSettings,
  readConsent,
} from '@/modules/analytics/privacy'
import { loadConfig } from '@/modules/core/config'
import { publicSiteForHost } from '@/modules/public/site-scope'

const allowed = new Set<EventType>([
  'page_view',
  'click_internal',
  'click_outbound',
  'site_search',
  'read_depth',
  'form_submit',
  'download',
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
    (body.id !== undefined && typeof body.id !== 'string') ||
    (body.occurredAt !== undefined &&
      (typeof body.occurredAt !== 'string' || !Number.isFinite(Date.parse(body.occurredAt))))
  )
    return NextResponse.json({ error: 'Invalid minimal analytics event.' }, { status: 400 })
  const siteId = await publicSiteForHost(
    payload,
    request.headers.get('host') ?? new URL(request.url).host,
  )
  if (!siteId || body.siteId !== siteId)
    return NextResponse.json(
      { error: 'Analytics site does not match this publication.' },
      { status: 404 },
    )
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const consent = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(request.headers)
  if (
    !consent ||
    consent.version !== policy.consentVersion ||
    !analyticsAllowed({ choices: consent.choices, policy, ...signals })
  )
    return new NextResponse(null, { status: 204 })
  if (
    isBotOrInternal({
      userAgent: request.headers.get('user-agent') ?? undefined,
      internal: request.headers.get('x-renegade-internal') === '1',
    })
  )
    return new NextResponse(null, { status: 204 })
  const sites = await payload.find({
    collection: 'sites',
    where: { id: { equals: body.siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!sites.docs.length) return new NextResponse(null, { status: 204 })
  const hash = (value?: string) =>
    value
      ? createHash('sha256').update(`${runtime.payloadSecret}:${value}`).digest('hex')
      : undefined
  const now = new Date().toISOString()
  const event = {
    id: body.id ?? randomUUID(),
    eventType: body.eventType,
    occurredAt: body.occurredAt ?? now,
    receivedAt: now,
    identity: { anonymousId: hash(body.anonymousId), sessionId: hash(body.sessionId) },
    context: { siteId: body.siteId, referrer: undefined, sourceEventId: body.id, path: body.path },
    consentBasis: 'analytics-consent' as const,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    trusted: false,
    dedupeKey: '',
  }
  const result = await new PayloadAnalyticsEventStore(payload).record(
    event,
    policy.rawEventRetentionDays,
  )
  return NextResponse.json(
    { accepted: !result.deduplicated, deduplicated: result.deduplicated },
    { status: result.deduplicated ? 202 : 201 },
  )
}
