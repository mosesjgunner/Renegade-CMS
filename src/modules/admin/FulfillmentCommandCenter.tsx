import type { FC } from 'react'
import Link from 'next/link'
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
/** Read-only projection of supplied records; mutations use the persisted operator interfaces. */
export const FulfillmentCommandCenter: FC<FulfillmentCommandCenterProps> = ({
  initialJobs = [],
  initialProviders = [],
  initialManualPackages = [],
  initialTab = 'jobs',
  initialProviderFilter,
}) => {
  const jobs = initialProviderFilter
    ? initialJobs.filter((job) => job.providerKey === initialProviderFilter)
    : initialJobs
  return (
    <main className="gutter--left gutter--right">
      <h1>POD & Fulfillment</h1>
      <p>Saved fulfillment state. Provider acceptance requires an observed provider receipt.</p>
      <nav>
        <Link href="/admin/fulfillment?tab=jobs">Jobs</Link>
        {' | '}
        <Link href="/admin/fulfillment?tab=manual">Manual queue</Link>
        {' | '}
        <Link href="/admin/fulfillment?tab=providers">Providers</Link>
      </nav>
      {initialProviders
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
      {initialTab === 'providers'
        ? initialProviders.map((provider) => (
            <section key={provider.id}>
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
            </section>
          ))
        : initialTab === 'manual'
          ? initialManualPackages.map((item) => (
              <section key={item.id}>
                <h2>{item.id}</h2>
                <p>{item.status}</p>
                <p>{item.disclaimer}</p>
              </section>
            ))
          : jobs.map((job) => (
              <section key={job.id}>
                <h2>{job.id}</h2>
                <p>
                  {job.providerKey}: {job.state}
                </p>
                {job.state === 'failed' && <strong>FAILED WORKER / SUBMISSION</strong>}
                <p>Attempts: {job.attemptCount}</p>
                {job.lastError && <p>{job.lastError}</p>}
                <p>
                  Reconciliation Age:{' '}
                  {job.lastReconciledAt
                    ? `Reconciled with provider at ${job.lastReconciledAt}`
                    : 'No provider reconciliation recorded.'}
                </p>
                {job.state === 'failed' && (
                  <Link href="/admin/collections/manual-fulfillment-packages">
                    View in Manual Queue
                  </Link>
                )}
              </section>
            ))}
      {((initialTab === 'providers' && !initialProviders.length) ||
        (initialTab === 'manual' && !initialManualPackages.length) ||
        (initialTab === 'jobs' && !jobs.length)) && <p>No saved records in this view.</p>}
    </main>
  )
}
