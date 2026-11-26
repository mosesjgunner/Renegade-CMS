import { createHash } from 'node:crypto'
import type { CsvTable } from './csv'

/**
 * RC3-CE generic external-revenue import (CE-04, contract §5.3).
 *
 * Pure mapping/validation core. The pipeline around it is:
 * upload → choose mapping → validate/preview → review duplicates and
 * conflicts → confirm → transactional ingestion → reconciliation
 * summary. Nothing here guesses: an unmapped provider status rejects
 * the row, an unknown amount stays null, and a repeated import of the
 * same source row is a duplicate that changes no totals. A row whose
 * event id already exists with different content is a conflict for
 * human review — it is never silently overwritten, because the
 * original provider record is evidence.
 */

export const EVIDENCE_STATUSES = [
  'reported-estimated',
  'reported-pending',
  'approved',
  'cleared',
  'settled',
  'payout-reported',
  'payout-confirmed',
  'denied',
  'reversed',
  'corrected',
  'disputed',
] as const
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number]

export type EvidenceMapping = Readonly<{
  mappingVersion: string
  columns: Readonly<{
    eventId: string
    currency: string
    status?: string
    gross?: string
    commission?: string
    fees?: string
    net?: string
    timestamp?: string
    programRef?: string
    payoutRef?: string
  }>
  /** Provider-original status string → canonical status. Unmapped statuses reject the row. */
  statusMap: Readonly<Record<string, EvidenceStatus>>
  /** Amount cells: 'minor' = already integer minor units; 'decimal' = major units converted with the exponent. */
  amountFormat: 'minor' | 'decimal'
  decimalExponent?: number
}>

export type NormalizedEvidenceRow = Readonly<{
  providerEventId: string
  originalStatus: string | null
  status: EvidenceStatus
  currency: string
  grossMinor: string | null
  commissionMinor: string | null
  feesMinor: string | null
  netMinor: string | null
  isEstimated: boolean
  payoutRef: string | null
  programRef: string | null
  sourceTimestamp: string | null
  sourceHash: string
}>

export type ImportRowRejection = Readonly<{ rowNumber: number; reasons: readonly string[] }>
export type ImportPreview = Readonly<{
  accepted: readonly NormalizedEvidenceRow[]
  rejected: readonly ImportRowRejection[]
  duplicates: readonly { rowNumber: number; providerEventId: string }[]
  conflicts: readonly { rowNumber: number; providerEventId: string }[]
}>

const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
}

function decimalToMinor(raw: string, exponent: number): string | null {
  const trimmed = raw.trim()
  if (!/^-?[0-9]+(\.[0-9]+)?$/.test(trimmed)) return null
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole, fraction = ''] = unsigned.split('.')
  if (fraction.length > exponent && /[^0]/.test(fraction.slice(exponent))) return null
  const padded = (fraction + '0'.repeat(exponent)).slice(0, exponent)
  const digits = (whole + padded).replace(/^0+(?=[0-9])/, '')
  const value = BigInt(digits === '' ? '0' : digits)
  return (negative && value !== 0n ? -value : value).toString()
}

function minorCell(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null
  const trimmed = raw.trim()
  return /^-?(0|[1-9][0-9]*)$/.test(trimmed) ? trimmed : null
}

function amountCell(
  raw: string | undefined,
  mapping: EvidenceMapping,
  currency: string,
  reasons: string[],
  label: string,
): string | null {
  if (raw === undefined || raw.trim() === '') return null
  if (mapping.amountFormat === 'minor') {
    const value = minorCell(raw)
    if (value === null) reasons.push(`${label} is not an integer minor-unit amount.`)
    return value
  }
  const exponent = mapping.decimalExponent ?? CURRENCY_EXPONENTS[currency] ?? 2
  const value = decimalToMinor(raw, exponent)
  if (value === null) reasons.push(`${label} is not a valid decimal amount.`)
  return value
}

export function sourceHashOf(parts: readonly (string | null)[]): string {
  return createHash('sha256')
    .update(parts.map((p) => p ?? '∅').join(''))
    .digest('hex')
}

/**
 * Normalize + validate every row of a parsed CSV against a mapping.
 * `existing` maps providerEventId → sourceHash for rows already in
 * the evidence store (same site + provider + account), driving the
 * duplicate/conflict classification.
 */
export function previewImport(
  table: CsvTable,
  mapping: EvidenceMapping,
  existing: ReadonlyMap<string, string>,
): ImportPreview {
  const accepted: NormalizedEvidenceRow[] = []
  const rejected: ImportRowRejection[] = []
  const duplicates: ImportPreview['duplicates'][number][] = []
  const conflicts: ImportPreview['conflicts'][number][] = []
  const seenInFile = new Map<string, string>()
  const cols = mapping.columns
  for (const required of [cols.eventId, cols.currency]) {
    if (!table.headers.includes(required))
      throw new Error(`Mapping references missing column "${required}".`)
  }
  table.rows.forEach((row, index) => {
    const rowNumber = index + 2
    const reasons: string[] = []
    const providerEventId = (row[cols.eventId] ?? '').trim()
    if (!providerEventId) reasons.push('Missing provider event id.')
    const currency = (row[cols.currency] ?? '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) reasons.push('Currency is not an ISO-4217 code.')
    const originalStatus = cols.status ? (row[cols.status] ?? '').trim() || null : null
    let status: EvidenceStatus = 'reported-estimated'
    if (originalStatus !== null) {
      const mapped = mapping.statusMap[originalStatus]
      if (!mapped) reasons.push(`Unmapped provider status "${originalStatus}".`)
      else status = mapped
    }
    const grossMinor = amountCell(row[cols.gross ?? ''], mapping, currency, reasons, 'Gross')
    const commissionMinor = amountCell(
      row[cols.commission ?? ''],
      mapping,
      currency,
      reasons,
      'Commission',
    )
    const feesMinor = amountCell(row[cols.fees ?? ''], mapping, currency, reasons, 'Fees')
    const netMinor = amountCell(row[cols.net ?? ''], mapping, currency, reasons, 'Net')
    if (
      grossMinor === null &&
      commissionMinor === null &&
      feesMinor === null &&
      netMinor === null &&
      reasons.length === 0
    )
      reasons.push('Row carries no money component at all.')
    let sourceTimestamp: string | null = null
    const rawTimestamp = cols.timestamp ? (row[cols.timestamp] ?? '').trim() : ''
    if (rawTimestamp) {
      const parsed = Date.parse(rawTimestamp)
      if (Number.isNaN(parsed)) reasons.push('Timestamp does not parse.')
      else sourceTimestamp = new Date(parsed).toISOString()
    }
    if (reasons.length > 0) {
      rejected.push({ rowNumber, reasons })
      return
    }
    const normalized: NormalizedEvidenceRow = {
      providerEventId,
      originalStatus,
      status,
      currency,
      grossMinor,
      commissionMinor,
      feesMinor,
      netMinor,
      isEstimated: status === 'reported-estimated' || status === 'reported-pending',
      payoutRef: cols.payoutRef ? (row[cols.payoutRef] ?? '').trim() || null : null,
      programRef: cols.programRef ? (row[cols.programRef] ?? '').trim() || null : null,
      sourceTimestamp,
      sourceHash: '',
    }
    const sourceHash = sourceHashOf([
      normalized.providerEventId,
      normalized.originalStatus,
      normalized.status,
      normalized.currency,
      normalized.grossMinor,
      normalized.commissionMinor,
      normalized.feesMinor,
      normalized.netMinor,
      normalized.payoutRef,
      normalized.programRef,
      normalized.sourceTimestamp,
    ])
    const withHash = { ...normalized, sourceHash }
    const priorHash = existing.get(providerEventId) ?? seenInFile.get(providerEventId)
    if (priorHash !== undefined) {
      if (priorHash === sourceHash) duplicates.push({ rowNumber, providerEventId })
      else conflicts.push({ rowNumber, providerEventId })
      return
    }
    seenInFile.set(providerEventId, sourceHash)
    accepted.push(withHash)
  })
  return { accepted, rejected, duplicates, conflicts }
}
