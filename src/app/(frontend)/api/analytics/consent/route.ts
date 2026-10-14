import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import { normalizeConsentChoices } from '@/modules/analytics/contracts'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import {
  browserPrivacySignals,
  consentSetCookie,
  consentSubject,
  consentSubjectHash,
  privacyPolicyFromSettings,
  readConsent,
} from '@/modules/analytics/privacy'

export async function GET(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const current = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const signals = browserPrivacySignals(new Headers(request.headers))
  return NextResponse.json({
    policy,
    choices: current?.choices ?? null,
    version: current?.version ?? policy.consentVersion,
    signals,
  })
}
export async function POST(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => null)) as {
    siteId?: string
    choices?: Record<string, boolean>
  } | null
  if (!body || typeof body.siteId !== 'string' || !body.siteId)
    return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
  const siteId = await publicSiteForHost(
    payload,
    request.headers.get('host') ?? new URL(request.url).host,
  )
  if (!siteId || body.siteId !== siteId)
    return NextResponse.json(
      { error: 'Consent site does not match this publication.' },
      { status: 404 },
    )
  if (request.headers.get('origin') && !(await samePublicOrigin(payload, request, false)))
    return NextResponse.json({ error: 'Origin access denied.' }, { status: 403 })
  const sites = await payload.find({
    collection: 'sites',
    where: { id: { equals: body.siteId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!sites.docs.length) return NextResponse.json({ error: 'Unknown site.' }, { status: 404 })
  const policy = privacyPolicyFromSettings(
    await payload.findGlobal({ slug: 'site-settings', overrideAccess: true }),
  )
  const existing = readConsent(request.headers.get('cookie'), runtime.payloadSecret)
  const choices = normalizeConsentChoices(body.choices)
  const subject = consentSubject(existing)
  const action =
    !choices.analytics && !choices.personalization && !choices.marketing
      ? 'withdraw'
      : existing
        ? 'update'
        : 'grant'

  // Only create consent record if analytics is enabled
  if (policy.analyticsEnabled) {
    try {
      await payload.create({
        collection: 'analytics-consent-records',
        data: {
          site: body.siteId,
          subjectHash: consentSubjectHash(subject, runtime.payloadSecret),
          consentVersion: policy.consentVersion,
          action,
          categories: choices,
          occurredAt: new Date().toISOString(),
          source: 'browser',
        },
        overrideAccess: true,
      } as never)
    } catch (error) {
      console.error('Failed to create analytics consent record:', error)
      // Continue anyway, as the cookie setting is more important
    }
  }
  const signals = browserPrivacySignals(new Headers(request.headers))
  return NextResponse.json(
    { choices, policy, signals },
    {
      headers: {
        'set-cookie': consentSetCookie(
          { subject, version: policy.consentVersion, choices },
          runtime.payloadSecret,
          runtime.secureCookies,
        ),
      },
    },
  )
}
