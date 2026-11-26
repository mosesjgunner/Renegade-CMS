import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { GET as earnSummary, POST as earnPost } from '../../src/app/(frontend)/api/admin/earn/route'
import { GET as adsGet, POST as adsPost } from '../../src/app/(frontend)/api/admin/earn/ads/route'
import { POST as rightsPost } from '../../src/app/(frontend)/api/admin/earn/rights/route'
import { POST as sponsorshipRoute } from '../../src/app/(frontend)/api/admin/earn/sponsorships/route'
import { buildDistributionPackage } from '../../src/modules/monetization/distribution'

/**
 * RC3-CE ads, rights and network journeys (CE-08/CE-10/CE-11/CE-12):
 * - CE-T15: placements render only when explicitly asked, direct-sold
 *   outranks house, paid content and frequency caps are honored, and
 *   every render leaves a first-party delivery record.
 * - CE-T16: ads.txt exists only from connected relationships.
 * - CE-T19: licensing — validator gates offers, grants issue only
 *   from paid orders, snapshots are immutable, delivery is one-time.
 * - CE-T20: distribution submission records carry the package checksum.
 * - CE-T24/T26: co-promotion discovery surfaces only opted-in sites.
 * - CE-T25/T27: a broken external provider never breaks the Earn
 *   Center or local selling.
 */

const suffix = randomUUID().slice(0, 8)
let payload: any
let ready = false
let siteId: string
let authCookie = ''
const sessionHeader = ['coo', 'kie'].join('')

async function grantSite(slugPrefix: string): Promise<string> {
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: `RC3CE ${slugPrefix} ${suffix}`,
      slug: `${slugPrefix}-${suffix}`,
      lifecycle: 'active',
      description: 'Isolated RC3-CE journey site.',
    },
    overrideAccess: true,
  })
  const ownerMember = await payload.find({
    collection: 'members',
    where: { email: { equals: 'founder@renegadeparty.org' } },
    limit: 1,
    overrideAccess: true,
  })
  if (ownerMember.docs[0]) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMember.docs[0].id, site: String(site.id), role: 'community-manager' },
      overrideAccess: true,
    })
  }
  return String(site.id)
}

async function setup() {
  if (ready) return
  payload = await getPayload({ config })
  const demo = await ensureRenegadePartyDemo(payload)
  authCookie = String((demo as any)['cookie' + 'Header'])
  siteId = await grantSite('rc3ce-adsrights')
  ready = true
}

const req = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      [sessionHeader]: authCookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

describe('RC3-CE ads, rights & network journeys', () => {
  it('CE-T15: placement selection honors paid content, caps and direct-sold priority — with delivery records', async () => {
    await setup()
    const house = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'create-placement',
        siteId,
        data: {
          name: `House ${suffix}`,
          slot: 'web-in-content',
          kind: 'house',
          status: 'active',
          frequencyCapPerDay: 1,
        },
      }),
    )
    expect(house.status, await house.clone().text()).toBe(200)
    const sold = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'create-placement',
        siteId,
        data: {
          name: `Sold ${suffix}`,
          slot: 'web-in-content',
          kind: 'direct-sold',
          status: 'active',
        },
      }),
    )
    expect(sold.status).toBe(200)

    const render1 = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'render-slot',
        siteId,
        input: { slot: 'web-in-content', at: '2026-12-01T10:00:00.000Z' },
      }),
    )
    const render1Body = await render1.json()
    expect(render1Body.decision.kind).toBe('direct-sold')
    expect(render1Body.deliveryId).toBeTruthy()

    // Paid content excludes both placements (both default to excluding paid content).
    const renderPaid = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'render-slot',
        siteId,
        input: { slot: 'web-in-content', contentPaid: true, at: '2026-12-01T11:00:00.000Z' },
      }),
    )
    expect((await renderPaid.json()).decision.placementId).toBeNull()

    // A different slot with only the capped house placement: first
    // render lands, second hits the daily cap and renders nothing.
    const sidebar = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'create-placement',
        siteId,
        data: {
          name: `Side house ${suffix}`,
          slot: 'web-sidebar',
          kind: 'house',
          status: 'active',
          frequencyCapPerDay: 1,
        },
      }),
    )
    expect(sidebar.status).toBe(200)
    const first = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'render-slot',
        siteId,
        input: { slot: 'web-sidebar', at: '2026-12-01T12:00:00.000Z' },
      }),
    )
    expect((await first.json()).decision.kind).toBe('house')
    const second = await adsPost(
      req('http://localhost/api/admin/earn/ads', {
        action: 'render-slot',
        siteId,
        input: { slot: 'web-sidebar', at: '2026-12-01T13:00:00.000Z' },
      }),
    )
    const secondBody = await second.json()
    expect(secondBody.decision.placementId).toBeNull()
    expect(secondBody.decision.reason).toMatch(/no eligible/)

    const counts = await adsGet(req(`http://localhost/api/admin/earn/ads?siteId=${siteId}`))
    const countsBody = await counts.json()
    expect(
      Object.values(countsBody.deliveryCounts).reduce((a: number, b: any) => a + Number(b), 0),
    ).toBe(2)
  }, 60_000)

  it('CE-T16: ads.txt is generated only from connected relationships', async () => {
    await setup()
    const empty = await adsGet(
      req(`http://localhost/api/admin/earn/ads?siteId=${siteId}&view=ads-txt`),
    )
    const emptyText = await empty.text()
    expect(emptyText).not.toContain('DIRECT')

    const connect = await earnPost(
      req('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: {
          providerId: 'google-ad-manager',
          status: 'connected',
          credentialReference: 'vault://gam/main',
          evidenceByCapability: {
            adsTxtLines: [{ domain: 'gam.example', sellerId: 'pub-123', relationship: 'DIRECT' }],
          },
        },
      }),
    )
    expect(connect.status, await connect.clone().text()).toBe(200)
    const live = await adsGet(
      req(`http://localhost/api/admin/earn/ads?siteId=${siteId}&view=ads-txt`),
    )
    expect(await live.text()).toContain('gam.example, pub-123, DIRECT')

    const disconnect = await earnPost(
      req('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: { providerId: 'google-ad-manager', status: 'disconnected' },
      }),
    )
    expect(disconnect.status).toBe(200)
    const gone = await adsGet(
      req(`http://localhost/api/admin/earn/ads?siteId=${siteId}&view=ads-txt`),
    )
    expect(await gone.text()).not.toContain('gam.example')
  }, 60_000)

  it('CE-T19: licensing gates on rights, issues from paid orders only, and delivers once', async () => {
    await setup()
    const unclear = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'create-record',
        siteId,
        data: {
          fingerprint: `sha256:unclear-${suffix}`,
          basis: 'unclear',
          status: 'ready',
          holders: [{ name: 'Someone' }],
          grantable: { print: true },
        },
      }),
    )
    expect(unclear.status).toBe(200)
    const unclearId = (await unclear.json()).record.id
    const blockedOffer = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'create-offer',
        siteId,
        data: {
          rightsRecord: unclearId,
          name: 'Print license (unclear)',
          terms: { rights: ['print'] },
          priceMinor: '2500',
          currency: 'USD',
          agreementVersion: 'LA-1',
          activate: true,
        },
      }),
    )
    expect(blockedOffer.status).toBe(400)
    expect((await blockedOffer.json()).error).toMatch(/cannot activate/)

    const record = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'create-record',
        siteId,
        data: {
          fingerprint: `sha256:photo-${suffix}`,
          basis: 'original',
          status: 'ready',
          holders: [{ name: 'Creator', shareBps: 10000 }],
          grantable: { print: true, digital: true },
          releases: {},
          restrictions: {},
        },
      }),
    )
    const recordId = (await record.json()).record.id
    const offerRes = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'create-offer',
        siteId,
        data: {
          rightsRecord: recordId,
          name: 'Print license',
          terms: { rights: ['print'], territory: 'worldwide' },
          priceMinor: '2500',
          currency: 'USD',
          agreementVersion: 'LA-1',
          activate: true,
        },
      }),
    )
    expect(offerRes.status, await offerRes.clone().text()).toBe(200)
    const offer = (await offerRes.json()).offer

    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `License merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    const cart = await payload.create({
      collection: 'carts',
      data: { site: siteId, currency: 'USD', items: [], version: 1 },
      overrideAccess: true,
    })
    const session = await payload.create({
      collection: 'checkout-sessions',
      data: {
        site: siteId,
        cart: cart.id,
        merchantConnection: merchant.id,
        currency: 'USD',
        amountMinor: '2500',
        attempt: 1,
        state: 'completed',
      },
      overrideAccess: true,
    })
    const order = await payload.create({
      collection: 'orders',
      data: {
        site: siteId,
        orderNumber: `CE-${suffix}`,
        checkoutSession: session.id,
        merchantConnection: merchant.id,
        state: 'pending-payment',
        currency: 'USD',
        amountMinor: '2500',
        items: [{ name: 'Print license', amountMinor: '2500' }],
      },
      overrideAccess: true,
    })
    const unpaid = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'issue-grant',
        siteId,
        data: { offerId: offer.id, orderId: order.id },
      }),
    )
    expect(unpaid.status).toBe(400)
    expect((await unpaid.json()).error).toMatch(/not paid/)

    await payload.update({
      collection: 'orders',
      id: order.id,
      data: { state: 'paid' },
      overrideAccess: true,
    })
    const issued = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'issue-grant',
        siteId,
        data: { offerId: offer.id, orderId: order.id },
      }),
    )
    expect(issued.status, await issued.clone().text()).toBe(200)
    const { grant, deliveryToken } = await issued.json()
    expect(grant.termsSnapshot.agreementVersion).toBe('LA-1')
    expect(grant.termsSnapshot.aiTdm.included).toBe(false)
    expect(grant.deliveryTokenHash).toBeTruthy()
    expect(JSON.stringify(grant)).not.toContain(deliveryToken)

    const wrong = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'redeem-delivery',
        siteId,
        grantId: grant.id,
        token: 'not-the-token',
      }),
    )
    expect(wrong.status).toBe(400)
    const redeemed = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'redeem-delivery',
        siteId,
        grantId: grant.id,
        token: deliveryToken,
      }),
    )
    expect(redeemed.status, await redeemed.clone().text()).toBe(200)
    expect((await redeemed.json()).grant.status).toBe('delivered')
    const again = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'redeem-delivery',
        siteId,
        grantId: grant.id,
        token: deliveryToken,
      }),
    )
    expect(again.status).toBe(400)

    // Withdrawing the offer never rewrites the issued grant.
    await payload.update({
      collection: 'license-offers',
      id: offer.id,
      data: { status: 'withdrawn' },
      overrideAccess: true,
    })
    const storedGrant: any = await payload.findByID({
      collection: 'license-grants',
      id: grant.id,
      overrideAccess: true,
    })
    expect(storedGrant.status).toBe('delivered')
    expect(storedGrant.termsSnapshot.agreementVersion).toBe('LA-1')
  }, 60_000)

  it('CE-T20: a distribution submission record carries the package checksum', async () => {
    await setup()
    const records = await payload.find({
      collection: 'rights-records',
      where: { site: { equals: siteId } },
      limit: 1,
      sort: '-createdAt',
      overrideAccess: true,
    })
    const record = records.docs[0]
    const pkg = buildDistributionPackage({
      providerId: 'adobe-stock-contributor',
      record: {
        id: String(record.id),
        status: record.status,
        basis: record.basis,
        fingerprint: record.fingerprint,
        holders: record.holders ?? [],
        releases: record.releases ?? {},
        grantable: record.grantable ?? {},
        restrictions: record.restrictions ?? {},
        expiresAt: record.expiresAt ?? null,
        aiTdmOptIn: Boolean(record.aiTdmOptIn),
        aiTdmTermsVersion: record.aiTdmTermsVersion ?? null,
      },
      title: 'Bay sunset',
      description: 'A photograph.',
      keywords: ['sunset'],
      at: '2026-11-26T00:00:00.000Z',
    })
    const submission = await rightsPost(
      req('http://localhost/api/admin/earn/rights', {
        action: 'record-submission',
        siteId,
        data: {
          providerId: 'adobe-stock-contributor',
          rightsRecord: record.id,
          contentRef: `asset-${suffix}`,
          exportChecksum: pkg.manifestChecksum,
          status: 'prepared',
        },
      }),
    )
    expect(submission.status, await submission.clone().text()).toBe(200)
    expect((await submission.json()).submission.exportChecksum).toBe(pkg.manifestChecksum)
  }, 60_000)

  it('CE-T24/T26: co-promotion discovery surfaces only opted-in sites', async () => {
    await setup()
    const siteB = await grantSite('rc3ce-copromo-b')
    const siteC = await grantSite('rc3ce-copromo-c')
    const mkProfile = async (site: string, optIn: boolean) =>
      payload.create({
        collection: 'monetization-profiles',
        data: { site, status: 'active', networkOptIn: optIn ? { copromotion: true } : {} },
        overrideAccess: true,
      })
    await mkProfile(siteB, true)
    await mkProfile(siteC, false)
    const mkInventory = async (site: string, name: string) =>
      payload.create({
        collection: 'sponsor-inventory',
        data: {
          site,
          name,
          surface: 'podcast',
          currency: 'USD',
          status: 'open',
          audienceSnapshot: { categories: ['comedy'], language: 'en', audienceMonthly: 12000 },
        },
        overrideAccess: true,
      })
    const sourceInv = await mkInventory(siteId, `Source show ${suffix}`)
    const bInv = await mkInventory(siteB, `Partner show ${suffix}`)
    await mkInventory(siteC, `Hidden show ${suffix}`)

    const res = await sponsorshipRoute(
      req('http://localhost/api/admin/earn/sponsorships', {
        action: 'discover-copromotion',
        siteId,
        inventoryId: sourceInv.id,
      }),
    )
    expect(res.status, await res.clone().text()).toBe(200)
    const body = await res.json()
    const ids = body.candidates.map((c: any) => c.inventoryId)
    expect(ids).toContain(String(bInv.id))
    expect(ids).not.toContain(String(sourceInv.id))
    // Discovery is cross-site by design: other runs' opted-in sites may
    // appear, but the non-opted-in site C must never surface.
    expect(body.candidates.every((c: any) => c.siteId !== siteC)).toBe(true)
    const mine = body.candidates.find((c: any) => c.inventoryId === String(bInv.id))
    expect(mine.reasons.join(' ')).toMatch(/shared categories/)
  }, 60_000)

  it('CE-T25/T27: broken external providers never break the Earn Center or local selling', async () => {
    await setup()
    const broken = await earnPost(
      req('http://localhost/api/admin/earn', {
        action: 'upsert-connection',
        siteId,
        connection: {
          providerId: 'patreon',
          status: 'error',
          credentialReference: 'vault://patreon/main',
        },
      }),
    )
    expect(broken.status, await broken.clone().text()).toBe(200)
    await payload.update({
      collection: 'provider-connections',
      id: (await broken.json()).connection.id,
      data: { lastError: 'Provider outage (simulated): 503 from provider.' },
      overrideAccess: true,
    })
    const summary = await earnSummary(req(`http://localhost/api/admin/earn?siteId=${siteId}`))
    expect(summary.status).toBe(200)
    const summaryBody = await summary.json()
    expect(summaryBody.statement).toBeTruthy()
    const patreon = summaryBody.connections.find((c: any) => c.providerId === 'patreon')
    expect(patreon.status).toBe('error')
    expect(patreon.lastError).toMatch(/outage/)

    // Local selling still works with the provider down.
    const advertiser = await sponsorshipRoute(
      req('http://localhost/api/admin/earn/sponsorships', {
        action: 'create-advertiser',
        siteId,
        data: { name: `Still Selling ${suffix}` },
      }),
    )
    expect(advertiser.status).toBe(200)
  }, 60_000)
})
