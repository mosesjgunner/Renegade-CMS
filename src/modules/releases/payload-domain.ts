import { ContentReleases } from '../../collections/Releases'
import type { DomainDefinition } from '../core/payload-domains'
import { releaseTasks } from './tasks'

export const releasesDomain: DomainDefinition = {
  id: 'releases',
  collections: [ContentReleases],
  tasks: releaseTasks,
}
