import {
  InboundNetworkActivities,
  NetworkAccessDecisions,
  NetworkAuditEvents,
  NetworkDeliveryAttempts,
  NetworkRelationships,
  NetworkSettings,
  NetworkSigningKeys,
  OutboundNetworkDeliveries,
  RemoteActors,
  RemoteInstances,
  RemoteObjects,
  RenegadePeerLinks,
  SyndicatedItems,
} from '../../collections/Network'
import type { DomainDefinition } from '../core/payload-domains'
import { networkTasks } from './tasks'

export const networkDomain: DomainDefinition = {
  id: 'network',
  collections: [
    NetworkSigningKeys,
    RemoteInstances,
    RemoteActors,
    RemoteObjects,
    NetworkRelationships,
    InboundNetworkActivities,
    OutboundNetworkDeliveries,
    NetworkDeliveryAttempts,
    NetworkAccessDecisions,
    NetworkAuditEvents,
    RenegadePeerLinks,
    SyndicatedItems,
  ],
  globals: [NetworkSettings],
  tasks: networkTasks,
}
