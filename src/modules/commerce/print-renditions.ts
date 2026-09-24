import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { PlacementBounds, PrintAreaType } from './pod-contract'

export const COLOR_FIDELITY_DISCLAIMER =
  'No color-fidelity promise: Screen previews are approximations (sRGB); print results may vary based on garment color, fabric substrate, and direct-to-garment (DTG) ink absorption.' as const

export type PrintRenditionFormat = 'image/png' | 'image/tiff' | 'application/pdf'

export type GovernedPrintRendition = Readonly<{
  id: string
  mediaAssetId: string
  revision: number
  hash: string
  filename: string
  mimeType: PrintRenditionFormat
  sizeBytes: number
  widthPx: number
  heightPx: number
  dpi: number
  colorProfile?: string
  hasTransparency?: boolean
  rightsStatus: 'approved' | 'pending' | 'restricted'
  rightsExpiresAt?: string
  malwareStatus: 'clean' | 'pending' | 'infected'
  publicOriginal: false
  reviewStatus: 'approved' | 'pending' | 'rejected'
  approvedBy?: string
  approvedAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}>

export type SoldPrintRenditionSnapshot = Readonly<{
  renditionId: string
  mediaAssetId: string
  revision: number
  hash: string
  placement: PlacementBounds
  printArea: PrintAreaType
  colorFidelityDisclaimer: typeof COLOR_FIDELITY_DISCLAIMER
  effectiveDpi: number
  frozenAt: string
  integritySignature: string
}>

export function validatePrintRendition(
  rendition: GovernedPrintRendition,
  now: number = Date.now(),
): { valid: boolean; issues: readonly string[]; warnings: readonly string[] } {
  const issues: string[] = []
  const warnings: string[] = []

  // 1. Format & Dimensions
  const allowedFormats: string[] = ['image/png', 'image/tiff', 'application/pdf']
  if (!allowedFormats.includes(rendition.mimeType)) {
    issues.push(`Unsupported MIME type ${rendition.mimeType}. Must be PNG, TIFF, or PDF.`)
  }
  if (rendition.widthPx < 1000 || rendition.heightPx < 1000) {
    issues.push('Artwork pixel dimensions must be at least 1000x1000 pixels.')
  }
  if (rendition.dpi < 150) {
    issues.push(`Artwork DPI (${rendition.dpi}) is below the required 150 DPI minimum.`)
  } else if (rendition.dpi < 300) {
    warnings.push(`Artwork DPI is ${rendition.dpi}; 300 DPI recommended for optimal print detail.`)
  }

  // 2. Private governance
  if (rendition.publicOriginal !== false) {
    issues.push('Print rendition original must be private: publicOriginal must be false.')
  }

  // 3. Rights & Expiry
  if (rendition.rightsStatus !== 'approved') {
    issues.push(`Print rendition rights status is "${rendition.rightsStatus}"; must be "approved".`)
  }
  if (rendition.rightsExpiresAt) {
    const expiry = Date.parse(rendition.rightsExpiresAt)
    if (isNaN(expiry) || expiry <= now) {
      issues.push(`Print rendition rights have expired (${rendition.rightsExpiresAt}).`)
    }
  }

  // 4. Malware Status
  if (rendition.malwareStatus !== 'clean') {
    issues.push(`Print rendition malware scan is "${rendition.malwareStatus}"; must be "clean".`)
  }

  // 5. Review & Approval
  if (rendition.reviewStatus !== 'approved') {
    issues.push(
      `Print rendition has not been reviewed and approved (current status: ${rendition.reviewStatus}).`,
    )
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  }
}

/** Computes effective DPI on physical substrate. */
export function computeEffectiveDpi(widthPx: number, widthMm: number): number {
  const widthInches = widthMm / 25.4
  return Math.round(widthPx / Math.max(0.1, widthInches))
}

/** Freezes an immutable sold print snapshot at the time of purchase. */
export function freezeSoldPrintRendition(
  rendition: GovernedPrintRendition,
  placement: PlacementBounds,
  printArea: PrintAreaType,
  signingSecret = 'renegade-sold-rendition-v1',
): SoldPrintRenditionSnapshot {
  const validation = validatePrintRendition(rendition)
  if (!validation.valid) {
    throw new Error(`Cannot freeze unapproved print rendition: ${validation.issues.join(', ')}`)
  }

  const effectiveDpi = computeEffectiveDpi(rendition.widthPx, placement.widthMm)
  const now = new Date().toISOString()

  const raw = [
    rendition.id,
    rendition.mediaAssetId,
    rendition.revision,
    rendition.hash,
    printArea,
    placement.topMm,
    placement.leftMm,
    placement.widthMm,
    placement.heightMm,
    effectiveDpi,
    now,
  ].join(';')

  const integritySignature = createHmac('sha256', signingSecret).update(raw).digest('hex')

  return {
    renditionId: rendition.id,
    mediaAssetId: rendition.mediaAssetId,
    revision: rendition.revision,
    hash: rendition.hash,
    placement,
    printArea,
    colorFidelityDisclaimer: COLOR_FIDELITY_DISCLAIMER,
    effectiveDpi,
    frozenAt: now,
    integritySignature,
  }
}

/** Verifies that a sold rendition snapshot has not been tampered with. */
export function verifySoldPrintRendition(
  snapshot: SoldPrintRenditionSnapshot,
  signingSecret = 'renegade-sold-rendition-v1',
): boolean {
  const raw = [
    snapshot.renditionId,
    snapshot.mediaAssetId,
    snapshot.revision,
    snapshot.hash,
    snapshot.printArea,
    snapshot.placement.topMm,
    snapshot.placement.leftMm,
    snapshot.placement.widthMm,
    snapshot.placement.heightMm,
    snapshot.effectiveDpi,
    snapshot.frozenAt,
  ].join(';')

  const expected = createHmac('sha256', signingSecret).update(raw).digest('hex')
  return (
    snapshot.integritySignature.length === expected.length &&
    timingSafeEqual(Buffer.from(snapshot.integritySignature), Buffer.from(expected))
  )
}

/** Generates a signed, time-limited download URL for provider ingestion of private artwork. */
export function signPrivatePrintAssetUrl(
  input: {
    renditionId: string
    hash: string
    siteId: string
    expiresAtEpochMs: number
  },
  secret: string,
): string {
  const token = createHmac('sha256', secret)
    .update(`${input.siteId}:${input.renditionId}:${input.hash}:${input.expiresAtEpochMs}`)
    .digest('base64url')
  return `/api/commerce/pod/assets/${input.renditionId}?exp=${input.expiresAtEpochMs}&sig=${token}`
}
