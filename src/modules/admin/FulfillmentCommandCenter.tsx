import type { FC } from 'react'
import UnavailableWorkspace from './UnavailableWorkspace'
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
/** Deferred operator surface: no demo records or client-only fulfillment transitions. */
export const FulfillmentCommandCenter: FC<FulfillmentCommandCenterProps> = () => (
  <UnavailableWorkspace
    title="POD & Fulfillment"
    reason="Persisted mapping actions, provider-observed artwork/preflight/quotes, job recovery and settlement acceptance are required before launch."
  />
)
