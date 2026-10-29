import { FulfillmentPlanningPanel } from './FulfillmentPlanningPanel'
import type { DetailedPodMapping } from '../commerce/pod-mapping'
interface PodMappingCenterProps {
  initialMappings?: readonly DetailedPodMapping[]
  onSaveMapping?: (mapping: DetailedPodMapping) => void
}
/** Uses the canonical persisted mapping review workflow. */
export function PodMappingCenter(props: PodMappingCenterProps) {
  void props
  return <FulfillmentPlanningPanel />
}
