import {
  ConversionGoals,
  ExperimentAnalyses,
  ExperimentAssignments,
  ExperimentDecisions,
  ExperimentEvents,
  ExperimentVariants,
  Experiments,
  ExperienceRules,
  ExperienceVariants,
  TrafficAllocations,
} from '../../collections/Experiences'
import type { DomainDefinition } from '../core/payload-domains'

export const experiencesDomain: DomainDefinition = {
  id: 'experiences',
  collections: [
    ExperienceRules,
    ExperienceVariants,
    Experiments,
    ExperimentVariants,
    TrafficAllocations,
    ExperimentAssignments,
    ConversionGoals,
    ExperimentEvents,
    ExperimentAnalyses,
    ExperimentDecisions,
  ],
}
