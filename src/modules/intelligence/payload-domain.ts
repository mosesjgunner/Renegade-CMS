import {
  IntelligenceAnalyses,
  IntelligenceCitations,
  IntelligenceClaims,
  IntelligenceEntities,
  IntelligenceExecutions,
  IntelligenceFindings,
  IntelligenceRecommendations,
} from '../../collections/Intelligence'
import type { DomainDefinition } from '../core/payload-domains'
import { intelligenceTasks } from './tasks'

export const intelligenceDomain: DomainDefinition = {
  id: 'intelligence',
  collections: [
    IntelligenceEntities,
    IntelligenceClaims,
    IntelligenceCitations,
    IntelligenceAnalyses,
    IntelligenceFindings,
    IntelligenceRecommendations,
    IntelligenceExecutions,
  ],
  tasks: intelligenceTasks,
}
