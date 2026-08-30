import {
  ApiClients,
  IntegrationAuditEvents,
  WebhookDeliveries,
  WebhookSubscriptions,
} from '../../collections/Integrations'
import type { DomainDefinition } from '../core/payload-domains'

export const integrationsDomain: DomainDefinition = {
  id: 'integrations',
  description: 'Versioned external-app, automation, and agent boundary.',
  collections: [ApiClients, WebhookSubscriptions, WebhookDeliveries, IntegrationAuditEvents],
}
