'use client'

import React, { useState } from 'react'
import { PodMappingCenter } from './PodMappingCenter'
import { MANUAL_FULFILLMENT_DISCLAIMER } from '../commerce/manual-fulfillment'
import type { PODJob } from '../commerce/fulfillment-plan'
import type { ManualFulfillmentPackage } from '../commerce/manual-fulfillment'
import type { PublicPodConnectionProjection } from '../commerce/pod-connection'

export interface FulfillmentCommandCenterProps {
  initialJobs?: PODJob[]
  initialProviders?: PublicPodConnectionProjection[]
  initialManualPackages?: ManualFulfillmentPackage[]
  initialTab?: 'jobs' | 'manual' | 'providers' | 'mappings'
  initialProviderFilter?: string | null
}

export const FulfillmentCommandCenter: React.FC<FulfillmentCommandCenterProps> =
  function FulfillmentCommandCenter(props = {}) {
    const [activeTab, setActiveTab] = useState<'jobs' | 'manual' | 'providers' | 'mappings'>(
      props.initialTab ?? 'jobs',
    )
    const [selectedProviderFilter, setSelectedProviderFilter] = useState<string | null>(
      props.initialProviderFilter ?? null,
    )

    // Sample seed state for interactive administration
    const [jobs, setJobs] = useState<PODJob[]>(
      props.initialJobs ?? [
        {
          id: 'pod_job_sample_101',
          orderId: 'order_ord-9921',
          siteId: 'site-default',
          connectionId: 'conn-emu-1',
          providerKey: 'pod-emulator',
          packageIndex: 0,
          idempotencyKey: 'pod_job:site-default:order_ord-9921:0:hash123',
          payloadHash: 'hash1234567890abcdef',
          state: 'on_hold',
          addressPolicy: 'domestic',
          recipientSnapshot: {
            name: 'Jane Doe',
            address1: '123 Market St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
          itemsSnapshot: [
            {
              lineId: 'line-1',
              productId: 'prod-tee',
              variantSku: 'SHIRT-M-BLK',
              title: 'Renegade Heavyweight Cotton Tee - M / Black',
              quantity: 2,
              unitPriceMinor: '2800',
              lineAmountMinor: '5600',
              kind: 'pod',
            },
          ],
          costSnapshot: {
            estimatedCostMinor: '2950',
            currency: 'USD',
          },
          attemptCount: 0,
          holdExpiresAt: new Date(Date.now() + 3600000).toISOString(),
          auditTrail: [
            {
              timestamp: new Date().toISOString(),
              action: 'job_created',
              actor: 'commerce_paid_listener',
              newState: 'on_hold',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    )

    const [manualPackages, setManualPackages] = useState<ManualFulfillmentPackage[]>(
      props.initialManualPackages ?? [
        {
          id: 'man_pkg_sample_201',
          orderId: 'order_ord-9922',
          siteId: 'site-default',
          packageIndex: 1,
          source: 'pod-submission-exhausted',
          status: 'pending_acknowledgement',
          approvedLines: [
            {
              lineId: 'line-manual-1',
              productId: 'prod-hoodie',
              variantSku: 'HOOD-L-BLK',
              title: 'Renegade Classic Pullover Hoodie - L / Black',
              quantity: 1,
              artworkSpecs: [
                {
                  area: 'front',
                  artworkId: 'art-hoodie-front',
                  artworkHash: 'b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8',
                  placement: { topMm: 60, leftMm: 50, widthMm: 300, heightMm: 350 },
                  downloadUrl: '/api/commerce/pod/assets/art-hoodie-front?sig=token',
                },
              ],
            },
          ],
          permissionedAddressManifest: {
            name: 'Alex Rivera',
            address1: '456 Union Square',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94108',
            country: 'US',
          },
          instructions:
            'Provider submission exhausted; please embroider and dispatch manually from SF workshop.',
          disclaimer: MANUAL_FULFILLMENT_DISCLAIMER,
          auditTrail: [
            {
              timestamp: new Date().toISOString(),
              action: 'package_created',
              actor: 'pod_worker',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    )

    const [providers] = useState<PublicPodConnectionProjection[]>(
      props.initialProviders ?? [
        {
          id: 'conn-emu-1',
          siteId: 'site-default',
          providerKey: 'pod-emulator',
          label: 'Local POD Emulator',
          redactedApiKey: 'emu_***test',
          hasWebhookSecret: true,
          status: 'active',
          capabilities: {
            supportedPrintAreas: ['front', 'back', 'sleeve_left', 'sleeve_right', 'all_over'],
            supportsCancellation: true,
            supportsPartialShipments: true,
            supportsLivePreflight: true,
            supportsLiveCostEstimation: true,
            supportsAutomaticReprint: true,
            supportsReturnRouting: true,
            supportsPoBoxDelivery: false,
          },
          lastHealthCheckedAt: new Date().toISOString(),
          lastHealthStatus: 'healthy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'conn-pf-1',
          siteId: 'site-default',
          providerKey: 'printful',
          label: 'Printful Production API',
          remoteStoreId: 'store_98765',
          remoteStoreName: 'Renegade Store',
          redactedApiKey: 'pf_t***9812',
          hasWebhookSecret: true,
          status: 'active',
          capabilities: {
            supportedPrintAreas: ['front', 'back', 'sleeve_left', 'sleeve_right'],
            supportsCancellation: true,
            supportsPartialShipments: true,
            supportsLivePreflight: true,
            supportsLiveCostEstimation: true,
            supportsAutomaticReprint: false,
            supportsReturnRouting: true,
            supportsPoBoxDelivery: false,
          },
          lastHealthCheckedAt: new Date().toISOString(),
          lastHealthStatus: 'healthy',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    )

    const [carrierInput, setCarrierInput] = useState('USPS')
    const [trackingInput, setTrackingInput] = useState('')

    const handleReleaseHold = (jobId: string) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                state: 'created',
                releasedAt: new Date().toISOString(),
                auditTrail: [
                  ...j.auditTrail,
                  {
                    timestamp: new Date().toISOString(),
                    action: 'hold_released',
                    actor: 'admin_ui',
                    previousState: j.state,
                    newState: 'created',
                  },
                ],
              }
            : j,
        ),
      )
    }

    const handleAcknowledgeManual = (pkgId: string) => {
      setManualPackages((prev) =>
        prev.map((p) =>
          p.id === pkgId
            ? {
                ...p,
                status: 'acknowledged',
                acknowledgement: {
                  acknowledgedBy: 'admin_operator',
                  acknowledgedAt: new Date().toISOString(),
                },
              }
            : p,
        ),
      )
    }

    const handleShipManual = (pkgId: string) => {
      if (!trackingInput.trim()) return
      setManualPackages((prev) =>
        prev.map((p) =>
          p.id === pkgId
            ? {
                ...p,
                status: 'shipped',
                externalFulfillment: {
                  carrier: carrierInput,
                  trackingNumber: trackingInput,
                  trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingInput)}`,
                  shippedAt: new Date().toISOString(),
                },
              }
            : p,
        ),
      )
      setTrackingInput('')
    }

    const displayedJobs = selectedProviderFilter
      ? jobs.filter((j) => j.providerKey === selectedProviderFilter)
      : jobs

    const degradedProviders = providers.filter((p) => p.lastHealthStatus !== 'healthy')

    return (
      <div
        style={{
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <header style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
            POD & Fulfillment Command Center
          </h1>
          <p style={{ color: '#666', margin: '0 0 16px 0' }}>
            Monitor print-on-demand pipelines, manage holds and releases, track partial shipments,
            and dispatch manual packages.
          </p>

          {/* Operational Health Alert Banner */}
          {degradedProviders.length > 0 && (
            <div
              data-testid="provider-health-alert-banner"
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #f87171',
                borderRadius: '6px',
                padding: '12px 16px',
                color: '#991b1b',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <strong>⚠️ Provider Health Alert:</strong>{' '}
                {degradedProviders
                  .map(
                    (p) =>
                      `${p.label} (${p.providerKey}): ${(p.lastHealthStatus ?? 'degraded').toUpperCase()}`,
                  )
                  .join(', ')}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (degradedProviders[0]) {
                    setSelectedProviderFilter(degradedProviders[0].providerKey)
                    setActiveTab('jobs')
                  }
                }}
                data-testid="drilldown-banner-btn"
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                Drilldown to Affected Jobs →
              </button>
            </div>
          )}

          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '8px',
            }}
          >
            {(['jobs', 'manual', 'providers', 'mappings'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === tab ? '#2563eb' : '#f3f4f6',
                  color: activeTab === tab ? '#ffffff' : '#374151',
                  fontWeight: activeTab === tab ? '600' : 'normal',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'jobs'
                  ? `POD Jobs (${displayedJobs.length}${selectedProviderFilter ? ` / ${jobs.length}` : ''})`
                  : tab === 'manual'
                    ? `Manual Queue (${manualPackages.filter((p) => p.status !== 'shipped').length})`
                    : tab === 'providers'
                      ? 'Providers & Connections'
                      : 'Catalog Mappings'}
              </button>
            ))}
          </div>
        </header>

        {/* TAB 1: POD Jobs */}
        {activeTab === 'jobs' && (
          <section>
            {selectedProviderFilter && (
              <div
                data-testid="provider-filter-indicator"
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: '#1e40af',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  Filtered by provider: <strong>{selectedProviderFilter}</strong> (
                  {displayedJobs.length} of {jobs.length} jobs)
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedProviderFilter(null)}
                  data-testid="clear-provider-filter-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1d4ed8',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                  }}
                >
                  Clear Filter
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {displayedJobs.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px dashed #d1d5db',
                    color: '#6b7280',
                  }}
                >
                  No print-on-demand fulfillment jobs found.
                </div>
              ) : (
                displayedJobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '20px',
                    background: '#ffffff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                        Job {job.id}{' '}
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>({job.orderId})</span>
                      </h3>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Provider: <strong>{job.providerKey}</strong> • Idempotency:{' '}
                        <code>
                          {job.idempotencyKey ? `${job.idempotencyKey.slice(0, 30)}...` : 'N/A'}
                        </code>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background:
                            job.state === 'on_hold'
                              ? '#fef3c7'
                              : job.state === 'shipped'
                                ? '#dcfce7'
                                : job.state === 'failed'
                                  ? '#fee2e2'
                                  : '#e0e7ff',
                          color:
                            job.state === 'on_hold'
                              ? '#92400e'
                              : job.state === 'shipped'
                                ? '#166534'
                                : job.state === 'failed'
                                  ? '#991b1b'
                                  : '#3730a3',
                        }}
                      >
                        {job.state ? job.state.toUpperCase() : 'UNKNOWN'}
                      </span>
                      {job.state === 'on_hold' && (
                        <button
                          onClick={() => handleReleaseHold(job.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#16a34a',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '500',
                          }}
                        >
                          ✓ Release Hold Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Failed worker/job indicator */}
                  {job.state === 'failed' && (
                    <div
                      data-testid={`failed-job-alert-${job.id}`}
                      style={{
                        marginBottom: '12px',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        color: '#991b1b',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>FAILED WORKER / SUBMISSION:</strong> Attempts: {job.attemptCount} •
                        Error:{' '}
                        {job.lastError ?? 'Submission exhausted or non-retryable provider failure.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('manual')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#991b1b',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '600',
                        }}
                      >
                        View in Manual Queue →
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '16px',
                      fontSize: '13px',
                      background: '#f9fafb',
                      padding: '12px',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <strong>Shipping Recipient:</strong>
                      <div>{job.recipientSnapshot?.name ?? 'N/A'}</div>
                      <div>{job.recipientSnapshot?.address1 ?? ''}</div>
                      <div>
                        {job.recipientSnapshot?.city ?? ''}, {job.recipientSnapshot?.state ?? ''}{' '}
                        {job.recipientSnapshot?.postalCode ?? ''},{' '}
                        {job.recipientSnapshot?.country ?? ''}
                      </div>
                    </div>
                    <div>
                      <strong>Items & Estimated Cost:</strong>
                      {(job.itemsSnapshot ?? []).map((item, idx) => (
                        <div key={idx}>
                          • {item.quantity}x {item.title}
                        </div>
                      ))}
                      {job.costSnapshot && (
                        <div style={{ marginTop: '4px', color: '#4b5563' }}>
                          Estimated POD Cost: $
                          {(Number(job.costSnapshot.estimatedCostMinor) / 100).toFixed(2)}{' '}
                          {job.costSnapshot.currency}
                        </div>
                      )}
                      {job.holdExpiresAt && (
                        <div style={{ color: '#b45309', marginTop: '4px' }}>
                          Hold expires: {new Date(job.holdExpiresAt).toLocaleTimeString()}
                        </div>
                      )}
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
                        <strong>Reconciliation Age:</strong>{' '}
                        {job.lastReconciledAt
                          ? `Reconciled with provider at ${new Date(job.lastReconciledAt).toISOString()}`
                          : 'Pending initial provider reconciliation'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
              )}
            </div>
          </section>
        )}

        {/* TAB 2: Manual Queue */}
        {activeTab === 'manual' && (
          <section>
            <div
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '12px 16px',
                color: '#1e40af',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              <strong>{MANUAL_FULFILLMENT_DISCLAIMER}</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {manualPackages.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px dashed #d1d5db',
                    color: '#6b7280',
                  }}
                >
                  No manual fulfillment packages pending.
                </div>
              ) : (
                manualPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '20px',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                        Package {pkg.id} ({pkg.orderId})
                      </h3>
                      <div style={{ fontSize: '12px', color: '#dc2626' }}>
                        Reason: <strong>{pkg.source}</strong>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background: pkg.status === 'shipped' ? '#dcfce7' : '#fee2e2',
                        color: pkg.status === 'shipped' ? '#166534' : '#991b1b',
                      }}
                    >
                      {pkg.status.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', marginBottom: '16px', lineHeight: '1.5' }}>
                    <div>
                      <strong>Instructions:</strong> {pkg.instructions}
                    </div>
                    <div>
                      <strong>Ship To:</strong> {pkg.permissionedAddressManifest.name},{' '}
                      {pkg.permissionedAddressManifest.address1},{' '}
                      {pkg.permissionedAddressManifest.city},{' '}
                      {pkg.permissionedAddressManifest.state}{' '}
                      {pkg.permissionedAddressManifest.postalCode}
                    </div>
                  </div>

                  {/* Items & Artwork Links */}
                  <div
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      paddingTop: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                      Approved Artwork Specifications
                    </h4>
                    {pkg.approvedLines.map((line, idx) => (
                      <div key={idx} style={{ fontSize: '13px', marginBottom: '8px' }}>
                        <div>
                          • {line.quantity}x {line.title} ({line.variantSku})
                        </div>
                        {line.artworkSpecs.map((spec, sIdx) => (
                          <div
                            key={sIdx}
                            style={{ marginLeft: '16px', fontSize: '12px', color: '#4b5563' }}
                          >
                            Print Area: {spec.area} • Bounds: {spec.placement.widthMm}x
                            {spec.placement.heightMm}mm •{' '}
                            <a
                              href={spec.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb' }}
                            >
                              📥 Download Governed High-Res Artwork
                            </a>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Operator Actions */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {pkg.status === 'pending_acknowledgement' && (
                      <button
                        onClick={() => handleAcknowledgeManual(pkg.id)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '4px',
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                        }}
                      >
                        Acknowledge Package & Claim for Shop Production
                      </button>
                    )}
                    {pkg.status === 'acknowledged' && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Carrier (e.g. USPS)"
                          value={carrierInput}
                          onChange={(e) => setCarrierInput(e.target.value)}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Tracking Number"
                          value={trackingInput}
                          onChange={(e) => setTrackingInput(e.target.value)}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '13px',
                          }}
                        />
                        <button
                          onClick={() => handleShipManual(pkg.id)}
                          disabled={!trackingInput.trim()}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            border: 'none',
                            background: trackingInput.trim() ? '#16a34a' : '#9ca3af',
                            color: '#fff',
                            cursor: trackingInput.trim() ? 'pointer' : 'not-allowed',
                            fontSize: '13px',
                          }}
                        >
                          Dispatch & Record Tracking
                        </button>
                      </div>
                    )}
                    {pkg.externalFulfillment && (
                      <div style={{ fontSize: '13px', color: '#166534' }}>
                        Shipped via {pkg.externalFulfillment.carrier} • Tracking:{' '}
                        <a
                          href={pkg.externalFulfillment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'underline' }}
                        >
                          {pkg.externalFulfillment.trackingNumber}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          </section>
        )}

        {/* TAB 3: Providers */}
        {activeTab === 'providers' && (
          <section>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '16px',
              }}
            >
              {providers.map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '20px',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                        {conn.label}
                      </h3>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Key: {conn.providerKey}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: conn.lastHealthStatus === 'healthy' ? '#dcfce7' : '#fee2e2',
                        color: conn.lastHealthStatus === 'healthy' ? '#166534' : '#991b1b',
                      }}
                    >
                      {conn.lastHealthStatus?.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' }}>
                    <div>
                      <strong>API Token:</strong> <code>{conn.redactedApiKey}</code> (Encrypted
                      AES-256-GCM)
                    </div>
                    <div>
                      <strong>Store Mapping:</strong> {conn.remoteStoreName ?? 'N/A'} (
                      {conn.remoteStoreId ?? 'N/A'})
                    </div>
                    <div>
                      <strong>Webhook Verified:</strong>{' '}
                      {conn.hasWebhookSecret ? 'HMAC-SHA256 Active' : 'No'}
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderFilter(conn.providerKey)
                        setActiveTab('jobs')
                      }}
                      data-testid={`drilldown-${conn.providerKey}`}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: '1px solid #2563eb',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                      }}
                    >
                      Drilldown to Affected Jobs (
                      {jobs.filter((j) => j.providerKey === conn.providerKey).length}) →
                    </button>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      paddingTop: '12px',
                      marginTop: '12px',
                      fontSize: '12px',
                      color: '#4b5563',
                    }}
                  >
                    <strong>Capabilities Matrix:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: '1.6' }}>
                      <li>
                        Cancellation:{' '}
                        {conn.capabilities.supportsCancellation
                          ? 'Supported (pre-production)'
                          : 'Unsupported — Operator review required (Not simulated)'}
                      </li>
                      <li>
                        Partial Shipments:{' '}
                        {conn.capabilities.supportsPartialShipments
                          ? 'Supported'
                          : 'Unsupported — Single dispatch only'}
                      </li>
                      <li>
                        Live Preflight:{' '}
                        {conn.capabilities.supportsLivePreflight
                          ? 'Supported (live provider validation)'
                          : 'Unsupported — Local preflight validation only (Not simulated)'}
                      </li>
                      <li>
                        Automatic Reprint:{' '}
                        {conn.capabilities.supportsAutomaticReprint
                          ? 'Supported'
                          : 'Unsupported — Requires manual operator review (Not simulated or silently claimed)'}
                      </li>
                      <li>
                        PO Box Delivery:{' '}
                        {conn.capabilities.supportsPoBoxDelivery
                          ? 'Supported'
                          : 'Unsupported — Strict address guard blocks PO boxes'}
                      </li>
                      <li>
                        Return Routing:{' '}
                        {conn.capabilities.supportsReturnRouting
                          ? 'Supported'
                          : 'Unsupported — Return routing not provided'}
                      </li>
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 4: Mappings */}
        {activeTab === 'mappings' && <PodMappingCenter />}
      </div>
    )
  }
