import { createHash, generateKeyPairSync, sign } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { POST } from '@/app/(frontend)/ap/actors/[handle]/inbox/route'
import { blockRemoteSource, followRemoteActor } from '@/modules/network/service'

/**
 * RC3-22 #69 — federation SANDBOX DEMO (local peers only).
 *
 * Two synthetic remote peers exchange posts and replies with one local
 * install through the real inbox route and the real network service:
 * follow (both directions), standalone post, reply, author-verified
 * delete, non-author delete refusal, and block. Both peers are
 * in-process fixtures with throwaway keys and the remote fetch seam
 * stubbed — this is a local sandbox demonstration ONLY. Public/remote
 * interop with real servers stays NOT VERIFIED (see
 * docs/rc3/evidence/RC3-22/RESULT.md).
 */

process.env.NETWORKING_ENABLED = 'true'

const APP_ORIGIN = (process.env.APP_URL ?? 'http://127.0.0.1:3114').replace(/\/$/, '')
const APP_HOST = new URL(APP_ORIGIN).host
const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

const makePeer = (origin: string, name: string) => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const actorUrl = `${origin}/users/${name}`
  return {
    origin,
    actorUrl,
    keyId: `${actorUrl}#main-key`,
    privatePem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }
}
// Origins carry the run suffix: the acceptance database is shared, and
// network policy decisions recorded by other suites for a generic
// origin (e.g. RC3-01's peer.example) must not leak into this demo.
const peerP = makePeer(`https://peer-${suffix}.example`, 'alice')
const peerQ = makePeer(`https://stranger-${suffix}.example`, 'mallory')

const actorDocFor = (peer: ReturnType<typeof makePeer>) => ({
  '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
  id: peer.actorUrl,
  type: 'Person',
  preferredUsername: peer.actorUrl.split('/').pop(),
  inbox: `${peer.actorUrl}/inbox`,
  outbox: `${peer.actorUrl}/outbox`,
  publicKey: { id: peer.keyId, owner: peer.actorUrl, publicKeyPem: peer.publicPem },
})

vi.mock('@/modules/network/safe-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/network/safe-fetch')>()
  return {
    ...actual,
    // The real fetchRemoteJson takes a URL string and resolves to the
    // parsed document itself.
    fetchRemoteJson: async (url: string) => {
      for (const peer of [peerP, peerQ]) if (url === peer.actorUrl) return actorDocFor(peer)
      throw new Error(`Unexpected remote fetch in federation demo: ${url}`)
    },
  }
})

const localKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
process.env.ACTIVITYPUB_PUBLIC_KEY_PEM = localKeys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .replace(/\n/g, '\\n')

describe('federation sandbox demo (RC3-22, local peers only)', () => {
  let payload: Payload
  let handle = ''
  let localActorUrl = ''
  let accountId = ''
  let discussionId = ''
  let discussionPath = ''
  let priorOriginsBySite: Record<string, unknown> | null = null
  let siteId = ''
  let senderSeq = 0
  const created: { collection: string; id: string }[] = []
  const track = (collection: string, id: unknown) => {
    if (id) created.push({ collection, id: String(id) })
  }

  const NOTE_POST = `${peerP.origin}/notes/post-${suffix}`
  const NOTE_POST2 = `${peerP.origin}/notes/post2-${suffix}`
  const NOTE_REPLY = `${peerP.origin}/notes/reply-${suffix}`
  const NOTE_STRANGER = `${peerQ.origin}/notes/stranger-${suffix}`

  const deliver = async (peer: ReturnType<typeof makePeer>, activity: Record<string, unknown>) => {
    const body = JSON.stringify(activity)
    const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`
    const date = new Date().toUTCString()
    const target = `post /ap/actors/${handle}/inbox`
    const signingString = `(request-target): ${target}\nhost: ${APP_HOST}\ndate: ${date}\ndigest: ${digest}`
    const signature = sign('sha256', Buffer.from(signingString), peer.privatePem).toString('base64')
    senderSeq += 1
    const request = new Request(`${APP_ORIGIN}/ap/actors/${handle}/inbox`, {
      method: 'POST',
      headers: {
        host: APP_HOST,
        date,
        digest,
        signature: `keyId="${peer.keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
        'content-type': 'application/activity+json',
        'x-forwarded-for': `10.8.${senderSeq}.1`,
      },
      body,
    })
    const response = await POST(request, { params: Promise.resolve({ handle }) })
    return response.status
  }

  const remoteObject = async (canonicalId: string) => {
    const found = await payload.find({
      collection: 'remote-objects',
      where: { canonicalId: { equals: canonicalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs[0] as unknown as
      | { id: string; visibility?: string; actor?: unknown }
      | undefined
  }

  const replyPost = async () => {
    const found = await payload.find({
      collection: 'discussion-posts',
      where: {
        paginationAnchor: {
          equals: `federation:${peerP.origin}/activities/reply-${suffix}`,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return found.docs[0] as unknown as
      | { id: string; status?: string; moderationState?: string; federation?: unknown }
      | undefined
  }

  beforeAll(async () => {
    payload = await getPayload({ config })

    const site = await payload.create({
      collection: 'sites',
      data: {
        name: `RC3-22 Demo Site ${suffix}`,
        slug: `rc322-demo-${suffix}`,
        lifecycle: 'active',
      } as never,
      overrideAccess: true,
    })
    track('sites', site.id)
    siteId = String(site.id)
    const pubs = await payload.find({
      collection: 'publications',
      where: { site: { equals: site.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const pub = pubs.docs[0] as unknown as { id: string; slug: string }
    track('publications', pub.id)
    handle = pub.slug
    localActorUrl = `${APP_ORIGIN}/ap/actors/${handle}`
    const account = await payload.create({
      collection: 'social-accounts',
      data: {
        site: site.id,
        publication: pub.id,
        displayName: 'RC3-22 Demo',
        network: 'activitypub',
        actorType: 'publication',
        externalAccountId: pub.slug,
        capabilityState: 'available',
        capabilities: {},
      } as never,
      overrideAccess: true,
    })
    track('social-accounts', account.id)
    accountId = String(account.id)

    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as { canonicalOriginsBySite?: Record<string, unknown> }
    priorOriginsBySite =
      settings?.canonicalOriginsBySite && typeof settings.canonicalOriginsBySite === 'object'
        ? { ...settings.canonicalOriginsBySite }
        : {}
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: { ...priorOriginsBySite, [siteId]: APP_ORIGIN },
      } as never,
      overrideAccess: true,
    })

    const section = await payload.create({
      collection: 'forum-sections',
      data: {
        site: site.id,
        name: `RC3-22 Section ${suffix}`,
        slug: `rc322-section-${suffix}`,
      } as never,
      overrideAccess: true,
    })
    track('forum-sections', section.id)
    const forum = await payload.create({
      collection: 'forums',
      data: {
        site: site.id,
        section: section.id,
        name: `RC3-22 Forum ${suffix}`,
        slug: `rc322-forum-${suffix}`,
      } as never,
      overrideAccess: true,
    })
    track('forums', forum.id)
    discussionPath = `/discussions/rc322-demo-${suffix}`
    const discussion = await payload.create({
      collection: 'discussions',
      data: {
        site: site.id,
        kind: 'thread',
        forum: forum.id,
        title: 'RC3-22 demo thread',
        canonicalPath: discussionPath,
        status: 'open',
        visibility: 'public',
        moderationState: 'clear',
        commentsPolicy: 'open',
      } as never,
      overrideAccess: true,
    })
    track('discussions', discussion.id)
    discussionId = String(discussion.id)
  })

  afterAll(async () => {
    if (priorOriginsBySite)
      await payload
        .updateGlobal({
          slug: 'site-settings',
          data: { canonicalOriginsBySite: priorOriginsBySite } as never,
          overrideAccess: true,
        })
        .catch(() => undefined)
    // Flow-created rows are swept by this run's exact subjects (never by
    // broad patterns — the acceptance database is shared with other
    // suites); setup rows are deleted by tracked id, children first.
    const sweep = async (collection: string, where: Record<string, unknown>) => {
      const found = await payload
        .find({
          collection: collection as never,
          where: where as never,
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as Array<{ id: string }> }))
      for (const doc of found.docs as Array<{ id: string }>)
        await payload
          .delete({ collection: collection as never, id: doc.id, overrideAccess: true })
          .catch(() => undefined)
      return found.docs as Array<{ id: string }>
    }
    const discussionPosts = await payload
      .find({
        collection: 'discussion-posts',
        where: { discussion: { equals: discussionId } },
        limit: 50,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as Array<{ id: string }> }))
    for (const doc of discussionPosts.docs)
      await payload
        .delete({ collection: 'discussion-posts', id: doc.id, overrideAccess: true })
        .catch(() => undefined)
    await sweep('remote-objects', { canonicalId: { in: [NOTE_POST, NOTE_POST2, NOTE_STRANGER] } })
    await sweep('network-blocks', { subject: { equals: peerP.actorUrl } })
    await sweep('network-relationships', { localSubjectId: { equals: accountId } })
    const peerActors = await sweep('remote-actors', {
      canonicalId: { in: [peerP.actorUrl, peerQ.actorUrl] },
    })
    void peerActors
    for (const collection of [
      'discussions',
      'forums',
      'forum-sections',
      'social-accounts',
      'publications',
      'sites',
    ]) {
      const ids = created.filter((entry) => entry.collection === collection).map((e) => e.id)
      for (const id of ids)
        await payload
          .delete({ collection: collection as never, id, overrideAccess: true })
          .catch(() => undefined)
    }
  })

  it('a standalone post from a peer with no follow relationship is acknowledged but not retained', async () => {
    const status = await deliver(peerQ, {
      id: `${peerQ.origin}/activities/stranger-post-${suffix}`,
      type: 'Create',
      actor: peerQ.actorUrl,
      object: {
        id: NOTE_STRANGER,
        type: 'Note',
        attributedTo: peerQ.actorUrl,
        content: '<p>unsolicited</p>',
        published: new Date().toISOString(),
      },
    })
    expect(status).toBe(202)
    expect(await remoteObject(NOTE_STRANGER)).toBeUndefined()
  })

  it('follow works in both directions', async () => {
    // Inbound: the peer follows the local actor.
    const status = await deliver(peerP, {
      id: `${peerP.origin}/activities/follow-${suffix}`,
      type: 'Follow',
      actor: peerP.actorUrl,
      object: localActorUrl,
    })
    expect(status).toBe(202)
    const inbound = await payload.find({
      collection: 'network-relationships',
      where: {
        and: [
          { kind: { equals: 'follow' } },
          { direction: { equals: 'inbound' } },
          { state: { equals: 'active' } },
          { localSubjectId: { equals: accountId } },
        ],
      },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    expect(inbound.docs.length).toBeGreaterThan(0)
    // An Accept is queued back to the peer (scoped to this run's Follow
    // activity id inside the envelope).
    const deliveries = await payload.find({
      collection: 'outbound-network-deliveries',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    expect(
      deliveries.docs.some((doc) => {
        const serialized = JSON.stringify((doc as unknown as { envelope?: unknown }).envelope ?? {})
        return (
          serialized.includes('"Accept"') &&
          serialized.includes(`${peerP.origin}/activities/follow-${suffix}`)
        )
      }),
    ).toBe(true)

    // Outbound: the local install follows the peer through the service.
    const relationship = (await followRemoteActor({
      payload: payload as never,
      localActor: localActorUrl,
      localSubjectId: accountId,
      remoteActorId: peerP.actorUrl,
    })) as unknown as { state?: string; direction?: string }
    expect(relationship.direction).toBe('outbound')
    expect(relationship.state).toBe('pending')
  })

  it('a followed peer’s standalone posts are cached as remote references', async () => {
    for (const [noteId, label] of [
      [NOTE_POST, 'first'],
      [NOTE_POST2, 'second'],
    ] as const) {
      const status = await deliver(peerP, {
        id: `${peerP.origin}/activities/post-${label}-${suffix}`,
        type: 'Create',
        actor: peerP.actorUrl,
        object: {
          id: noteId,
          type: 'Note',
          attributedTo: peerP.actorUrl,
          content: `<p>demo ${label} post</p>`,
          published: new Date().toISOString(),
        },
      })
      expect(status).toBe(202)
      const cached = await remoteObject(noteId)
      expect(cached?.visibility).toBe('visible')
    }
  })

  it('a followed peer’s reply lands on the local discussion with provenance persisted', async () => {
    const status = await deliver(peerP, {
      id: `${peerP.origin}/activities/reply-${suffix}`,
      type: 'Create',
      actor: peerP.actorUrl,
      object: {
        id: NOTE_REPLY,
        type: 'Note',
        attributedTo: peerP.actorUrl,
        inReplyTo: `${APP_ORIGIN}${discussionPath}`,
        content: '<p>demo reply</p>',
      },
    })
    expect(status).toBe(202)
    const post = await replyPost()
    expect(post).toBeTruthy()
    expect(post?.status).toBe('hidden')
    expect(post?.moderationState).toBe('review')
    const federation = post?.federation as { actor?: string; noteId?: string } | undefined
    expect(federation?.actor).toBe(peerP.actorUrl)
    expect(federation?.noteId).toBe(NOTE_REPLY)
  })

  it('a Delete from a non-author changes nothing', async () => {
    const status = await deliver(peerQ, {
      id: `${peerQ.origin}/activities/delete-foreign-${suffix}`,
      type: 'Delete',
      actor: peerQ.actorUrl,
      object: { id: NOTE_REPLY, type: 'Note' },
    })
    expect(status).toBe(202)
    const post = await replyPost()
    expect(post?.status).toBe('hidden')
    const deletePost = await deliver(peerQ, {
      id: `${peerQ.origin}/activities/delete-foreign-post-${suffix}`,
      type: 'Delete',
      actor: peerQ.actorUrl,
      object: NOTE_POST,
    })
    expect(deletePost).toBe(202)
    expect((await remoteObject(NOTE_POST))?.visibility).toBe('visible')
  })

  it('the author’s Delete retracts its reply and its cached post', async () => {
    const replyDelete = await deliver(peerP, {
      id: `${peerP.origin}/activities/delete-reply-${suffix}`,
      type: 'Delete',
      actor: peerP.actorUrl,
      object: { id: NOTE_REPLY, type: 'Note' },
    })
    expect(replyDelete).toBe(202)
    const post = await replyPost()
    expect(post?.status).toBe('removed')
    expect(post?.moderationState).toBe('removed')

    const postDelete = await deliver(peerP, {
      id: `${peerP.origin}/activities/delete-post-${suffix}`,
      type: 'Delete',
      actor: peerP.actorUrl,
      object: NOTE_POST,
    })
    expect(postDelete).toBe(202)
    expect((await remoteObject(NOTE_POST))?.visibility).toBe('removed')
  })

  it('blocking the peer hides its cached references and rejects further deliveries', async () => {
    await blockRemoteSource(payload as never, {
      subject: peerP.actorUrl,
      subjectType: 'actor',
      note: 'RC3-22 demo block',
    })
    expect((await remoteObject(NOTE_POST2))?.visibility).toBe('hidden')

    const status = await deliver(peerP, {
      id: `${peerP.origin}/activities/after-block-${suffix}`,
      type: 'Create',
      actor: peerP.actorUrl,
      object: {
        id: `${peerP.origin}/notes/after-block-${suffix}`,
        type: 'Note',
        attributedTo: peerP.actorUrl,
        inReplyTo: `${APP_ORIGIN}${discussionPath}`,
        content: '<p>should not land</p>',
      },
    })
    expect(status).toBe(401)
    const posts = await payload.find({
      collection: 'discussion-posts',
      where: {
        paginationAnchor: {
          equals: `federation:${peerP.origin}/activities/after-block-${suffix}`,
        },
      },
      limit: 1,
      overrideAccess: true,
    })
    expect(posts.docs).toHaveLength(0)
  })
})
