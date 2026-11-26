import { sourceHashOf, type EvidenceStatus, type NormalizedEvidenceRow } from './import'

/**
 * RC3-CE affiliate network adapters (CE-05).
 *
 * Report translators for the four networks with documented report
 * APIs (Amazon Creators, impact.com, Awin, CJ). Each translator is
 * exercised against representative fixtures in unit tests. LIVE
 * CALLS ARE DISABLED: no code path in this pass performs a network
 * request to a provider. `assertLiveCallAllowed` is the single gate
 * every future live reader must pass, and it refuses unless the
 * creator's own connection is connected AND the provider has been
 * explicitly enabled for live reads on that connection — a state no
 * UI in this pass can set.
 */

export type AdapterResult = Readonly<{
  rows: readonly NormalizedEvidenceRow[]
  skipped: number
}>

function decimalToMinorString(raw: unknown): string | null {
  if (typeof raw === 'number') raw = raw.toFixed(2)
  if (typeof raw !== 'string') return null
  const trimmed = raw.replace(/[$,]/g, '').trim()
  if (!/^-?[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) return null
  const negative = trimmed.startsWith('-')
  const [whole, fraction = ''] = (negative ? trimmed.slice(1) : trimmed).split('.')
  const value = BigInt(whole + (fraction + '00').slice(0, 2))
  return (negative && value !== 0n ? -value : value).toString()
}

function row(partial: Omit<NormalizedEvidenceRow, 'sourceHash'>): NormalizedEvidenceRow {
  return {
    ...partial,
    sourceHash: sourceHashOf([
      partial.providerEventId,
      partial.originalStatus,
      partial.status,
      partial.currency,
      partial.grossMinor,
      partial.commissionMinor,
      partial.feesMinor,
      partial.netMinor,
      partial.payoutRef,
      partial.programRef,
      partial.sourceTimestamp,
    ]),
  }
}

function base(
  providerEventId: string,
  currency: string,
): Omit<NormalizedEvidenceRow, 'sourceHash' | 'status' | 'originalStatus' | 'isEstimated'> {
  return {
    providerEventId,
    currency,
    grossMinor: null,
    commissionMinor: null,
    feesMinor: null,
    netMinor: null,
    payoutRef: null,
    programRef: null,
    sourceTimestamp: null,
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const str = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value)

// ---- Awin transactions ----
const AWIN_STATUS: Record<string, EvidenceStatus> = {
  pending: 'reported-pending',
  approved: 'approved',
  declined: 'denied',
  paid: 'payout-reported',
}

export function parseAwinTransactions(payload: unknown): AdapterResult {
  const items = Array.isArray(payload) ? payload : []
  const rows: NormalizedEvidenceRow[] = []
  let skipped = 0
  for (const item of items) {
    const tx = asRecord(item)
    const id = str(tx.id ?? tx.transactionId)
    const commission = decimalToMinorString(tx.commissionAmount)
    if (!id || commission === null) {
      skipped++
      continue
    }
    const originalStatus = str(tx.status).toLowerCase()
    rows.push(
      row({
        ...base(id, str(tx.currency ?? 'USD').toUpperCase()),
        originalStatus: originalStatus || null,
        status: AWIN_STATUS[originalStatus] ?? 'reported-estimated',
        grossMinor: decimalToMinorString(tx.saleAmount),
        commissionMinor: commission,
        isEstimated: originalStatus === 'pending' || !(originalStatus in AWIN_STATUS),
        programRef: str(tx.advertiserId) || null,
        sourceTimestamp: str(tx.transactionDate) || null,
      }),
    )
  }
  return { rows, skipped }
}

// ---- CJ Affiliate commission details ----
const CJ_STATUS: Record<string, EvidenceStatus> = {
  new: 'reported-pending',
  extended: 'reported-pending',
  locked: 'approved',
  closed: 'settled',
}

export function parseCjCommissionDetails(payload: unknown): AdapterResult {
  const root = asRecord(payload)
  const items = Array.isArray(root.items) ? root.items : Array.isArray(payload) ? payload : []
  const rows: NormalizedEvidenceRow[] = []
  let skipped = 0
  for (const item of items) {
    const detail = asRecord(item)
    const id = str(detail.commissionId ?? detail.id)
    const commission = decimalToMinorString(detail.commissionAmount)
    if (!id || commission === null) {
      skipped++
      continue
    }
    const originalStatus = str(detail.actionStatus).toLowerCase()
    rows.push(
      row({
        ...base(id, str(detail.currency ?? 'USD').toUpperCase()),
        originalStatus: originalStatus || null,
        status: CJ_STATUS[originalStatus] ?? 'reported-estimated',
        grossMinor: decimalToMinorString(detail.saleAmount),
        commissionMinor: commission,
        isEstimated: originalStatus === 'new' || originalStatus === 'extended',
        programRef: str(detail.advertiserId ?? detail.cid) || null,
        sourceTimestamp: str(detail.eventDate) || null,
      }),
    )
  }
  return { rows, skipped }
}

// ---- impact.com actions ----
const IMPACT_STATUS: Record<string, EvidenceStatus> = {
  PENDING: 'reported-pending',
  APPROVED: 'approved',
  REVERSED: 'reversed',
  PAID: 'payout-reported',
}

export function parseImpactActions(payload: unknown): AdapterResult {
  const root = asRecord(payload)
  const items = Array.isArray(root.actions) ? root.actions : Array.isArray(payload) ? payload : []
  const rows: NormalizedEvidenceRow[] = []
  let skipped = 0
  for (const item of items) {
    const action = asRecord(item)
    const id = str(action.id ?? action.actionId)
    const commission = decimalToMinorString(action.payout ?? action.amount)
    if (!id || commission === null) {
      skipped++
      continue
    }
    const originalStatus = str(action.state).toUpperCase()
    rows.push(
      row({
        ...base(id, str(action.currency ?? 'USD').toUpperCase()),
        originalStatus: originalStatus || null,
        status: IMPACT_STATUS[originalStatus] ?? 'reported-estimated',
        grossMinor: decimalToMinorString(action.amount ?? action.grossRevenue),
        commissionMinor: commission,
        isEstimated: originalStatus === 'PENDING',
        programRef: str(action.campaignId ?? action.mediaPartnerId) || null,
        sourceTimestamp: str(action.eventDate ?? action.creationDate) || null,
      }),
    )
  }
  return { rows, skipped }
}

// ---- Amazon Associates earnings report rows (CSV-shaped objects) ----
export function parseAmazonEarningsRows(payload: unknown): AdapterResult {
  const items = Array.isArray(payload) ? payload : []
  const rows: NormalizedEvidenceRow[] = []
  let skipped = 0
  for (const item of items) {
    const earning = asRecord(item)
    const id = str(earning.orderId ?? earning.trackingId ?? earning.id)
    const commission = decimalToMinorString(earning.earnings ?? earning.commission)
    if (!id || commission === null) {
      skipped++
      continue
    }
    rows.push(
      row({
        ...base(id, str(earning.currency ?? 'USD').toUpperCase()),
        // Amazon's earnings report carries no per-row settlement
        // state; rows stay estimates until the monthly statement.
        originalStatus: null,
        status: 'reported-estimated',
        grossMinor: decimalToMinorString(earning.revenue ?? earning.itemsShippedRevenue),
        commissionMinor: commission,
        feesMinor: decimalToMinorString(earning.fees),
        isEstimated: true,
        programRef: str(earning.trackingId) || null,
        sourceTimestamp: str(earning.date) || null,
      }),
    )
  }
  return { rows, skipped }
}

export const NETWORK_ADAPTERS = {
  awin: parseAwinTransactions,
  'cj-affiliate': parseCjCommissionDetails,
  impact: parseImpactActions,
  'amazon-associates': parseAmazonEarningsRows,
} as const

export type NetworkAdapterId = keyof typeof NETWORK_ADAPTERS

/**
 * The live-call gate. Every condition is required; the default state
 * of every connection fails it. This pass ships no UI and no job that
 * can set `liveReadEnabled`, so in practice live reads are disabled
 * everywhere — the adapters are proven on fixtures only.
 */
export function assertLiveCallAllowed(connection: {
  status: string
  credentialReference: string | null
  evidenceByCapability: Record<string, unknown> | null
}): void {
  if (connection.status !== 'connected')
    throw new Error('Live provider reads require a connected provider account.')
  if (!connection.credentialReference)
    throw new Error('Live provider reads require a credential reference on the connection.')
  if (connection.evidenceByCapability?.liveReadEnabled !== true)
    throw new Error(
      'Live provider reads are disabled for this connection. Import a report instead — imports are always available.',
    )
}
