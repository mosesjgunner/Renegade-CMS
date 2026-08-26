import type { CollectionConfig, Field } from 'payload'
import { ownerFields, retentionFields } from './canonical-shared'

const staff = ({ req }: { req: { user?: { role?: string } | null } }) =>
  req.user?.role === 'owner' || req.user?.role === 'staff'
const publicRead = ({ req }: { req: { user?: { role?: string } | null } }) =>
  Boolean(req.user) || true
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  admin: { useAsTitle: title, group: 'Commerce' },
  access: { create: staff, delete: staff, read: staff, update: staff },
  fields: [],
})
const ref = (name: string, relationTo: string | string[], required = false): Field =>
  ({ name, type: 'relationship', relationTo: relationTo as never, required, index: true }) as Field
const select = (name: string, options: string[], defaultValue?: string): Field =>
  ({
    name,
    type: 'select',
    required: true,
    options,
    ...(defaultValue ? { defaultValue } : {}),
  }) as Field

export const MerchantConnections: CollectionConfig = {
  ...base('merchant-connections', 'label'),
  fields: [
    ...ownerFields(),
    { name: 'label', type: 'text', required: true },
    { name: 'providerKey', type: 'text', required: true },
    { name: 'merchantCountry', type: 'text', required: true },
    select('status', ['active', 'disabled', 'degraded'], 'active'),
    {
      name: 'credentialReference',
      type: 'text',
      admin: {
        description: 'Secret-manager reference only; never store processor credentials in Payload.',
      },
    },
    { name: 'configuration', type: 'json', defaultValue: {} },
  ],
}
export const PaymentMethodCapabilities: CollectionConfig = {
  ...base('payment-method-capabilities', 'railKey'),
  fields: [
    ...ownerFields(),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'providerKey', type: 'text', required: true },
    { name: 'railKey', type: 'text', required: true },
    select('family', [
      'card',
      'wallet',
      'bank-debit',
      'bank-transfer',
      'open-banking',
      'mobile-money',
      'cash-voucher',
      'buy-now-pay-later',
      'crypto',
      'external-link',
    ]),
    select('flow', ['hosted', 'redirect', 'qr', 'asynchronous', 'manual']),
    { name: 'merchantCountries', type: 'json', defaultValue: [] },
    { name: 'buyerCountries', type: 'json', defaultValue: [] },
    { name: 'presentmentCurrencies', type: 'json', defaultValue: [] },
    { name: 'settlementCurrencies', type: 'json', defaultValue: [] },
    { name: 'minimumAmountMinor', type: 'text' },
    { name: 'maximumAmountMinor', type: 'text' },
    { name: 'recurring', type: 'checkbox', defaultValue: false },
    { name: 'refunds', type: 'checkbox', defaultValue: false },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    select('health', ['healthy', 'degraded', 'unavailable'], 'healthy'),
    { name: 'requiredCustomerFields', type: 'json', defaultValue: [] },
    { name: 'instructions', type: 'textarea' },
  ],
}
export const Products: CollectionConfig = {
  ...base('products', 'name'),
  access: { create: staff, delete: staff, update: staff, read: publicRead },
  fields: [
    ...ownerFields(),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true },
    { name: 'canonicalPath', type: 'text', required: true, unique: true },
    select('kind', ['physical', 'digital', 'pod-reference', 'subscription', 'membership']),
    select('state', ['draft', 'review', 'approved', 'published', 'archived'], 'draft'),
    { name: 'description', type: 'textarea' },
    {
      name: 'localized',
      type: 'json',
      defaultValue: {},
      admin: {
        description:
          'Prompt 2 reviewed product text keyed by locale; legal/payment copy is kept separately and reviewed.',
      },
    },
    ref('categories', 'categories'),
    { name: 'collections', type: 'relationship', relationTo: 'albums' as never, hasMany: true },
    { name: 'media', type: 'relationship', relationTo: 'media-assets' as never, hasMany: true },
    {
      name: 'variants',
      type: 'array',
      fields: [
        { name: 'sku', type: 'text', required: true },
        { name: 'title', type: 'text', required: true },
        { name: 'attributes', type: 'json', defaultValue: {} },
        {
          name: 'inventoryPolicy',
          type: 'select',
          options: ['untracked', 'tracked', 'external-hook', 'pod-provider'],
          defaultValue: 'untracked',
        },
        { name: 'inventoryQuantity', type: 'number' },
        { name: 'inventoryReference', type: 'text' },
        {
          name: 'digitalFiles',
          type: 'relationship',
          relationTo: 'media-assets' as never,
          hasMany: true,
        },
        { name: 'podReference', type: 'json' },
      ],
    },
    {
      name: 'prices',
      type: 'array',
      fields: [
        { name: 'currency', type: 'text', required: true },
        { name: 'amountMinor', type: 'text', required: true },
        { name: 'compareAtMinor', type: 'text' },
        { name: 'variantSku', type: 'text' },
        { name: 'recurringInterval', type: 'select', options: ['month', 'year'] },
      ],
    },
    {
      name: 'entitlement',
      type: 'text',
      admin: { description: 'Existing entitlement key for subscription/membership products.' },
    },
    { name: 'releaseRevision', type: 'text' },
    ...retentionFields(),
  ],
  indexes: [{ fields: ['site', 'slug'], unique: true }],
}
export const Carts: CollectionConfig = {
  ...base('carts', 'id'),
  fields: [
    ...ownerFields(),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'currency', type: 'text', required: true },
    { name: 'buyerCountry', type: 'text' },
    { name: 'items', type: 'json', required: true, defaultValue: [] },
    select('state', ['active', 'converted', 'abandoned', 'expired'], 'active'),
    { name: 'idempotencyKey', type: 'text', index: true },
    { name: 'expiresAt', type: 'date' },
  ],
}
export const CheckoutSessions: CollectionConfig = {
  ...base('checkout-sessions', 'id'),
  fields: [
    ...ownerFields(),
    ref('cart', 'carts', true),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'currency', type: 'text', required: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'buyerCountry', type: 'text' },
    select(
      'state',
      ['open', 'pending', 'completed', 'failed', 'cancelled', 'abandoned', 'expired'],
      'open',
    ),
    { name: 'selectedCapabilityId', type: 'text' },
    { name: 'legalCopy', type: 'json', defaultValue: {} },
    { name: 'idempotencyKey', type: 'text', index: true },
    { name: 'expiresAt', type: 'date' },
    { name: 'shippingExtension', type: 'json' },
    { name: 'taxExtension', type: 'json' },
  ],
}
export const PaymentIntents: CollectionConfig = {
  ...base('payment-intents', 'id'),
  fields: [
    ...ownerFields(),
    ref('checkoutSession', 'checkout-sessions', true),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'capabilityId', type: 'text', required: true },
    { name: 'providerKey', type: 'text', required: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    select(
      'state',
      [
        'created',
        'requires-action',
        'pending',
        'paid',
        'failed',
        'cancelled',
        'expired',
        'refunded',
        'disputed',
        'exception',
      ],
      'created',
    ),
    { name: 'providerReference', type: 'text', index: true },
    {
      name: 'cryptoInvoice',
      type: 'json',
      admin: {
        description:
          'Noncustodial intent-bound invoice: destination, network, asset, exact amount, URI/QR, expiry, server-verified observations, confirmations and reorg history. Never private keys.',
      },
    },
    {
      name: 'exception',
      type: 'json',
      admin: {
        description: 'Scoped operational exception only; it does not alter financial history.',
      },
    },
    { name: 'financialEvents', type: 'json', defaultValue: [] },
    { name: 'expiresAt', type: 'date', required: true },
  ],
}
export const Orders: CollectionConfig = {
  ...base('orders', 'orderNumber'),
  fields: [
    ...ownerFields(),
    ref('checkoutSession', 'checkout-sessions', true),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'orderNumber', type: 'text', required: true, unique: true },
    select('state', [
      'pending-payment',
      'paid',
      'fulfilling',
      'fulfilled',
      'cancelled',
      'failed',
      'refunded',
      'exception',
    ]),
    { name: 'currency', type: 'text', required: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'items', type: 'json', required: true },
    { name: 'transitionLog', type: 'json', defaultValue: [] },
    { name: 'refundExtension', type: 'json' },
    { name: 'receipt', type: 'json' },
    {
      name: 'fulfillmentExtension',
      type: 'json',
      admin: {
        description:
          'External POD fulfillment state, provider request idempotency and tracking. CMS Order remains canonical.',
      },
    },
    { name: 'exception', type: 'json' },
    {
      name: 'posMetadata',
      type: 'json',
      admin: {
        description:
          'Optional note, tip, discount and receipt-brand snapshot; no card or wallet credentials.',
      },
    },
  ],
}
export const PaymentWebhookEvents: CollectionConfig = {
  ...base('payment-webhook-events', 'providerEventId'),
  fields: [
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'providerKey', type: 'text', required: true },
    { name: 'providerEventId', type: 'text', required: true },
    { name: 'payloadHash', type: 'text', required: true },
    { name: 'verifiedAt', type: 'date', required: true },
    { name: 'processedAt', type: 'date' },
    { name: 'outcome', type: 'json' },
  ],
  indexes: [{ fields: ['providerKey', 'providerEventId'], unique: true }],
}
export const Supporters: CollectionConfig = {
  ...base('supporters', 'displayName'),
  fields: [
    ...ownerFields(),
    { name: 'displayName', type: 'text' },
    ref('member', 'members'),
    { name: 'emailHash', type: 'text', index: true },
    { name: 'providerReferences', type: 'json', defaultValue: [] },
    {
      name: 'visibilityPreference',
      type: 'select',
      defaultValue: 'public',
      options: ['public', 'anonymous', 'private'],
    },
  ],
}
export const Entitlements: CollectionConfig = {
  ...base('entitlements', 'entitlement'),
  fields: [
    ...ownerFields(),
    ref('supporter', 'supporters', true),
    ref('campaign', 'campaigns'),
    ref('paymentIntent', 'payment-intents'),
    { name: 'entitlement', type: 'text', required: true },
    { name: 'source', type: 'text', required: true },
    { name: 'startsAt', type: 'date', required: true },
    { name: 'endsAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'fulfillmentReference', type: 'json' },
  ],
}
