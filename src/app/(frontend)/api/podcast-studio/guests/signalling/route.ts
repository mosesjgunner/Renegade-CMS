import config from '@payload-config'
import { getPayload } from 'payload'

import {
  pollSignalMessages,
  postSignalMessage,
  resolveSignallingCredential,
} from '@/modules/podcast-studio/guests/service'
import type { SignalMessageType } from '@/modules/podcast-studio/guests/signalling-core'
import {
  guestCredential,
  guestErrorResponse,
  privateJson,
  readJson,
  staffInviteContext,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-10 signalling over HTTP long-poll on the durable message log
 * (see guests/service.ts for the transport rationale).
 *
 * - Guest side: the post-join signalling credential (Bearer) scopes
 *   every call to exactly one invite/session.
 * - Host side: staff auth + operator site access, with `inviteId`.
 * - The service refuses media negotiation for non-admitted guests.
 *
 * GET polls (params: after=<iso>, waitMs<=25000, inviteId for staff).
 * POST sends { type, payload, sessionId, inviteId? (staff) }.
 */
async function resolveActor(payload: any, request: Request, inviteIdHint: string) {
  const credential = guestCredential(request)
  if (credential) {
    const invite = await resolveSignallingCredential(payload, credential)
    return { invite, sender: 'guest' as const }
  }
  if (!inviteIdHint) return null
  const ctx = await staffInviteContext(payload, request, inviteIdHint)
  if ('error' in ctx) return { error: ctx.error }
  return { invite: ctx.invite, sender: 'host' as const }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  try {
    const actor = await resolveActor(payload, request, url.searchParams.get('inviteId') ?? '')
    if (!actor) return privateJson({ error: 'Guest credential or staff inviteId required.' }, 401)
    if ('error' in actor) return actor.error
    const messages = await pollSignalMessages(payload as never, {
      invite: actor.invite,
      forSender: actor.sender,
      afterIso: url.searchParams.get('after') ?? undefined,
      waitMs: Number(url.searchParams.get('waitMs') ?? 0),
    })
    return privateJson({
      lobbyState: String((actor.invite as any).state ?? ''),
      messages: messages.map((m: any) => ({
        id: String(m.id),
        type: m.type,
        payload: m.payload ?? {},
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    return guestErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  try {
    const actor = await resolveActor(payload, request, String(body.inviteId ?? ''))
    if (!actor) return privateJson({ error: 'Guest credential or staff inviteId required.' }, 401)
    if ('error' in actor) return actor.error
    const inviteSessionId =
      typeof (actor.invite as any).session === 'string'
        ? (actor.invite as any).session
        : String((actor.invite as any).session?.id ?? '')
    const message = await postSignalMessage(payload as never, {
      invite: actor.invite,
      sender: actor.sender,
      type: String(body.type ?? '') as SignalMessageType,
      payload: (body.payload ?? {}) as Record<string, unknown>,
      sessionId: String(body.sessionId ?? inviteSessionId),
    })
    return privateJson({ id: String(message.id) }, 201)
  } catch (error) {
    return guestErrorResponse(error)
  }
}
