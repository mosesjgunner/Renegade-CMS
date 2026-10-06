import UnavailableWorkspace from './UnavailableWorkspace'
import type { DetailedPodMapping } from '../commerce/pod-mapping'
interface PodMappingCenterProps {
  initialMappings?: readonly DetailedPodMapping[]
  onSaveMapping?: (mapping: DetailedPodMapping) => void
}
/** Kept as an explicit boundary until a persisted mapping review flow is accepted. */
export function PodMappingCenter(props: PodMappingCenterProps) {
  void props
  return (
    <UnavailableWorkspace
      title="POD mappings unavailable"
      reason="Mapping review requires persisted records and provider-observed artwork and template evidence. No sample mapping is treated as approved."
    />
  )
}
