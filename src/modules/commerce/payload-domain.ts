import {
  Carts,
  CheckoutSessions,
  Entitlements,
  MerchantConnections,
  Orders,
  PaymentIntents,
  PaymentMethodCapabilities,
  PaymentWebhookEvents,
  Products,
  Supporters,
} from '../../collections/Commerce'
import type { DomainDefinition } from '../core/payload-domains'
import { commerceTasks } from './tasks'

export const commerceDomain: DomainDefinition = {
  id: 'commerce',
  collections: [
    MerchantConnections,
    PaymentMethodCapabilities,
    Products,
    Carts,
    CheckoutSessions,
    PaymentIntents,
    Orders,
    PaymentWebhookEvents,
    Supporters,
    Entitlements,
  ],
  tasks: commerceTasks,
}
