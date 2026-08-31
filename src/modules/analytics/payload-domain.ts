import {
  AnalyticsEvents,
  AnalyticsConsentRecords,
  AnalyticsGoals,
  AnalyticsRollups,
  CommandCenterPreferences,
  MetricSnapshots,
} from '../../collections/Analytics'
import type { DomainDefinition } from '../core/payload-domains'
import { analyticsTasks } from './tasks'

export const analyticsDomain: DomainDefinition = {
  id: 'analytics',
  collections: [
    AnalyticsEvents,
    AnalyticsConsentRecords,
    AnalyticsRollups,
    MetricSnapshots,
    AnalyticsGoals,
    CommandCenterPreferences,
  ],
  tasks: analyticsTasks,
}
