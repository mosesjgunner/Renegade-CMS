import { analyticsDomain } from './analytics/payload-domain'
import { audienceDomain } from './audience/payload-domain'
import { commerceDomain } from './commerce/payload-domain'
import { coreDomain } from './core/payload-domain'
import {
  composePayloadDomains,
  type DomainDefinition,
  type PayloadRegistrations,
} from './core/payload-domains'
import { editorialDomain } from './editorial/payload-domain'
import { experiencesDomain } from './experiences/payload-domain'
import { identityDomain } from './identity/payload-domain'
import { integrationsDomain } from './integrations/payload-domain'
import { mediaDomain } from './media/payload-domain'
import { networkDomain } from './network/payload-domain'
import { operationsDomain } from './operations/payload-domain'
import { qualityDomain } from './quality/payload-domain'
import { releasesDomain } from './releases/payload-domain'
import { socialDomain } from './social/payload-domain'
import type { AppConfig } from './core/config'

export function payloadDomains(config: AppConfig): DomainDefinition[] {
  return [
    operationsDomain,
    identityDomain(config),
    coreDomain,
    integrationsDomain,
    editorialDomain,
    releasesDomain,
    mediaDomain,
    socialDomain,
    networkDomain,
    audienceDomain,
    analyticsDomain,
    experiencesDomain,
    qualityDomain,
    commerceDomain,
  ]
}

const collections = (domain: DomainDefinition) => domain.collections ?? []

/**
 * The segments preserve the established collection order without moving ownership out of domains.
 * Payload uses that order when generating types and admin registration metadata.
 */
export function registeredPayloadDomains(config: AppConfig): PayloadRegistrations {
  const domains = payloadDomains(config)
  const [
    ,
    identity,
    core,
    integrations,
    editorial,
    releases,
    media,
    social,
    network,
    audience,
    analytics,
    experiences,
    quality,
    commerce,
  ] = domains
  const registrations = composePayloadDomains(domains)
  const identityCollections = collections(identity)
  const editorialCollections = collections(editorial)

  return {
    ...registrations,
    collections: [
      ...identityCollections.slice(0, 1),
      ...collections(core),
      ...collections(integrations),
      ...identityCollections.slice(1),
      ...editorialCollections.slice(0, 13),
      ...collections(releases),
      ...editorialCollections.slice(13, 19),
      ...collections(media),
      ...collections(social),
      ...editorialCollections.slice(19),
      ...collections(network),
      ...collections(audience),
      ...collections(analytics),
      ...collections(experiences),
      ...collections(quality),
      ...collections(commerce),
    ],
    tasks: registrations.tasks,
  }
}
