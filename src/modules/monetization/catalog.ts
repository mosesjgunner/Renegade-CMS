/**
 * RC3-CE Provider Catalog (CE-04, contract §5 + Appendix A).
 *
 * Descriptive data, versioned with the code. Every entry records what
 * was verified from the provider's own public documentation on the
 * checked date — it is NOT a claim that Renegade holds an account,
 * approval or live access. The five status dimensions (integration
 * mode, evidence, connection health, program eligibility, commercial
 * authority) are deliberately separate fields: a catalog entry can
 * never make a provider look "connected" or "approved".
 *
 * Eligibility figures quoted from providers are recorded as provider
 * claims with a recheck prompt; where a provider's own public pages
 * conflict (Mediavine), the conflict itself is the recorded fact.
 */

import { ADVERTISING_CATALOG, SPONSORSHIP_CATALOG } from './catalog-sponsorship'
import { EXTERNAL_PLATFORM_CATALOG, LICENSING_CATALOG } from './catalog-external'

export type IntegrationMode =
  | 'native-verified'
  | 'native-tested'
  | 'manual-import'
  | 'external-workflow'
  | 'partner-required'
export type EvidenceLevel = 'spec-only' | 'mock-tested' | 'sandbox-tested' | 'live-verified'
export type ProviderFamily =
  | 'affiliate'
  | 'sponsorship'
  | 'advertising'
  | 'licensing'
  | 'payments'
  | 'external-membership'
  | 'external-commerce'

export type ProviderCapability =
  | 'link-generate'
  | 'catalog-read'
  | 'approval-check'
  | 'click-report'
  | 'conversion-report'
  | 'payout-report'
  | 'placement-publish'
  | 'ad-delivery'
  | 'impression-report'
  | 'booking-read'
  | 'inventory-publish'
  | 'creative-approve'
  | 'asset-export'
  | 'license-order'
  | 'royalty-report'
  | 'webhook-ingest'
  | 'csv-import'
  | 'manual-record'
  | 'oauth-connect'
  | 'account-key-connect'
  | 'external-application'

export type ProviderCatalogEntry = Readonly<{
  id: string
  name: string
  family: ProviderFamily
  aliases: readonly string[]
  capabilities: readonly ProviderCapability[]
  integrationMode: IntegrationMode
  evidence: EvidenceLevel
  authMode: 'oauth' | 'account-key' | 'manual' | 'none'
  prerequisites: string
  fallback: string
  docsUrl: string
  documentationCheckedDate: string
  caveats: string
}>

const CHECKED = '2026-11-22'

const entry = (e: ProviderCatalogEntry): ProviderCatalogEntry => e

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  // ---- R6 affiliate / referral ----
  entry({
    id: 'amazon-associates',
    name: 'Amazon Associates',
    family: 'affiliate',
    aliases: ['amazon', 'creators-api', 'pa-api'],
    capabilities: [
      'link-generate',
      'catalog-read',
      'conversion-report',
      'csv-import',
      'manual-record',
    ],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'account-key',
    prerequisites:
      'Approved Associates account per marketplace; Creators API credentials are the creator\u2019s own.',
    fallback: 'Manually supplied tagged product links and commission report import always work.',
    docsUrl:
      'https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi',
    documentationCheckedDate: CHECKED,
    caveats:
      'Legacy Product Advertising API 5.0 is deprecated; the Creators API replaces it. Program Content rules restrict price display/caching; no price scraping.',
  }),
  entry({
    id: 'impact',
    name: 'impact.com',
    family: 'affiliate',
    aliases: ['impact.com', 'impact radius'],
    capabilities: [
      'link-generate',
      'conversion-report',
      'payout-report',
      'csv-import',
      'manual-record',
    ],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'account-key',
    prerequisites:
      'Creator\u2019s own partner account; each brand relationship and API permission is separate.',
    fallback: 'Action-level report import.',
    docsUrl:
      'https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/reporting-for-partners/advanced-action-listing-report-for-partners',
    documentationCheckedDate: CHECKED,
    caveats:
      'Rakuten\u2019s transition to impact.com can leave a creator on both systems; imports dedupe across the pair rather than summing.',
  }),
  entry({
    id: 'awin',
    name: 'Awin',
    family: 'affiliate',
    aliases: ['affiliate window'],
    capabilities: [
      'link-generate',
      'conversion-report',
      'payout-report',
      'csv-import',
      'manual-record',
    ],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'account-key',
    prerequisites: 'Creator\u2019s own Awin publisher account.',
    fallback: 'Performance/transaction report import.',
    docsUrl: 'https://help.awin.com/apidocs/introduction-to-awins-apis',
    documentationCheckedDate: CHECKED,
    caveats: 'Successor destination for legacy ShareASale accounts.',
  }),
  entry({
    id: 'cj-affiliate',
    name: 'CJ Affiliate',
    family: 'affiliate',
    aliases: ['cj', 'commission junction'],
    capabilities: ['link-generate', 'conversion-report', 'csv-import', 'manual-record'],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'account-key',
    prerequisites: 'Creator\u2019s own CJ publisher account and accepted advertiser relationships.',
    fallback: 'Commission report import.',
    docsUrl: 'https://docs.cj.com/docs/pub-commissiondetail-api',
    documentationCheckedDate: CHECKED,
    caveats:
      'Commission Detail is a GraphQL API; an adapter exists as tested fixtures only until a real account authorizes live reads.',
  }),
  entry({
    id: 'rakuten-advertising',
    name: 'Rakuten Advertising',
    family: 'affiliate',
    aliases: ['rakuten', 'linkshare'],
    capabilities: ['link-generate', 'conversion-report', 'csv-import', 'manual-record'],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites: 'Creator\u2019s own Rakuten publisher account.',
    fallback: 'Publisher report import with migration-aware identity mapping to impact.com.',
    docsUrl:
      'https://pubhelp.rakutenadvertising.com/hc/en-us/articles/360061521052-Run-Reports-Via-API',
    documentationCheckedDate: CHECKED,
    caveats:
      'Transitional state with impact.com; the same commission must never be counted from both systems.',
  }),
  entry({
    id: 'partnerstack',
    name: 'PartnerStack',
    family: 'affiliate',
    aliases: [],
    capabilities: [
      'link-generate',
      'conversion-report',
      'payout-report',
      'webhook-ingest',
      'csv-import',
    ],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites:
      'Partner account per program; Partner API/postbacks only where the program authorizes them.',
    fallback: 'Report import.',
    docsUrl:
      'https://support.partnerstack.com/hc/en-us/articles/31444178237587-Using-the-Partner-API-and-Postbacks',
    documentationCheckedDate: CHECKED,
    caveats:
      'SaaS recurring commissions are a different shape from single-sale commissions; evidence states keep them distinct.',
  }),
  entry({
    id: 'ebay-partner-network',
    name: 'eBay Partner Network',
    family: 'affiliate',
    aliases: ['epn'],
    capabilities: ['link-generate', 'catalog-read', 'conversion-report', 'csv-import'],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites: 'EPN affiliate campaign account.',
    fallback: 'Manual EPN links and report import.',
    docsUrl: 'https://developer.ebay.com/api-docs/buy/api-browse.html',
    documentationCheckedDate: CHECKED,
    caveats: 'Browse API returns itemAffiliateWebUrl when called with an affiliate campaign id.',
  }),
  entry({
    id: 'sovrn-commerce',
    name: 'Sovrn Commerce',
    family: 'affiliate',
    aliases: ['sovrn', 'viglink'],
    capabilities: ['link-generate', 'conversion-report', 'csv-import'],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites: 'Sovrn account; software/app usage may require approval.',
    fallback: 'Transaction report import.',
    docsUrl: 'https://developer.sovrn.com/reference/building-affiliate-links',
    documentationCheckedDate: CHECKED,
    caveats:
      'Separate product from Sovrn Advertising. Automatic link monetization is explicit opt-in only, never a default.',
  }),
  entry({
    id: 'skimlinks',
    name: 'Skimlinks',
    family: 'affiliate',
    aliases: [],
    capabilities: ['link-generate', 'conversion-report', 'csv-import'],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites: 'Site approval by Skimlinks; revenue-share terms apply.',
    fallback: 'Reporting API data via report import.',
    docsUrl: 'https://support.skimlinks.com/hc/en-us/articles/223835348-What-is-the-Reporting-API',
    documentationCheckedDate: CHECKED,
    caveats:
      'Link transformation policies are the provider\u2019s; Renegade never rewrites a creator\u2019s own tagged links.',
  }),
  entry({
    id: 'clickbank',
    name: 'ClickBank',
    family: 'affiliate',
    aliases: [],
    capabilities: ['link-generate', 'conversion-report', 'csv-import', 'manual-record'],
    integrationMode: 'manual-import',
    evidence: 'spec-only',
    authMode: 'account-key',
    prerequisites: 'ClickBank account.',
    fallback: 'Referral links plus report import.',
    docsUrl: 'https://support.clickbank.com/en/articles/10535400-clickbank-apis',
    documentationCheckedDate: CHECKED,
    caveats:
      'Strong product-quality and regulated-claim controls; offers in regulated categories need policy review before promotion.',
  }),
  entry({
    id: 'walmart-creator',
    name: 'Walmart Creator',
    family: 'affiliate',
    aliases: [],
    capabilities: ['manual-record', 'csv-import', 'external-application'],
    integrationMode: 'external-workflow',
    evidence: 'spec-only',
    authMode: 'manual',
    prerequisites: 'Official program enrollment.',
    fallback: 'Manual links and report import.',
    docsUrl: 'https://creator.walmart.com/',
    documentationCheckedDate: CHECKED,
    caveats:
      'No public general-purpose creator-earnings API was established in the source research.',
  }),
  entry({
    id: 'shopify-collabs',
    name: 'Shopify Collabs',
    family: 'affiliate',
    aliases: ['collabs'],
    capabilities: ['manual-record', 'external-application'],
    integrationMode: 'external-workflow',
    evidence: 'spec-only',
    authMode: 'manual',
    prerequisites: 'Creator Collabs account and brand invitations.',
    fallback: 'Manual codes/links recorded as external evidence.',
    docsUrl: 'https://help.shopify.com/en/manual/promoting-marketing/collabs/creators',
    documentationCheckedDate: CHECKED,
    caveats:
      'Collabs is NOT the Shopify Admin API; merchant app scopes do not authorize creator Collabs data.',
  }),
  entry({
    id: 'tiktok-shop-affiliate',
    name: 'TikTok Shop Affiliate',
    family: 'affiliate',
    aliases: ['tiktok shop'],
    capabilities: ['manual-record', 'csv-import', 'external-application'],
    integrationMode: 'external-workflow',
    evidence: 'spec-only',
    authMode: 'manual',
    prerequisites: 'Platform and geography-specific program eligibility.',
    fallback: 'Enrollment checklist plus supported report import.',
    docsUrl: 'https://seller-us.tiktok.com/university/essay?knowledge_id=6939143037667118',
    documentationCheckedDate: CHECKED,
    caveats: 'No blanket external account revenue API is promised.',
  }),
  entry({
    id: 'shareasale-legacy',
    name: 'ShareASale (legacy)',
    family: 'affiliate',
    aliases: ['shareasale', 'sas'],
    capabilities: ['csv-import', 'manual-record'],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'manual',
    prerequisites: 'Historical records only.',
    fallback: 'Read-only import and migration assistance to Awin.',
    docsUrl: 'https://help.awin.com/docs/post-upgrade-checklist-sas',
    documentationCheckedDate: CHECKED,
    caveats:
      'Platform closed October 6, 2025. The legacy enum/alias is preserved so historical records stay legible; new onboarding routes to Awin.',
  }),
  entry({
    id: 'direct-brand-referral',
    name: 'Direct brand referral',
    family: 'affiliate',
    aliases: ['direct referral'],
    capabilities: ['link-generate', 'manual-record', 'webhook-ingest', 'csv-import'],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'manual',
    prerequisites: 'A direct agreement with the brand.',
    fallback: 'Tracked coupon/deep link plus signed brand report or manual revenue confirmation.',
    docsUrl:
      'https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking',
    documentationCheckedDate: CHECKED,
    caveats:
      'An onsite click is never a third-party conversion; only brand-reported or manually confirmed evidence counts.',
  }),
  entry({
    id: 'generic-affiliate-import',
    name: 'Generic affiliate CSV/API',
    family: 'affiliate',
    aliases: ['generic import'],
    capabilities: ['csv-import', 'manual-record', 'conversion-report'],
    integrationMode: 'manual-import',
    evidence: 'mock-tested',
    authMode: 'manual',
    prerequisites: 'Creator supplies valid report data and a column mapping.',
    fallback: 'The generic mapping import is the fallback for every long-tail program.',
    docsUrl:
      'https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking',
    documentationCheckedDate: CHECKED,
    caveats:
      'Imported figures keep their provider-original states; a repeat import never changes totals.',
  }),
  entry({
    id: 'ltk-specialty',
    name: 'LTK / specialty creator networks',
    family: 'affiliate',
    aliases: ['ltk', 'rewardstyle'],
    capabilities: ['manual-record', 'external-application'],
    integrationMode: 'external-workflow',
    evidence: 'spec-only',
    authMode: 'manual',
    prerequisites: 'Program acceptance.',
    fallback: 'External workflow and authorized export only.',
    docsUrl: 'https://company.shopltk.com/',
    documentationCheckedDate: CHECKED,
    caveats:
      'No guaranteed general API; treated as documentation-only until integration rights are verified.',
  }),
]

/** The full catalog across families. Counts are reported by mode and evidence, never as "integrations". */
export const ALL_PROVIDERS: readonly ProviderCatalogEntry[] = [
  ...PROVIDER_CATALOG,
  ...SPONSORSHIP_CATALOG,
  ...ADVERTISING_CATALOG,
  ...LICENSING_CATALOG,
  ...EXTERNAL_PLATFORM_CATALOG,
]

export function findProvider(idOrAlias: string): ProviderCatalogEntry | undefined {
  const needle = idOrAlias.trim().toLowerCase()
  return ALL_PROVIDERS.find(
    (p) => p.id === needle || p.aliases.some((a) => a.toLowerCase() === needle),
  )
}

export function catalogCounts(): Readonly<{
  total: number
  byMode: Readonly<Record<string, number>>
  byEvidence: Readonly<Record<string, number>>
}> {
  const byMode: Record<string, number> = {}
  const byEvidence: Record<string, number> = {}
  for (const p of ALL_PROVIDERS) {
    byMode[p.integrationMode] = (byMode[p.integrationMode] ?? 0) + 1
    byEvidence[p.evidence] = (byEvidence[p.evidence] ?? 0) + 1
  }
  return { total: ALL_PROVIDERS.length, byMode, byEvidence }
}
