/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  assertInvoiceConsistency,
  assertTransition,
  findConflicts,
  ioChangeIsMaterial,
  nextIoVersion,
  representationFeeFor,
  type BookingState,
  type BookingWindow,
  type InvoiceState,
} from './sponsorship'
import { relId } from './earn-service'

/**
 * RC3-CE sponsorship operations (CE-06/CE-07).
 *
 * Payload-backed booking lifecycle on top of the pure rules in
 * sponsorship.ts. Conflict checks run against live bookings at every
 * reserving transition; material IO changes after approval mint a new
 * IO version and return the booking to draft-proposal; collection is
 * recorded explicitly and is the only moment a representation fee can
 * be computed.
 */

const siteWhere = (siteId: string) => ({ site: { equals: siteId } })

async function findAll(db: any, collection: string, siteId: string, limit = 1000): Promise<any[]> {
  const result = await db.find({
    collection,
    where: siteWhere(siteId),
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as any[]
}

function toWindow(doc: any): BookingWindow {
  return {
    id: String(doc.id),
    inventoryId: relId(doc.inventory) ?? '',
    advertiserId: relId(doc.advertiser) ?? '',
    state: doc.state,
    startsAt: doc.startsAt ?? null,
    endsAt: doc.endsAt ?? null,
    holdExpiresAt: doc.holdExpiresAt ?? null,
  }
}

export async function createAdvertiser(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'sponsor-advertisers',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

export async function createInventory(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'sponsor-inventory',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

export async function createBooking(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'sponsor-bookings',
    data: { ...data, site: siteId, state: 'inquiry', ioVersion: 'IO-1' },
    depth: 0,
    overrideAccess: true,
  })
}

export async function transitionBooking(
  db: any,
  siteId: string,
  bookingId: string,
  to: BookingState,
  patch: Record<string, unknown> = {},
): Promise<any> {
  const booking = await db.findByID({
    collection: 'sponsor-bookings',
    id: bookingId,
    depth: 0,
    overrideAccess: true,
  })
  if (!booking || relId(booking.site) !== siteId)
    throw new Error('Booking not found for this site.')
  assertTransition(booking.state, to)
  const merged = { ...booking, ...patch, state: to }
  // Material change to an approved-or-later booking: new IO version,
  // back to draft-proposal for fresh approval (CE-T13).
  if (
    ['approved', 'scheduled', 'delivered', 'proof-review', 'invoiced'].includes(booking.state) &&
    ioChangeIsMaterial(booking, merged)
  ) {
    return db.update({
      collection: 'sponsor-bookings',
      id: bookingId,
      data: {
        ...patch,
        state: 'draft-proposal',
        ioVersion: nextIoVersion(booking.ioVersion ?? null),
        creativeStatus: 'none',
      },
      depth: 0,
      overrideAccess: true,
    })
  }
  if (['tentative', 'approved', 'scheduled'].includes(to)) {
    const [all, advertisers] = await Promise.all([
      findAll(db, 'sponsor-bookings', siteId),
      findAll(db, 'sponsor-advertisers', siteId),
    ])
    const blocked = new Set(
      advertisers.filter((a) => a.status === 'blocked').map((a) => String(a.id)),
    )
    const conflicts = findConflicts(
      toWindow(merged),
      all.map(toWindow),
      blocked,
      new Date().toISOString(),
    )
    const hard = conflicts.filter(
      (c) => c.reason !== 'hold-expired' || c.withBookingId !== bookingId,
    )
    if (hard.length > 0)
      throw new Error(
        `Booking conflicts: ${hard.map((c) => `${c.reason} with ${c.withBookingId}`).join('; ')}`,
      )
  }
  if (patch.invoiceState !== undefined || to === 'collected')
    assertInvoiceConsistency(
      to,
      ((patch.invoiceState as string | undefined) ?? booking.invoiceState) as InvoiceState,
    )
  return db.update({
    collection: 'sponsor-bookings',
    id: bookingId,
    data: { ...patch, state: to },
    depth: 0,
    overrideAccess: true,
  })
}

/**
 * Record an actual collection against a booking. This is the only
 * writer of collectedMinor: an invoice marked sent, a promise, or a
 * marketplace "booked" state never reaches this function. When a
 * representation agreement covers the booking, the fee is computed
 * from the collected amount at this moment and stored on the booking.
 */
export async function recordCollection(
  db: any,
  siteId: string,
  bookingId: string,
  collectedMinor: string,
  collectedAt: string,
): Promise<any> {
  const booking = await db.findByID({
    collection: 'sponsor-bookings',
    id: bookingId,
    depth: 0,
    overrideAccess: true,
  })
  if (!booking || relId(booking.site) !== siteId)
    throw new Error('Booking not found for this site.')
  assertTransition(booking.state, 'collected')
  assertInvoiceConsistency('collected', 'paid')
  let agencyFeeMinor: string | null = null
  let representationAgreementId: string | null = relId(booking.representationAgreement)
  const agreements = await findAll(db, 'representation-agreements', siteId)
  const active = agreements.find((a) => a.status === 'active' && !a.revokedAt) ?? null
  const fee = representationFeeFor({
    agreement: active
      ? {
          id: String(active.id),
          status: active.status,
          commissionBasisBps: active.commissionBasisBps ?? null,
          carveouts: (active.carveouts as string[]) ?? [],
          startsAt: active.startsAt ?? null,
          endsAt: active.endsAt ?? null,
          revokedAt: active.revokedAt ?? null,
        }
      : null,
    bookingId,
    collectedMinor,
    collectedAt,
  })
  if (fee.applies && active) {
    agencyFeeMinor = fee.feeMinor
    representationAgreementId = String(active.id)
  }
  return db.update({
    collection: 'sponsor-bookings',
    id: bookingId,
    data: {
      state: 'collected',
      invoiceState: 'paid',
      collectedMinor,
      agencyFeeMinor,
      representationAgreement: representationAgreementId,
    },
    depth: 0,
    overrideAccess: true,
  })
}

export async function upsertAgreement(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'representation-agreements',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}
