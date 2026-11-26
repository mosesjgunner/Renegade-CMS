/* eslint-disable @typescript-eslint/no-explicit-any */
import { summarizeCommissionLiabilities } from '../commerce/settlement-service'
import type { CommissionLedger } from '../commerce/affiliate-referral-contracts'
import { findProvider } from './catalog'
import {
  computeStatement,
  type ExternalMoneyRow,
  type NativeMoneyRow,
  type Statement,
} from './statements'

/**
 * RC3-CE Earn Center service layer (CE-02/CE-03/CE-04).
 *
 * Payload-backed operations behind the /api/admin/earn routes. Every
 * function is site-scoped; the routes resolve the operator grant and
 * pass an already-authorized site id. Money truth is read from the
 * canonical Commerce stores — this layer never writes payment state.
 */

export const relId = (value: any): string | null =>
  value == null ? null : typeof value === 'object' ? String(value.id) : String(value)

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

// ---- Monetization profile (CE-02) ----

export async function getProfile(db: any, siteId: string): Promise<any | null> {
  const docs = await findAll(db, 'monetization-profiles', siteId, 1)
  return docs[0] ?? null
}

export async function upsertProfile(
  db: any,
  siteId: string,
  data: Record<string, unknown>,
): Promise<any> {
  const existing = await getProfile(db, siteId)
  if (existing)
    return db.update({
      collection: 'monetization-profiles',
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
  return db.create({
    collection: 'monetization-profiles',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

// ---- Provider connections (CE-04) ----

const CONNECTION_STATUSES = [
  'not-configured',
  'awaiting-provider',
  'connected',
  'expired',
  'denied',
  'error',
  'disconnected',
] as const

export async function listConnections(db: any, siteId: string): Promise<any[]> {
  return findAll(db, 'provider-connections', siteId)
}

/**
 * Create or update a provider connection. Hard rules enforced here,
 * not just in the UI: the provider must exist in the catalog; raw
 * credential material is refused (only a secret-manager reference may
 * be stored); a connection may only read `connected` when it carries
 * a credential reference or the provider's auth mode is manual/none.
 */
export async function upsertConnection(
  db: any,
  siteId: string,
  input: {
    providerId: string
    accountRef?: string | null
    credentialReference?: string | null
    status?: string
    grantedScopes?: readonly string[]
    authorizedPurpose?: string | null
    evidenceByCapability?: Record<string, unknown>
  },
): Promise<any> {
  const raw = input as unknown as Record<string, unknown>
  for (const forbidden of ['credentials', 'apiKey', 'apiSecret', 'password', 'token', 'secret'])
    if (forbidden in raw)
      throw new Error(
        `Refusing to store raw credential material ("${forbidden}"). Store a secret-manager reference instead.`,
      )
  const provider = findProvider(input.providerId)
  if (!provider) throw new Error(`Unknown provider "${input.providerId}".`)
  const status = input.status ?? 'not-configured'
  if (!(CONNECTION_STATUSES as readonly string[]).includes(status))
    throw new Error(`Unknown connection status "${status}".`)
  if (
    status === 'connected' &&
    !input.credentialReference &&
    provider.authMode !== 'manual' &&
    provider.authMode !== 'none'
  )
    throw new Error(
      'A connection can only be marked connected with a credential reference on file.',
    )
  const existing = (await listConnections(db, siteId)).find(
    (row) =>
      row.providerId === provider.id && (row.accountRef ?? null) === (input.accountRef ?? null),
  )
  const data: Record<string, unknown> = {
    providerId: provider.id,
    accountRef: input.accountRef ?? null,
    credentialReference: input.credentialReference ?? existing?.credentialReference ?? null,
    status,
    grantedScopes: input.grantedScopes ?? existing?.grantedScopes ?? [],
    authorizedPurpose: input.authorizedPurpose ?? existing?.authorizedPurpose ?? null,
    evidenceByCapability: input.evidenceByCapability ?? existing?.evidenceByCapability ?? {},
    lastSuccessAt:
      status === 'connected' ? new Date().toISOString() : (existing?.lastSuccessAt ?? null),
    revokedAt: status === 'disconnected' ? new Date().toISOString() : (existing?.revokedAt ?? null),
  }
  if (existing)
    return db.update({
      collection: 'provider-connections',
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
  return db.create({
    collection: 'provider-connections',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

// ---- Statements (CE-03) ----

/**
 * Native rows: gross from payment intents (paid/refunded/disputed all
 * mean money was captured), refunds only from executed refund
 * records, disputes only from open/under-review/lost dispute records
 * — one source per figure, so nothing is counted twice. Provider
 * fees are not recorded on intents in this system, so fee stays null
 * (unknown) and the statement says so instead of inventing a net.
 */
export async function nativeMoneyRows(db: any, siteId: string): Promise<NativeMoneyRow[]> {
  const [intents, refunds, disputes] = await Promise.all([
    findAll(db, 'payment-intents', siteId),
    findAll(db, 'commerce-refunds', siteId),
    findAll(db, 'commerce-disputes', siteId),
  ])
  const rows: NativeMoneyRow[] = []
  for (const intent of intents) {
    const base: NativeMoneyRow = {
      currency: String(intent.currency ?? 'USD').toUpperCase(),
      capturedMinor: null,
      refundMinor: null,
      disputeMinor: null,
      feeMinor: null,
      state: 'pending',
    }
    if (['paid', 'refunded', 'disputed'].includes(intent.state))
      rows.push({ ...base, capturedMinor: String(intent.amountMinor), state: 'collected' })
    else if (['failed', 'cancelled', 'expired', 'exception'].includes(intent.state))
      rows.push({ ...base, state: 'failed' })
    else rows.push(base)
  }
  for (const refund of refunds)
    if (refund.state === 'succeeded')
      rows.push({
        currency: String(refund.currency ?? 'USD').toUpperCase(),
        capturedMinor: null,
        refundMinor: String(refund.amountMinor),
        disputeMinor: null,
        feeMinor: null,
        state: 'collected',
      })
  for (const dispute of disputes)
    if (['open', 'under-review', 'lost'].includes(dispute.state))
      rows.push({
        currency: String(dispute.currency ?? 'USD').toUpperCase(),
        capturedMinor: null,
        refundMinor: null,
        disputeMinor: String(dispute.amountMinor),
        feeMinor: null,
        state: 'collected',
      })
  return rows
}

export async function affiliateLiabilityRows(db: any, siteId: string) {
  const pool = db.db?.pool ?? db.pool
  if (!pool) return []
  const result = await pool.query(
    `SELECT id, program_id, program_version, referrer_member_id, order_id, order_number,
            payment_intent_id, currency, amount_minor, type, status, mature_at, created_at,
            settled_at, reversed_at, reversal_reason, fraud_flag, settlement_batch_id,
            explanation, compensates_ledger_id
       FROM commission_ledgers WHERE site_id = $1`,
    [siteId],
  )
  const ledgers: CommissionLedger[] = result.rows.map((row: any) => ({
    id: String(row.id),
    siteId,
    programId: String(row.program_id),
    programVersion: Number(row.program_version),
    referrerMemberId: String(row.referrer_member_id),
    orderId: String(row.order_id),
    orderNumber: String(row.order_number),
    paymentIntentId: row.payment_intent_id ? String(row.payment_intent_id) : undefined,
    currency: String(row.currency),
    amountMinor: String(row.amount_minor),
    type: row.type,
    status: row.status,
    matureAt: new Date(row.mature_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : undefined,
    reversedAt: row.reversed_at ? new Date(row.reversed_at).toISOString() : undefined,
    reversalReason: row.reversal_reason ?? undefined,
    fraudFlag: row.fraud_flag ?? undefined,
    settlementBatchId: row.settlement_batch_id ? String(row.settlement_batch_id) : undefined,
    explanation: String(row.explanation ?? ''),
    compensatesLedgerId: row.compensates_ledger_id ? String(row.compensates_ledger_id) : undefined,
  }))
  return summarizeCommissionLiabilities(ledgers, siteId).map((summary) => ({
    currency: summary.currency,
    pendingAmountMinor: summary.pendingAmountMinor,
    eligibleAmountMinor: summary.eligibleAmountMinor,
    onHoldAmountMinor: summary.onHoldAmountMinor,
    settledAmountMinor: summary.settledAmountMinor,
    reversedAmountMinor: summary.reversedAmountMinor,
  }))
}

export async function externalMoneyRows(db: any, siteId: string): Promise<ExternalMoneyRow[]> {
  const docs = await findAll(db, 'external-revenue-evidence', siteId)
  return docs.map((doc) => ({
    providerId: String(doc.providerId),
    currency: String(doc.currency).toUpperCase(),
    status: String(doc.status),
    commissionMinor: doc.commissionMinor ?? null,
    netMinor: doc.netMinor ?? null,
    isEstimated: Boolean(doc.isEstimated),
  }))
}

export async function statementForSite(db: any, siteId: string): Promise<Statement> {
  const [native, affiliate, external] = await Promise.all([
    nativeMoneyRows(db, siteId),
    affiliateLiabilityRows(db, siteId),
    externalMoneyRows(db, siteId),
  ])
  return computeStatement({ native, affiliate, external })
}

// ---- External evidence import commit (CE-04) ----

/**
 * Transactional ingestion of preview-accepted rows. Re-checks
 * existence inside the call so a double-submit or a retry after a
 * partial failure inserts nothing twice; the unique index on
 * (site, provider, event) is the final guard.
 */
export async function commitEvidenceImport(
  db: any,
  siteId: string,
  input: {
    providerId: string
    accountRef?: string | null
    sourceType: 'api' | 'csv' | 'manual'
    mappingVersion: string
    rows: readonly {
      providerEventId: string
      originalStatus: string | null
      status: string
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
    }[]
  },
): Promise<{ inserted: number; skippedDuplicates: number }> {
  const existing = await findAll(db, 'external-revenue-evidence', siteId)
  const seen = new Set(
    existing
      .filter((row) => row.providerId === input.providerId)
      .map((row) => String(row.providerEventId)),
  )
  let inserted = 0
  let skippedDuplicates = 0
  const now = new Date().toISOString()
  for (const row of input.rows) {
    if (seen.has(row.providerEventId)) {
      skippedDuplicates += 1
      continue
    }
    await db.create({
      collection: 'external-revenue-evidence',
      data: {
        site: siteId,
        providerId: input.providerId,
        accountRef: input.accountRef ?? null,
        programRef: row.programRef,
        providerEventId: row.providerEventId,
        sourceHash: row.sourceHash,
        sourceType: input.sourceType,
        status: row.status,
        originalStatus: row.originalStatus,
        currency: row.currency,
        grossMinor: row.grossMinor,
        commissionMinor: row.commissionMinor,
        feesMinor: row.feesMinor,
        netMinor: row.netMinor,
        isEstimated: row.isEstimated,
        payoutRef: row.payoutRef,
        mappingVersion: input.mappingVersion,
        sourceTimestamp: row.sourceTimestamp,
        importedAt: now,
        lastConfirmedAt: now,
      },
      depth: 0,
      overrideAccess: true,
    })
    seen.add(row.providerEventId)
    inserted += 1
  }
  return { inserted, skippedDuplicates }
}
