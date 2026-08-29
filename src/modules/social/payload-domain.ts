import {
  Campaigns,
  ExternalPosts,
  SocialAccounts,
  SocialCalendarEntries,
  SocialDrafts,
  SocialNetworkVariants,
  SocialPublishAttempts,
  SocialQueueItems,
} from '../../collections/Social'
import type { DomainDefinition } from '../core/payload-domains'
import { socialTasks } from './tasks'

export const socialDomain: DomainDefinition = {
  id: 'social',
  collections: [
    SocialAccounts,
    SocialDrafts,
    SocialNetworkVariants,
    SocialQueueItems,
    SocialPublishAttempts,
    ExternalPosts,
    Campaigns,
    SocialCalendarEntries,
  ],
  tasks: socialTasks,
}
