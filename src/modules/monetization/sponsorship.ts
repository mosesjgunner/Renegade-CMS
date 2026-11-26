import { bpsFee } from './money'

/**
 * RC3-CE sponsorship core (CE-06/CE-07, contract §6).
 *
 * Pure domain rules for direct sponsorships. The state machine keeps
 * the distinctions creators actually lose money on: an inquiry is not
 * a booking, an invoice is not a collection, a delivery claim is not
 * proof, and a price change after approval is a NEW insertion order
 * version that needs fresh approval — never a silent edit.
 */

export const BOOKING_STATES = [
  'inquiry',
  'draft-proposal',
  'tentative',
  'approved',
  'scheduled',
  'delivered',
  'proof-review',
  'invoiced',
  'collected',
  'allocated',
  'cancelled',
  'makegood',
  'disputed',
  'refunded',
] as const
export type BookingState = (typeof BOOKING_STATES)[number]

const TRANSITIONS: Readonly<Record<BookingState, readonly BookingState[]>> = {
  inquiry: ['draft-proposal', 'tentative', 'cancelled'],
  'draft-proposal': ['tentative', 'approved', 'cancelled'],
  tentative: ['approved', 'cancelled'],
  approved: ['scheduled', 'cancelled'],
  scheduled: ['delivered', 'cancelled', 'makegood'],
  delivered: ['proof-review', 'makegood', 'disputed'],
  'proof-review': ['invoiced', 'makegood', 'disputed'],
  invoiced: ['collected', 'disputed', 'cancelled'],
  collected: ['allocated', 'disputed', 'refunded'],
  allocated: ['disputed', 'refunded'],
  cancelled: [],
  makegood: ['scheduled', 'cancelled'],
  disputed: ['makegood', 'refunded', 'cancelled'],
  refunded: [],
}

export function canTransition(from: BookingState, to: BookingState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function assertTransition(from: BookingState, to: BookingState): void {
  if (!canTransition(from, to))
    throw new Error(`Sponsor booking cannot move from ${from} to ${to}.`)
}

/** States in which a booking actually reserves its inventory window. */
export const RESERVING_STATES: readonly BookingState[] = [
  'tentative',
  'approved',
  'scheduled',
  'delivered',
  'proof-review',
  'invoiced',
  'collected',
  'allocated',
  'makegood',
]

export type BookingWindow = Readonly<{
  id: string
  inventoryId: string
  advertiserId: string
  state: BookingState
  startsAt: string | null
  endsAt: string | null
  holdExpiresAt: string | null
}>

export type ConflictReason = 'inventory-overlap' | 'advertiser-blocked' | 'hold-expired'

export type Conflict = Readonly<{
  withBookingId: string
  reason: ConflictReason
}>

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Conflict check for placing `candidate` against existing bookings.
 * Bookings without a full window cannot conflict on time (an inquiry
 * reserves nothing). A tentative booking whose hold has expired no
 * longer reserves — reported as hold-expired against itself so the
 * operator releases it explicitly rather than the system silently
 * double-selling the slot.
 */
export function findConflicts(
  candidate: BookingWindow,
  existing: readonly BookingWindow[],
  blockedAdvertiserIds: ReadonlySet<string>,
  now: string,
): readonly Conflict[] {
  const conflicts: Conflict[] = []
  if (blockedAdvertiserIds.has(candidate.advertiserId))
    conflicts.push({ withBookingId: candidate.id, reason: 'advertiser-blocked' })
  if (!RESERVING_STATES.includes(candidate.state)) return conflicts
  if (candidate.state === 'tentative' && candidate.holdExpiresAt && candidate.holdExpiresAt <= now)
    conflicts.push({ withBookingId: candidate.id, reason: 'hold-expired' })
  if (!candidate.startsAt || !candidate.endsAt) return conflicts
  for (const other of existing) {
    if (other.id === candidate.id) continue
    if (other.inventoryId !== candidate.inventoryId) continue
    if (!RESERVING_STATES.includes(other.state)) continue
    if (other.state === 'tentative' && other.holdExpiresAt && other.holdExpiresAt <= now) continue
    if (!other.startsAt || !other.endsAt) continue
    if (overlaps(candidate.startsAt, candidate.endsAt, other.startsAt, other.endsAt))
      conflicts.push({ withBookingId: other.id, reason: 'inventory-overlap' })
  }
  return conflicts
}

/**
 * Insertion-order versioning: once a booking is approved, its price,
 * inventory, window or terms are frozen into that IO version. Any
 * material change produces the next version and returns the booking
 * to draft-proposal for fresh approval (CE-T13).
 */
export function nextIoVersion(current: string | null): string {
  if (!current) return 'IO-1'
  const match = /^IO-(\d+)$/.exec(current)
  if (!match) return 'IO-2'
  return `IO-${Number(match[1]) + 1}`
}

export const MATERIAL_IO_FIELDS = [
  'priceMinor',
  'currency',
  'inventory',
  'startsAt',
  'endsAt',
] as const

export function ioChangeIsMaterial(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): boolean {
  return MATERIAL_IO_FIELDS.some((field) => before[field] !== after[field])
}

/** Invoice state is tracked separately from booking delivery state — an invoice is never a collection. */
export const INVOICE_STATES = ['none', 'created', 'sent', 'paid', 'overdue', 'void'] as const
export type InvoiceState = (typeof INVOICE_STATES)[number]

export function assertInvoiceConsistency(
  bookingState: BookingState,
  invoiceState: InvoiceState,
): void {
  if (invoiceState === 'paid' && bookingState !== 'collected' && bookingState !== 'allocated')
    throw new Error(
      'An invoice can only read paid once the booking itself is in a collected state; payment is recorded on the booking, not inferred from the invoice.',
    )
  if (bookingState === 'collected' && invoiceState !== 'paid')
    throw new Error('A collected booking must carry a paid invoice state.')
}

// ---- Representation (CE-07) ----

export type RepresentationAgreementShape = Readonly<{
  id: string
  status: string
  commissionBasisBps: number | null
  carveouts: readonly string[]
  startsAt: string | null
  endsAt: string | null
  revokedAt: string | null
}>

export type RepresentationFeeResult = Readonly<{
  applies: boolean
  reason: string
  feeMinor: string
  creatorNetMinor: string
}>

/**
 * The agency fee applies ONLY to revenue that is (a) covered by an
 * agreement active at collection time, (b) not carved out, and
 * (c) actually collected. Bookings, invoices, estimates and direct
 * deals the creator brought themselves never incur the fee, and a
 * self-hosted operator can always run with no agreement at all —
 * representation is opt-in, never a platform tax (contract §6.3).
 */
export function representationFeeFor(input: {
  agreement: RepresentationAgreementShape | null
  bookingId: string
  collectedMinor: string | null
  collectedAt: string
}): RepresentationFeeResult {
  const zero: RepresentationFeeResult = {
    applies: false,
    reason: '',
    feeMinor: '0',
    creatorNetMinor: input.collectedMinor ?? '0',
  }
  if (!input.agreement) return { ...zero, reason: 'No representation agreement exists.' }
  const agreement = input.agreement
  if (agreement.status !== 'active' || agreement.revokedAt)
    return { ...zero, reason: 'Agreement is not active.' }
  if (agreement.startsAt && input.collectedAt < agreement.startsAt)
    return { ...zero, reason: 'Collection predates the agreement.' }
  if (agreement.endsAt && input.collectedAt > agreement.endsAt)
    return { ...zero, reason: 'Collection is after the agreement ended.' }
  if (agreement.carveouts.includes(input.bookingId))
    return { ...zero, reason: 'Booking is carved out of the agreement.' }
  if (input.collectedMinor === null || input.collectedMinor === '0')
    return { ...zero, reason: 'Nothing has been collected; no fee can apply.' }
  if (agreement.commissionBasisBps === null)
    return { ...zero, reason: 'Agreement has no commission basis recorded.' }
  const collected = BigInt(input.collectedMinor)
  const fee = bpsFee(collected, agreement.commissionBasisBps)
  return {
    applies: fee > 0n,
    reason: 'Fee applies to collected revenue under the active agreement.',
    feeMinor: fee.toString(),
    creatorNetMinor: (collected - fee).toString(),
  }
}
