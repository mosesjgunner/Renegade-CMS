import type { CollectionConfig, Field } from 'payload'
import {
  operatorSiteCreateAccess,
  operatorSiteReadAccess,
  operatorSiteUpdateAccess,
} from '../modules/operations/operator-grants'
import { ownerFields } from './canonical-shared'

/**
 * RC3-CE — Creator Earnings Engine storage.
 *
 * Additive collections only. Canonical money truth stays in Commerce
 * (products, orders, payment intents, refunds, subscriptions,
 * entitlements, affiliate commission ledgers); these collections hold
 * the monetization layer the contract adds on top: profiles, provider
 * connections, external revenue evidence, sponsorships, representation
 * agreements, first-party ad placements, rights/licensing and service
 * bookings. Every record is site-scoped through the shared owner
 * fields, and money is always integer minor units stored as text —
 * never floating point, never summed across currencies or sources.
 */
const base = (slug: string, title: string): CollectionConfig => ({
  slug,
  lockDocuments: false,
  admin: { useAsTitle: title, group: 'Monetization' },
  access: {
    create: operatorSiteCreateAccess,
    delete: operatorSiteReadAccess,
    read: operatorSiteReadAccess,
    update: operatorSiteUpdateAccess,
  },
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
const text = (name: string, required = false): Field =>
  ({ name, type: 'text', required, index: true }) as Field
const minor = (name: string): Field =>
  ({
    name,
    type: 'text',
    admin: {
      description: 'Integer minor units as a decimal string; empty means unknown, never zero.',
    },
  }) as Field

export const MonetizationProfiles: CollectionConfig = {
  ...base('monetization-profiles', 'site'),
  fields: [
    ...ownerFields(),
    select('status', ['not-started', 'in-progress', 'active', 'paused'], 'not-started'),
    select(
      'sellerOfRecordMode',
      ['self-hosted-direct', 'managed-direct', 'creator-invoiced', 'agency-invoiced'],
      'self-hosted-direct',
    ),
    { name: 'railsEnabled', type: 'json', defaultValue: {} },
    { name: 'preferences', type: 'json', defaultValue: {} },
    { name: 'categoryExclusions', type: 'json', defaultValue: [] },
    { name: 'maxAdLoadPercent', type: 'number' },
    { name: 'networkOptIn', type: 'json', defaultValue: {} },
    text('taxDisclosureVersion'),
    text('consentVersion'),
  ],
  indexes: [{ fields: ['site'], unique: true }],
}

export const ProviderConnections: CollectionConfig = {
  ...base('provider-connections', 'providerId'),
  fields: [
    ...ownerFields(),
    text('providerId', true),
    text('accountRef'),
    {
      name: 'credentialReference',
      type: 'text',
      admin: {
        description: 'Secret-manager reference only; never store provider credentials in Payload.',
      },
    },
    select(
      'status',
      [
        'not-configured',
        'awaiting-provider',
        'connected',
        'expired',
        'denied',
        'error',
        'disconnected',
      ],
      'not-configured',
    ),
    { name: 'grantedScopes', type: 'json', defaultValue: [] },
    { name: 'evidenceByCapability', type: 'json', defaultValue: {} },
    { name: 'lastSuccessAt', type: 'date' },
    { name: 'expiresAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    text('authorizedPurpose'),
    text('lastError'),
  ],
  indexes: [{ fields: ['site', 'providerId', 'accountRef'], unique: true }],
}

export const ExternalRevenueEvidence: CollectionConfig = {
  ...base('external-revenue-evidence', 'providerEventId'),
  fields: [
    ...ownerFields(),
    text('providerId', true),
    text('accountRef'),
    text('programRef'),
    text('providerEventId', true),
    text('sourceHash'),
    select('sourceType', ['api', 'csv', 'manual'], 'manual'),
    select(
      'status',
      [
        'reported-estimated',
        'reported-pending',
        'approved',
        'cleared',
        'settled',
        'payout-reported',
        'payout-confirmed',
        'denied',
        'reversed',
        'corrected',
        'disputed',
      ],
      'reported-estimated',
    ),
    text('originalStatus'),
    text('currency', true),
    minor('grossMinor'),
    minor('commissionMinor'),
    minor('feesMinor'),
    minor('netMinor'),
    { name: 'isEstimated', type: 'checkbox', defaultValue: true },
    text('reversalRef'),
    text('payoutRef'),
    text('mappingVersion', true),
    { name: 'sourceTimestamp', type: 'date' },
    { name: 'importedAt', type: 'date' },
    { name: 'lastConfirmedAt', type: 'date' },
  ],
  indexes: [{ fields: ['site', 'providerId', 'providerEventId'], unique: true }],
}

export const SponsorAdvertisers: CollectionConfig = {
  ...base('sponsor-advertisers', 'name'),
  fields: [
    ...ownerFields(),
    text('name', true),
    text('contactName'),
    text('contactEmail'),
    text('website'),
    select('status', ['active', 'blocked'], 'active'),
    { name: 'notes', type: 'textarea' },
  ],
}

export const SponsorInventory: CollectionConfig = {
  ...base('sponsor-inventory', 'name'),
  fields: [
    ...ownerFields(),
    text('name', true),
    select('surface', ['web', 'newsletter', 'podcast', 'video', 'live', 'event', 'bundle'], 'web'),
    text('placementKey'),
    { name: 'unitsTotal', type: 'number' },
    minor('rateMinor'),
    text('currency', true),
    select('pricingModel', ['flat', 'cpm', 'cpa', 'hybrid'], 'flat'),
    { name: 'availableFrom', type: 'date' },
    { name: 'availableTo', type: 'date' },
    select('status', ['draft', 'open', 'held', 'sold-out', 'archived'], 'draft'),
    { name: 'audienceSnapshot', type: 'json', defaultValue: {} },
    { name: 'exclusions', type: 'json', defaultValue: [] },
  ],
}

export const SponsorBookings: CollectionConfig = {
  ...base('sponsor-bookings', 'state'),
  fields: [
    ...ownerFields(),
    ref('inventory', 'sponsor-inventory', true),
    ref('advertiser', 'sponsor-advertisers', true),
    select(
      'state',
      [
        'inquiry',
        'draft-proposal',
        'tentative',
        'approved',
        'scheduled',
        'delivered',
        'proof-review',
        'invoiced',
        'collected',
        'allocated',
        'cancelled',
        'makegood',
        'disputed',
        'refunded',
      ],
      'inquiry',
    ),
    minor('priceMinor'),
    text('currency', true),
    text('ioVersion'),
    { name: 'creativeVersions', type: 'json', defaultValue: [] },
    select('creativeStatus', ['none', 'submitted', 'approved', 'rejected'], 'none'),
    { name: 'proof', type: 'json', defaultValue: {} },
    select('invoiceState', ['none', 'created', 'sent', 'paid', 'overdue', 'void'], 'none'),
    minor('collectedMinor'),
    ref('representationAgreement', 'representation-agreements'),
    minor('agencyFeeMinor'),
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    { name: 'holdExpiresAt', type: 'date' },
    { name: 'notes', type: 'textarea' },
  ],
}

export const RepresentationAgreements: CollectionConfig = {
  ...base('representation-agreements', 'version'),
  fields: [
    ...ownerFields(),
    text('version', true),
    select('status', ['draft', 'offered', 'active', 'revoked', 'expired'], 'draft'),
    { name: 'commissionBasisBps', type: 'number' },
    { name: 'carveouts', type: 'json', defaultValue: [] },
    { name: 'exclusions', type: 'json', defaultValue: [] },
    { name: 'territory', type: 'json', defaultValue: [] },
    { name: 'signedAt', type: 'date' },
    { name: 'revokedAt', type: 'date' },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
  ],
}

export const AdPlacements: CollectionConfig = {
  ...base('ad-placements', 'name'),
  fields: [
    ...ownerFields(),
    text('name', true),
    select(
      'slot',
      ['web-header', 'web-in-content', 'web-sidebar', 'newsletter-block', 'video-static'],
      'web-in-content',
    ),
    select('kind', ['house', 'direct-sold', 'provider-tag'], 'house'),
    ref('booking', 'sponsor-bookings'),
    text('providerId'),
    text('tagReference'),
    { name: 'content', type: 'json', defaultValue: {} },
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    { name: 'frequencyCapPerDay', type: 'number' },
    { name: 'categoryExclusions', type: 'json', defaultValue: [] },
    { name: 'excludePaidContent', type: 'checkbox', defaultValue: true },
    { name: 'requiresConsent', type: 'checkbox', defaultValue: false },
    select('status', ['draft', 'active', 'paused', 'ended'], 'draft'),
  ],
}

export const AdDeliveries: CollectionConfig = {
  ...base('ad-deliveries', 'slot'),
  fields: [
    ...ownerFields(),
    ref('placement', 'ad-placements', true),
    text('slot', true),
    select('kind', ['house', 'direct-sold', 'provider-tag'], 'house'),
    text('reason'),
    { name: 'context', type: 'json', defaultValue: {} },
    { name: 'deliveredAt', type: 'date' },
  ],
}

export const RightsRecords: CollectionConfig = {
  ...base('rights-records', 'fingerprint'),
  fields: [
    ...ownerFields(),
    ref('mediaAsset', 'media-assets'),
    text('fingerprint', true),
    select(
      'basis',
      [
        'original',
        'commissioned',
        'assignment',
        'licensed-in',
        'public-domain',
        'mixed',
        'unclear',
      ],
      'unclear',
    ),
    { name: 'holders', type: 'json', defaultValue: [] },
    { name: 'releases', type: 'json', defaultValue: {} },
    { name: 'grantable', type: 'json', defaultValue: {} },
    { name: 'restrictions', type: 'json', defaultValue: {} },
    select('status', ['draft', 'ready', 'blocked', 'withdrawn'], 'draft'),
    { name: 'expiresAt', type: 'date' },
    { name: 'aiTdmOptIn', type: 'checkbox', defaultValue: false },
    text('aiTdmTermsVersion'),
  ],
  indexes: [{ fields: ['site', 'fingerprint'], unique: true }],
}

export const LicenseOffers: CollectionConfig = {
  ...base('license-offers', 'name'),
  fields: [
    ...ownerFields(),
    ref('rightsRecord', 'rights-records', true),
    ref('product', 'products'),
    text('name', true),
    { name: 'terms', type: 'json', defaultValue: {} },
    minor('priceMinor'),
    text('currency', true),
    select('status', ['draft', 'active', 'paused', 'withdrawn'], 'draft'),
    text('agreementVersion', true),
  ],
}

export const LicenseGrants: CollectionConfig = {
  ...base('license-grants', 'agreementVersion'),
  fields: [
    ...ownerFields(),
    ref('offer', 'license-offers', true),
    ref('order', 'orders'),
    text('buyerName'),
    text('buyerEmail'),
    text('agreementVersion', true),
    text('fingerprint', true),
    { name: 'termsSnapshot', type: 'json', defaultValue: {} },
    select('status', ['issued', 'delivered', 'expired', 'revoked', 'disputed'], 'issued'),
    { name: 'issuedAt', type: 'date' },
    { name: 'deliveredAt', type: 'date' },
    { name: 'expiresAt', type: 'date' },
    text('deliveryTokenHash'),
  ],
}

export const ServiceSlots: CollectionConfig = {
  ...base('service-slots', 'startsAt'),
  fields: [
    ...ownerFields(),
    ref('product', 'products', true),
    { name: 'startsAt', type: 'date' },
    { name: 'endsAt', type: 'date' },
    text('timezone'),
    { name: 'capacity', type: 'number' },
    { name: 'bookedCount', type: 'number', defaultValue: 0 },
    select('status', ['open', 'closed', 'cancelled'], 'open'),
  ],
}

export const ServiceBookings: CollectionConfig = {
  ...base('service-bookings', 'state'),
  fields: [
    ...ownerFields(),
    ref('slot', 'service-slots', true),
    ref('product', 'products', true),
    ref('order', 'orders'),
    text('buyerName'),
    text('buyerEmail'),
    { name: 'seats', type: 'number' },
    select('state', ['reserved', 'confirmed', 'fulfilled', 'cancelled', 'refunded'], 'reserved'),
    { name: 'notes', type: 'textarea' },
  ],
}

export const DistributionSubmissions: CollectionConfig = {
  ...base('distribution-submissions', 'providerId'),
  fields: [
    ...ownerFields(),
    text('providerId', true),
    ref('rightsRecord', 'rights-records'),
    text('contentRef'),
    text('exportChecksum'),
    select(
      'status',
      ['prepared', 'submitted', 'accepted', 'denied', 'withdrawn', 'exclusive-conflict'],
      'prepared',
    ),
    { name: 'submittedAt', type: 'date' },
    { name: 'notes', type: 'textarea' },
  ],
}

export const monetizationCollections = [
  MonetizationProfiles,
  ProviderConnections,
  ExternalRevenueEvidence,
  SponsorAdvertisers,
  SponsorInventory,
  SponsorBookings,
  RepresentationAgreements,
  AdPlacements,
  AdDeliveries,
  RightsRecords,
  LicenseOffers,
  LicenseGrants,
  ServiceSlots,
  ServiceBookings,
  DistributionSubmissions,
]
