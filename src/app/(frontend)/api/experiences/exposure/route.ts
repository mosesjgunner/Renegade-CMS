import { createHash, randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import {
  analyticsAllowed,
  ANALYTICS_SCHEMA_VERSION,
  isBotOrInternal,
} from '@/modules/analytics/contracts'
import { PayloadAnalyticsEventStore } from '@/modules/analytics/service'
import {
  browserPrivacySignals,
  privacyPolicyFromSettings,
  readConsent,
} from '@/modules/analytics/privacy'

export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as {
    experimentId?: string
    variantId?: string
    assignmentKey?: string
    siteId?: string
  }

  if (!body.experimentId || !body.variantId) {
    return NextResponse.json({ error: 'experimentId and variantId are required.' }, { status: 400 })
  }

  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const consent = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(new Headers(request.headers))

  // 1. Strict Privacy Check: Zero telemetry without valid consent or with DNT/GPC
  if (
    !consent ||
    consent.version !== policy.consentVersion ||
    !analyticsAllowed({ choices: consent.choices, policy, ...signals })
  ) {
    return new NextResponse(null, { status: 204 })
  }

  // 2. Bot & Internal Filtering
  if (
    isBotOrInternal({
      userAgent: request.headers.get('user-agent') ?? undefined,
      internal: request.headers.get('x-renegade-internal') === '1',
    })
  ) {
    return new NextResponse(null, { status: 204 })
  }

  const siteId = body.siteId ?? 'default-site'
  const subjectKey = consent.subject
  const subjectHash = createHash('sha256')
    .update(`${runtime.payloadSecret}:${subjectKey}`)
    .digest('hex')

  const dedupeSource = `exp-exposure:${body.experimentId}:${body.variantId}:${subjectHash}`
  const now = new Date().toISOString()

  const event = {
    id: randomUUID(),
    eventType: 'experiment_exposure' as const,
    occurredAt: now,
    receivedAt: now,
    identity: { anonymousId: subjectHash },
    context: {
      siteId,
      sourceEventId: dedupeSource,
      path: '/',
      channel: 'web-experiment',
    },
    consentBasis: 'analytics-consent' as const,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    trusted: false,
    dedupeKey: '',
    properties: {
      experimentId: body.experimentId,
      variantId: body.variantId,
      assignmentKey: body.assignmentKey ?? dedupeSource,
    },
  }

  const result = await new PayloadAnalyticsEventStore(payload).record(event)

  // Also record in canonical experiment-events collection if enabled
  if (!result.deduplicated) {
    try {
      await payload.create({
        collection: 'experiment-events',
        data: {
          experiment: body.experimentId,
          variant: body.variantId,
          kind: 'exposure',
          dedupeKey: `${siteId}:${dedupeSource}`,
          occurredAt: now,
          consentBasis: 'analytics-consent',
        },
        overrideAccess: true,
      } as never)
    } catch {
      // Best-effort canonical mirror; does not block analytics response
    }
  }

  return NextResponse.json(
    {
      accepted: !result.deduplicated,
      deduplicated: result.deduplicated,
      variantId: body.variantId,
      experimentId: body.experimentId,
    },
    { status: result.deduplicated ? 202 : 201 },
  )
}
