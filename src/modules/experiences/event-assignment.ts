import type { Payload } from 'payload'
import { getActivePublicExperiment, resolvePublicExperimentVariant } from './public-experiment'
import type { privacyPolicyFromSettings } from '../analytics/privacy'

/** Event claims must match the configured public renderer and server-assigned variant. */
export async function validatePublicEventAssignment(
  payload: Payload,
  request: Request,
  siteId: string,
  experimentId: string,
  variantId: string,
  secret: string,
  policy: ReturnType<typeof privacyPolicyFromSettings>,
) {
  const experiment = await getActivePublicExperiment(payload, siteId)
  const resolution = resolvePublicExperimentVariant({
    experiment,
    cookieHeader: request.headers.get('cookie'),
    headers: new Headers(request.headers),
    secret,
    privacyPolicy: policy,
  })
  return experiment.dbId === experimentId &&
    experiment.configurationStatus === 'configured' &&
    experiment.state === 'running' &&
    resolution.consented &&
    !resolution.assignment.isDefault &&
    resolution.variant.id === variantId
    ? resolution.assignment
    : null
}
