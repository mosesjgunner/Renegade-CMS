/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { parseEnabledModules } from '../../src/modules/module-registry'
import { resolveOperatorGrantContext } from '../../src/modules/operations/operator-grants'
import { replyToForumThread } from '../../src/modules/community/service'
import {
  activeProfileName,
  activeSite,
  actorOn,
  assertFixtureSafeDatabase,
  browseAnonymous,
  buildRc2World,
  canReadAs,
  canWriteAs,
  deterministicProviderFailures,
  isFixtureSafeDatabase,
  loginAsMember,
  operatorSession,
  moduleEnabled,
  reloadPrincipals,
  switchSite,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-A-04 proof suite: the standard fixture world builds, the role
 * ladder is real, one permitted and one denied site transition hold
 * (including after a reload of principal state), the member journey
 * Matthew specified runs on production paths, and no cross-site data
 * is exposed. This is NOT the complete role matrix — that is H-02.
 */
describe('RC2-A-04: standard fixture world', () => {
  let payload: Payload
  let world: Rc2World

  beforeAll(async () => {
    assertFixtureSafeDatabase(process.env.DATABASE_URL)
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
  }, 180_000)

  afterAll(async () => {
    if (payload && world) await teardownRc2World(payload, world)
  })

  describe('safety guard', () => {
    it('accepts only dedicated acceptance databases', () => {
      expect(
        isFixtureSafeDatabase('postgresql://u:p@localhost:5432/renegade_release_acceptance'),
      ).toBe(true)
      expect(isFixtureSafeDatabase('postgresql://u:p@localhost:5432/renegade')).toBe(false)
      expect(isFixtureSafeDatabase('postgresql://u:p@localhost:5432/production')).toBe(false)
      expect(isFixtureSafeDatabase(undefined)).toBe(false)
      expect(isFixtureSafeDatabase('not a url')).toBe(false)
    })
  })

  describe('the world', () => {
    it('builds two sites with the full role ladder and core surfaces', () => {
      for (const site of [world.siteA, world.siteB]) {
        expect(site.siteId).toBeTruthy()
        expect(site.owner.userId).toBeTruthy()
        expect(site.admin.userId).toBeTruthy()
        expect(site.editor.userId).toBeTruthy()
        expect(site.member.memberId).toBeTruthy()
        expect(site.memberSpaceId).toBeTruthy()
        expect(site.spacePostId).toBeTruthy()
        expect(site.blogPublicationId).toBeTruthy()
        expect(site.newsPublicationId).toBeTruthy()
        expect(site.publishedArticleId).toBeTruthy()
        expect(site.draftArticleId).toBeTruthy()
      }
      expect(world.outsider.memberId).toBe(world.siteB.admin.memberId)
    })

    it('builds Standard-only surfaces exactly when their module is on', () => {
      for (const site of [world.siteA, world.siteB]) {
        expect(Boolean(site.discussionId)).toBe(moduleEnabled('community'))
        expect(Boolean(site.productId)).toBe(moduleEnabled('commerce'))
        expect(Boolean(site.paidOrderId)).toBe(moduleEnabled('commerce'))
        expect(Boolean(site.unpaidOrderId)).toBe(moduleEnabled('commerce'))
      }
    })

    it('evaluates Lean and Standard profiles at the registry', () => {
      const lean = parseEnabledModules(undefined)
      expect(lean.has('community' as never)).toBe(false)
      expect(lean.has('commerce' as never)).toBe(false)
      const standard = parseEnabledModules('all')
      expect(standard.has('community' as never)).toBe(true)
      expect(standard.has('commerce' as never)).toBe(true)
      expect(['lean', 'standard']).toContain(activeProfileName())
    })
  })

  describe('site transitions through the production switch path', () => {
    it('permits an authorized admin switch to Site A, still valid after reload', async () => {
      const session = await operatorSession(payload, world.siteA.admin)
      const switched = await switchSite(session, world.siteA.siteId)
      expect(switched.status).toBe(200)
      expect(switched.setCookie).toContain(world.siteA.siteId)

      const state = await activeSite(session, switched.setCookie ?? undefined)
      expect(state.activeSiteId).toBe(world.siteA.siteId)

      // Reload: brand-new login, switch again from scratch.
      const fresh = await reloadPrincipals(payload, world)
      const again = await switchSite(fresh.adminSession, world.siteA.siteId)
      expect(again.status).toBe(200)
    })

    it('permits the editor to write on their own site', async () => {
      const allowed = await canWriteAs(
        payload,
        world.siteA.editor.user,
        'content',
        world.siteA.draftArticleId,
        { title: `Editor touch ${world.suffix}` },
      )
      expect(allowed).toBe(true)
      const read = await canReadAs(
        payload,
        world.siteA.admin.user,
        'content',
        world.siteA.draftArticleId,
      )
      expect(read).toBe(true)
    })

    it('denies the Site B admin any transition into Site A, still denied after reload', async () => {
      const session = await operatorSession(payload, world.outsider)
      const switched = await switchSite(session, world.siteA.siteId)
      expect(switched.status).toBe(403)
      expect(switched.setCookie).toBeNull()

      // A forged cookie naming Site A must not take effect either.
      const forged = await activeSite(session, `renegade-active-site=${world.siteA.siteId}`)
      expect(forged.activeSiteId).not.toBe(world.siteA.siteId)

      const read = await canReadAs(
        payload,
        world.outsider.user,
        'content',
        world.siteA.draftArticleId,
      )
      expect(read).toBe(false)
      const write = await canWriteAs(
        payload,
        world.outsider.user,
        'content',
        world.siteA.draftArticleId,
        { title: 'cross-site write attempt' },
      )
      expect(write).toBe(false)

      const fresh = await reloadPrincipals(payload, world)
      const again = await switchSite(fresh.outsiderSession, world.siteA.siteId)
      expect(again.status).toBe(403)
    })

    it('gives a subscriber no operator authority at all', async () => {
      // Subscribers hold member identities only — there is no operator
      // account to sign in with — and grant resolution denies them.
      const grant = await resolveOperatorGrantContext(payload, world.siteA.subscriber.user)
      expect(grant.authorized).toBe(false)
      expect(grant.authorizedSiteIds).toHaveLength(0)
    })
  })

  describe('the member journey (profile, own blog space, forum)', () => {
    it('signs a member in through the real magic-link machinery', async () => {
      const session = await loginAsMember(payload, world.siteA.member)
      expect(session.memberId).toBe(world.siteA.member.memberId)
      const actor = await actorOn(payload, session.headers, world.siteA.siteId)
      expect(actor.kind).not.toBe('anonymous')
      expect(actor.memberId).toBe(world.siteA.member.memberId)
    })

    it('lets the member post in their own site’s forum; cross-site member posting currently succeeds (finding)', async () => {
      if (!moduleEnabled('community')) return // Lean: community surfaces do not exist.
      const session = await loginAsMember(payload, world.siteA.member)
      const actorA = await actorOn(payload, session.headers, world.siteA.siteId)
      const post = await replyToForumThread(
        payload,
        {
          siteId: world.siteA.siteId,
          discussionId: world.siteA.discussionId!,
          authorMemberId: world.siteA.member.memberId,
          body: `Hello from member A ${world.suffix}`,
        } as any,
        { siteId: world.siteA.siteId, actor: actorA } as any,
      )
      expect(post).toBeTruthy()
      const authorRef = (post as any).authorMember
      const authorId = typeof authorRef === 'object' ? authorRef?.id : authorRef
      expect(String(authorId)).toBe(world.siteA.member.memberId)

      // FINDING (A-04, open policy question): member identity is
      // installation-wide. The same member, carrying no role and no
      // standing on Site B, can also post in Site B's forum under their
      // own name — assertWriter checks identity + active status only,
      // never per-site membership. Whether that is the intended network
      // model or a per-website boundary gap is Matthew's call; this
      // assertion records the behavior H-02 must test either way.
      const actorB = await actorOn(payload, session.headers, world.siteB.siteId)
      expect(actorB.memberId).toBe(world.siteA.member.memberId)
      const crossPost = await replyToForumThread(
        payload,
        {
          siteId: world.siteB.siteId,
          discussionId: world.siteB.discussionId!,
          authorMemberId: world.siteA.member.memberId,
          body: `Cross-site post from member A ${world.suffix}`,
        } as any,
        { siteId: world.siteB.siteId, actor: actorB } as any,
      )
      expect(crossPost).toBeTruthy()
    })

    it('has the member’s space with a staff-placed post readable in space scope', async () => {
      const found = await (payload as any).find({
        collection: 'content',
        where: { space: { equals: world.siteA.memberSpaceId } },
        depth: 0,
        overrideAccess: true,
      })
      expect(found.docs.map((d: any) => String(d.id))).toContain(world.siteA.spacePostId)
    })

    it('documents the current gap: member identities cannot write space content (staff-only access)', async () => {
      // The collection layer admits only staff Payload users as authors.
      // A member's own blog post on their own space therefore has no
      // production write path today — recorded as the A-04 member-journey
      // finding for H-03; this assertion flips when that path exists.
      const write = await canWriteAs(
        payload,
        world.siteA.subscriber.user,
        'content',
        world.siteA.spacePostId,
        { title: 'member write attempt' },
      )
      expect(write).toBe(false)
    })
  })

  describe('anonymous browsing and cross-site exposure', () => {
    it('resolves each host to its own site and shows only its published content', async () => {
      const a = await browseAnonymous(payload, world.siteA.host)
      expect(a.siteId).toBe(world.siteA.siteId)
      expect(a.publishedTitles.some((t: string) => t.includes('Site A Published'))).toBe(true)
      expect(a.publishedTitles.some((t: string) => t.includes('Site B'))).toBe(false)
      expect(a.publishedTitles.some((t: string) => t.includes('Draft'))).toBe(false)

      const b = await browseAnonymous(payload, world.siteB.host)
      expect(b.siteId).toBe(world.siteB.siteId)
      expect(b.publishedTitles.some((t: string) => t.includes('Site A'))).toBe(false)
    })

    it('fails closed for an unknown host', async () => {
      const none = await browseAnonymous(payload, 'nope.rc2-a04.test')
      expect(none.siteId).toBe('')
      expect(none.publishedTitles).toHaveLength(0)
    })
  })

  describe('deterministic provider failures', () => {
    it('supplies adapters whose failures are reproducible', async () => {
      const adapter = deterministicProviderFailures.cryptoObservationMissing()
      await expect(adapter.getObservation('any-tx')).resolves.toBeNull()
      const pod = deterministicProviderFailures.podSubmitFails()
      const submitted = await pod.submit({
        orderId: 'order-x',
        idempotencyKey: 'key-x',
        items: [],
      })
      expect(submitted.state).toBe('failed')
    })
  })
})
