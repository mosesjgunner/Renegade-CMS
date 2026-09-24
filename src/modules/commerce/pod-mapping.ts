import { createHash } from 'node:crypto'
import type { CatalogVariant } from './catalog'
import type { PlacementBounds, PrintAreaType } from './pod-contract'
import type { GovernedPrintRendition } from './print-renditions'

export type PodPrintAreaConfig = Readonly<{
  area: PrintAreaType
  artworkRenditionId: string
  artworkHash: string
  artworkRevision: number
  placement: PlacementBounds
}>

export type DetailedPodMapping = Readonly<{
  id: string
  siteId: string
  productId: string
  variantSku: string
  optionValues: Readonly<Record<string, string>>
  providerKey: string
  remoteProductId: string
  remoteVariantId: string
  printAreas: readonly PodPrintAreaConfig[]
  pinnedArtworkHash: string
  artworkRevisionId: string
  mockupProvenance: Readonly<{
    source: 'provider' | 'publisher'
    generatedAt: string
    hash?: string
    url?: string
  }>
  snapshot: Readonly<{
    costMinor: string
    currency: string
    available: boolean
    observedAt: string
  }>
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
  version: number
  createdAt: string
  updatedAt: string
}>

export function computeCompositeArtworkHash(areas: readonly PodPrintAreaConfig[]): string {
  const parts = areas
    .map((a) => `${a.area}:${a.artworkHash}:${a.artworkRevision}`)
    .sort()
    .join('|')
  return createHash('sha256').update(parts).digest('hex')
}

export function validatePodMapping(
  mapping: DetailedPodMapping,
  variant: CatalogVariant,
  renditionsById?: Readonly<Map<string, GovernedPrintRendition>>,
): { valid: boolean; issues: readonly string[] } {
  const issues: string[] = []

  // 1. Variant SKU & Option Alignment
  if (mapping.variantSku !== variant.sku) {
    issues.push(
      `Mapping variantSku "${mapping.variantSku}" does not match variant SKU "${variant.sku}".`,
    )
  }

  const variantOptionKeys = Object.keys(variant.optionValues).sort()
  const mappingOptionKeys = Object.keys(mapping.optionValues).sort()
  if (
    variantOptionKeys.length !== mappingOptionKeys.length ||
    variantOptionKeys.some((k) => variant.optionValues[k] !== mapping.optionValues[k])
  ) {
    issues.push(
      `POD mapping option values (${JSON.stringify(mapping.optionValues)}) do not exactly match canonical variant options (${JSON.stringify(variant.optionValues)}).`,
    )
  }

  // 2. Provider Identity
  if (!mapping.providerKey.trim()) {
    issues.push('Provider key is required for POD mapping.')
  }
  if (!mapping.remoteProductId.trim() || !mapping.remoteVariantId.trim()) {
    issues.push('Remote product ID and variant ID are required.')
  }

  // 3. Print Areas & Artwork Hash
  if (!mapping.printAreas.length) {
    issues.push('At least one print area must be configured.')
  }

  for (const area of mapping.printAreas) {
    if (!area.artworkRenditionId || !area.artworkHash) {
      issues.push(`Print area ${area.area} lacks artwork rendition ID or hash.`)
    }
    if (area.placement.widthMm <= 0 || area.placement.heightMm <= 0) {
      issues.push(`Print area ${area.area} placement dimensions must be positive integers.`)
    }
    if (renditionsById) {
      const rendition = renditionsById.get(area.artworkRenditionId)
      if (!rendition) {
        issues.push(`Configured artwork rendition ${area.artworkRenditionId} was not found.`)
      } else {
        if (rendition.hash !== area.artworkHash) {
          issues.push(
            `Artwork hash mismatch for ${area.area}: expected ${rendition.hash}, mapping has ${area.artworkHash}.`,
          )
        }
        if (rendition.reviewStatus !== 'approved' || rendition.rightsStatus !== 'approved') {
          issues.push(`Artwork ${area.artworkRenditionId} is not approved for print production.`)
        }
      }
    }
  }

  const expectedComposite = computeCompositeArtworkHash(mapping.printAreas)
  if (mapping.pinnedArtworkHash !== expectedComposite) {
    issues.push(
      `Pinned artwork hash does not match current print area composite hash (${mapping.pinnedArtworkHash} vs ${expectedComposite}).`,
    )
  }

  // 4. Mockup Provenance
  if (!mapping.mockupProvenance.source || !mapping.mockupProvenance.generatedAt) {
    issues.push('Mockup provenance source and generation timestamp are required.')
  } else if (isNaN(Date.parse(mapping.mockupProvenance.generatedAt))) {
    issues.push('Mockup generation timestamp is invalid.')
  }

  // 5. Cost Snapshot
  if (!/^(0|[1-9][0-9]*)$/.test(mapping.snapshot.costMinor)) {
    issues.push('Cost snapshot amount must be an integer minor unit.')
  }
  if (!/^[A-Z]{3}$/.test(mapping.snapshot.currency)) {
    issues.push('Cost snapshot currency must be a 3-letter ISO code.')
  }
  if (!mapping.snapshot.observedAt || isNaN(Date.parse(mapping.snapshot.observedAt))) {
    issues.push('Cost snapshot observation timestamp is invalid.')
  }

  // 6. Review Status
  if (mapping.reviewStatus !== 'approved') {
    issues.push(
      `POD mapping requires deliberate review approval (current status: "${mapping.reviewStatus}").`,
    )
  }

  return { valid: issues.length === 0, issues }
}

export function reviewPodMapping(
  mapping: DetailedPodMapping,
  decision: {
    status: 'approved' | 'rejected'
    reviewedBy: string
    notes?: string
  },
): DetailedPodMapping {
  return {
    ...mapping,
    reviewStatus: decision.status,
    reviewedBy: decision.reviewedBy,
    reviewedAt: new Date().toISOString(),
    reviewNotes: decision.notes,
    updatedAt: new Date().toISOString(),
  }
}

/** Deliberate remap creates an incremented version requiring fresh review, without altering sold snapshots. */
export function remapPodVariant(
  current: DetailedPodMapping,
  updates: Partial<
    Omit<DetailedPodMapping, 'id' | 'siteId' | 'productId' | 'variantSku' | 'version'>
  >,
  deliberateReview: { approvedBy: string; justification: string },
): DetailedPodMapping {
  const nextPrintAreas = updates.printAreas ?? current.printAreas
  const pinnedArtworkHash = computeCompositeArtworkHash(nextPrintAreas)

  return {
    ...current,
    ...updates,
    printAreas: nextPrintAreas,
    pinnedArtworkHash,
    version: current.version + 1,
    reviewStatus: 'pending', // Re-mapping requires new review approval
    reviewNotes: `Remap justified by ${deliberateReview.approvedBy}: ${deliberateReview.justification}`,
    updatedAt: new Date().toISOString(),
  }
}
