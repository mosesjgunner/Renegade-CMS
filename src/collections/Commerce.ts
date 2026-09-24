import type { CollectionConfig, Field } from 'payload'
import {
  enforceSiteTenantBoundary,
  ownerFields,
  retentionFields,
  seoFields,
} from './canonical-shared'
import { assertCatalogReady, catalogProductFromDocument } from '../modules/commerce/catalog'
import { searchProjectionHooks } from '../modules/public/search-projection'
import { assertCampaignTransition, assertDonationTransition } from '../modules/commerce/donations'

const staff = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
const publishedProductRead = ({ req }: { req: { user?: { role?: string } | null } }) =>
  ['owner', 'administrator', 'staff'].includes(String(req.user?.role))
    ? true
    : { state: { equals: 'published' } }
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  lockDocuments: false,
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
  access: { create: staff, delete: staff, update: staff, read: publishedProductRead },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc, operation, context }) => {
        if (
          operation === 'update' &&
          data?.state === 'published' &&
          originalDoc?.state !== 'published' &&
          context?.catalogWorkflow !== true
        )
          throw new Error('Publish products through the catalog or coordinated release workflow.')
        if (data?.catalogContractVersion && ['approved', 'published'].includes(String(data.state)))
          assertCatalogReady(catalogProductFromDocument(data))
        return data
      },
    ],
    afterChange: [
      ...searchProjectionHooks('products').afterChange,
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update') return doc
        const fromPath = String(previousDoc?.canonicalPath ?? '')
        const toPath = String(doc?.canonicalPath ?? '')
        const site =
          typeof doc?.site === 'object' && doc.site
            ? String(doc.site.id ?? '')
            : String(doc?.site ?? '')
        if (!site || !fromPath || !toPath || fromPath === toPath) return doc
        const existing = await req.payload.find({
          collection: 'public-redirects',
          where: { and: [{ site: { equals: site } }, { fromPath: { equals: fromPath } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
        if (!existing.docs.length)
          await req.payload.create({
            collection: 'public-redirects',
            data: {
              site,
              fromPath,
              toPath,
              match: 'exact',
              statusCode: '308',
              preserveQuery: true,
              enabled: true,
            },
            overrideAccess: true,
          } as never)
        return doc
      },
    ],
    afterDelete: searchProjectionHooks('products').afterDelete,
  },
  fields: [
    ...ownerFields(),
    ref('merchantConnection', 'merchant-connections'),
    { name: 'catalogContractVersion', type: 'number', min: 1, defaultValue: 1, required: true },
    { name: 'name', type: 'text', required: true },
    { name: 'summary', type: 'textarea' },
    { name: 'slug', type: 'text', required: true },
    { name: 'canonicalPath', type: 'text', required: true },
    select('kind', [
      'physical',
      'digital',
      'pod-reference',
      'subscription',
      'membership',
      'donation',
      'affiliate',
    ]),
    select('state', ['draft', 'review', 'approved', 'published', 'archived'], 'draft'),
    { name: 'publishedAt', type: 'date' },
    { name: 'archivedAt', type: 'date' },
    { name: 'redirectTo', type: 'text' },
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
    { name: 'topics', type: 'relationship', relationTo: 'topics' as never, hasMany: true },
    { name: 'tags', type: 'relationship', relationTo: 'tags' as never, hasMany: true },
    { name: 'collections', type: 'relationship', relationTo: 'albums' as never, hasMany: true },
    { name: 'media', type: 'relationship', relationTo: 'media-assets' as never, hasMany: true },
    { name: 'relationships', type: 'relationship', relationTo: 'products' as never, hasMany: true },
    {
      name: 'productCapabilities',
      type: 'json',
      required: true,
      defaultValue: [],
      admin: {
        description:
          'Allowlisted capabilities: shippable, digital-entitlement, subscription, donation, affiliate, pod.',
      },
    },
    {
      name: 'optionDimensions',
      type: 'json',
      defaultValue: [],
      admin: {
        description:
          'Deliberate option dimensions and allowed values; variants are authored explicitly.',
      },
    },
    {
      name: 'variants',
      type: 'array',
      fields: [
        { name: 'sku', type: 'text', required: true },
        { name: 'title', type: 'text', required: true },
        { name: 'attributes', type: 'json', defaultValue: {} },
        { name: 'optionValues', type: 'json', defaultValue: {} },
        {
          name: 'status',
          type: 'select',
          options: ['active', 'unavailable', 'archived'],
          defaultValue: 'active',
        },
        { name: 'weightGrams', type: 'number', min: 1 },
        { name: 'dimensionsMm', type: 'json' },
        {
          name: 'inventoryPolicy',
          type: 'select',
          options: ['untracked', 'tracked', 'external-hook', 'pod-provider', 'affiliate', 'pod'],
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
      name: 'offers',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Versioned canonical price offers. Never overwrite historical versions.',
      },
    },
    {
      name: 'digitalDelivery',
      type: 'json',
      admin: {
        description:
          'Private media IDs, entitlement key, limits, expiry and malware/rights evidence. Originals are never public.',
      },
    },
    {
      name: 'affiliatePolicy',
      type: 'json',
      admin: {
        description:
          'Destination, disclosure, allowlisted tracking, observed remote facts and freshness window.',
      },
    },
    {
      name: 'podMappings',
      type: 'json',
      admin: {
        description:
          'Reviewed remote IDs/options, pinned artwork revision, mockup provenance and cost/availability snapshot.',
      },
    },
    { name: 'disclosures', type: 'json', defaultValue: [] },
    { name: 'workflowAudit', type: 'json', defaultValue: [] },
    { name: 'revisionSnapshots', type: 'json', defaultValue: [] },
    { name: 'publishedPresentation', type: 'json' },
    {
      name: 'entitlement',
      type: 'text',
      admin: { description: 'Existing entitlement key for subscription/membership products.' },
    },
    { name: 'releaseRevision', type: 'text' },
    ...seoFields(),
    ...retentionFields(),
  ],
  indexes: [
    { fields: ['site', 'slug'], unique: true },
    { fields: ['site', 'canonicalPath'], unique: true },
  ],
}
export const Carts: CollectionConfig = {
  ...base('carts', 'id'),
  fields: [
    ...ownerFields(),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'version', type: 'number', min: 1, defaultValue: 1, required: true },
    { name: 'guestTokenHash', type: 'text', index: true },
    ref('member', 'members'),
    { name: 'customerEmail', type: 'text' },
    { name: 'currency', type: 'text', required: true },
    { name: 'buyerCountry', type: 'text' },
    { name: 'items', type: 'json', required: true, defaultValue: [] },
    { name: 'appliedCouponCodes', type: 'json', defaultValue: [] },
    { name: 'shippingAddress', type: 'json' },
    { name: 'billingAddress', type: 'json' },
    { name: 'selectedShippingRateId', type: 'text' },
    { name: 'reconciliationNotes', type: 'json', defaultValue: [] },
    select('state', ['active', 'converted', 'abandoned', 'expired'], 'active'),
    { name: 'idempotencyKey', type: 'text', index: true },
    { name: 'expiresAt', type: 'date' },
  ],
}
export const Promotions: CollectionConfig = {
  ...base('promotions', 'code'),
  fields: [
    ...ownerFields(),
    { name: 'version', type: 'number', min: 1, defaultValue: 1, required: true },
    { name: 'code', type: 'text', required: true, index: true },
    { name: 'description', type: 'text', required: true },
    select('scope', ['order', 'line', 'category', 'shipping'], 'order'),
    select(
      'discountType',
      ['fixed-minor', 'percentage-basis-points', 'free-shipping'],
      'fixed-minor',
    ),
    { name: 'discountValue', type: 'text', required: true },
    { name: 'maxDiscountMinor', type: 'text' },
    { name: 'currency', type: 'text', required: true },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    { name: 'timezone', type: 'text' },
    select('status', ['active', 'paused', 'archived'], 'active'),
    select('stackingRule', ['exclusive', 'stackable', 'priority'], 'stackable'),
    { name: 'stackingPriority', type: 'number', defaultValue: 0, required: true },
    { name: 'usageLimitTotal', type: 'number' },
    { name: 'usageCount', type: 'number', defaultValue: 0, required: true },
    { name: 'usageLimitPerCustomer', type: 'number' },
    { name: 'eligibility', type: 'json', defaultValue: {} },
  ],
  indexes: [{ fields: ['site', 'code'], unique: true }],
}
export const CheckoutProposals: CollectionConfig = {
  ...base('checkout-proposals', 'id'),
  fields: [
    ...ownerFields(),
    ref('cart', 'carts', true),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'cartVersion', type: 'number', required: true },
    { name: 'currency', type: 'text', required: true },
    { name: 'customer', type: 'json', required: true },
    { name: 'shippingAddress', type: 'json' },
    { name: 'billingAddress', type: 'json' },
    { name: 'selectedShippingRate', type: 'json' },
    { name: 'pricingSnapshot', type: 'json', required: true },
    { name: 'taxSnapshot', type: 'json' },
    { name: 'consents', type: 'json', required: true },
    { name: 'fulfillmentSplit', type: 'json', required: true },
    { name: 'integrityHash', type: 'text', required: true },
    select('state', ['active', 'consumed', 'expired', 'cancelled'], 'active'),
    { name: 'expiresAt', type: 'date', required: true },
  ],
  indexes: [{ fields: ['site', 'integrityHash'] }],
}
export const InventoryReservations: CollectionConfig = {
  ...base('inventory-reservations', 'id'),
  fields: [
    ...ownerFields(),
    ref('cart', 'carts', true),
    ref('proposal', 'checkout-proposals'),
    ref('product', 'products', true),
    { name: 'variantSku', type: 'text', required: true },
    { name: 'quantity', type: 'number', required: true, min: 1 },
    select('status', ['active', 'consumed', 'released', 'expired'], 'active'),
    { name: 'expiresAt', type: 'date', required: true },
  ],
  indexes: [{ fields: ['site', 'variantSku', 'status'] }],
}
export const CheckoutSessions: CollectionConfig = {
  ...base('checkout-sessions', 'id'),
  fields: [
    ...ownerFields(),
    ref('cart', 'carts', true),
    ref('proposal', 'checkout-proposals'),
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
    { name: 'bindingKey', type: 'text', index: true },
    { name: 'customerKey', type: 'text', index: true },
    { name: 'attempt', type: 'number', min: 1, defaultValue: 1, required: true },
    { name: 'guestAccessTokenHash', type: 'text', index: true },
    { name: 'returnPath', type: 'text' },
    { name: 'cancelPath', type: 'text' },
    { name: 'expiresAt', type: 'date' },
    { name: 'shippingExtension', type: 'json' },
    { name: 'taxExtension', type: 'json' },
  ],
}
export const PaymentAttempts: CollectionConfig = {
  ...base('payment-attempts', 'id'),
  fields: [
    ...ownerFields(),
    ref('checkoutSession', 'checkout-sessions', true),
    ref('paymentIntent', 'payment-intents', true),
    ref('proposal', 'checkout-proposals'),
    ref('merchantConnection', 'merchant-connections', true),
    { name: 'attempt', type: 'number', min: 1, required: true },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'providerKey', type: 'text', required: true },
    { name: 'providerContractVersion', type: 'text', required: true },
    { name: 'providerImplementationVersion', type: 'text', required: true },
    { name: 'providerApiVersion', type: 'text', required: true },
    { name: 'providerReference', type: 'text', index: true },
    { name: 'providerPaymentReference', type: 'text', index: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    select(
      'state',
      [
        'initiated',
        'action-required',
        'processing',
        'succeeded',
        'failed',
        'cancelled',
        'partially-refunded',
        'refunded',
        'disputed',
        'unknown',
      ],
      'initiated',
    ),
    { name: 'refundedAmountMinor', type: 'text', required: true, defaultValue: '0' },
    { name: 'lastProviderSequence', type: 'number' },
    { name: 'processedEventIds', type: 'json', defaultValue: [] },
    { name: 'unknownSince', type: 'date' },
    { name: 'lastReconciledAt', type: 'date' },
    { name: 'nextReconcileAt', type: 'date' },
    { name: 'failure', type: 'json' },
    { name: 'expiresAt', type: 'date', required: true },
  ],
  indexes: [
    { fields: ['checkoutSession', 'attempt'], unique: true },
    { fields: ['providerKey', 'providerReference'] },
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
    {
      name: 'orderLines',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Server-priced immutable checkout snapshot; never copied from a later cart.',
      },
    },
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
    { name: 'partySnapshot', type: 'json' },
    { name: 'addressSnapshot', type: 'json' },
    { name: 'totalsSnapshot', type: 'json' },
    { name: 'termsSnapshot', type: 'json' },
    { name: 'sourceSnapshot', type: 'json' },
    { name: 'downstreamInstructions', type: 'json', defaultValue: [] },
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
    { name: 'occurredAt', type: 'date' },
    { name: 'sequence', type: 'number' },
    { name: 'normalizedKind', type: 'text' },
    { name: 'providerReference', type: 'text', index: true },
    { name: 'sanitizedEvidence', type: 'json', defaultValue: {} },
    select('processingState', ['received', 'processing', 'processed', 'failed', 'gap'], 'received'),
    { name: 'attempts', type: 'number', min: 0, defaultValue: 0, required: true },
    { name: 'lastError', type: 'text' },
    { name: 'processedAt', type: 'date' },
    { name: 'outcome', type: 'json' },
  ],
  indexes: [{ fields: ['providerKey', 'providerEventId'], unique: true }],
}
export const CommerceRefunds: CollectionConfig = {
  ...base('commerce-refunds', 'id'),
  fields: [
    ...ownerFields(),
    ref('order', 'orders', true),
    ref('paymentAttempt', 'payment-attempts', true),
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    select('kind', ['partial', 'full']),
    select(
      'state',
      ['previewed', 'awaiting-approval', 'processing', 'succeeded', 'failed', 'unknown'],
      'previewed',
    ),
    { name: 'reason', type: 'text', required: true },
    { name: 'requestedBy', type: 'text', required: true },
    { name: 'approvedBy', type: 'text' },
    { name: 'providerRefundReference', type: 'text', index: true },
    { name: 'providerEvidence', type: 'json' },
    { name: 'downstreamPolicy', type: 'json', defaultValue: {} },
    { name: 'correctionReceipt', type: 'json' },
    { name: 'auditLog', type: 'json', defaultValue: [] },
  ],
}
export const CommerceDisputes: CollectionConfig = {
  ...base('commerce-disputes', 'providerDisputeReference'),
  fields: [
    ...ownerFields(),
    ref('order', 'orders', true),
    ref('paymentAttempt', 'payment-attempts', true),
    { name: 'providerDisputeReference', type: 'text', required: true, unique: true, index: true },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    select('state', ['open', 'under-review', 'won', 'lost', 'closed'], 'open'),
    { name: 'reason', type: 'text' },
    { name: 'deadlineAt', type: 'date' },
    { name: 'sanitizedEvidence', type: 'json', defaultValue: {} },
    { name: 'auditLog', type: 'json', defaultValue: [] },
  ],
}
export const CommerceReconciliationCases: CollectionConfig = {
  ...base('commerce-reconciliation-cases', 'legacyId'),
  timestamps: false,
  fields: [
    ref('site', 'sites', true),
    { name: 'legacyType', type: 'text', required: true },
    { name: 'legacyId', type: 'text', required: true },
    { name: 'reason', type: 'text', required: true },
    { name: 'evidence', type: 'json', required: true, defaultValue: {} },
    select('status', ['quarantined', 'resolved', 'dismissed'], 'quarantined'),
    { name: 'createdAt', type: 'date', required: true },
    { name: 'resolvedAt', type: 'date' },
  ],
  indexes: [{ fields: ['legacyType', 'legacyId'], unique: true }],
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

const immutableFields =
  (fields: string[]) =>
  ({
    data,
    originalDoc,
    operation,
  }: {
    data?: Record<string, unknown>
    originalDoc?: Record<string, unknown>
    operation: string
  }) => {
    if (operation === 'update' && originalDoc)
      for (const field of fields) {
        if (
          data?.[field] !== undefined &&
          JSON.stringify(data[field]) !== JSON.stringify(originalDoc[field])
        )
          throw new Error(`${field} is an immutable donation snapshot.`)
      }
    return data
  }

/** Each published campaign revision is immutable; edits create a new version. */
export const DonationCampaigns: CollectionConfig = {
  ...base('donation-campaigns', 'title'),
  hooks: {
    beforeChange: [
      enforceSiteTenantBoundary([{ field: 'organization', collection: 'organizations' }]),
      ({ data, originalDoc, operation }) => {
        if (operation === 'create' && data?.lifecycle && data.lifecycle !== 'draft')
          throw new Error('Campaign revisions must begin in draft.')
        if (
          operation === 'update' &&
          originalDoc &&
          originalDoc.lifecycle !== 'draft' &&
          Object.keys(data ?? {}).some((field) => field !== 'lifecycle')
        )
          throw new Error('Published campaign versions are immutable; create a new version.')
        if (operation === 'update' && originalDoc?.lifecycle && data?.lifecycle)
          assertCampaignTransition(originalDoc.lifecycle as never, data.lifecycle as never)
        const value = { ...(originalDoc ?? {}), ...(data ?? {}) }
        if (
          value.startsAt &&
          value.endsAt &&
          Date.parse(String(value.endsAt)) <= Date.parse(String(value.startsAt))
        )
          throw new Error('Campaign end must follow its start.')
        const amounts = (value.allowedAmounts as string[] | undefined) ?? []
        if (amounts.some((amount) => !/^[1-9][0-9]*$/.test(amount)))
          throw new Error('Allowed amounts must be positive integer minor units.')
        if (value.goalAmountMinor && !/^[1-9][0-9]*$/.test(String(value.goalAmountMinor)))
          throw new Error('Campaign goal must be positive integer minor units.')
        if (
          (value.supporterEntitlement || value.supporterEntitlementTermDays) &&
          (!String(value.supporterEntitlement ?? '').trim() ||
            !Number.isInteger(Number(value.supporterEntitlementTermDays)) ||
            Number(value.supporterEntitlementTermDays) < 1)
        )
          throw new Error(
            'A supporter benefit needs both an entitlement name and a positive whole-day term.',
          )
        return data
      },
    ],
  },
  indexes: [{ fields: ['site', 'campaignKey', 'version'], unique: true }],
  fields: [
    ...ownerFields(),
    ref('organization', 'organizations'),
    { name: 'campaignKey', type: 'text', required: true, index: true },
    { name: 'version', type: 'number', required: true, min: 1 },
    { name: 'title', type: 'text', required: true },
    { name: 'story', type: 'richText' },
    { name: 'media', type: 'json', defaultValue: [] },
    { name: 'purpose', type: 'textarea', required: true },
    { name: 'designations', type: 'json', defaultValue: [] },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    { name: 'goalAmountMinor', type: 'text' },
    { name: 'goalRules', type: 'json', defaultValue: {} },
    { name: 'allowedAmounts', type: 'json', defaultValue: [] },
    { name: 'currency', type: 'text', required: true },
    {
      name: 'receiptEntityName',
      type: 'text',
      admin: { description: 'Entity name frozen onto each settled receipt.' },
    },
    { name: 'verifiedNonprofitStatus', type: 'checkbox', defaultValue: false },
    { name: 'verified501c3Status', type: 'checkbox', defaultValue: false },
    { name: 'verifiedTaxDeductibility', type: 'checkbox', defaultValue: false },
    { name: 'taxDisclaimer', type: 'textarea' },
    { name: 'donorWallMinimumMinor', type: 'text', defaultValue: '0' },
    { name: 'supporterEntitlement', type: 'text' },
    { name: 'supporterEntitlementTermDays', type: 'number', min: 1 },
    { name: 'recurrence', type: 'json', required: true, defaultValue: ['one-time'] },
    { name: 'feeCover', type: 'json' },
    select('privacyDefault', ['public', 'anonymous', 'private'], 'private'),
    { name: 'disclosures', type: 'json', required: true, defaultValue: [] },
    select(
      'lifecycle',
      ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'],
      'draft',
    ),
  ],
}

/** A donation intent is the frozen checkout request; provider truth stays in PaymentIntent. */
export const DonationIntents: CollectionConfig = {
  ...base('donation-intents', 'id'),
  hooks: {
    beforeChange: [
      immutableFields([
        'idempotencyKey',
        'site',
        'campaign',
        'campaignVersion',
        'designation',
        'donorSnapshot',
        'moneySnapshot',
        'recognition',
        'publicDisplayName',
        'donorMessage',
        'trackingSource',
        'recurrence',
      ]),
      ({ data, originalDoc, operation }) => {
        if (operation === 'update' && originalDoc)
          for (const field of ['paymentIntent', 'subscription'])
            if (
              originalDoc[field] &&
              data?.[field] !== undefined &&
              JSON.stringify(data[field]) !== JSON.stringify(originalDoc[field])
            )
              throw new Error(`${field} linkage is immutable once attached.`)
        if (operation === 'update' && originalDoc?.lifecycle && data?.lifecycle)
          assertDonationTransition(originalDoc.lifecycle as never, data.lifecycle as never)
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    ref('campaign', 'donation-campaigns', true),
    { name: 'idempotencyKey', type: 'text', unique: true, index: true },
    { name: 'campaignVersion', type: 'number', required: true },
    { name: 'designation', type: 'text' },
    { name: 'donorSnapshot', type: 'json', required: true },
    { name: 'moneySnapshot', type: 'json', required: true },
    {
      name: 'recognition',
      type: 'select',
      required: true,
      options: ['public', 'anonymous', 'private'],
    },
    { name: 'publicDisplayName', type: 'text' },
    { name: 'donorMessage', type: 'textarea' },
    { name: 'trackingSource', type: 'json', defaultValue: {} },
    ref('paymentIntent', 'payment-intents'),
    ref('subscription', 'subscriptions'),
    select('recurrence', ['one-time', 'recurring'], 'one-time'),
    select(
      'lifecycle',
      ['created', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'disputed', 'unknown'],
      'created',
    ),
  ],
}

/** Canonical contribution snapshot. Updates are prohibited; corrections append ledger events. */
export const Donations: CollectionConfig = {
  ...base('donations', 'id'),
  access: { create: staff, delete: () => false, read: staff, update: staff },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        if (operation === 'create' && data?.lifecycle && data.lifecycle !== 'succeeded')
          throw new Error('A donation snapshot is created only from successful payment evidence.')
        if (operation === 'update' && originalDoc?.lifecycle && data?.lifecycle)
          assertDonationTransition(originalDoc.lifecycle as never, data.lifecycle as never)
        for (const field of [
          'site',
          'donationIntent',
          'campaign',
          'paymentIntent',
          'subscription',
          'supporter',
          'donorSnapshot',
          'campaignSnapshot',
          'receiptSnapshot',
          'designation',
          'baseAmountMinor',
          'feeCoveredAmountMinor',
          'currency',
          'recognition',
          'publicDisplayName',
          'donorMessage',
          'trackingSource',
        ]) {
          if (
            operation === 'update' &&
            originalDoc &&
            data?.[field] !== undefined &&
            JSON.stringify(data[field]) !== JSON.stringify(originalDoc[field])
          )
            throw new Error(`${field} is an immutable donation snapshot.`)
        }
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    ref('donationIntent', 'donation-intents', true),
    ref('campaign', 'donation-campaigns', true),
    ref('paymentIntent', 'payment-intents', true),
    ref('subscription', 'subscriptions'),
    ref('supporter', 'supporters'),
    { name: 'donorSnapshot', type: 'json', required: true },
    { name: 'campaignSnapshot', type: 'json', required: true },
    { name: 'receiptSnapshot', type: 'json' },
    { name: 'designation', type: 'text' },
    { name: 'baseAmountMinor', type: 'text', required: true },
    { name: 'feeCoveredAmountMinor', type: 'text', required: true, defaultValue: '0' },
    { name: 'currency', type: 'text', required: true },
    {
      name: 'recognition',
      type: 'select',
      required: true,
      options: ['public', 'anonymous', 'private'],
    },
    { name: 'publicDisplayName', type: 'text' },
    { name: 'donorMessage', type: 'textarea' },
    { name: 'trackingSource', type: 'json', defaultValue: {} },
    select(
      'lifecycle',
      ['succeeded', 'partially-refunded', 'refunded', 'disputed', 'exception'],
      'succeeded',
    ),
  ],
}

export const DonationEvents: CollectionConfig = {
  ...base('donation-events', 'eventKey'),
  access: { create: staff, delete: () => false, read: staff, update: () => false },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (Boolean(data?.donation) === Boolean(data?.donationIntent))
          throw new Error(
            'A donation event must reference exactly one donation or donation intent.',
          )
        return data
      },
    ],
  },
  fields: [
    ref('donation', 'donations'),
    ref('donationIntent', 'donation-intents'),
    { name: 'eventKey', type: 'text', required: true, unique: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'actor', type: 'text' },
    { name: 'evidence', type: 'json', defaultValue: {} },
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
    { name: 'resource', type: 'text' },
    { name: 'capability', type: 'text' },
    { name: 'scope', type: 'text' },
    { name: 'grantKey', type: 'text', unique: true, index: true },
    { name: 'limit', type: 'number', min: 0 },
    { name: 'evidence', type: 'json', defaultValue: {} },
  ],
}

/** Published agreements are immutable snapshots. A new price or policy is a new revision. */
export const PlanRevisions: CollectionConfig = {
  ...base('plan-revisions', 'name'),
  access: { create: staff, delete: () => false, read: staff, update: () => false },
  fields: [
    ...ownerFields(),
    { name: 'planKey', type: 'text', required: true, index: true },
    { name: 'revision', type: 'number', required: true, min: 1 },
    { name: 'name', type: 'text', required: true },
    {
      name: 'lifecycle',
      type: 'select',
      required: true,
      defaultValue: 'published',
      options: ['published', 'retired'],
    },
    { name: 'interval', type: 'select', required: true, options: ['week', 'month', 'year'] },
    { name: 'intervalCount', type: 'number', required: true, min: 1 },
    { name: 'amountMinor', type: 'text', required: true },
    { name: 'currency', type: 'text', required: true },
    { name: 'trialDays', type: 'number', required: true, min: 0 },
    {
      name: 'trialEligibility',
      type: 'select',
      required: true,
      options: ['once_per_customer', 'unrestricted', 'none'],
    },
    { name: 'entitlements', type: 'json', required: true, defaultValue: [] },
    { name: 'cancelPolicy', type: 'select', required: true, options: ['immediate', 'period_end'] },
    { name: 'changePolicy', type: 'select', required: true, options: ['immediate', 'period_end'] },
    {
      name: 'taxPolicy',
      type: 'select',
      required: true,
      options: ['provider', 'inclusive', 'exclusive'],
    },
    { name: 'providerMappings', type: 'json', required: true, defaultValue: {} },
    { name: 'publishedAt', type: 'date', required: true },
  ],
  indexes: [{ fields: ['planKey', 'revision'], unique: true }],
}

export const Subscriptions: CollectionConfig = {
  ...base('subscriptions', 'id'),
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, context }) => {
        if (operation === 'update' && originalDoc)
          for (const field of ['site', 'supporter', 'planRevision', 'planSnapshot', 'source']) {
            if (
              context?.subscriptionLifecycleTransition === true &&
              ['planRevision', 'planSnapshot'].includes(field)
            )
              continue
            if (
              data?.[field] !== undefined &&
              JSON.stringify(data[field]) !== JSON.stringify(originalDoc[field])
            )
              throw new Error(`Subscription ${field} is an immutable agreement snapshot.`)
          }
        return data
      },
    ],
  },
  fields: [
    ...ownerFields(),
    ref('supporter', 'supporters', true),
    ref('planRevision', 'plan-revisions', true),
    { name: 'planSnapshot', type: 'json', required: true },
    { name: 'providerKey', type: 'text', required: true },
    { name: 'providerCustomerReference', type: 'text' },
    { name: 'providerSubscriptionReference', type: 'text', index: true },
    { name: 'providerStatus', type: 'text' },
    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'incomplete',
      options: [
        'incomplete',
        'trialing',
        'active',
        'past_due',
        'grace',
        'paused',
        'cancel_at_period_end',
        'canceled',
        'expired',
        'incomplete_expired',
      ],
      index: true,
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      options: ['provider', 'complimentary', 'migration'],
    },
    { name: 'currentPeriodStart', type: 'date', required: true },
    { name: 'currentPeriodEnd', type: 'date', required: true },
    { name: 'trialEnd', type: 'date' },
    { name: 'graceEnd', type: 'date' },
    { name: 'cancelAtPeriodEnd', type: 'checkbox', defaultValue: false },
    { name: 'settings', type: 'json', defaultValue: {} },
    { name: 'version', type: 'number', required: true, defaultValue: 1 },
    { name: 'lastEventSequence', type: 'number' },
    { name: 'lastEventOccurredAt', type: 'date' },
    { name: 'lastReconciledAt', type: 'date' },
    { name: 'checkoutKey', type: 'text', unique: true, index: true },
    { name: 'failure', type: 'json' },
  ],
}

export const SubscriptionEvents: CollectionConfig = {
  ...base('subscription-events', 'eventKey'),
  access: { create: () => false, delete: () => false, read: staff, update: () => false },
  fields: [
    ...ownerFields(),
    ref('subscription', 'subscriptions', true),
    { name: 'eventKey', type: 'text', required: true, unique: true, index: true },
    { name: 'providerEventId', type: 'text', index: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'evidence', type: 'json', defaultValue: {} },
  ],
}

export const DigitalDeliveryGrants: CollectionConfig = {
  ...base('digital-delivery-grants', 'id'),
  fields: [
    ...ownerFields(),
    ref('product', 'products', true),
    { name: 'variantSku', type: 'text', required: true },
    ref('entitlement', 'entitlements', true),
    ref('member', 'members'),
    ref('mediaAsset', 'media-assets', true),
    { name: 'grantKeyHash', type: 'text', required: true, unique: true, index: true },
    { name: 'downloadLimit', type: 'number', min: 1 },
    { name: 'downloadCount', type: 'number', min: 0, defaultValue: 0, required: true },
    { name: 'expiresAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'lastDownloadedAt', type: 'date' },
  ],
}

export const DigitalDownloadEvents: CollectionConfig = {
  ...base('digital-download-events', 'id'),
  access: { create: staff, delete: () => false, read: staff, update: () => false },
  fields: [
    ...ownerFields(),
    ref('grant', 'digital-delivery-grants', true),
    ref('mediaAsset', 'media-assets', true),
    { name: 'occurredAt', type: 'date', required: true },
    { name: 'outcome', type: 'select', required: true, options: ['allowed', 'denied'] },
    { name: 'reason', type: 'text' },
    { name: 'requestFingerprint', type: 'text', required: true },
  ],
}

export const CatalogImportRuns: CollectionConfig = {
  ...base('catalog-import-runs', 'checksum'),
  fields: [
    ...ownerFields(),
    { name: 'checksum', type: 'text', required: true, index: true },
    { name: 'mode', type: 'select', required: true, options: ['dry-run', 'apply'] },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: ['planned', 'applied', 'replayed', 'rejected'],
    },
    { name: 'source', type: 'text', required: true },
    { name: 'summary', type: 'json', required: true },
    { name: 'appliedAt', type: 'date' },
  ],
  indexes: [{ fields: ['site', 'checksum', 'mode'], unique: true }],
}

export const PodConnections: CollectionConfig = {
  ...base('pod-connections', 'label'),
  fields: [
    ...ownerFields(),
    { name: 'providerKey', type: 'text', required: true },
    { name: 'label', type: 'text', required: true },
    { name: 'remoteStoreId', type: 'text' },
    { name: 'remoteStoreName', type: 'text' },
    {
      name: 'encryptedApiKey',
      type: 'text',
      required: true,
      admin: {
        description: 'Encrypted credential envelope; never display or store plaintext secrets.',
      },
    },
    { name: 'encryptedWebhookSecret', type: 'text' },
    select('status', ['active', 'degraded', 'disabled'], 'active'),
    { name: 'capabilities', type: 'json', defaultValue: {} },
    { name: 'lastHealthCheckedAt', type: 'date' },
    { name: 'lastHealthStatus', type: 'text' },
    { name: 'lastHealthReason', type: 'text' },
    { name: 'disabledReason', type: 'text' },
  ],
}

export const PodJobs: CollectionConfig = {
  ...base('pod-jobs', 'idempotencyKey'),
  fields: [
    ...ownerFields(),
    ref('order', 'orders', true),
    ref('connection', 'pod-connections'),
    { name: 'providerKey', type: 'text', required: true },
    { name: 'packageIndex', type: 'number', required: true, defaultValue: 0 },
    { name: 'idempotencyKey', type: 'text', required: true, unique: true, index: true },
    { name: 'payloadHash', type: 'text', required: true },
    select(
      'state',
      [
        'created',
        'on_hold',
        'submitting',
        'submitted',
        'in_production',
        'partially_shipped',
        'shipped',
        'delivered',
        'cancelled',
        'failed',
        'exception',
        'returned',
      ],
      'created',
    ),
    select('addressPolicy', ['domestic', 'international', 'po-box-rejected'], 'domestic'),
    { name: 'recipientSnapshot', type: 'json', required: true },
    { name: 'itemsSnapshot', type: 'json', required: true },
    { name: 'costSnapshot', type: 'json', required: true },
    { name: 'attemptCount', type: 'number', required: true, defaultValue: 0 },
    { name: 'externalOrderId', type: 'text', index: true },
    { name: 'holdExpiresAt', type: 'date' },
    { name: 'releasedAt', type: 'date' },
    { name: 'auditTrail', type: 'json', defaultValue: [] },
    { name: 'lastError', type: 'text' },
    ref('parentJob', 'pod-jobs'),
  ],
}

export const ManualFulfillmentPackages: CollectionConfig = {
  ...base('manual-fulfillment-packages', 'id'),
  fields: [
    ...ownerFields(),
    ref('order', 'orders', true),
    { name: 'packageIndex', type: 'number', required: true, defaultValue: 0 },
    { name: 'source', type: 'text', required: true },
    select(
      'status',
      ['pending_acknowledgement', 'acknowledged', 'in_production', 'shipped', 'cancelled'],
      'pending_acknowledgement',
    ),
    { name: 'approvedLines', type: 'json', required: true },
    { name: 'permissionedAddressManifest', type: 'json', required: true },
    { name: 'instructions', type: 'textarea' },
    { name: 'acknowledgement', type: 'json' },
    { name: 'externalFulfillment', type: 'json' },
    { name: 'auditTrail', type: 'json', defaultValue: [] },
  ],
}
