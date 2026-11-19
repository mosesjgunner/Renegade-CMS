/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  PODCAST_GUEST_APPEARANCE_COLLECTION,
  recordGuestConsent,
} from '@/modules/podcast-studio/production'
import {
  loadEpisode,
  privateJson,
  productionErrorResponse,
  readJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-10): POST { appearanceId, consentBy, consentScope,
 * releaseUrl? } records consent on one appearance (stamps consentAt).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await readJson(request)
  const appearanceId = typeof body.appearanceId === 'string' ? body.appearanceId : ''
  const appearance = await payload
    .findByID({
      collection: PODCAST_GUEST_APPEARANCE_COLLECTION as never,
      id: appearanceId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!appearance) return privateJson({ error: 'Guest appearance not found.' }, 404)
  const episode = await loadEpisode(payload, relationId((appearance as any).episode))
  const denied = await requireSiteAccess(payload, user, relationId(episode?.site))
  if (denied) return denied
  try {
    const updated = await recordGuestConsent(payload as never, appearanceId, {
      consentBy: typeof body.consentBy === 'string' ? body.consentBy : '',
      consentScope: typeof body.consentScope === 'string' ? body.consentScope : '',
      releaseUrl: typeof body.releaseUrl === 'string' ? body.releaseUrl : undefined,
    })
    return privateJson({
      id: String(updated.id),
      consentAt: updated.consentAt,
      consentBy: updated.consentBy,
      consentScope: updated.consentScope,
    })
  } catch (error) {
    return productionErrorResponse(error)
  }
}
