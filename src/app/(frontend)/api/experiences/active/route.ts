import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import {
  hasCurrentAnalyticsConsent,
  readConsent,
  browserPrivacySignals,
  privacyPolicyFromSettings,
} from '@/modules/analytics/privacy'
import { publicSiteForHost } from '@/modules/public/site-scope'
import {
  getActivePublicExperiment,
  resolvePublicExperimentVariant,
} from '@/modules/experiences/public-experiment'

export async function GET(request: Request) {
  const runtime = loadConfig()
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
  const policy = privacyPolicyFromSettings(settings)

  const url = new URL(request.url)
  const siteId = await publicSiteForHost(payload, request.headers.get('host') ?? url.host)
  const requestedSiteId = url.searchParams.get('siteId')
  if (!siteId || (requestedSiteId && requestedSiteId !== siteId))
    return NextResponse.json({ error: 'Experience not found for this site.' }, { status: 404 })

  const experiment = await getActivePublicExperiment(payload, siteId)
  const current = await hasCurrentAnalyticsConsent(
    payload,
    readConsent(request.headers.get('cookie'), runtime.payloadSecret),
    siteId,
    runtime.payloadSecret,
    policy,
    browserPrivacySignals(new Headers(request.headers)),
  )
  const resolution = resolvePublicExperimentVariant({
    experiment,
    cookieHeader: current ? request.headers.get('cookie') : null,
    headers: new Headers(request.headers),
    secret: runtime.payloadSecret,
    privacyPolicy: policy,
  })

  return NextResponse.json({
    experiment: {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description,
      state: experiment.state,
      configurationStatus: experiment.configurationStatus,
      configurationIssue: experiment.configurationIssue,
      goalKey: experiment.goalKey,
      winnerDecision: experiment.winnerDecision,
    },
    form: experiment.form
      ? {
          id: experiment.form.form.id,
          fields: experiment.form.snapshot.fields,
          consentText: experiment.form.snapshot.consentText,
        }
      : null,
    assignedVariant: resolution.variant,
    assignment: resolution.assignment,
    consented: resolution.consented,
    privacyMode: resolution.privacyMode,
    reason: resolution.reason,
  })
}
