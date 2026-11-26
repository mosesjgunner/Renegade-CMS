import { monetizationCollections } from '../../collections/Monetization'
import type { DomainDefinition } from '../core/payload-domains'

/**
 * RC3-CE monetization domain: the Creator Earnings Engine storage
 * layer. Canonical money truth stays in the commerce domain; this
 * domain owns the earnings layer on top of it (profiles, provider
 * connections, external evidence, sponsorships, representation, ads,
 * rights/licensing, service bookings, distribution records).
 */
export const monetizationDomain: DomainDefinition = {
  id: 'monetization',
  collections: monetizationCollections,
  tasks: [],
}
