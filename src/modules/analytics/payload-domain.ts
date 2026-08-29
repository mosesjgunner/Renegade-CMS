import {
  AnalyticsEvents,
  AnalyticsGoals,
  AnalyticsRollups,
  CommandCenterPreferences,
  MetricSnapshots,
} from '../../collections/Analytics'
import type { DomainDefinition } from '../core/payload-domains'

export const analyticsDomain: DomainDefinition = {
  id: 'analytics',
  collections: [
    AnalyticsEvents,
    AnalyticsRollups,
    MetricSnapshots,
    AnalyticsGoals,
    CommandCenterPreferences,
  ],
}
