'use client'

import { type FC, useState } from 'react'
import Link from 'next/link'
import { FulfillmentPlanningPanel } from './FulfillmentPlanningPanel'
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

export const FulfillmentCommandCenter: FC<FulfillmentCommandCenterProps> = ({
  initialJobs = [],
  initialProviders = [],
  initialManualPackages = [],
  initialTab = 'jobs',
  initialProviderFilter,
}) => {
  const [jobs, setJobs] = useState<PODJob[]>(initialJobs)
  const [manualPackages, setManualPackages] =
    useState<ManualFulfillmentPackage[]>(initialManualPackages)
  const [providers, setProviders] = useState<PublicPodConnectionProjection[]>(initialProviders)
  const [activeTab, setActiveTab] = useState<'jobs' | 'manual' | 'providers' | 'mappings'>(
    initialTab,
  )
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [repairReasons, setRepairReasons] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<string | null>(null)
  const [carrierInputs, setCarrierInputs] = useState<
    Record<string, { carrier: string; trackingNumber: string }>
  >({})

  const filteredJobs = initialProviderFilter
    ? jobs.filter((job) => job.providerKey === initialProviderFilter)
    : jobs

  const executeAction = async (payload: Record<string, unknown>, label: string) => {
    setLoadingAction(label)
    setFeedback(null)
    try {
      const res = await fetch('/api/admin/fulfillment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.job)
        setJobs((prev) =>
          prev.map((job) => (job.id === data.job.id ? { ...job, ...data.job } : job)),
        )
      if (data.connection)
        setProviders((prev) =>
          prev.map((conn) =>
            conn.id === data.connection.id ? { ...conn, ...data.connection } : conn,
          ),
        )
      if (!res.ok || data.success === false) {
        setFeedback(`Error: ${data.error ?? 'Action failed'}`)
        return
      }

      setFeedback(`Success: ${label} completed.`)
      // Refresh local state based on returned entities
      if (data.package) {
        setManualPackages((prev) =>
          prev.map((pkg) => (pkg.id === data.package.id ? { ...pkg, ...data.package } : pkg)),
        )
      }
      if (data.job) {
        setJobs((prev) =>
          prev.map((job) => (job.id === data.job.id ? { ...job, ...data.job } : job)),
        )
      }
      if (data.connection) {
        setProviders((prev) =>
          prev.map((conn) =>
            conn.id === data.connection.id ? { ...conn, ...data.connection } : conn,
          ),
        )
      }
      if (data.manualHandoff) {
        setManualPackages((prev) => [data.manualHandoff, ...prev])
      }
    } catch (err: unknown) {
      setFeedback(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <main className="gutter--left gutter--right">
      <h1>POD &amp; Fulfillment</h1>
      <FulfillmentPlanningPanel />
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <p style={{ margin: 0 }}>Saved fulfillment state. Operator mutations execute through verified worker paths.</p>
        {siteId && (
          <button
            type="button"
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
            disabled={loadingAction !== null}
            onClick={() =>
              executeAction(
                { action: 'reconcile-outstanding', siteId },
                'Reconcile outstanding fulfillment orders',
              )
            }
          >
            Reconcile Outstanding Orders
          </button>
        )}
      </div>

      {feedback && (
        <aside
          role="status"
          style={{
            padding: '0.75rem',
            margin: '1rem 0',
            backgroundColor: feedback.startsWith('Error') ? '#fee2e2' : '#dcfce7',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
          }}
        >
          {feedback}
        </aside>
      )}

      <nav style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('jobs')}
          style={{ fontWeight: activeTab === 'jobs' ? 'bold' : 'normal', marginRight: '1rem' }}
        >
          Jobs ({jobs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          style={{ fontWeight: activeTab === 'manual' ? 'bold' : 'normal', marginRight: '1rem' }}
        >
          Manual queue ({manualPackages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('providers')}
          style={{ fontWeight: activeTab === 'providers' ? 'bold' : 'normal', marginRight: '1rem' }}
        >
          Providers ({providers.length})
        </button>
      </nav>

      {providers
        .filter(
          (provider) =>
            provider.lastHealthStatus === 'unavailable' || provider.lastHealthStatus === 'degraded',
        )
        .map((provider) => (
          <aside key={provider.id}>
            <h2>Provider Health Alert</h2>
            <p>
              {provider.label}: {provider.lastHealthStatus}
            </p>
            <Link href={`/admin/fulfillment?provider=${encodeURIComponent(provider.providerKey)}`}>
              Drilldown to Affected Jobs
            </Link>
          </aside>
        ))}

      {initialProviderFilter && <p>Filtered by provider: {initialProviderFilter}</p>}

      {activeTab === 'providers' && (
        <section>
          {providers.length === 0 && <p>No providers configured.</p>}
          {providers.map((provider) => (
            <div
              key={provider.id}
              style={{
                border: '1px solid #ccc',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px',
              }}
            >
              <h2>{provider.label}</h2>
              <p>
                {provider.providerKey}: {provider.status}. Last observed health:{' '}
                {provider.lastHealthStatus ?? 'unknown'}.
              </p>
              {!provider.capabilities.supportsAutomaticReprint && (
                <p>
                  Unsupported — Requires manual operator review (Not simulated or silently claimed)
                </p>
              )}
              {!provider.capabilities.supportsPoBoxDelivery && (
                <p>Unsupported — Strict address guard blocks PO boxes</p>
              )}
              <button
                type="button"
                disabled={loadingAction !== null}
                onClick={() =>
                  executeAction(
                    { action: 'check-provider-health', connectionId: provider.id },
                    `Check health for ${provider.label}`,
                  )
                }
              >
                Check Provider Health
              </button>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'manual' && (
        <section>
          {manualPackages.length === 0 && <p>No packages in manual fulfillment queue.</p>}
          {manualPackages.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid #cbd5e1',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px',
              }}
            >
              <h2>Package {item.id}</h2>
              <p>
                Status: <strong>{item.status}</strong> | Source: {item.source}
              </p>
              <p style={{ fontStyle: 'italic', color: '#64748b' }}>{item.disclaimer}</p>
              <p>
                Recipient: {(item.permissionedAddressManifest as any)?.name ?? 'Customer'} -{' '}
                {(item.permissionedAddressManifest as any)?.address1 ?? ''},{' '}
                {(item.permissionedAddressManifest as any)?.city ?? ''}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                {item.status === 'pending_acknowledgement' && (
                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() =>
                      executeAction(
                        { action: 'acknowledge-manual', packageId: item.id },
                        `Acknowledge ${item.id}`,
                      )
                    }
                  >
                    Acknowledge Package
                  </button>
                )}

                {item.status === 'acknowledged' && (
                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() =>
                      executeAction(
                        { action: 'start-production-manual', packageId: item.id },
                        `Start production on ${item.id}`,
                      )
                    }
                  >
                    Start Production
                  </button>
                )}

                {(item.status === 'acknowledged' || item.status === 'in_production') && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Carrier (e.g. USPS)"
                      value={carrierInputs[item.id]?.carrier ?? 'USPS'}
                      onChange={(e) =>
                        setCarrierInputs((prev) => ({
                          ...prev,
                          [item.id]: {
                            carrier: e.target.value,
                            trackingNumber: prev[item.id]?.trackingNumber ?? '',
                          },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Tracking #"
                      value={carrierInputs[item.id]?.trackingNumber ?? ''}
                      onChange={(e) =>
                        setCarrierInputs((prev) => ({
                          ...prev,
                          [item.id]: {
                            carrier: prev[item.id]?.carrier ?? 'USPS',
                            trackingNumber: e.target.value,
                          },
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={loadingAction !== null || !carrierInputs[item.id]?.trackingNumber}
                      onClick={() =>
                        executeAction(
                          {
                            action: 'ship-manual',
                            packageId: item.id,
                            carrier: carrierInputs[item.id]?.carrier ?? 'USPS',
                            trackingNumber: carrierInputs[item.id]?.trackingNumber ?? '',
                          },
                          `Ship package ${item.id}`,
                        )
                      }
                    >
                      Mark Shipped
                    </button>
                  </div>
                )}

                {item.status !== 'shipped' && item.status !== 'cancelled' && (
                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() =>
                      executeAction(
                        {
                          action: 'cancel-manual',
                          packageId: item.id,
                          reason: 'Operator cancelled',
                        },
                        `Cancel package ${item.id}`,
                      )
                    }
                  >
                    Cancel Package
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'jobs' && (
        <section>
          {filteredJobs.length === 0 && <p>No POD jobs found.</p>}
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              style={{
                border: '1px solid #cbd5e1',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px',
              }}
            >
              <h2>Job {job.id}</h2>
              <p>
                Provider: <strong>{job.providerKey}</strong> | State: <strong>{job.state}</strong>
              </p>
              {job.state === 'failed' && (
                <>
                  <p style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                    Provider rejected the request. Repair and retry, or review manual fulfillment.
                  </p>
                  <Link href="/admin/collections/manual-fulfillment-packages">
                    View in Manual Queue
                  </Link>
                  {!job.externalOrderId && (
                    <div>
                      <label>
                        Repair reason
                        <input
                          aria-label={`Repair reason ${job.id}`}
                          value={repairReasons[job.id] ?? ''}
                          onChange={(e) =>
                            setRepairReasons((prev) => ({ ...prev, [job.id]: e.target.value }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={loadingAction !== null || !repairReasons[job.id]?.trim()}
                        onClick={() =>
                          executeAction(
                            {
                              action: 'retry-pod-job',
                              jobId: job.id,
                              reason: repairReasons[job.id],
                            },
                            `Retry repaired ${job.id}`,
                          )
                        }
                      >
                        Retry known rejected request
                      </button>
                    </div>
                  )}
                </>
              )}
              {job.holdExpiresAt && <p>Hold expires at: {job.holdExpiresAt}</p>}
              <p>
                Attempts: {job.attemptCount} | Provider order:{' '}
                {job.externalOrderId ?? 'not confirmed'}
              </p>
              {job.auditTrail
                .filter((a) =>
                  [
                    'provider_poll_observed',
                    'job_submitted_success',
                    'provider_state_unresolved',
                  ].includes(a.action),
                )
                .slice(-1)
                .map((a) => (
                  <p key={a.timestamp}>
                    Provider status: {String(a.details?.providerStatus ?? 'unknown')} | Request:{' '}
                    {String(a.details?.requestId ?? 'not returned')} | Evidence:{' '}
                    {job.auditTrail.some(
                      (entry) => entry.details?.evidenceClass === 'deterministic-emulator',
                    )
                      ? 'Local simulator'
                      : 'Provider response'}
                  </p>
                ))}
              {(job as any).fulfillments && (job as any).fulfillments.length > 0 && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 0.25rem 0', fontWeight: 'bold' }}>Tracking &amp; Shipments:</p>
                  {((job as any).fulfillments as any[]).map((f: any, idx: number) => (
                    <p key={f.fulfillmentId ?? idx} style={{ margin: '0.25rem 0' }}>
                      Shipment: <strong>{f.status}</strong> | Carrier: <strong>{f.carrier ?? 'USPS'}</strong> | #{' '}
                      <strong>{f.trackingNumber ?? 'None'}</strong>
                      {f.trackingUrl && (
                        <a
                          href={f.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ marginLeft: '0.5rem', textDecoration: 'underline' }}
                        >
                          Track package
                        </a>
                      )}
                    </p>
                  ))}
                </div>
              )}
              {job.state === 'exception' && (
                <p>Outcome unknown. Reconcile before retrying or arranging manual fulfillment.</p>
              )}
              {job.lastError && <p style={{ color: '#b91c1c' }}>Error: {job.lastError}</p>}
              <p>
                Reconciliation Age:{' '}
                {job.lastReconciledAt
                  ? `Reconciled with provider at ${job.lastReconciledAt}`
                  : 'No provider reconciliation recorded.'}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {(job.externalOrderId || job.state === 'exception') && (
                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() =>
                      executeAction(
                        { action: 'reconcile-pod-job', jobId: job.id },
                        `Reconcile ${job.id}`,
                      )
                    }
                  >
                    Reconcile provider
                  </button>
                )}
                {job.state === 'on_hold' && (
                  <button
                    type="button"
                    disabled={loadingAction !== null}
                    onClick={() =>
                      executeAction(
                        { action: 'release-pod-hold', jobId: job.id },
                        `Release hold on ${job.id}`,
                      )
                    }
                  >
                    Release Hold
                  </button>
                )}

                {!job.externalOrderId &&
                  (job.state === 'created' || job.state === 'submitting') && (
                    <button
                      type="button"
                      disabled={loadingAction !== null}
                      onClick={() =>
                        executeAction(
                          { action: 'submit-pod-job', jobId: job.id },
                          `Submit job ${job.id} to provider`,
                        )
                      }
                    >
                      Submit to Provider
                    </button>
                  )}

                {job.state !== 'shipped' &&
                  job.state !== 'cancelled' &&
                  job.state !== 'delivered' && (
                    <button
                      type="button"
                      disabled={loadingAction !== null}
                      onClick={() =>
                        executeAction(
                          {
                            action: 'cancel-pod-job',
                            jobId: job.id,
                            reason: 'Operator cancellation',
                          },
                          `Cancel job ${job.id}`,
                        )
                      }
                    >
                      Cancel Job
                    </button>
                  )}
              </div>
            </div>
          ))}
        </section>
      )}
      {((activeTab === 'providers' && !providers.length) ||
        (activeTab === 'manual' && !manualPackages.length) ||
        (activeTab === 'jobs' && !jobs.length)) && <p>No saved records in this view.</p>}
    </main>
  )
}
