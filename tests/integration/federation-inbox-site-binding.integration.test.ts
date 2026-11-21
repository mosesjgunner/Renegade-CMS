/* eslint-disable @typescript-eslint/no-explicit-any */
// RC3-01 — Federation ownership proof.
//
// RC3-00 confirmed at the tagged tree that the ActivityPub inbox resolved
// a remote reply's discussion by canonicalPath alone — no site,
// publication, or canonical-origin predicate — while discussion paths
// are unique only per site (unique index ['site', 'canonicalPath']).
// This fixture drives the REAL inbox route handler with two isolated
// synthetic sites that share a discussion path and determines, from
// persisted state, whether a reply addressed to one site's actor can
// write onto the other site's discussion.
//
// The only stub is the outbound actor-document GET (safe-fetch): the
// peer is synthetic, so its actor document is served from memory.
// Everything else runs for real: HTTP-signature verification against
// the peer's RSA key, the dedupe record/release machinery, discussion
// resolution, and every Payload write.
//
// DEBT-22 legs live here too: a processing failure before a side effect
// and after a side effect must each recover exactly once under a
// legitimate retry, and concurrent duplicate deliveries of one activity
// must create exactly one reply.

import { createHash, generateKeyPairSync, sign, randomUUID } from 'node:crypto'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '../../src/payload.config'

const peerState = vi.hoisted(() => ({
  actorDoc: null as any,
  unreachable: false,
}))

vi.mock('../../src/modules/network/safe-fetch', () => ({
  fetchRemoteJson: async (url: string) => {
    if (peerState.unreachable) throw new Error('Remote request was not accepted.')
    if (peerState.actorDoc && url === peerState.actorDoc.id) return peerState.actorDoc
    throw new Error('Remote request was not accepted.')
  },
}))

import { POST } from '../../src/app/(frontend)/ap/actors/[handle]/inbox/route'

const suffix = randomUUID().slice(0, 8)
// The runner env decides APP_URL (loadConfig derives the actor document
// id and the canonical origin from it); never hardcode it here.
const APP_ORIGIN = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const APP_HOST = new URL(APP_ORIGIN).host
const PEER_ORIGIN = 'https://peer.example'
const PEER_ACTOR = `${PEER_ORIGIN}/actors/alice`
const PEER_KEY_ID = `${PEER_ACTOR}#main-key`

const cmsPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const peerPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const peerPrivatePem = peerPair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const peerPublicPem = peerPair.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()

process.env.NETWORKING_ENABLED = 'true'
process.env.ACTIVITYPUB_PUBLIC_KEY_PEM = cmsPair.publicKey
  .export({ type: 'pkcs1', format: 'pem' })
  .toString()

const actorDoc = (withInbox: boolean) => ({
  id: PEER_ACTOR,
  type: 'Person',
  preferredUsername: 'alice',
  ...(withInbox ? { inbox: `${PEER_ORIGIN}/inbox` } : {}),
  publicKey: { id: PEER_KEY_ID, owner: PEER_ACTOR, publicKeyPem: peerPublicPem },
})

// Each site has its own canonical origin: the site-settings global
// itself forbids two sites sharing one canonical origin host. Remote
// replies cite discussions under the owning site's canonical origin.
const ORIGIN_A = `https://site-a-${suffix}.rc301.test`
const ORIGIN_B = `https://site-b-${suffix}.rc301.test`

describe('federation inbox site binding (RC3-01)', () => {
  let payload: Payload
  const runStart = new Date()
  let priorOriginsBySite: Record<string, unknown> | null = null
  let siteA = ''
  let siteB = ''
  let handleA = ''
  let handleB = ''
  let actorDocUrlA = ''
  const discussions: Record<string, string> = {}
  const created: { collection: string; id: string }[] = []
  let senderSeq = 0

  const track = (collection: string, id: unknown) => {
    if (id) created.push({ collection, id: String(id) })
  }

  const forums: Record<string, string> = {}
  const makeForum = async (site: string, label: string) => {
    const section = await payload.create({
      collection: 'forum-sections',
      data: {
        site,
        name: `RC3-01 Section ${label} ${suffix}`,
        slug: `rc301-section-${label}-${suffix}`,
      } as never,
      overrideAccess: true,
    })
    track('forum-sections', section.id)
    const forum = await payload.create({
      collection: 'forums',
      data: {
        site,
        section: section.id,
        name: `RC3-01 Forum ${label} ${suffix}`,
        slug: `rc301-forum-${label}-${suffix}`,
      } as never,
      overrideAccess: true,
    })
    track('forums', forum.id)
    forums[site] = String(forum.id)
  }

  const makeDiscussion = async (
    site: string,
    path: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const doc = await payload.create({
      collection: 'discussions',
      data: {
        site,
        kind: 'thread',
        forum: forums[site],
        title: `RC3-01 ${path}`,
        canonicalPath: path,
        status: 'open',
        visibility: 'public',
        moderationState: 'clear',
        commentsPolicy: 'open',
        ...overrides,
      } as never,
      overrideAccess: true,
    })
    track('discussions', doc.id)
    return String(doc.id)
  }

  const signAndBuild = (handle: string, activity: Record<string, unknown>) => {
    const body = JSON.stringify(activity)
    const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`
    const date = new Date().toUTCString()
    const target = `post /ap/actors/${handle}/inbox`
    const signingString = `(request-target): ${target}\nhost: ${APP_HOST}\ndate: ${date}\ndigest: ${digest}`
    const signature = sign('sha256', Buffer.from(signingString), peerPrivatePem).toString('base64')
    senderSeq += 1
    const request = new Request(`${APP_ORIGIN}/ap/actors/${handle}/inbox`, {
      method: 'POST',
      headers: {
        host: APP_HOST,
        date,
        digest,
        signature: `keyId="${PEER_KEY_ID}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
        'content-type': 'application/activity+json',
        'x-forwarded-for': `10.9.${senderSeq}.1`,
      },
      body,
    })
    return request
  }

  const deliver = async (handle: string, activity: Record<string, unknown>) => {
    const response = await POST(signAndBuild(handle, activity), {
      params: Promise.resolve({ handle }),
    })
    return response.status
  }

  const replyActivity = (idPart: string, inReplyTo: string) => ({
    id: `${PEER_ORIGIN}/activities/${idPart}-${suffix}`,
    type: 'Create',
    actor: PEER_ACTOR,
    object: {
      type: 'Note',
      inReplyTo,
      content: `<p>rc3-01 synthetic reply ${idPart}</p>`,
    },
  })

  const postsFor = async (activityIdPart: string) => {
    // remoteReply persists the activity id as paginationAnchor
    // (`federation:<activityId>`); there is no federation field group.
    const all = await payload.find({
      collection: 'discussion-posts',
      where: {
        paginationAnchor: {
          equals: `federation:${PEER_ORIGIN}/activities/${activityIdPart}-${suffix}`,
        },
      },
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
    return all.docs as any[]
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    peerState.actorDoc = actorDoc(true)

    const mkSite = async (label: string) => {
      const site = await payload.create({
        collection: 'sites',
        data: {
          name: `RC3-01 ${label} ${suffix}`,
          slug: `rc301-${label}-${suffix}`,
          lifecycle: 'active',
        } as never,
        overrideAccess: true,
      })
      track('sites', site.id)
      // The site afterChange hook auto-creates its publication (slug = site slug).
      const pubs = await payload.find({
        collection: 'publications',
        where: { site: { equals: site.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const pub = pubs.docs[0] as any
      track('publications', pub?.id)
      const account = await payload.create({
        collection: 'social-accounts',
        data: {
          site: site.id,
          publication: pub.id,
          displayName: `RC3-01 ${label}`,
          network: 'activitypub',
          actorType: 'publication',
          externalAccountId: pub.slug,
          capabilityState: 'available',
          capabilities: {},
        } as never,
        overrideAccess: true,
      })
      track('social-accounts', account.id)
      return { siteId: String(site.id), handle: String(pub.slug) }
    }

    const a = await mkSite('a')
    siteA = a.siteId
    handleA = a.handle
    const b = await mkSite('b')
    siteB = b.siteId
    handleB = b.handle
    actorDocUrlA = `${APP_ORIGIN}/ap/actors/${handleA}`
    // The acceptance database is shared with other suites, so register
    // this fixture's per-site canonical origins explicitly (restored in
    // afterAll). The global's own validation requires a distinct host
    // per site, which the two origins above satisfy.
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })) as any
    priorOriginsBySite =
      settings?.canonicalOriginsBySite && typeof settings.canonicalOriginsBySite === 'object'
        ? { ...settings.canonicalOriginsBySite }
        : {}
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: {
          ...priorOriginsBySite,
          [siteA]: ORIGIN_A,
          [siteB]: ORIGIN_B,
        },
      } as never,
      overrideAccess: true,
    })
    await makeForum(siteA, 'a')
    await makeForum(siteB, 'b')

    const shared = `/discussions/rc301-shared-${suffix}`
    discussions.sharedA = await makeDiscussion(siteA, shared)
    discussions.sharedB = await makeDiscussion(siteB, shared)
    discussions.onlyB = await makeDiscussion(siteB, `/discussions/rc301-only-b-${suffix}`)
    discussions.onlyA = await makeDiscussion(siteA, `/discussions/rc301-only-a-${suffix}`)
    discussions.lockedB = await makeDiscussion(siteB, `/discussions/rc301-locked-b-${suffix}`, {
      status: 'locked',
      commentsPolicy: 'closed',
    })
    discussions.lockedA = await makeDiscussion(siteA, `/discussions/rc301-locked-a-${suffix}`, {
      status: 'locked',
      commentsPolicy: 'closed',
    })
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
    // Best-effort cleanup, children before parents.
    const order = [
      'discussion-posts',
      'inbound-network-activities',
      'outbound-network-deliveries',
      'network-relationships',
      'discussions',
      'forums',
      'forum-sections',
      'social-accounts',
      'publications',
      'sites',
    ]
    const sweep = async (collection: string, where: any) => {
      const found = await payload
        .find({
          collection: collection as never,
          where,
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as any[] }))
      for (const doc of found.docs as any[])
        await payload
          .delete({ collection: collection as never, id: doc.id, overrideAccess: true })
          .catch(() => undefined)
    }
    await sweep('discussion-posts', { paginationAnchor: { like: suffix } })
    await sweep('inbound-network-activities', { remoteActivityId: { like: suffix } })
    for (const collection of order.slice(3)) {
      for (const item of created.filter((c) => c.collection === collection))
        await payload
          .delete({ collection: collection as never, id: item.id, overrideAccess: true })
          .catch(() => undefined)
    }
    const actors = await payload
      .find({
        collection: 'remote-actors',
        where: { canonicalId: { equals: PEER_ACTOR } },
        limit: 5,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as any[] }))
    for (const doc of actors.docs as any[])
      await payload
        .delete({ collection: 'remote-actors', id: doc.id, overrideAccess: true })
        .catch(() => undefined)
    const instances = await payload
      .find({
        collection: 'remote-instances',
        where: { origin: { equals: PEER_ORIGIN } },
        limit: 5,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as any[] }))
    for (const doc of instances.docs as any[])
      await payload
        .delete({ collection: 'remote-instances', id: doc.id, overrideAccess: true })
        .catch(() => undefined)
  })

  it('happy path: a reply to site A lands on site A discussion, hidden in review', async () => {
    const status = await deliver(
      handleA,
      replyActivity('happy', `${ORIGIN_A}/discussions/rc301-only-a-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('happy')
    expect(posts).toHaveLength(1)
    expect(String(posts[0].discussion)).toBe(discussions.onlyA)
    expect(posts[0].status).toBe('hidden')
    expect(posts[0].moderationState).toBe('review')
  })

  it('cross-site: a discussion that exists ONLY on site B receives nothing from site A inbox', async () => {
    const status = await deliver(
      handleA,
      replyActivity('xsite-b', `${ORIGIN_A}/discussions/rc301-only-b-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('xsite-b')
    expect(posts).toHaveLength(0)
  })

  it('cross-site (mirror): a discussion that exists ONLY on site A receives nothing from site B inbox', async () => {
    const status = await deliver(
      handleB,
      replyActivity('xsite-a', `${ORIGIN_B}/discussions/rc301-only-a-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('xsite-a')
    expect(posts).toHaveLength(0)
  })

  it('same path on both sites: the reply binds to the receiving actor site', async () => {
    const status = await deliver(
      handleA,
      replyActivity('shared', `${ORIGIN_A}/discussions/rc301-shared-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('shared')
    expect(posts).toHaveLength(1)
    expect(String(posts[0].discussion)).toBe(discussions.sharedA)
  })

  it('foreign canonical origin: a reply citing another origin writes nothing', async () => {
    const status = await deliver(
      handleA,
      replyActivity('foreign', `https://unrelated.example/discussions/rc301-only-a-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('foreign')
    expect(posts).toHaveLength(0)
  })

  it('ineligible discussion on the receiving site (locked/closed) receives nothing', async () => {
    const status = await deliver(
      handleA,
      replyActivity('locked-a', `${ORIGIN_A}/discussions/rc301-locked-a-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('locked-a')
    expect(posts).toHaveLength(0)
  })

  it('origin disagreement: a reply citing site B origin at site A inbox writes nothing', async () => {
    const status = await deliver(
      handleA,
      replyActivity('locked-b', `${ORIGIN_B}/discussions/rc301-locked-b-${suffix}`),
    )
    expect(status).toBe(202)
    const posts = await postsFor('locked-b')
    expect(posts).toHaveLength(0)
  })

  it('DEBT-22: failure BEFORE a side effect does not burn the dedupe key; the fixed retry processes fresh', async () => {
    const broken = replyActivity('retry-before', 'not-a-url')
    const first = await deliver(handleA, broken)
    expect(first).toBe(401)
    const fixed = replyActivity('retry-before', `${ORIGIN_A}/discussions/rc301-only-a-${suffix}`)
    const second = await deliver(handleA, fixed)
    expect(second).toBe(202)
    const posts = await postsFor('retry-before')
    expect(posts).toHaveLength(1)
    expect(String(posts[0].discussion)).toBe(discussions.onlyA)
  })

  it('DEBT-22: failure AFTER a side effect recovers exactly once under retry', async () => {
    peerState.actorDoc = actorDoc(false) // no inbox: Accept queueing throws after the relationship write
    const follow = {
      id: `${PEER_ORIGIN}/activities/follow-${suffix}`,
      type: 'Follow',
      actor: PEER_ACTOR,
      object: actorDocUrlA,
    }
    const first = await deliver(handleA, follow)
    expect(first).toBe(401)

    peerState.actorDoc = actorDoc(true)
    const second = await deliver(handleA, follow)
    expect(second).toBe(202)

    // Exactly one relationship for this fixture's follow, despite two
    // deliveries: the retry found the first attempt's write by its
    // idempotency key (the activity dedupe key) instead of duplicating it.
    const dedupeKey = `activitypub:${createHash('sha256')
      .update(`${PEER_ACTOR}|${PEER_ORIGIN}/activities/follow-${suffix}`)
      .digest('hex')}`
    const rels = await payload.find({
      collection: 'network-relationships',
      where: { idempotencyKey: { equals: dedupeKey } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(rels.docs).toHaveLength(1)
    // Scope to this run: earlier runs against the same database may have
    // left deliveries to the same synthetic inbox behind.
    const deliveries = await payload.find({
      collection: 'outbound-network-deliveries',
      where: {
        and: [
          { target: { equals: `${PEER_ORIGIN}/inbox` } },
          { createdAt: { greater_than: runStart.toISOString() } },
        ],
      },
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
    expect(deliveries.docs.length).toBe(1)
  })

  it('DEBT-22: concurrent duplicate deliveries of one activity create exactly one reply', async () => {
    const activity = replyActivity('concurrent', `${ORIGIN_A}/discussions/rc301-only-a-${suffix}`)
    const statuses = await Promise.all([
      deliver(handleA, activity),
      deliver(handleA, activity),
      deliver(handleA, activity),
      deliver(handleA, activity),
      deliver(handleA, activity),
    ])
    // The safety property is exactly one reply. Duplicate deliveries must
    // also be acknowledged (202), never rejected as if unauthenticated.
    const posts = await postsFor('concurrent')
    expect(posts).toHaveLength(1)
    expect(statuses, `statuses: ${statuses.join(',')}`).toEqual([202, 202, 202, 202, 202])
  })

  it('networking off: the inbox refuses and writes nothing', async () => {
    process.env.NETWORKING_ENABLED = 'false'
    try {
      const status = await deliver(
        handleA,
        replyActivity('offline', `${ORIGIN_A}/discussions/rc301-only-a-${suffix}`),
      )
      expect(status).toBe(404)
    } finally {
      process.env.NETWORKING_ENABLED = 'true'
    }
    const posts = await postsFor('offline')
    expect(posts).toHaveLength(0)
  })

  it('unreachable peer (network boundary down): verification fails closed, nothing is written', async () => {
    peerState.unreachable = true
    try {
      const status = await deliver(
        handleA,
        replyActivity('unreachable', `${ORIGIN_A}/discussions/rc301-only-a-${suffix}`),
      )
      expect(status).toBe(401)
    } finally {
      peerState.unreachable = false
    }
    const posts = await postsFor('unreachable')
    expect(posts).toHaveLength(0)
  })
})
