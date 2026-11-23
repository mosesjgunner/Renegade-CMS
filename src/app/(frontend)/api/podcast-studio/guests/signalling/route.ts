import config from '@payload-config'
import { getPayload } from 'payload'

import {
  dropGuest,
  pollSignalMessages,
  postSignalMessage,
  resolveSignallingCredential,
} from '@/modules/podcast-studio/guests/service'
import { buildIceConfigFromEnv } from '@/modules/podcast-studio/guests/peer-session'
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
async function resolveActor(
  payload: any,
  request: Request,
  inviteIdHint: string,
): Promise<{ invite: any; sender: 'guest' | 'host' } | { error: Response } | null> {
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
    const claimedSession = url.searchParams.get('sessionId')
    const claimedInvite = url.searchParams.get('inviteId')
    const relationship = actor.invite.session
    const actualSession = typeof relationship === 'object' ? relationship?.id : relationship
    if (
      (claimedSession !== null && claimedSession !== String(actualSession)) ||
      (claimedInvite !== null && claimedInvite !== String(actor.invite.id))
    ) {
      return privateJson({ error: 'Signalling room does not match this invite.' }, 403)
    }
    const messages = await pollSignalMessages(payload as never, {
      invite: actor.invite,
      forSender: actor.sender,
      afterIso: url.searchParams.get('after') ?? undefined,
      afterId: url.searchParams.get('afterId') ?? undefined,
      waitMs: Number(url.searchParams.get('waitMs') ?? 0),
    })
    return privateJson({
      lobbyState: String((actor.invite as any).state ?? ''),
      ...(actor.sender === 'host' ? { ice: buildIceConfigFromEnv(process.env) } : {}),
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
    if (
      (body.inviteId !== undefined && String(body.inviteId) !== String(actor.invite.id)) ||
      (body.sessionId !== undefined && String(body.sessionId) !== inviteSessionId)
    ) {
      return privateJson({ error: 'Signalling room does not match this invite.' }, 403)
    }
    if (actor.sender === 'guest' && body.type === 'bye' && body.sessionId === inviteSessionId) {
      await dropGuest(payload, String(actor.invite.id), 'guest-left')
      return privateJson({ ok: true })
    }
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
