import type { LayoutBlock, PageLayout, PresentationField } from '../public/page-builder'
import type { ThemeId } from '../public/contracts'

export type StarterId = 'publication-community' | 'campaign-commerce'

export type StarterMediaDef = {
  id: string
  title: string
  originalFilename: string
  mimeType: string
  kind: 'image' | 'cover' | 'thumbnail' | 'graphic'
  altText: string
  description: string
  creatorCredit: string
  licenseType: 'creative-commons' | 'owned' | 'public-domain'
  governanceEnabled: boolean
  localAssetPath: string
  width: number
  height: number
  aspectRatio: number
}

export type StarterArticleDef = {
  title: string
  slug: string
  canonicalPath: string
  summary: string
  body: string
  tags: string[]
  publishedAt: string
  commentsPolicy: 'open' | 'closed'
}

export type StarterPageDef = {
  title: string
  slug: string
  canonicalPath: string
  summary: string
  body: string
  status: 'published' | 'draft'
}

export type StarterProductDef = {
  name: string
  slug: string
  canonicalPath: string
  summary: string
  description: string
  kind: 'physical'
  priceMinor: string
  currency: string
  sku: string
  weightGrams: number
  mediaAssetId?: string
  inventoryQuantity: number
}

export type StarterDonationCampaignDef = {
  title: string
  slug: string
  purpose: string
  goalMinor: string
  currency: string
  suggestedTiersMinor: string[]
  complianceDisclosure: string
}

export type StarterMemberDef = {
  email: string
  displayName: string
  handle: string
  bio: string
  roleTitle: string
}

export type StarterLayoutDef = {
  path: string
  name: string
  surface: 'page' | 'template' | 'pattern' | 'global'
  slot: 'main' | 'header' | 'footer' | 'announcement' | 'cta'
  category?: string
  blocks: LayoutBlock[]
  status: 'published' | 'draft'
}

export type StarterDefinition = {
  id: StarterId
  name: string
  archetype: 'publication' | 'campaign'
  version: string
  themeId: ThemeId
  description: string
  summary: string
  features: string[]
  navigation: {
    primary: Array<{ label: string; href: string }>
    footer: Array<{ label: string; href: string }>
  }
  siteSettings: {
    siteName: string
    siteDescription: string
    footerText: string
    themeId: ThemeId
    themeTokens?: Record<string, string>
  }
  media: StarterMediaDef[]
  pages: StarterPageDef[]
  articles: StarterArticleDef[]
  members: StarterMemberDef[]
  templates: StarterLayoutDef[]
  patterns: StarterLayoutDef[]
  globals: StarterLayoutDef[]
  layouts: StarterLayoutDef[]
  products?: StarterProductDef[]
  donationCampaign?: StarterDonationCampaignDef
}

export type StarterInstallStatus = {
  installed: boolean
  starterId?: StarterId
  version?: string
  siteId: string
  installedAt?: string
  upgradable: boolean
  availableUpgradeVersion?: string
  stats: {
    pagesCount: number
    articlesCount: number
    templatesCount: number
    patternsCount: number
    globalsCount: number
    productsCount: number
    donationsCount: number
  }
}
