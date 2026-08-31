import { PageLayouts } from '../../collections/PageLayouts'
import { Sites } from '../../collections/Sites'
import { ExecutionEvents } from '../../collections/Execution'
import { SiteSettings } from '../../globals/SiteSettings'
import type { DomainDefinition } from './payload-domains'

export const coreDomain: DomainDefinition = {
  id: 'core',
  description: 'Shared installation and site primitives.',
  collections: [Sites, PageLayouts, ExecutionEvents],
  globals: [SiteSettings],
}
