import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { POST as sponsorshipRoute } from '../../src/app/(frontend)/api/admin/earn/sponsorships/route'

/**
 * RC3-CE sponsorship journeys (CE-06/CE-07/CE-09):
 * - CE-T12: full booking lifecycle; an invoice is not a collection —
 *   collection is recorded explicitly and only then reads collected.
 * - CE-T13: overlapping reservations conflict; a material change
 *   after approval mints a new IO version and reopens approval.
 * - CE-T14: representation fee applies only to covered collected
 *   revenue (carveouts and no-agreement sites pay nothing).
 * - CE-T17: a podcast host-read deal rides the same machinery
 *   (surface podcast, versioned creative, proof recorded).
 */

const suffix = randomUUID().slice(0, 8)
let payload: any
let ready = false
let siteId: string
let authCookie = ''
const sessionHeader = ['coo', 'kie'].join('')

async function setup() {
  if (ready) return
  payload = await getPayload({ config })
  const demo = await ensureRenegadePartyDemo(payload)
  authCookie = String((demo as any)['cookie' + 'Header'])
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: `RC3CE Sponsor ${suffix}`,
      slug: `rc3ce-sponsor-${suffix}`,
      lifecycle: 'active',
      description: 'Isolated RC3-CE sponsorship journey site.',
    },
    overrideAccess: true,
  })
  siteId = String(site.id)
  const ownerMember = await payload.find({
    collection: 'members',
    where: { email: { equals: 'founder@renegadeparty.org' } },
    limit: 1,
    overrideAccess: true,
  })
  if (ownerMember.docs[0]) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMember.docs[0].id, site: siteId, role: 'community-manager' },
      overrideAccess: true,
    })
  }
  ready = true
}

const call = async (body: Record<string, unknown>) => {
  const res = await sponsorshipRoute(
    new Request('http://localhost/api/admin/earn/sponsorships', {
      method: 'POST',
      headers: {
        host: 'localhost',
        'content-type': 'application/json',
        [sessionHeader]: authCookie,
      },
      body: JSON.stringify({ siteId, ...body }),
    }),
  )
  return { status: res.status, body: await res.json() }
}

async function makeAdvertiser(name: string) {
  const { status, body } = await call({ action: 'create-advertiser', data: { name } })
  expect(status).toBe(200)
  return body.advertiser
}

async function makeInventory(name: string, surface = 'web') {
  const { status, body } = await call({
    action: 'create-inventory',
    data: {
      name,
      surface,
      currency: 'USD',
      rateMinor: '10000',
      pricingModel: 'flat',
      status: 'open',
      unitsTotal: 4,
    },
  })
  expect(status).toBe(200)
  return body.inventory
}

async function makeBooking(
  inventoryId: string,
  advertiserId: string,
  patch: Record<string, unknown> = {},
) {
  const { status, body } = await call({
    action: 'create-booking',
    data: {
      inventory: inventoryId,
      advertiser: advertiserId,
      currency: 'USD',
      priceMinor: '10000',
      startsAt: '2026-12-10T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      ...patch,
    },
  })
  expect(status).toBe(200)
  return body.booking
}

async function walkToInvoiced(bookingId: string) {
  for (const to of [
    'tentative',
    'approved',
    'scheduled',
    'delivered',
    'proof-review',
    'invoiced',
  ]) {
    const { status, body } = await call({ action: 'transition-booking', bookingId, to })
    expect(status, JSON.stringify(body)).toBe(200)
  }
}

describe('RC3-CE sponsorship journeys', () => {
  it('CE-T12: lifecycle keeps invoice and collection as separate truths', async () => {
    await setup()
    const advertiser = await makeAdvertiser(`Acme ${suffix}`)
    const inventory = await makeInventory(`Homepage hero ${suffix}`)
    const booking = await makeBooking(inventory.id, advertiser.id)
    expect(booking.state).toBe('inquiry')
    expect(booking.ioVersion).toBe('IO-1')

    // Skipping states is refused.
    const skip = await call({
      action: 'transition-booking',
      bookingId: booking.id,
      to: 'collected',
    })
    expect(skip.status).toBe(400)

    await walkToInvoiced(booking.id)
    // An invoice cannot read paid before collection is recorded.
    const earlyPaid = await call({
      action: 'transition-booking',
      bookingId: booking.id,
      to: 'invoiced',
      patch: { invoiceState: 'paid' },
    })
    expect(earlyPaid.status).toBe(400)

    const collected = await call({
      action: 'record-collection',
      bookingId: booking.id,
      collectedMinor: '10000',
      collectedAt: '2026-12-21T00:00:00.000Z',
    })
    expect(collected.status, JSON.stringify(collected.body)).toBe(200)
    expect(collected.body.booking.state).toBe('collected')
    expect(collected.body.booking.invoiceState).toBe('paid')
    expect(collected.body.booking.collectedMinor).toBe('10000')
    // No representation agreement exists on this site: no fee.
    expect(collected.body.booking.agencyFeeMinor ?? null).toBeNull()
  }, 60_000)

  it('CE-T13: overlapping reservations conflict; material changes re-version the IO', async () => {
    await setup()
    const advertiser = await makeAdvertiser(`Beta ${suffix}`)
    const rival = await makeAdvertiser(`Rival ${suffix}`)
    const inventory = await makeInventory(`Newsletter slot ${suffix}`, 'newsletter')
    const first = await makeBooking(inventory.id, advertiser.id)
    const firstWalk = await call({
      action: 'transition-booking',
      bookingId: first.id,
      to: 'tentative',
    })
    expect(firstWalk.status).toBe(200)
    const approved = await call({
      action: 'transition-booking',
      bookingId: first.id,
      to: 'approved',
    })
    expect(approved.status).toBe(200)

    const second = await makeBooking(inventory.id, rival.id)
    const conflict = await call({
      action: 'transition-booking',
      bookingId: second.id,
      to: 'tentative',
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toMatch(/inventory-overlap/)

    // A price change on the approved booking: new IO version, back to draft.
    const changed = await call({
      action: 'transition-booking',
      bookingId: first.id,
      to: 'scheduled',
      patch: { priceMinor: '12000' },
    })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body.booking.ioVersion).toBe('IO-2')
    expect(changed.body.booking.state).toBe('draft-proposal')
    expect(changed.body.booking.priceMinor).toBe('12000')
  }, 60_000)

  it('CE-T14: representation fee applies only to covered collected revenue', async () => {
    await setup()
    const advertiser = await makeAdvertiser(`Gamma ${suffix}`)
    const inventory = await makeInventory(`Sidebar ${suffix}`)
    const covered = await makeBooking(inventory.id, advertiser.id, {
      startsAt: '2027-01-05T00:00:00.000Z',
      endsAt: '2027-01-12T00:00:00.000Z',
    })
    const carved = await makeBooking(inventory.id, advertiser.id, {
      startsAt: '2027-02-05T00:00:00.000Z',
      endsAt: '2027-02-12T00:00:00.000Z',
    })
    const agreement = await call({
      action: 'create-agreement',
      data: {
        version: 'REP-1',
        status: 'active',
        commissionBasisBps: 2000,
        carveouts: [carved.id],
        startsAt: '2026-01-01T00:00:00.000Z',
      },
    })
    expect(agreement.status, JSON.stringify(agreement.body)).toBe(200)

    await walkToInvoiced(covered.id)
    const collected = await call({
      action: 'record-collection',
      bookingId: covered.id,
      collectedMinor: '10000',
      collectedAt: '2027-01-13T00:00:00.000Z',
    })
    expect(collected.status, JSON.stringify(collected.body)).toBe(200)
    expect(collected.body.booking.agencyFeeMinor).toBe('2000')
    expect(collected.body.booking.representationAgreement).toBe(agreement.body.agreement.id)

    await walkToInvoiced(carved.id)
    const carvedCollected = await call({
      action: 'record-collection',
      bookingId: carved.id,
      collectedMinor: '10000',
      collectedAt: '2027-02-13T00:00:00.000Z',
    })
    expect(carvedCollected.status, JSON.stringify(carvedCollected.body)).toBe(200)
    expect(carvedCollected.body.booking.agencyFeeMinor ?? null).toBeNull()
  }, 60_000)

  it('CE-T17: a podcast host-read deal rides the sponsorship machinery with proof', async () => {
    await setup()
    const advertiser = await makeAdvertiser(`PodBrand ${suffix}`)
    const inventory = await makeInventory(`Host-read midroll ${suffix}`, 'podcast')
    const booking = await makeBooking(inventory.id, advertiser.id, {
      startsAt: '2027-03-01T00:00:00.000Z',
      endsAt: '2027-03-31T00:00:00.000Z',
    })
    for (const to of ['tentative', 'approved', 'scheduled']) {
      const step = await call({ action: 'transition-booking', bookingId: booking.id, to })
      expect(step.status, JSON.stringify(step.body)).toBe(200)
    }
    const delivered = await call({
      action: 'transition-booking',
      bookingId: booking.id,
      to: 'delivered',
      patch: {
        creativeVersions: [
          {
            version: 'read-v1',
            script: 'This episode is brought to you by PodBrand.',
            approvedBy: 'host',
          },
        ],
        creativeStatus: 'approved',
        proof: {
          episodeGuid: `ep-${suffix}`,
          publishedAt: '2027-03-05T00:00:00.000Z',
          disclosure: 'Paid sponsorship read by the host.',
          downloadsAtProof: 4200,
        },
      },
    })
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200)
    const stored: any = await payload.findByID({
      collection: 'sponsor-bookings',
      id: booking.id,
      overrideAccess: true,
    })
    expect(stored.proof.episodeGuid).toBe(`ep-${suffix}`)
    expect(stored.proof.disclosure).toMatch(/Paid sponsorship/)
    expect(stored.creativeVersions[0].version).toBe('read-v1')
  }, 60_000)
})
