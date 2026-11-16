/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  buildRc2World,
  loginAsMember,
  operatorSession,
  type Rc2Principal,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-H-02 setup: builds a fresh A-04 world into the served acceptance
 * database and writes the full actor manifest the matrix runner reads.
 * Unlike the B-01 seed, this exports every principal the role matrix
 * needs (owner/admin/editor per site, the denied outsider, real member
 * sessions) plus one freshly-created member with NO standing rows —
 * the RC2-DEBT-19 acceptance actor. Provisioning provenance is part of
 * the evidence: world members carry in-process member-site-roles rows
 * (the fixture's memberRole grants); the fresh member carries none.
 */
describe('RC2-H-02 setup', () => {
  it('builds the world and mints every actor session', async () => {
    const payload: Payload = await getPayload({ config })
    const world: Rc2World = await buildRc2World(payload)

    const staff = async (principal: Rc2Principal) => {
      const headers = await operatorSession(payload, principal)
      return (headers.get('cookie') ?? '').replace('renegade-passkey=', '')
    }
    const member = async (principal: Rc2Principal) => {
      const session = await loginAsMember(payload, principal)
      return {
        cookie: session.headers.get('cookie') ?? '',
        memberId: session.memberId,
      }
    }

    // A member created exactly the way self-signup creates one: the
    // magic-link consume path enrolls them (member + profile + linked
    // identity). Deliberately NO member-site-roles row anywhere — the
    // RC2-DEBT-19 acceptance actor.
    const freshEmail = `h02-fresh-${world.suffix}@rc2-h02.test`
    const freshPrincipal: Rc2Principal = {
      key: 'fresh',
      memberId: '',
      email: freshEmail,
    }
    const freshSession = await loginAsMember(payload, freshPrincipal)
    const freshRoles = await (payload as any).find({
      collection: 'member-site-roles',
      where: { member: { equals: freshSession.memberId } },
      limit: 10,
      overrideAccess: true,
    })
    const freshProfiles = await (payload as any).find({
      collection: 'profiles',
      where: { member: { equals: freshSession.memberId } },
      limit: 1,
      overrideAccess: true,
    })

    const siteShape = (site: Rc2World['siteA']) => ({
      siteId: site.siteId,
      host: site.host,
      origin: site.origin,
      blogPublicationId: site.blogPublicationId,
      publishedArticleId: site.publishedArticleId,
      draftArticleId: site.draftArticleId,
      mediaAssetId: site.mediaAssetId,
      memberProfileId: site.memberProfileId,
      memberSpaceId: site.memberSpaceId,
      forumSectionId: site.forumSectionId ?? null,
      forumId: site.forumId ?? null,
      discussionId: site.discussionId ?? null,
      productId: site.productId ?? null,
      paidOrderId: site.paidOrderId ?? null,
      unpaidOrderId: site.unpaidOrderId ?? null,
    })

    const manifest = {
      suffix: world.suffix,
      siteA: siteShape(world.siteA),
      siteB: siteShape(world.siteB),
      staff: {
        installationOwner: await staff(world.installationOwner),
        ownerA: await staff(world.siteA.owner),
        adminA: await staff(world.siteA.admin),
        editorA: await staff(world.siteA.editor),
        adminB: await staff(world.siteB.admin),
        outsiderB: await staff(world.outsider),
      },
      staffIds: {
        ownerAUserId: world.siteA.owner.userId,
        adminAUserId: world.siteA.admin.userId,
        editorAUserId: world.siteA.editor.userId,
        adminBUserId: world.siteB.admin.userId,
        outsiderBUserId: world.outsider.userId,
      },
      members: {
        memberA: await member(world.siteA.member),
        memberB: await member(world.siteB.member),
        // Site A's admin also holds a community-manager member role on A
        // (the fixture's grant) — this is the moderation actor.
        modA: await member(world.siteA.admin),
        subscriberA: await member(world.siteA.subscriber),
        fresh: {
          cookie: freshSession.headers.get('cookie') ?? '',
          memberId: freshSession.memberId,
          profileId: freshProfiles.docs[0]?.id ? String(freshProfiles.docs[0].id) : null,
          standingRows: freshRoles.totalDocs as number,
        },
      },
      principals: {
        memberAId: world.siteA.member.memberId,
        memberBId: world.siteB.member.memberId,
        memberAProfileId: world.siteA.memberProfileId,
        memberBProfileId: world.siteB.memberProfileId,
      },
    }
    writeFileSync(
      '/home/hatch/workspace/gui01b-logs/h02-world.json',
      JSON.stringify(manifest, null, 2),
    )
    expect(manifest.siteA.siteId).toBeTruthy()
    expect(manifest.members.fresh.standingRows).toBe(0)
  }, 300_000)
})
