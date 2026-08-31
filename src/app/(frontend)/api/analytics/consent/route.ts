import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import { normalizeConsentChoices } from '@/modules/analytics/contracts'
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
  const body = (await request.json()) as { siteId?: string; choices?: Record<string, boolean> }
  if (!body.siteId) return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
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
