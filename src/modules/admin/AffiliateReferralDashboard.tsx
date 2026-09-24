import React, { useState } from 'react'
import type {
  AffiliateOffer,
  ConversionEvidence,
  ReferralAttributionSnapshot,
  CommissionLedger,
  SettlementBatch,
} from '../commerce/affiliate-referral-contracts'
import {
  summarizeCommissionLiabilities,
  type SettlementLiabilitySummary,
} from '../commerce/settlement-service'

export interface AffiliateReferralDashboardProps {
  siteId: string
  offers: readonly AffiliateOffer[]
  conversions: readonly ConversionEvidence[]
  attributions: readonly ReferralAttributionSnapshot[]
  ledgers: readonly CommissionLedger[]
  batches: readonly SettlementBatch[]
  onApproveBatch?: (batchId: string) => void
  onExportBatch?: (batchId: string) => void
}

export function AffiliateReferralDashboard({
  siteId,
  offers,
  conversions,
  attributions,
  ledgers,
  batches,
  onApproveBatch,
  onExportBatch,
}: AffiliateReferralDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    'disclosures' | 'freshness' | 'conversions' | 'attributions' | 'commissions'
  >('commissions')

  const liabilitySummaries: readonly SettlementLiabilitySummary[] = summarizeCommissionLiabilities(
    ledgers,
    siteId,
  )

  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    liabilitySummaries[0]?.currency ?? 'USD',
  )

  const activeSummary =
    liabilitySummaries.find((s) => s.currency === selectedCurrency) ?? liabilitySummaries[0]

  const formatMinor = (minor: string, curr: string) => {
    try {
      const val = Number(minor) / 100
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(val)
    } catch {
      return `${minor} ${curr}`
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            Affiliate & Referral Operations Command
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Disclosures, link health, external conversion reconciliation, and currency-separated
            settlement.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {(
            [
              ['commissions', 'Commission Liability'],
              ['disclosures', 'Disclosures'],
              ['freshness', 'Link Health & Freshness'],
              ['conversions', 'Conversions'],
              ['attributions', 'Attributions'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === key
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Commissions & Settlement Tab (Strictly Currency-Separated) */}
      {activeTab === 'commissions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Currency-Separated Liabilities
            </h2>
            {liabilitySummaries.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-500">Currency:</span>
                <div className="flex gap-1 rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
                  {liabilitySummaries.map((s) => (
                    <button
                      key={s.currency}
                      type="button"
                      onClick={() => setSelectedCurrency(s.currency)}
                      className={`rounded px-2.5 py-1 text-xs font-semibold ${
                        selectedCurrency === s.currency
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {s.currency}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activeSummary ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <div className="text-xs font-medium text-neutral-500">Pending (Hold Period)</div>
                <div className="mt-1 text-lg font-bold text-neutral-800 dark:text-neutral-200">
                  {formatMinor(activeSummary.pendingAmountMinor, activeSummary.currency)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Eligible for Settlement
                </div>
                <div className="mt-1 text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  {formatMinor(activeSummary.eligibleAmountMinor, activeSummary.currency)}
                </div>
                <div className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">
                  {activeSummary.eligibleCount} entries
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  On Hold / Fraud Review
                </div>
                <div className="mt-1 text-lg font-bold text-amber-900 dark:text-amber-200">
                  {formatMinor(activeSummary.onHoldAmountMinor, activeSummary.currency)}
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="text-xs font-medium text-blue-700 dark:text-blue-400">
                  Settled (Paid Out)
                </div>
                <div className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-200">
                  {formatMinor(activeSummary.settledAmountMinor, activeSummary.currency)}
                </div>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
                <div className="text-xs font-medium text-rose-700 dark:text-rose-400">
                  Reversals & Refunds
                </div>
                <div className="mt-1 text-lg font-bold text-rose-900 dark:text-rose-200">
                  {formatMinor(activeSummary.reversedAmountMinor, activeSummary.currency)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
              No commission liabilities recorded yet.
            </div>
          )}

          {/* Settlement Batches */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Settlement Batches ({selectedCurrency})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="min-w-full divide-y divide-neutral-200 text-left text-xs dark:divide-neutral-800">
                <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5">Batch Number</th>
                    <th className="px-4 py-2.5">Entries</th>
                    <th className="px-4 py-2.5">Total Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Created At</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                  {batches
                    .filter((b) => b.currency === selectedCurrency)
                    .map((batch) => (
                      <tr key={batch.id}>
                        <td className="px-4 py-2.5 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                          {batch.batchNumber}
                        </td>
                        <td className="px-4 py-2.5">{batch.entriesCount}</td>
                        <td className="px-4 py-2.5 font-semibold">
                          {formatMinor(batch.totalAmountMinor, batch.currency)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              batch.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : batch.status === 'approved'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : batch.status === 'pending_approval'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            {batch.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-500">
                          {new Date(batch.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-2">
                          {batch.status === 'pending_approval' && onApproveBatch && (
                            <button
                              type="button"
                              onClick={() => onApproveBatch(batch.id)}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          )}
                          {batch.status === 'approved' && onExportBatch && (
                            <button
                              type="button"
                              onClick={() => onExportBatch(batch.id)}
                              className="rounded bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                            >
                              Export CSV
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {batches.filter((b) => b.currency === selectedCurrency).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-neutral-500">
                        No batches for {selectedCurrency}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Disclosures Tab */}
      {activeTab === 'disclosures' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Affiliate Disclosures & Compliance
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs dark:divide-neutral-800">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Offer</th>
                  <th className="px-4 py-2.5">Network</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Disclosure Status</th>
                  <th className="px-4 py-2.5">Disclosure Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                {offers.map((offer) => (
                  <tr key={offer.id}>
                    <td className="px-4 py-2.5 font-medium">{offer.name}</td>
                    <td className="px-4 py-2.5">{offer.networkReference.network}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {offer.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {offer.disclosure?.text ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                          ✓ Compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                          ✗ Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 max-w-xs truncate">
                      {offer.disclosure?.text ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Link Health & Freshness Tab */}
      {activeTab === 'freshness' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Link Health & Pricing Freshness
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs dark:divide-neutral-800">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Offer</th>
                  <th className="px-4 py-2.5">Destination</th>
                  <th className="px-4 py-2.5">Health</th>
                  <th className="px-4 py-2.5">HTTP Status</th>
                  <th className="px-4 py-2.5">Remote Price</th>
                  <th className="px-4 py-2.5">Availability</th>
                  <th className="px-4 py-2.5">Freshness Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                {offers.map((offer) => {
                  const observedAt = Date.parse(offer.pricingFreshness?.observedAt ?? '')
                  const isStale =
                    !Number.isFinite(observedAt) ||
                    Date.now() - observedAt >
                      (offer.pricingFreshness?.freshnessHours ?? 24) * 3600000

                  return (
                    <tr key={offer.id}>
                      <td className="px-4 py-2.5 font-medium">{offer.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] max-w-xs truncate">
                        {offer.destinationUrl}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            offer.linkHealth?.status === 'healthy'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : offer.linkHealth?.status === 'rate-limited'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {offer.linkHealth?.status ?? 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{offer.linkHealth?.httpStatus ?? '—'}</td>
                      <td className="px-4 py-2.5 font-semibold">
                        {isStale || !offer.pricingFreshness?.remotePrice
                          ? 'Unknown (Stale)'
                          : formatMinor(
                              offer.pricingFreshness.remotePrice.amountMinor,
                              offer.pricingFreshness.remotePrice.currency,
                            )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isStale
                          ? 'Unknown'
                          : (offer.pricingFreshness?.remoteAvailability ?? 'unknown')}
                      </td>
                      <td className="px-4 py-2.5">
                        {isStale ? (
                          <span className="text-amber-600 font-medium">Stale (Overdue)</span>
                        ) : (
                          <span className="text-emerald-600 font-medium">Fresh</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Conversions Tab */}
      {activeTab === 'conversions' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Imported Conversion Evidence
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs dark:divide-neutral-800">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Event ID</th>
                  <th className="px-4 py-2.5">Network</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Reconciliation</th>
                  <th className="px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                {conversions.map((conv) => (
                  <tr key={conv.id}>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{conv.externalEventId}</td>
                    <td className="px-4 py-2.5">{conv.network}</td>
                    <td className="px-4 py-2.5 uppercase font-semibold text-[10px] text-neutral-500">
                      {conv.source}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      {formatMinor(conv.money.amountMinor, conv.money.currency)}
                    </td>
                    <td className="px-4 py-2.5">{conv.status}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          conv.reconciliationState === 'matched'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : conv.reconciliationState === 'reversed'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                        }`}
                      >
                        {conv.reconciliationState}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 text-[11px]">
                      {conv.reconciliationNotes ?? '—'}
                    </td>
                  </tr>
                ))}
                {conversions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-neutral-500">
                      No conversion evidence imported.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Attributions Tab */}
      {activeTab === 'attributions' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            First-Party Referral Attributions
          </h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full divide-y divide-neutral-200 text-left text-xs dark:divide-neutral-800">
              <thead className="bg-neutral-50 text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5">Referral Code</th>
                  <th className="px-4 py-2.5">Referrer</th>
                  <th className="px-4 py-2.5">Order Amount</th>
                  <th className="px-4 py-2.5">Commission</th>
                  <th className="px-4 py-2.5">Model</th>
                  <th className="px-4 py-2.5">Attributed At</th>
                  <th className="px-4 py-2.5">Frozen Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-neutral-900">
                {attributions.map((attr, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-600">
                      {attr.referralCode}
                    </td>
                    <td className="px-4 py-2.5">{attr.referrerMemberId}</td>
                    <td className="px-4 py-2.5">
                      {formatMinor(attr.orderAmountMinor, attr.currency)}
                    </td>
                    <td className="px-4 py-2.5 font-bold">
                      {formatMinor(attr.calculatedCommissionMinor, attr.currency)}
                    </td>
                    <td className="px-4 py-2.5">{attr.model}</td>
                    <td className="px-4 py-2.5 text-neutral-500">
                      {new Date(attr.attributedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-neutral-500 max-w-sm truncate">
                      {attr.explanation}
                    </td>
                  </tr>
                ))}
                {attributions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-neutral-500">
                      No referral attributions recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
