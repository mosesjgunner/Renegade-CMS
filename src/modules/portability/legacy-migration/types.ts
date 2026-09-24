import type { LayoutBlock } from '../../public/page-builder'

/** Pipeline stage lifecycle */
export type PipelineStage =
  | 'inspect'
  | 'parse'
  | 'map'
  | 'dry-run'
  | 'imported'
  | 'verified'
  | 'activated'
  | 'rolled-back'
  | 'failed'

/** Safe Theme Export Mapping supplied with or derived from legacy site */
export type LegacyThemeMapping = {
  themeId?: string
  tokens?: {
    canvas?: string
    surface?: string
    ink?: string
    brand?: string
    accent?: string
    fontFamily?: string
    borderRadius?: string
    spacing?: 'compact' | 'normal' | 'relaxed'
  }
  header?: {
    siteTitle?: string
    logoUrl?: string
    navigationMenuName?: string
  }
  footer?: {
    copyrightText?: string
    columns?: Array<{ title: string; links: Array<{ label: string; href: string }> }>
  }
  templateMapping?: {
    defaultPostTemplate?: string
    defaultPageTemplate?: string
  }
}

/** Migration options supplied by operator */
export type LegacyMigrationOptions = {
  remoteMediaDownloadAllowed?: boolean
  targetSiteMode?: 'new-isolated-site' | 'existing-site'
  targetSiteId?: string
  newSiteName?: string
  newSiteSlug?: string
  actorId?: string
  themeId?: string
  dryRun?: boolean
  autoActivate?: boolean
}

/** Complete input package for legacy migration */
export type LegacySitePackage = {
  wxr: string
  themeMapping?: LegacyThemeMapping
  capturedHtml?: Record<string, string>
  mediaFiles?: Record<string, { buffer: Buffer; fileName: string; mimeType?: string }>
  options?: Partial<LegacyMigrationOptions>
}

/** Normalized author from WXR */
export type NormalizedAuthor = {
  id: string
  login: string
  email: string
  displayName: string
  firstName?: string
  lastName?: string
}

/** Normalized taxonomy term (category or tag) */
export type NormalizedTaxonomy = {
  id: string
  name: string
  slug: string
  taxonomy: 'category' | 'tag'
  parentSlug?: string
  description?: string
}

/** Normalized media attachment */
export type NormalizedMedia = {
  id: string
  title: string
  sourceUrl: string
  localPath?: string
  fileName: string
  mimeType?: string
  caption?: string
  altText?: string
  width?: number
  height?: number
  sha256?: string
}

/** Normalized menu item */
export type NormalizedMenuItem = {
  id: string
  title: string
  url: string
  targetSlug?: string
  order: number
  parentId?: string
  classes?: string[]
}

/** Normalized menu structure */
export type NormalizedMenu = {
  name: string
  slug: string
  items: NormalizedMenuItem[]
}

/** SEO metadata extracted from recognized exports */
export type ExtractedSeo = {
  metaTitle?: string
  metaDescription?: string
  canonicalUrl?: string
  ogTitle?: string
  ogDescription?: string
  noindex?: boolean
}

/** Unsupported artifact requiring quarantine */
export type UnsupportedArtifact = {
  id: string
  kind:
    | 'shortcode'
    | 'plugin-block'
    | 'form'
    | 'widget'
    | 'php-code'
    | 'script'
    | 'style'
    | 'custom-post-type'
    | 'comment'
    | 'membership'
    | 'commerce'
    | 'unsupported-embed'
  name: string
  rawSource: string
  location: string
  reason: string
}

/** Gutenberg or parsed block representation */
export type ParsedContentBlock = {
  type: 'paragraph' | 'heading' | 'list' | 'quote' | 'image' | 'columns' | 'raw-html'
  level?: number
  content: string
  mediaUrl?: string
  caption?: string
}

/** Normalized post or page */
export type NormalizedItem = {
  id: string
  postType: 'post' | 'page' | 'nav_menu_item' | 'attachment' | string
  title: string
  slug: string
  originalUrl: string
  publishedAt: string
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private' | 'trash'
  authorLogin: string
  excerpt: string
  rawContent: string
  parsedBlocks: ParsedContentBlock[]
  categories: string[]
  tags: string[]
  featuredMediaId?: string
  seo: ExtractedSeo
  unsupported: UnsupportedArtifact[]
}

/** Complete normalized WXR dataset */
export type NormalizedWxr = {
  site: {
    title: string
    link: string
    description: string
    language: string
    baseSiteUrl: string
    baseBlogUrl: string
  }
  authors: NormalizedAuthor[]
  categories: NormalizedTaxonomy[]
  tags: NormalizedTaxonomy[]
  menus: NormalizedMenu[]
  media: NormalizedMedia[]
  items: NormalizedItem[]
}

/** Redirect plan entry */
export type RedirectPlanItem = {
  sourceUrl: string
  legacyPath: string
  canonicalPath: string
  status: 'compatible-direct' | 'needs-redirect' | 'collision' | 'loop'
  statusCode: 301 | 308
  error?: string
}

/** Reconstructed presentation layout configuration */
export type PresentationReconstruction = {
  themeId: string
  themeTokens: Record<string, unknown>
  header: {
    name: string
    blocks: LayoutBlock[]
    navigation: Array<{ label: string; href: string }>
  }
  footer: {
    name: string
    blocks: LayoutBlock[]
    columns: Array<{ title: string; links: Array<{ label: string; href: string }> }>
    copyright: string
  }
  templates: Array<{
    id: string
    name: string
    targetType: 'page' | 'post' | 'archive'
    blocks: LayoutBlock[]
  }>
  patterns: Array<{
    id: string
    name: string
    category: string
    blocks: LayoutBlock[]
  }>
  pages: Array<{
    path: string
    name: string
    templateId?: string
    templateMode: 'inherited' | 'explicit' | 'detached'
    blocks: LayoutBlock[]
  }>
}

/** Side-by-side comparison item */
export type SideBySideItem = {
  sourceId: string
  sourceTitle: string
  sourceType: string
  sourceUrl: string
  sourceExcerpt: string
  renegadeId?: string
  renegadeTitle: string
  renegadePath: string
  renegadeStatus: 'draft' | 'published'
  previewUrl: string
  repairUrl: string
  status: 'migrated' | 'needs-review' | 'quarantined' | 'redirect-only'
  warnings: string[]
}

/** Quarantine record saved in audit store */
export type QuarantineRecord = {
  id: string
  runId: string
  siteId: string
  sourceId: string
  itemType: string
  title: string
  kind: UnsupportedArtifact['kind']
  name: string
  rawSource: string
  location: string
  reason: string
  createdAt: string
}

/** Comprehensive audit and migration report */
export type MigrationReport = {
  runId: string
  stage: PipelineStage
  siteId: string
  targetSiteMode: 'new-isolated-site' | 'existing-site'
  options: LegacyMigrationOptions
  sourceSummary: {
    posts: number
    pages: number
    authors: number
    categories: number
    tags: number
    menus: number
    media: number
    unsupported: number
  }
  reconciliation: {
    created: {
      content: number
      authors: number
      categories: number
      tags: number
      media: number
      redirects: number
      layouts: number
      templates: number
      patterns: number
      globals: number
    }
    skipped: number
    failed: number
  }
  checksums: {
    sourceWxr: string
    media: Record<string, string>
    report: string
  }
  redirectPlan: RedirectPlanItem[]
  sideBySide: SideBySideItem[]
  quarantine: QuarantineRecord[]
  warnings: Array<{ code: string; message: string; sourceId?: string }>
  errors: Array<{ code: string; message: string; sourceId?: string }>
  acceptanceChecklist: {
    contentCountsMatch: boolean
    mediaChecksumsVerified: boolean
    urlsAndRedirectsLoopFree: boolean
    renderedTemplatesValid: boolean
    themeSafeNoArbitraryExec: boolean
    unsupportedQuarantined: boolean
    idempotencyVerified: boolean
  }
  resumableCheckpoint: {
    lastProcessedSourceId?: string
    completedSourceIds: string[]
  }
  createdEntityIds: {
    siteId?: string
    contentIds: string[]
    authorIds: string[]
    categoryIds: string[]
    tagIds: string[]
    mediaIds: string[]
    redirectIds: string[]
    layoutIds: string[]
  }
  createdAt: string
  updatedAt: string
  activatedAt?: string
  activatedBy?: string
  rolledBackAt?: string
  rolledBackBy?: string
}
