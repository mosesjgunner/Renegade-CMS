/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { addGuestAppearance } from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-10): POST { guestId, episodeId, role?, prepNotes?,
 * questions? } links a guest-book guest to an episode as an
 * appearance. Consent starts unrecorded; record it via
 * /guests/consent.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const guestId = typeof body.guestId === 'string' ? body.guestId : ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const appearance = await addGuestAppearance(payload as never, {
      guestId,
      episodeId,
      role: typeof body.role === 'string' ? body.role : undefined,
      prepNotes: typeof body.prepNotes === 'string' ? body.prepNotes : undefined,
      questions: body.questions ?? undefined,
    })
    return privateJson(
      {
        id: String(appearance.id),
        guest: guestId,
        episode: episodeId,
        consentAt: appearance.consentAt ?? null,
      },
      201,
    )
  } catch (error) {
    return productionErrorResponse(error)
  }
}
