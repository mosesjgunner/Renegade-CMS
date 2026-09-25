import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/modules/core/config'
import { privacyPolicyFromSettings } from '@/modules/analytics/privacy'
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
  const siteId = url.searchParams.get('siteId') ?? undefined

  const experiment = await getActivePublicExperiment(payload, siteId)
  const resolution = resolvePublicExperimentVariant({
    experiment,
    cookieHeader: request.headers.get('cookie'),
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
      goalKey: experiment.goalKey,
      winnerDecision: experiment.winnerDecision,
    },
    assignedVariant: resolution.variant,
    assignment: resolution.assignment,
    consented: resolution.consented,
    privacyMode: resolution.privacyMode,
    reason: resolution.reason,
  })
}
