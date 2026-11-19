/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-10 (POD-REQ-21/22/24) against real Payload + Postgres:
 *
 * - Invite lifecycle: issue → join (name only) → admit → revoke, with
 *   the guest mirrored into the POD-05 session doc (+ mixer strip).
 * - Token attacks (PT-E suite): expired / revoked / reused / tampered
 *   tokens refused at the join boundary; cross-session tokens refused
 *   at the signalling AND clip-upload boundaries; a guest token
 *   presented to the staff invites route is refused (401).
 * - Pre-admission signalling refused in the service (media messages),
 *   admitted signalling flows both ways over the durable log.
 * - Consent gate: a block-policy show refuses an unconsented guest at
 *   admission; a warn-policy show admits with warnings.
 * - Lobby bound: the 4th admission is refused (host + ≤3).
 * - Clip slots: an admitted guest's clip lands in the session's
 *   'guest-slots' bank; host revocation removes it; nothing leaks
 *   into another session.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  createStudioSessionRecord,
  loadStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import {
  admitGuest,
  dropGuest,
  issueGuestInvite,
  joinGuest,
  listGuestInvites,
  pollSignalMessages,
  postSignalMessage,
  registerGuestClip,
  resolveSignallingCredential,
  revokeGuestClip,
  revokeGuestInvite,
} from '../../src/modules/podcast-studio/guests/service'
import { POST as invitesPost } from '../../src/app/(frontend)/api/podcast-studio/guests/invites/route'
import { seed } from '../../src/scripts/seed'

let payload: Payload
let site: any
const runId = randomUUID().slice(0, 8)

async function makeShow(policy: 'warn' | 'block', suffix: string) {
  return payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-10 ${suffix} ${runId}`,
      slug: `pod10-${suffix}-${runId}`,
      status: 'draft',
      guestConsentPolicy: policy,
    } as any,
    overrideAccess: true,
  })
}

async function makeSessionRecord(show: any) {
  const session = createSession({ showId: String(show.id), showTitle: String(show.title) })
  return createStudioSessionRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    title: String(show.title),
    session,
  })
}

async function makeGuestBookGuest(name: string) {
  return (payload as any).create({
    collection: 'podcast-guests',
    data: { site: site.id, name } as any,
    overrideAccess: true,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()
}, 120_000)

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('POD-10 guest lifecycle', () => {
  it('issue → join → admit → revoke, mirrored into the session doc', async () => {
    const show = await makeShow('warn', 'lifecycle')
    const record = await makeSessionRecord(show)
    const { invite, token } = await issueGuestInvite(payload as never, {
      sessionRecordId: record.id,
    })
    expect(token.length).toBeGreaterThan(20)
    // Hash-only at rest: the stored row never carries the raw token.
    const stored = await payload.findByID({
      collection: 'podcast-guest-invites',
      id: invite.id,
      overrideAccess: true,
    } as never)
    expect(JSON.stringify(stored)).not.toContain(token)

    const joined = await joinGuest(payload as never, {
      token,
      displayName: 'Ada Guest',
      headphones: 'headphones',
    })
    expect(joined.invite.state).toBe('waiting')
    expect(joined.invite.displayName).toBe('Ada Guest')
    expect(joined.signallingCredential).toBeTruthy()
    expect(joined.ice.iceServers.length).toBeGreaterThan(0)

    const admitted = await admitGuest(payload as never, invite.id)
    expect(admitted.invite.state).toBe('admitted')

    const mirrored = await loadStudioSessionRecord(payload as never, record.id)
    const guests = (mirrored!.session as any).guests as any[]
    expect(guests).toHaveLength(1)
    expect(guests[0]).toMatchObject({ inviteId: invite.id, lobbyState: 'admitted' })
    expect(mirrored!.session.mixer.channels.some((c: any) => c.id === invite.stripId)).toBe(true)

    const revoked = await revokeGuestInvite(payload as never, invite.id)
    expect(revoked.state).toBe('dropped')
    expect(revoked.revokedAt).toBeTruthy()
  })

  it('token attacks: expired, reused, revoked and tampered tokens are refused at join', async () => {
    const show = await makeShow('warn', 'attacks')
    const record = await makeSessionRecord(show)

    const expired = await issueGuestInvite(payload as never, {
      sessionRecordId: record.id,
      ttlMs: -1_000,
    })
    await expect(
      joinGuest(payload as never, {
        token: expired.token,
        displayName: 'Late',
        headphones: 'headphones',
      }),
    ).rejects.toMatchObject({ code: 'invite-expired' })

    const reused = await issueGuestInvite(payload as never, { sessionRecordId: record.id })
    await joinGuest(payload as never, {
      token: reused.token,
      displayName: 'First',
      headphones: 'headphones',
    })
    await expect(
      joinGuest(payload as never, {
        token: reused.token,
        displayName: 'Second',
        headphones: 'headphones',
      }),
    ).rejects.toMatchObject({ code: 'invite-already-used' })

    const revoked = await issueGuestInvite(payload as never, { sessionRecordId: record.id })
    await revokeGuestInvite(payload as never, revoked.invite.id)
    await expect(
      joinGuest(payload as never, {
        token: revoked.token,
        displayName: 'Revoked',
        headphones: 'headphones',
      }),
    ).rejects.toMatchObject({ code: 'invite-revoked' })

    await expect(
      joinGuest(payload as never, {
        token: 'tampered-token-that-never-existed',
        displayName: 'Tamper',
        headphones: 'headphones',
      }),
    ).rejects.toMatchObject({ code: 'invite-not-found' })

    // Rotation: re-issuing for the same guest-book guest revokes the old invite instantly.
    const guest = await makeGuestBookGuest(`Rotate ${runId}`)
    const first = await issueGuestInvite(payload as never, {
      sessionRecordId: record.id,
      guestId: String(guest.id),
    })
    await issueGuestInvite(payload as never, {
      sessionRecordId: record.id,
      guestId: String(guest.id),
    })
    await expect(
      joinGuest(payload as never, {
        token: first.token,
        displayName: 'Old Link',
        headphones: 'headphones',
      }),
    ).rejects.toMatchObject({ code: 'invite-revoked' })
  })
})

describe('POD-10 signalling authorization', () => {
  it('pre-admission media refused; admitted media flows; cross-session refused everywhere', async () => {
    const show = await makeShow('warn', 'signalling')
    const recordA = await makeSessionRecord(show)
    const recordB = await makeSessionRecord(show)
    const { invite, token } = await issueGuestInvite(payload as never, {
      sessionRecordId: recordA.id,
    })
    const joined = await joinGuest(payload as never, {
      token,
      displayName: 'Sig Guest',
      headphones: 'no-headphones-fallback',
    })
    const credentialDoc = await resolveSignallingCredential(
      payload as never,
      joined.signallingCredential,
    )

    // Pre-admission: media negotiation refused at the signalling layer.
    await expect(
      postSignalMessage(payload as never, {
        invite: credentialDoc,
        sender: 'guest',
        type: 'offer',
        payload: { sdp: 'v=0' },
        sessionId: recordA.id,
      }),
    ).rejects.toMatchObject({ code: 'signal-pre-admission' })
    // Control messages carry no media and are allowed pre-admission.
    await postSignalMessage(payload as never, {
      invite: credentialDoc,
      sender: 'guest',
      type: 'hello',
      payload: {},
      sessionId: recordA.id,
    })

    await admitGuest(payload as never, invite.id)
    const admittedDoc = await resolveSignallingCredential(
      payload as never,
      joined.signallingCredential,
    )
    await postSignalMessage(payload as never, {
      invite: admittedDoc,
      sender: 'guest',
      type: 'offer',
      payload: { sdp: 'v=0 offer' },
      sessionId: recordA.id,
    })
    const hostInbox = await pollSignalMessages(payload as never, {
      invite: admittedDoc,
      forSender: 'host',
    })
    expect(hostInbox.some((m: any) => m.type === 'offer')).toBe(true)

    // Cross-session: the same credential/message aimed at session B is refused.
    await expect(
      postSignalMessage(payload as never, {
        invite: admittedDoc,
        sender: 'guest',
        type: 'offer',
        payload: { sdp: 'v=0' },
        sessionId: recordB.id,
      }),
    ).rejects.toMatchObject({ code: 'signal-wrong-session' })
    await expect(
      resolveSignallingCredential(payload as never, joined.signallingCredential, {
        sessionId: recordB.id,
      }),
    ).rejects.toMatchObject({ code: 'invite-wrong-session' })

    await dropGuest(payload as never, invite.id)
    const droppedDoc = await payload.findByID({
      collection: 'podcast-guest-invites',
      id: invite.id,
      overrideAccess: true,
    } as never)
    await expect(
      postSignalMessage(payload as never, {
        invite: droppedDoc,
        sender: 'guest',
        type: 'bye',
        payload: {},
        sessionId: recordA.id,
      }),
    ).rejects.toMatchObject({ code: 'signal-session-over' })
  })

  it('privilege escalation: a guest token presented to the staff invites route gets 401', async () => {
    const show = await makeShow('warn', 'escalation')
    const record = await makeSessionRecord(show)
    const { token } = await issueGuestInvite(payload as never, { sessionRecordId: record.id })
    const request = new Request('http://localhost/api/podcast-studio/guests/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionRecordId: record.id }),
    })
    const response = await invitesPost(request)
    expect(response.status).toBe(401)
  })
})

describe('POD-10 consent gate + lobby bound', () => {
  it('block policy refuses an unconsented guest at admission; warn admits with warnings; consent on file admits under block', async () => {
    const blockShow = await makeShow('block', 'block')
    const blockRecord = await makeSessionRecord(blockShow)
    const unconsented = await makeGuestBookGuest(`Unconsented ${runId}`)
    const blocked = await issueGuestInvite(payload as never, {
      sessionRecordId: blockRecord.id,
      guestId: String(unconsented.id),
    })
    await joinGuest(payload as never, {
      token: blocked.token,
      displayName: 'No Consent',
      headphones: 'headphones',
    })
    await expect(admitGuest(payload as never, blocked.invite.id)).rejects.toMatchObject({
      code: 'PODCAST_GUEST_CONSENT_REQUIRED',
    })
    const stillWaiting = (await listGuestInvites(payload as never, blockRecord.id)).find(
      (i) => i.id === blocked.invite.id,
    )
    expect(stillWaiting?.state).toBe('waiting')

    // Consent recorded on an appearance for an episode of the show → block admits.
    const consented = await makeGuestBookGuest(`Consented ${runId}`)
    const episode = await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: blockShow.id,
        title: `POD-10 episode ${runId}`,
        slug: `pod10-ep-${runId}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })
    await (payload as any).create({
      collection: 'podcast-guest-appearances',
      data: {
        guest: consented.id,
        episode: episode.id,
        consentAt: new Date().toISOString(),
        consentBy: 'host',
      } as any,
      overrideAccess: true,
    })
    const okInvite = await issueGuestInvite(payload as never, {
      sessionRecordId: blockRecord.id,
      guestId: String(consented.id),
    })
    await joinGuest(payload as never, {
      token: okInvite.token,
      displayName: 'Consented',
      headphones: 'headphones',
    })
    const admitted = await admitGuest(payload as never, okInvite.invite.id)
    expect(admitted.invite.state).toBe('admitted')

    // Warn policy: unconsented guest admitted, warning surfaced.
    const warnShow = await makeShow('warn', 'warn')
    const warnRecord = await makeSessionRecord(warnShow)
    const warnGuest = await makeGuestBookGuest(`Warn ${runId}`)
    const warnInvite = await issueGuestInvite(payload as never, {
      sessionRecordId: warnRecord.id,
      guestId: String(warnGuest.id),
    })
    await joinGuest(payload as never, {
      token: warnInvite.token,
      displayName: 'Warn Me',
      headphones: 'headphones',
    })
    const warnAdmitted = await admitGuest(payload as never, warnInvite.invite.id)
    expect(warnAdmitted.invite.state).toBe('admitted')
    expect(warnAdmitted.warnings.length).toBeGreaterThan(0)
  })

  it('lobby bound: the 4th admission is refused (host + ≤3)', async () => {
    const show = await makeShow('warn', 'bound')
    const record = await makeSessionRecord(show)
    for (let i = 0; i < 3; i++) {
      const { invite, token } = await issueGuestInvite(payload as never, {
        sessionRecordId: record.id,
      })
      await joinGuest(payload as never, {
        token,
        displayName: `Guest ${i + 1}`,
        headphones: 'headphones',
      })
      await admitGuest(payload as never, invite.id)
    }
    const fourth = await issueGuestInvite(payload as never, { sessionRecordId: record.id })
    await joinGuest(payload as never, {
      token: fourth.token,
      displayName: 'Guest 4',
      headphones: 'headphones',
    })
    await expect(admitGuest(payload as never, fourth.invite.id)).rejects.toMatchObject({
      code: 'lobby-bound',
    })
  })
})

describe('POD-10 guest clip slots', () => {
  it('admitted guest clip lands in the guest-slots bank; cross-session + oversize refused; host revoke removes it', async () => {
    const show = await makeShow('warn', 'clips')
    const recordA = await makeSessionRecord(show)
    const recordB = await makeSessionRecord(show)
    const { invite, token } = await issueGuestInvite(payload as never, {
      sessionRecordId: recordA.id,
    })
    const joined = await joinGuest(payload as never, {
      token,
      displayName: 'Clip Guest',
      headphones: 'headphones',
    })

    // Not admitted yet → refused.
    await expect(
      registerGuestClip(payload as never, {
        credential: joined.signallingCredential,
        sessionId: recordA.id,
        title: 'Too early',
        sizeBytes: 1024,
        mediaAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({ code: 'clip-not-admitted' })

    await admitGuest(payload as never, invite.id)

    // Cross-session → refused by construction + explicit check.
    await expect(
      registerGuestClip(payload as never, {
        credential: joined.signallingCredential,
        sessionId: recordB.id,
        title: 'Wrong session',
        sizeBytes: 1024,
        mediaAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({ code: 'invite-wrong-session' })

    // Oversize (> 60 MB) → refused.
    await expect(
      registerGuestClip(payload as never, {
        credential: joined.signallingCredential,
        sessionId: recordA.id,
        title: 'Huge',
        sizeBytes: 61 * 1024 * 1024,
        mediaAssetId: 'asset-1',
      }),
    ).rejects.toMatchObject({ code: 'clip-too-large' })

    const { clipId } = await registerGuestClip(payload as never, {
      credential: joined.signallingCredential,
      sessionId: recordA.id,
      title: 'Guest sting',
      sizeBytes: 2048,
      mediaAssetId: 'asset-1',
    })
    const docA = await loadStudioSessionRecord(payload as never, recordA.id)
    const bank = docA!.session.cartwall.banks.find((b) => b.id === 'guest-slots')
    expect(bank?.clips.some((c) => c.id === clipId)).toBe(true)
    expect((docA!.session as any).guestClips).toHaveLength(1)
    // Nothing leaked into the other session.
    const docB = await loadStudioSessionRecord(payload as never, recordB.id)
    expect(docB!.session.cartwall.banks.some((b) => b.id === 'guest-slots')).toBe(false)

    await revokeGuestClip(payload as never, { sessionRecordId: recordA.id, clipId })
    const after = await loadStudioSessionRecord(payload as never, recordA.id)
    expect(
      after!.session.cartwall.banks
        .find((b) => b.id === 'guest-slots')
        ?.clips.some((c) => c.id === clipId),
    ).toBe(false)
    expect((after!.session as any).guestClips).toHaveLength(0)
  })
})
