/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-10 (POD-REQ-21/22/24): guest invite + lobby + signalling service
 * (SERVER). All state lives in Postgres through Payload collections:
 *
 * - `podcast-guest-invites`: one row per invite (session rel, optional
 *   guest-book rel, token hashes only, lobby state, expiry/revocation).
 * - `podcast-signalling-messages`: the durable signalling log.
 *
 * Signalling transport: HTTP long-poll over that log. Rationale: the
 * repo has NO WebSocket server, and its one realtime layer (SSE over
 * the `realtime-events` collection, src/app/(frontend)/api/realtime)
 * requires an authenticated team member — guests join with a display
 * name only and hold no account, so that layer cannot carry guest
 * signalling. WebRTC SDP/ICE exchange is request/response shaped and
 * works over long-poll; the cost is push latency bounded by the poll
 * window (25 s cap, typically instant because the poll returns as soon
 * as a row lands). No new external service, no new dependency.
 *
 * Admission gate: `admitGuest` calls POD-04's
 * `assertGuestAdmissionReady` — under a show's `block` consent policy
 * an unconsented guest is refused HERE, at the signalling/admission
 * layer, not merely flagged in a UI. Guests with no guest-book record
 * are evaluated as "no appearance on file" under the same policy.
 */
import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, type Payload } from 'payload'

import { transactionPayload } from '../../core/transaction-payload'
import {
  assertGuestAdmissionReady,
  evaluateGuestAdmission,
  PodcastGuestConsentError,
} from '../production'
import { addBank, addClip, removeClip } from '../session-engine'
import {
  loadStudioSessionRecord,
  saveStudioSessionRecord,
  type StudioSessionRecord,
} from '../sessions'
import {
  lobbyBoundAllows,
  transitionLobby,
  MAX_REMOTE_GUESTS,
  type HeadphoneDeclaration,
  type LobbyState,
} from './lobby'
import { buildIceConfigFromEnv, type IceConfig } from './peer-session'
import {
  validateGuestClip,
  validateSignalMessage,
  GUEST_CLIP_BANK_ID,
  type SignalMessage,
  type SignalSender,
} from './signalling-core'
import {
  evaluateInviteToken,
  generateGuestToken,
  guestTokenMatchesHash,
  hashGuestToken,
  GUEST_INVITE_DEFAULT_TTL_MS,
} from './tokens'

export const PODCAST_GUEST_INVITE_COLLECTION = 'podcast-guest-invites'
export const PODCAST_SIGNALLING_COLLECTION = 'podcast-signalling-messages'

export class PodcastGuestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

export type GuestInviteRecord = {
  id: string
  sessionId: string
  guestId: string | null
  state: LobbyState
  displayName: string | null
  headphones: HeadphoneDeclaration | null
  stripId: string
  expiresAt: string | null
  revokedAt: string | null
  joinedAt: string | null
  admittedAt: string | null
  dropReason: string | null
}

const toInviteRecord = (doc: any): GuestInviteRecord => ({
  id: String(doc.id),
  sessionId: relationId(doc.session),
  guestId: relationId(doc.guest) || null,
  state: String(doc.state ?? 'invited') as LobbyState,
  displayName: doc.displayName ?? null,
  headphones: (doc.headphones ?? null) as HeadphoneDeclaration | null,
  stripId: String(doc.stripId ?? ''),
  expiresAt: doc.expiresAt ?? null,
  revokedAt: doc.revokedAt ?? null,
  joinedAt: doc.joinedAt ?? null,
  admittedAt: doc.admittedAt ?? null,
  dropReason: doc.dropReason ?? null,
})

/** Structured lifecycle events. NEVER include a raw token or its hash. */
export function logGuestEvent(
  event: string,
  fields: { inviteId?: string; sessionId?: string; guestId?: string },
): void {
  console.log(JSON.stringify({ event: `podcast.guest.${event}`, ...fields }))
}

const findInviteByHash = async (
  payload: any,
  field: 'tokenHash' | 'signallingTokenHash',
  token: string,
): Promise<any | null> => {
  if (!token) return null
  const result = await payload.find({
    collection: PODCAST_GUEST_INVITE_COLLECTION,
    where: { [field]: { equals: hashGuestToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = result.docs[0]
  if (!doc) return null
  // Hash lookup + constant-time re-verification (POD-03 discipline).
  if (!guestTokenMatchesHash(token, doc[field])) return null
  return doc
}

/** Resolves an invite token at a boundary; throws PodcastGuestError when refused. */
export async function resolveInviteToken(
  payload: any,
  token: string,
  input: { sessionId?: string; forJoin?: boolean; nowMs?: number } = {},
): Promise<any> {
  const doc = await findInviteByHash(payload, 'tokenHash', token)
  const verdict = evaluateInviteToken(
    doc
      ? {
          purpose: doc.purpose,
          sessionId: relationId(doc.session),
          state: String(doc.state),
          expiresAt: doc.expiresAt ?? null,
          revokedAt: doc.revokedAt ?? null,
        }
      : null,
    {
      sessionId: input.sessionId,
      nowMs: input.nowMs ?? Date.now(),
      forJoin: input.forJoin ?? false,
    },
  )
  if (!verdict.ok) throw new PodcastGuestError(verdict.code, verdict.message)
  return doc
}

/** Resolves the post-join signalling credential; throws when refused. */
export async function resolveSignallingCredential(
  payload: any,
  credential: string,
  input: { sessionId?: string; nowMs?: number } = {},
): Promise<any> {
  const doc = await findInviteByHash(payload, 'signallingTokenHash', credential)
  const verdict = evaluateInviteToken(
    doc
      ? {
          purpose: doc.purpose,
          sessionId: relationId(doc.session),
          state: String(doc.state),
          expiresAt: doc.expiresAt ?? null,
          revokedAt: doc.revokedAt ?? null,
        }
      : null,
    { sessionId: input.sessionId, nowMs: input.nowMs ?? Date.now(), forJoin: false },
  )
  if (!verdict.ok) throw new PodcastGuestError(verdict.code, verdict.message)
  if (!doc.joinedAt) {
    throw new PodcastGuestError('invite-not-found', 'Guest has not joined yet.')
  }
  return doc
}

// ---------------------------------------------------------------------------
// Invite lifecycle
// ---------------------------------------------------------------------------

async function mutateLobby<T>(
  payload: Payload,
  sessionId: string,
  change: (transaction: Payload) => Promise<T>,
): Promise<T> {
  const req = await createLocalReq({}, payload)
  const transactionId = await payload.db.beginTransaction()
  if (!transactionId) throw new Error('Guest lobby requires transactional storage.')
  req.transactionID = transactionId
  try {
    const adapter = payload.db as unknown as {
      sessions: Record<string, { db: { execute(statement: unknown): Promise<unknown> } }>
    }
    await adapter.sessions[transactionId].db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${'podcast-guest-lobby:' + sessionId}, 0))`,
    )
    const result = await change(transactionPayload(payload, req))
    await payload.db.commitTransaction(transactionId)
    return result
  } catch (error) {
    await payload.db.rollbackTransaction(transactionId)
    throw error
  }
}

async function loadGuestInvite(payload: Payload, inviteId: string) {
  const doc = await payload
    .findByID({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: inviteId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!doc) throw new PodcastGuestError('invite-not-found', 'Guest invite not found.')
  return doc as any
}

async function mutateInvite<T>(
  payload: Payload,
  inviteId: string,
  change: (transaction: Payload) => Promise<T>,
) {
  const invite = await loadGuestInvite(payload, inviteId)
  return mutateLobby(payload, relationId(invite.session), change)
}

/**
 * Issues an invite for a studio session record. Issuing a replacement
 * for the same (session, guest) revokes the previous active invite
 * instantly (rotation semantics). Returns the raw token ONCE.
 */
export async function issueGuestInvite(
  payload: any,
  input: { sessionRecordId: string; guestId?: string | null; ttlMs?: number; nowMs?: number },
): Promise<{ invite: GuestInviteRecord; token: string }> {
  return mutateLobby(payload, input.sessionRecordId, async (payload) => {
    const record = await loadStudioSessionRecord(payload, input.sessionRecordId)
    if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
    const nowMs = input.nowMs ?? Date.now()
    if (input.guestId) {
      const existing = await payload.find({
        collection: PODCAST_GUEST_INVITE_COLLECTION,
        where: {
          and: [
            { session: { equals: input.sessionRecordId } },
            { guest: { equals: input.guestId } },
            { state: { in: ['invited', 'preflight', 'waiting'] } },
          ],
        },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      for (const stale of existing.docs as any[]) {
        await payload.update({
          collection: PODCAST_GUEST_INVITE_COLLECTION,
          id: stale.id,
          data: {
            revokedAt: new Date(nowMs).toISOString(),
            state: 'dropped',
            dropReason: 'rotated',
          },
          overrideAccess: true,
        })
      }
    }
    const token = generateGuestToken()
    const doc = await payload.create({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      data: {
        purpose: 'guest-invite',
        session: input.sessionRecordId,
        show: record.showId,
        site: record.siteId,
        ...(input.guestId ? { guest: input.guestId } : {}),
        tokenHash: hashGuestToken(token),
        state: 'invited',
        stripId: '',
        expiresAt: new Date(nowMs + (input.ttlMs ?? GUEST_INVITE_DEFAULT_TTL_MS)).toISOString(),
      },
      overrideAccess: true,
    })
    const invite = toInviteRecord(doc)
    invite.stripId = `guest-${invite.id.slice(0, 8)}`
    await payload.update({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: doc.id,
      data: { stripId: invite.stripId },
      overrideAccess: true,
    })
    logGuestEvent('issued', { inviteId: invite.id, sessionId: input.sessionRecordId })
    return { invite, token }
  })
}

/**
 * Guest join: display name only, no account. Consumes the single-use
 * invite token (invited → preflight → waiting) and returns the
 * signalling credential ONCE. A second join with the same token is
 * refused (`invite-already-used`).
 */
export async function joinGuest(
  payload: any,
  input: {
    token: string
    displayName: string
    headphones: HeadphoneDeclaration
    nowMs?: number
  },
): Promise<{ invite: GuestInviteRecord; signallingCredential: string; ice: IceConfig }> {
  const name = input.displayName?.trim()
  if (!name) throw new PodcastGuestError('display-name-required', 'A display name is required.')
  if (input.headphones !== 'headphones' && input.headphones !== 'no-headphones-fallback') {
    throw new PodcastGuestError(
      'headphones-required',
      'Declare headphones or the no-headphones fallback before joining.',
    )
  }
  const candidate = await resolveInviteToken(payload, input.token, {
    forJoin: true,
    nowMs: input.nowMs,
  })
  return mutateLobby(payload, relationId(candidate.session), async (payload) => {
    const doc = await resolveInviteToken(payload, input.token, {
      forJoin: true,
      nowMs: input.nowMs,
    })
    const preflight = transitionLobby('invited', 'preflight')
    if (!preflight.ok) throw new PodcastGuestError(preflight.code, preflight.message)
    const waiting = transitionLobby('preflight', 'waiting')
    if (!waiting.ok) throw new PodcastGuestError(waiting.code, waiting.message)
    const credential = generateGuestToken()
    const updated = await payload.update({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: doc.id,
      data: {
        state: 'waiting',
        displayName: name,
        headphones: input.headphones,
        signallingTokenHash: hashGuestToken(credential),
        joinedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
      },
      overrideAccess: true,
    })
    logGuestEvent('joined', { inviteId: String(doc.id), sessionId: relationId(doc.session) })
    return {
      invite: toInviteRecord(updated),
      signallingCredential: credential,
      ice: buildIceConfigFromEnv(process.env),
    }
  })
}

async function mirrorGuestIntoSessionDoc(
  payload: any,
  invite: GuestInviteRecord,
  peerState: string,
): Promise<StudioSessionRecord | null> {
  const record = await loadStudioSessionRecord(payload, invite.sessionId)
  if (!record) return null
  const doc = record.session as any
  const guests: any[] = Array.isArray(doc.guests) ? doc.guests : []
  const entry = {
    inviteId: invite.id,
    guestId: invite.guestId,
    displayName: invite.displayName,
    lobbyState: invite.state,
    peerState,
    stripId: invite.stripId,
    headphones: invite.headphones,
  }
  const idx = guests.findIndex((g) => g.inviteId === invite.id)
  if (idx >= 0) guests[idx] = entry
  else guests.push(entry)
  doc.guests = guests
  if (
    invite.state === 'admitted' &&
    !doc.mixer.channels.some((c: any) => c.id === invite.stripId)
  ) {
    doc.mixer.channels.push({ id: invite.stripId, gainDb: 0, muted: false })
  }
  return saveStudioSessionRecord(payload, record.id, doc)
}

/**
 * Host admission: consent gate (POD-04) + mesh bound, then
 * waiting → admitted, mirrored into the POD-05 session doc (guest
 * entry + a mixer channel for their strip, which is what POD-07's
 * mix-minus and POD-09's guest ISO slot key off).
 */
export async function admitGuest(
  payload: any,
  inviteId: string,
): Promise<{ invite: GuestInviteRecord; warnings: string[] }> {
  return mutateInvite(payload, inviteId, async (payload) => {
    const doc = await loadGuestInvite(payload, inviteId)
    const invite = toInviteRecord(doc)
    const transition = transitionLobby(invite.state, 'admitted')
    if (!transition.ok) throw new PodcastGuestError(transition.code, transition.message)
    if (doc.revokedAt)
      throw new PodcastGuestError('invite-revoked', 'Guest invite has been revoked.')
    if (doc.expiresAt && Date.parse(doc.expiresAt) <= Date.now()) {
      throw new PodcastGuestError('invite-expired', 'Guest invite has expired.')
    }
    // Consent gate (POD-04): block policy refuses here.
    const record = await loadStudioSessionRecord(payload, invite.sessionId)
    if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
    const show = await payload
      .findByID({ collection: 'podcast-shows', id: record.showId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!show) throw new PodcastGuestError('show-not-found', 'Podcast show not found.')
    let warnings: string[] = []
    if (invite.guestId) {
      const admission = await assertGuestAdmissionReady(payload, show, invite.guestId)
      warnings = admission.warnings
    } else {
      const admission = evaluateGuestAdmission(show.guestConsentPolicy, [])
      if (!admission.ready) {
        throw new PodcastGuestConsentError(
          String(show.id),
          invite.id,
          admission.missingAppearanceIds,
        )
      }
      warnings = admission.warnings
    }
    // Mesh bound: host + ≤ MAX_REMOTE_GUESTS admitted.
    const admitted = await payload.find({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      where: {
        and: [{ session: { equals: invite.sessionId } }, { state: { equals: 'admitted' } }],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    if (!lobbyBoundAllows(admitted.docs.length)) {
      throw new PodcastGuestError(
        'lobby-bound',
        `Lobby is full: at most ${MAX_REMOTE_GUESTS} remote guests can be admitted alongside the host.`,
      )
    }
    const updated = await payload.update({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: inviteId,
      data: { state: 'admitted', admittedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const admittedInvite = toInviteRecord(updated)
    await mirrorGuestIntoSessionDoc(payload, admittedInvite, 'admitted')
    logGuestEvent('admitted', { inviteId, sessionId: invite.sessionId })
    return { invite: admittedInvite, warnings }
  })
}

export async function revokeGuestInvite(
  payload: any,
  inviteId: string,
): Promise<GuestInviteRecord> {
  return mutateInvite(payload, inviteId, async (payload) => {
    const doc = await loadGuestInvite(payload, inviteId)
    const terminal =
      doc.state === 'admitted' || doc.state === 'waiting' || doc.state === 'preflight'
    const updated = await payload.update({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: inviteId,
      data: {
        revokedAt: new Date().toISOString(),
        ...(terminal ? { state: 'dropped', dropReason: 'revoked' } : {}),
      },
      overrideAccess: true,
    })
    const invite = toInviteRecord(updated)
    if (terminal) await mirrorGuestIntoSessionDoc(payload, invite, 'dropped')
    logGuestEvent('revoked', { inviteId, sessionId: invite.sessionId })
    return invite
  })
}

export async function dropGuest(
  payload: any,
  inviteId: string,
  reason = 'dropped-by-host',
): Promise<GuestInviteRecord> {
  return mutateInvite(payload, inviteId, async (payload) => {
    const doc = await loadGuestInvite(payload, inviteId)
    const invite = toInviteRecord(doc)
    const transition = transitionLobby(invite.state, 'dropped')
    if (!transition.ok) throw new PodcastGuestError(transition.code, transition.message)
    const updated = await payload.update({
      collection: PODCAST_GUEST_INVITE_COLLECTION,
      id: inviteId,
      data: { state: 'dropped', dropReason: reason },
      overrideAccess: true,
    })
    const dropped = toInviteRecord(updated)
    await mirrorGuestIntoSessionDoc(payload, dropped, 'dropped')
    logGuestEvent('dropped', { inviteId, sessionId: invite.sessionId })
    return dropped
  })
}

export async function listGuestInvites(
  payload: any,
  sessionRecordId: string,
): Promise<GuestInviteRecord[]> {
  const result = await payload.find({
    collection: PODCAST_GUEST_INVITE_COLLECTION,
    where: { session: { equals: sessionRecordId } },
    sort: 'createdAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as any[]).map(toInviteRecord)
}

// ---------------------------------------------------------------------------
// Signalling over the durable message log (long-poll)
// ---------------------------------------------------------------------------

export async function postSignalMessage(
  payload: any,
  input: {
    invite: any
    sender: SignalSender
    type: SignalMessage['type']
    payload: Record<string, unknown>
    sessionId: string
  },
): Promise<any> {
  const invite = toInviteRecord(input.invite)
  const verdict = validateSignalMessage({
    lobbyState: invite.state,
    inviteSessionId: invite.sessionId,
    message: { sessionId: input.sessionId, type: input.type },
  })
  if (!verdict.ok) throw new PodcastGuestError(verdict.code, verdict.message)
  return payload.create({
    collection: PODCAST_SIGNALLING_COLLECTION,
    data: {
      session: invite.sessionId,
      invite: invite.id,
      sender: input.sender,
      type: input.type,
      payload: input.payload ?? {},
    },
    overrideAccess: true,
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Long-poll: returns messages for the invite from the OTHER sender,
 * created after `afterIso`. Waits up to `waitMs` (capped at 25 s),
 * checking the durable log every 500 ms.
 */
export async function pollSignalMessages(
  payload: any,
  input: {
    invite: any
    forSender: SignalSender
    afterIso?: string
    afterId?: string
    waitMs?: number
  },
): Promise<any[]> {
  const invite = toInviteRecord(input.invite)
  const other: SignalSender = input.forSender === 'guest' ? 'host' : 'guest'
  const deadline = Date.now() + Math.min(Math.max(input.waitMs ?? 0, 0), 25_000)
  for (;;) {
    const result = await payload.find({
      collection: PODCAST_SIGNALLING_COLLECTION,
      where: {
        and: [
          { invite: { equals: invite.id } },
          { sender: { equals: other } },
          ...(input.afterIso
            ? [
                {
                  or: [
                    { createdAt: { greater_than: input.afterIso } },
                    ...(input.afterId
                      ? [
                          {
                            and: [
                              { createdAt: { equals: input.afterIso } },
                              { id: { greater_than: input.afterId } },
                            ],
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
        ],
      },
      sort: 'createdAt',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    if (result.docs.length > 0 || Date.now() >= deadline) return result.docs
    await sleep(500)
  }
}

// ---------------------------------------------------------------------------
// Guest clip slots (POD-REQ-24)
//
// An admitted guest registers a clip (bytes land through the existing
// media upload path; this service binds the resulting media asset to
// the (session, guest) slot). The clip lands in the session doc's
// 'guest-slots' cart bank (POD-08 engine plays it; POD-05 cart model)
// plus a `guestClips` extension entry carrying the binding. Cross-
// session registration is denied by construction (the credential only
// resolves its own invite, and the invite names exactly one session)
// and by the explicit session check in validateGuestClip.
// ---------------------------------------------------------------------------

export async function registerGuestClip(
  payload: any,
  input: {
    credential: string
    sessionId: string
    title: string
    sizeBytes: number
    mediaAssetId: string
  },
): Promise<{ clipId: string; invite: GuestInviteRecord }> {
  const doc = await resolveSignallingCredential(payload, input.credential, {
    sessionId: input.sessionId,
  })
  const invite = toInviteRecord(doc)
  const verdict = validateGuestClip({
    lobbyState: invite.state,
    inviteSessionId: invite.sessionId,
    sessionId: input.sessionId,
    sizeBytes: input.sizeBytes,
  })
  if (!verdict.ok) throw new PodcastGuestError(verdict.code, verdict.message)
  const record = await loadStudioSessionRecord(payload, invite.sessionId)
  if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
  let session = record.session
  if (!session.cartwall.banks.some((bank) => bank.id === GUEST_CLIP_BANK_ID)) {
    const added = addBank(session, { id: GUEST_CLIP_BANK_ID, name: 'Guest clips' })
    if (!added.ok)
      throw new PodcastGuestError('clip-bank-failed', 'Could not open the guest clip bank.')
    session = added.session
  }
  const clipTitle = input.title?.trim() || `${invite.displayName ?? 'Guest'} clip`
  const addedClip = addClip(session, GUEST_CLIP_BANK_ID, { title: clipTitle })
  if (!addedClip.ok || !addedClip.clipId) {
    throw new PodcastGuestError('clip-add-failed', 'Could not add the clip to the guest slot bank.')
  }
  const docAny = addedClip.session as any
  const guestClips: any[] = Array.isArray(docAny.guestClips) ? docAny.guestClips : []
  guestClips.push({
    clipId: addedClip.clipId,
    inviteId: invite.id,
    sessionId: invite.sessionId,
    mediaAssetId: input.mediaAssetId,
    sizeBytes: input.sizeBytes,
    title: clipTitle,
    state: 'ready',
    uploadedAt: new Date().toISOString(),
  })
  docAny.guestClips = guestClips
  await saveStudioSessionRecord(payload, record.id, addedClip.session)
  logGuestEvent('clip-registered', { inviteId: invite.id, sessionId: invite.sessionId })
  return { clipId: addedClip.clipId, invite }
}

/** Host revokes a guest clip: removes it from the bank + binding list. Nothing leaks to other sessions. */
export async function revokeGuestClip(
  payload: any,
  input: { sessionRecordId: string; clipId: string },
): Promise<void> {
  const record = await loadStudioSessionRecord(payload, input.sessionRecordId)
  if (!record) throw new PodcastGuestError('session-not-found', 'Studio session not found.')
  const docAny = record.session as any
  const guestClips: any[] = Array.isArray(docAny.guestClips) ? docAny.guestClips : []
  if (!guestClips.some((clip) => clip.clipId === input.clipId)) {
    throw new PodcastGuestError('clip-not-found', 'Guest clip not found in this session.')
  }
  const removed = removeClip(record.session, input.clipId)
  if (!removed.ok)
    throw new PodcastGuestError('clip-remove-failed', 'Could not remove the guest clip.')
  const nextDoc = removed.session as any
  nextDoc.guestClips = guestClips.filter((clip) => clip.clipId !== input.clipId)
  await saveStudioSessionRecord(payload, record.id, removed.session)
}
