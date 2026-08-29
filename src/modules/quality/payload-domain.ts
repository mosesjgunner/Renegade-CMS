import {
  QualityExceptions,
  QualityIssues,
  QualityPolicies,
  QualityReports,
  QualityRules,
  QualityScans,
  QualityWaivers,
} from '../../collections/Quality'
import type { DomainDefinition } from '../core/payload-domains'
import { qualityTasks } from './tasks'

export const qualityDomain: DomainDefinition = {
  id: 'quality',
  collections: [
    QualityPolicies,
    QualityRules,
    QualityScans,
    QualityIssues,
    QualityExceptions,
    QualityWaivers,
    QualityReports,
  ],
  tasks: qualityTasks,
}
