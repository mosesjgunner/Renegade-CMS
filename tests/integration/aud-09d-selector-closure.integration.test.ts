/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { evaluateSegmentRecipients } from '../../src/modules/audience/service'
import { segmentVersion, type SegmentNode } from '../../src/modules/audience/engine'
import { audienceDigest } from '../../src/modules/audience/contracts'

/**
 * 09D closure — canonical selector projections.
 *
 * Until this closure, `evaluateSegmentRecipients` wired only list/tag facts
 * from persisted state; the form, sourceCampaign, engagement, role, locale,
 * commerceFact and communityFact projections were hardcoded empty, so any
 * segment using them silently matched nobody. Each case below persists real
 * facts through the product's own collections and proves the evaluator
 * selects exactly the subscribers whose facts match — and that facts
 * recorded against another site never contribute.
 */
describe('09D closure — canonical selector projections from persisted facts', () => {
  let payload: Payload
  let siteA: string
  let siteB: string
  let listA: string
  let listB: string
  const suffix = randomUUID().slice(0, 8)
  let segmentSeq = 0

  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()

  async function makeSite(slug: string) {
    const site = (await payload.create({
      collection: 'sites',
      data: {
        name: `09D closure ${slug} ${suffix}`,
        slug: `${slug}-${suffix}`,
        domain: `${slug}-${suffix}.example.test`,
        status: 'published',
      },
      overrideAccess: true,
    } as never)) as any
    return String(site.id)
  }

  async function makeList(siteId: string, name: string) {
    const list = (await payload.create({
      collection: 'audience-lists',
      data: { site: siteId, name: `${name} ${suffix}`, status: 'active', doubleOptIn: true },
      overrideAccess: true,
    } as never)) as any
    return String(list.id)
  }

  async function makeSubscriber(
    siteId: string,
    email: string,
    extra: Record<string, unknown> = {},
  ) {
    const sub = (await payload.create({
      collection: 'subscribers',
      data: {
        site: siteId,
        email,
        emailHash: audienceDigest(email),
        status: 'active',
        verifiedAt: new Date().toISOString(),
        ...extra,
      },
      overrideAccess: true,
    } as never)) as any
    return sub
  }

  async function makeMembership(subscriberId: string, listId: string, source: string) {
    return payload.create({
      collection: 'audience-memberships',
      data: {
        subscriber: subscriberId,
        audienceList: listId,
        status: 'active',
        source,
        confirmedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
  }

  async function makeContact(siteId: string, email: string) {
    const contact = (await payload.create({
      collection: 'contacts',
      data: {
        site: siteId,
        displayName: `Contact ${email}`,
        email,
        emailHash: audienceDigest(email),
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    return contact
  }

  async function makeMember(email: string) {
    const member = (await payload.create({
      collection: 'members',
      data: { displayName: `Member ${email}`, email, status: 'active' },
      overrideAccess: true,
    } as never)) as any
    return member
  }

  async function makeSegment(siteId: string, definition: SegmentNode) {
    segmentSeq += 1
    const segment = (await payload.create({
      collection: 'audience-segments',
      data: {
        site: siteId,
        name: `closure-${suffix}-${segmentSeq}`,
        definition,
        version: segmentVersion(definition),
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    return String(segment.id)
  }

  async function eligibleIds(siteId: string, segmentId: string) {
    const result = await evaluateSegmentRecipients(payload, { siteId, segmentId })
    return result.eligibleRecipients.map((r) => r.subscriberId).sort()
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    siteA = await makeSite('closure-a')
    siteB = await makeSite('closure-b')
    listA = await makeList(siteA, 'Closure A')
    listB = await makeList(siteB, 'Closure B')
  })

  it('form: selects subscribers whose consent ledger links a submission of that form on this site only', async () => {
    const schemaBody = {
      version: 1,
      locale: 'en',
      consentRevision: 'closure-v1',
      consentText: 'I consent.',
      fields: [{ key: 'email', type: 'email', label: 'Email', required: true }],
    }
    const makeForm = async (siteId: string, slug: string) => {
      const formDoc = (await payload.create({
        collection: 'form-definitions',
        data: {
          site: siteId,
          name: `Petition ${slug} ${suffix}`,
          publicPath: `/forms/petition-${slug}-${suffix}`,
          actions: [],
        },
        overrideAccess: true,
      } as never)) as any
      const schemaDoc = (await payload.create({
        collection: 'form-schemas',
        data: {
          form: formDoc.id,
          version: 1,
          state: 'published',
          locale: 'en',
          consentText: 'I consent.',
          consentRevision: 'closure-v1',
          schema: schemaBody,
        },
        overrideAccess: true,
      } as never)) as any
      return { formDoc, schemaDoc }
    }
    const { formDoc: form, schemaDoc: formSchema } = await makeForm(siteA, 'a')
    const { formDoc: formB, schemaDoc: formSchemaB } = await makeForm(siteB, 'b')
    const makeSubmission = async (siteId: string, formId: string, schemaId: string) =>
      (await payload.create({
        collection: 'form-submissions',
        data: {
          site: siteId,
          form: formId,
          schema: schemaId,
          locale: 'en',
          values: { email: 'someone@example.test' },
          consentSnapshot: { wording: 'I consent.', reviewed: true },
          status: 'received',
          privacyClass: 'standard',
          idempotencyKey: `closure-${suffix}-${siteId}-${randomUUID().slice(0, 6)}`,
        },
        overrideAccess: true,
      } as never)) as any
    const submissionA = await makeSubmission(siteA, form.id, formSchema.id)
    // A site-B submission of site B's own form. The product's write guard
    // (guardFormWrite) makes a submission whose site differs from its
    // form's site impossible, so the only inconsistent link that can exist
    // is a consent event recorded on site A pointing at this foreign
    // submission — the evaluator must not let it contribute site A's fact.
    const submissionForeign = await makeSubmission(siteB, formB.id, formSchemaB.id)

    const withForm = await makeSubscriber(siteA, `form-yes-${suffix}@example.test`)
    const withoutForm = await makeSubscriber(siteA, `form-no-${suffix}@example.test`)
    const foreignLinked = await makeSubscriber(siteA, `form-foreign-${suffix}@example.test`)
    const consent = (subscriberId: string, formSubmissionId?: string) =>
      payload.create({
        collection: 'consent-events',
        data: {
          site: siteA,
          subscriber: subscriberId,
          ...(formSubmissionId ? { formSubmission: formSubmissionId } : {}),
          event: 'requested',
          basis: 'consent',
          locale: 'en',
          occurredAt: new Date().toISOString(),
        },
        overrideAccess: true,
      } as never)
    await consent(withForm.id, submissionA.id)
    await consent(withoutForm.id)
    await consent(foreignLinked.id, submissionForeign.id)

    const segmentId = await makeSegment(siteA, {
      predicate: { field: 'form', op: 'in', value: [String(form.id)] },
    })
    expect(await eligibleIds(siteA, segmentId)).toEqual([String(withForm.id)])

    const otherFormSegment = await makeSegment(siteA, {
      predicate: { field: 'form', op: 'in', value: [randomUUID()] },
    })
    expect(await eligibleIds(siteA, otherFormSegment)).toEqual([])

    // The foreign form itself selects nobody on site A, even though a
    // site-A consent event links its site-B submission.
    const foreignFormSegment = await makeSegment(siteA, {
      predicate: { field: 'form', op: 'in', value: [String(formB.id)] },
    })
    expect(await eligibleIds(siteA, foreignFormSegment)).toEqual([])
  })

  it('sourceCampaign: selects by the acquisition source recorded on memberships', async () => {
    const launched = await makeSubscriber(siteA, `src-launch-${suffix}@example.test`)
    await makeMembership(launched.id, listA, 'launch-2026')
    const organic = await makeSubscriber(siteA, `src-organic-${suffix}@example.test`)
    await makeMembership(organic.id, listA, 'public-subscribe')
    await makeSubscriber(siteA, `src-none-${suffix}@example.test`)
    const launchedB = await makeSubscriber(siteB, `src-launch-b-${suffix}@example.test`)
    await makeMembership(launchedB.id, listB, 'launch-2026')

    const segmentId = await makeSegment(siteA, {
      predicate: { field: 'sourceCampaign', op: 'in', value: ['launch-2026'] },
    })
    expect(await eligibleIds(siteA, segmentId)).toEqual([String(launched.id)])

    const segmentB = await makeSegment(siteB, {
      predicate: { field: 'sourceCampaign', op: 'in', value: ['launch-2026'] },
    })
    expect(await eligibleIds(siteB, segmentB)).toEqual([String(launchedB.id)])
  })

  it('engagement: withinDays uses the latest observed CRM interaction on this site only', async () => {
    const recentContact = await makeContact(siteA, `eng-recent-${suffix}@example.test`)
    const recent = await makeSubscriber(siteA, `eng-recent-${suffix}@example.test`, {
      contact: recentContact.id,
    })
    const staleContact = await makeContact(siteA, `eng-stale-${suffix}@example.test`)
    const stale = await makeSubscriber(siteA, `eng-stale-${suffix}@example.test`, {
      contact: staleContact.id,
    })
    const foreignContact = await makeContact(siteA, `eng-foreign-${suffix}@example.test`)
    const foreignOnly = await makeSubscriber(siteA, `eng-foreign-${suffix}@example.test`, {
      contact: foreignContact.id,
    })
    const interaction = (siteId: string, contactId: string, occurredAt: string) =>
      payload.create({
        collection: 'interaction-records',
        data: {
          site: siteId,
          contact: contactId,
          kind: 'email',
          occurredAt,
          summary: `Closure interaction ${suffix}`,
        },
        overrideAccess: true,
      } as never)
    await interaction(siteA, recentContact.id, daysAgo(5))
    await interaction(siteA, staleContact.id, daysAgo(90))
    // Foreign-site interaction for a local contact must not count.
    await interaction(siteB, foreignContact.id, daysAgo(1))

    const within30 = await makeSegment(siteA, {
      predicate: { field: 'engagement', op: 'withinDays', value: 30 },
    })
    expect(await eligibleIds(siteA, within30)).toEqual([String(recent.id)])

    const within365 = await makeSegment(siteA, {
      predicate: { field: 'engagement', op: 'withinDays', value: 365 },
    })
    expect(await eligibleIds(siteA, within365)).toEqual(
      [String(recent.id), String(stale.id)].sort(),
    )
    expect(foreignOnly).toBeDefined()
  })

  it('role: selects by site-scoped member roles; a role on another site does not count', async () => {
    const modMember = await makeMember(`role-mod-${suffix}@example.test`)
    const mod = await makeSubscriber(siteA, `role-mod-${suffix}@example.test`, {
      member: modMember.id,
    })
    const foreignRoleMember = await makeMember(`role-foreign-${suffix}@example.test`)
    const foreignOnA = await makeSubscriber(siteA, `role-foreign-${suffix}@example.test`, {
      member: foreignRoleMember.id,
    })
    const foreignOnB = await makeSubscriber(siteB, `role-foreign-b-${suffix}@example.test`, {
      member: foreignRoleMember.id,
    })
    await makeSubscriber(siteA, `role-none-${suffix}@example.test`)
    const grant = (siteId: string, memberId: string, role: string) =>
      payload.create({
        collection: 'member-site-roles',
        data: { site: siteId, member: memberId, role },
        overrideAccess: true,
      } as never)
    await grant(siteA, modMember.id, 'moderator')
    await grant(siteB, foreignRoleMember.id, 'moderator')

    const segmentA = await makeSegment(siteA, {
      predicate: { field: 'role', op: 'in', value: ['moderator'] },
    })
    expect(await eligibleIds(siteA, segmentA)).toEqual([String(mod.id)])
    expect(foreignOnA).toBeDefined()

    const segmentB = await makeSegment(siteB, {
      predicate: { field: 'role', op: 'in', value: ['moderator'] },
    })
    expect(await eligibleIds(siteB, segmentB)).toEqual([String(foreignOnB.id)])
  })

  it('locale: the most recent consent-event locale is the subscriber locale', async () => {
    // Site B is this dimension's universe: no other closure test records
    // consent events there, so exact-set assertions stay hermetic.
    const spanish = await makeSubscriber(siteB, `loc-es-${suffix}@example.test`)
    const english = await makeSubscriber(siteB, `loc-en-${suffix}@example.test`)
    await makeSubscriber(siteB, `loc-none-${suffix}@example.test`)
    const consent = (subscriberId: string, locale: string, occurredAt: string) =>
      payload.create({
        collection: 'consent-events',
        data: {
          site: siteB,
          subscriber: subscriberId,
          event: 'requested',
          basis: 'consent',
          locale,
          occurredAt,
        },
        overrideAccess: true,
      } as never)
    // Older English request superseded by a newer Spanish confirmation.
    await consent(spanish.id, 'en', daysAgo(10))
    await consent(spanish.id, 'es', daysAgo(1))
    await consent(english.id, 'en', daysAgo(2))

    const esSegment = await makeSegment(siteB, {
      predicate: { field: 'locale', op: 'is', value: 'es' },
    })
    expect(await eligibleIds(siteB, esSegment)).toEqual([String(spanish.id)])

    const enSegment = await makeSegment(siteB, {
      predicate: { field: 'locale', op: 'is', value: 'en' },
    })
    expect(await eligibleIds(siteB, enSegment)).toEqual([String(english.id)])
  })

  it('commerceFact: supporter/donor/paid-subscription derive from site-scoped commerce records', async () => {
    // Donor: supporter (member-linked) + succeeded donation on site A.
    const donorMember = await makeMember(`com-donor-${suffix}@example.test`)
    const donor = await makeSubscriber(siteA, `com-donor-${suffix}@example.test`, {
      member: donorMember.id,
    })
    const donorSupporter = (await payload.create({
      collection: 'supporters',
      data: {
        site: siteA,
        displayName: `Donor ${suffix}`,
        member: donorMember.id,
        emailHash: donor.emailHash,
      },
      overrideAccess: true,
    } as never)) as any

    const merchant = (await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteA,
        label: `Merchant ${suffix}`,
        providerKey: 'local-test',
        merchantCountry: 'US',
      },
      overrideAccess: true,
    } as never)) as any
    const cart = (await payload.create({
      collection: 'carts',
      data: { site: siteA, merchantConnection: merchant.id, currency: 'USD', items: [] },
      overrideAccess: true,
    } as never)) as any
    const session = (await payload.create({
      collection: 'checkout-sessions',
      data: {
        site: siteA,
        cart: cart.id,
        merchantConnection: merchant.id,
        currency: 'USD',
        amountMinor: '500',
      },
      overrideAccess: true,
    } as never)) as any
    const paymentIntent = (await payload.create({
      collection: 'payment-intents',
      data: {
        site: siteA,
        checkoutSession: session.id,
        merchantConnection: merchant.id,
        capabilityId: 'card',
        providerKey: 'local-test',
        amountMinor: '500',
        currency: 'USD',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      overrideAccess: true,
    } as never)) as any
    const campaign = (await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteA,
        campaignKey: `closure-${suffix}`,
        version: 1,
        title: `Closure campaign ${suffix}`,
        purpose: 'Closure proof',
        currency: 'USD',
      },
      overrideAccess: true,
    } as never)) as any
    const intent = (await payload.create({
      collection: 'donation-intents',
      data: {
        site: siteA,
        campaign: campaign.id,
        campaignVersion: 1,
        donorSnapshot: { email: `com-donor-${suffix}@example.test` },
        moneySnapshot: { amountMinor: '500', currency: 'USD' },
        recognition: 'anonymous',
      },
      overrideAccess: true,
    } as never)) as any
    await payload.create({
      collection: 'donations',
      data: {
        site: siteA,
        donationIntent: intent.id,
        campaign: campaign.id,
        paymentIntent: paymentIntent.id,
        supporter: donorSupporter.id,
        donorSnapshot: { email: `com-donor-${suffix}@example.test` },
        campaignSnapshot: { title: `Closure campaign ${suffix}` },
        baseAmountMinor: '500',
        currency: 'USD',
        recognition: 'anonymous',
        lifecycle: 'succeeded',
      },
      overrideAccess: true,
    } as never)

    // Paid subscriber: supporter matched by email hash + active subscription.
    const payer = await makeSubscriber(siteA, `com-payer-${suffix}@example.test`)
    const payerSupporter = (await payload.create({
      collection: 'supporters',
      data: { site: siteA, displayName: `Payer ${suffix}`, emailHash: payer.emailHash },
      overrideAccess: true,
    } as never)) as any
    const planRevision = (await payload.create({
      collection: 'plan-revisions',
      data: {
        site: siteA,
        planKey: `closure-plan-${suffix}`,
        revision: 1,
        name: `Closure plan ${suffix}`,
        interval: 'month',
        intervalCount: 1,
        amountMinor: '900',
        currency: 'USD',
        trialDays: 0,
        trialEligibility: 'once_per_customer',
        taxPolicy: 'exclusive',
        publishedAt: new Date().toISOString(),
        entitlements: [
          {
            siteId: String(siteA),
            term: 'subscription',
            resource: 'content',
            capability: 'member-access',
          },
        ],
        providerMappings: {},
        cancelPolicy: 'period_end',
        changePolicy: 'immediate',
      },
      overrideAccess: true,
    } as never)) as any
    await payload.create({
      collection: 'subscriptions',
      data: {
        site: siteA,
        supporter: payerSupporter.id,
        planRevision: planRevision.id,
        planSnapshot: { name: `Closure plan ${suffix}` },
        providerKey: 'local-test',
        state: 'active',
        source: 'provider',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      overrideAccess: true,
    } as never)

    // Supporter with no donation/subscription, and a foreign-site supporter.
    const plain = await makeSubscriber(siteA, `com-plain-${suffix}@example.test`)
    await payload.create({
      collection: 'supporters',
      data: { site: siteA, displayName: `Plain ${suffix}`, emailHash: plain.emailHash },
      overrideAccess: true,
    } as never)
    const foreignOnly = await makeSubscriber(siteA, `com-foreign-${suffix}@example.test`)
    await payload.create({
      collection: 'supporters',
      data: { site: siteB, displayName: `Foreign ${suffix}`, emailHash: foreignOnly.emailHash },
      overrideAccess: true,
    } as never)

    const donorSegment = await makeSegment(siteA, {
      predicate: { field: 'commerceFact', op: 'in', value: ['donor'] },
    })
    expect(await eligibleIds(siteA, donorSegment)).toEqual([String(donor.id)])

    const payerSegment = await makeSegment(siteA, {
      predicate: { field: 'commerceFact', op: 'in', value: ['paid-subscription'] },
    })
    expect(await eligibleIds(siteA, payerSegment)).toEqual([String(payer.id)])

    const supporterSegment = await makeSegment(siteA, {
      predicate: { field: 'commerceFact', op: 'in', value: ['supporter'] },
    })
    expect(await eligibleIds(siteA, supporterSegment)).toEqual(
      [String(donor.id), String(payer.id), String(plain.id)].sort(),
    )
  })

  it('communityFact: profile existence and a space on this site are distinct facts', async () => {
    const spacedMember = await makeMember(`comm-space-${suffix}@example.test`)
    const spaced = await makeSubscriber(siteA, `comm-space-${suffix}@example.test`, {
      member: spacedMember.id,
    })
    const profileOnlyMember = await makeMember(`comm-profile-${suffix}@example.test`)
    const profileOnly = await makeSubscriber(siteA, `comm-profile-${suffix}@example.test`, {
      member: profileOnlyMember.id,
    })
    const foreignSpaceMember = await makeMember(`comm-foreign-${suffix}@example.test`)
    await makeSubscriber(siteA, `comm-foreign-${suffix}@example.test`, {
      member: foreignSpaceMember.id,
    })
    const profile = (memberId: string, handle: string) =>
      payload.create({
        collection: 'profiles',
        data: { member: memberId, displayName: `Profile ${handle}`, handle },
        overrideAccess: true,
      } as never)
    await profile(spacedMember.id, `space-${suffix}`)
    await profile(profileOnlyMember.id, `profile-${suffix}`)
    const space = (siteId: string, memberId: string, handle: string) =>
      payload.create({
        collection: 'spaces',
        data: {
          site: siteId,
          member: memberId,
          handle,
          canonicalPath: `/members/${handle}`,
          displayName: `Space ${handle}`,
        },
        overrideAccess: true,
      } as never)
    await space(siteA, spacedMember.id, `space-${suffix}`)
    await space(siteB, foreignSpaceMember.id, `foreign-${suffix}`)

    const spaceSegment = await makeSegment(siteA, {
      predicate: { field: 'communityFact', op: 'in', value: ['space'] },
    })
    expect(await eligibleIds(siteA, spaceSegment)).toEqual([String(spaced.id)])

    const profileSegment = await makeSegment(siteA, {
      predicate: { field: 'communityFact', op: 'in', value: ['profile'] },
    })
    expect(await eligibleIds(siteA, profileSegment)).toEqual(
      [String(spaced.id), String(profileOnly.id)].sort(),
    )
  })

  it('combined: an all-of segment across reconciled dimensions selects only the full match', async () => {
    const member = await makeMember(`combo-${suffix}@example.test`)
    const full = await makeSubscriber(siteA, `combo-full-${suffix}@example.test`, {
      member: member.id,
    })
    await makeMembership(full.id, listA, 'launch-2026')
    await payload.create({
      collection: 'member-site-roles',
      data: { site: siteA, member: member.id, role: 'contributor' },
      overrideAccess: true,
    } as never)
    await payload.create({
      collection: 'consent-events',
      data: {
        site: siteA,
        subscriber: full.id,
        event: 'double-opt-in-confirmed',
        basis: 'consent',
        locale: 'fr',
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    const partial = await makeSubscriber(siteA, `combo-partial-${suffix}@example.test`)
    await makeMembership(partial.id, listA, 'launch-2026')

    const segmentId = await makeSegment(siteA, {
      all: [
        { predicate: { field: 'sourceCampaign', op: 'in', value: ['launch-2026'] } },
        { predicate: { field: 'role', op: 'in', value: ['contributor'] } },
        { predicate: { field: 'locale', op: 'is', value: 'fr' } },
      ],
    })
    expect(await eligibleIds(siteA, segmentId)).toEqual([String(full.id)])
  })
})
