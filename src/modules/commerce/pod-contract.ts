import { createHash } from 'node:crypto'

export const POD_ADAPTER_CONTRACT_VERSION = 'shop-03.v1' as const

export type PodProviderState =
  | 'created'
  | 'on_hold'
  | 'submitting'
  | 'submitted'
  | 'in_production'
  | 'partially_shipped'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'exception'
  | 'returned'

export type PrintAreaType =
  | 'front'
  | 'back'
  | 'sleeve_left'
  | 'sleeve_right'
  | 'all_over'
  | 'embroidery_front'
  | 'pocket'

export type PlacementBounds = Readonly<{
  topMm: number
  leftMm: number
  widthMm: number
  heightMm: number
  rotationDeg?: number
}>

export type PodProviderCapabilityMatrix = Readonly<{
  supportedPrintAreas: readonly PrintAreaType[]
  supportsCancellation: boolean
  supportsPartialShipments: boolean
  supportsLivePreflight: boolean
  supportsLiveCostEstimation: boolean
  supportsAutomaticReprint: boolean
  supportsReturnRouting: boolean
  supportsPoBoxDelivery: boolean
}>

export type PodErrorCode =
  | 'configuration'
  | 'authentication'
  | 'invalid-request'
  | 'not-found'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'unknown-outcome'
  | 'preflight-failed'
  | 'address-rejected'
  | 'order-locked'

export class PodProviderError extends Error {
  constructor(
    readonly code: PodErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly outcomeKnown: boolean,
  ) {
    super(message)
    this.name = 'PodProviderError'
  }
}

export type PodCatalogItem = Readonly<{
  id: string
  name: string
  brand?: string
  description?: string
  model?: string
  image?: string
  techniques?: readonly string[]
}>

export type PodVariant = Readonly<{
  id: string
  productId: string
  name: string
  sku: string
  color: string
  size: string
  costMinor: string
  currency: string
  available: boolean
  dimensionsMm?: Readonly<{ length: number; width: number; height: number }>
  weightGrams?: number
}>

export type PodTemplate = Readonly<{
  id: string
  variantId: string
  printArea: PrintAreaType
  templateWidthMm: number
  templateHeightMm: number
  minDpi: number
  recommendedDpi: number
  printAreaBounds: PlacementBounds
  formatRequirements: Readonly<{
    allowedMimeTypes: readonly string[]
    maxSizeBytes: number
  }>
}>

export type PodPreflightInput = Readonly<{
  variantId: string
  printArea: PrintAreaType
  artwork: Readonly<{
    id: string
    hash: string
    mimeType: string
    widthPx: number
    heightPx: number
    dpi: number
  }>
  placement: PlacementBounds
}>

export type PodPreflightResult = Readonly<{
  passed: boolean
  effectiveDpi: number
  issues: readonly string[]
  mockupUrl?: string
  provenance: Readonly<{
    source: 'provider' | 'publisher'
    generatedAt: string
    hash?: string
  }>
}>

export type PodCostEstimateInput = Readonly<{
  variantId: string
  quantity: number
  recipientAddress: Readonly<{
    country: string
    state?: string
    postalCode?: string
    city?: string
  }>
}>

export type PodCostEstimate = Readonly<{
  productionCostMinor: string
  shippingCostMinor: string
  taxCostMinor: string
  totalCostMinor: string
  currency: string
  available: boolean
  estimatedDaysMin?: number
  estimatedDaysMax?: number
}>

export type PodRecipientAddress = Readonly<{
  name: string
  address1: string
  address2?: string
  city: string
  state?: string
  postalCode: string
  country: string
  phone?: string
  email?: string
}>

export type PodOrderItemInput = Readonly<{
  variantId: string
  externalVariantSku?: string
  quantity: number
  printAreas: readonly Readonly<{
    area: PrintAreaType
    artworkId: string
    artworkHash: string
    artworkUrl: string
    placement: PlacementBounds
  }>[]
}>

export type PodCreateOrderInput = Readonly<{
  orderId: string
  idempotencyKey: string
  recipient: PodRecipientAddress
  items: readonly PodOrderItemInput[]
  metadata?: Readonly<Record<string, string>>
}>

export type PodLineFulfillment = Readonly<{
  fulfillmentId: string
  status: 'pending' | 'in_production' | 'shipped' | 'delivered' | 'cancelled'
  lineIndices: readonly number[]
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  shippedAt?: string
  deliveredAt?: string
}>

export type PodOrderResult = Readonly<{
  externalOrderId: string
  state: PodProviderState
  costMinor?: string
  currency?: string
  fulfillments?: readonly PodLineFulfillment[]
  createdAt?: string
  updatedAt?: string
  error?: string
}>

export type NormalizedPodEvent = Readonly<{
  providerEventId: string
  providerKey: string
  externalOrderId: string
  kind:
    | 'order_created'
    | 'in_production'
    | 'partially_shipped'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'failed'
    | 'returned'
  occurredAt: string
  fulfillments?: readonly PodLineFulfillment[]
  tracking?: Readonly<{
    carrier: string
    trackingNumber: string
    trackingUrl?: string
  }>
  reason?: string
  rawEvidence: Readonly<Record<string, unknown>>
}>

export interface PodProviderAdapter {
  readonly key: string
  readonly contractVersion: typeof POD_ADAPTER_CONTRACT_VERSION
  readonly capabilities: PodProviderCapabilityMatrix
  readonly metadata: Readonly<{
    implementationVersion: string
    providerApiVersion: string
    mode: 'deterministic-emulator' | 'live-configured'
    liveCreationOptInRequired: boolean
  }>

  health(): Promise<{
    ready: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    reason?: string
    latencyMs?: number
  }>

  getCatalog(): Promise<readonly PodCatalogItem[]>
  getVariants(remoteProductId: string): Promise<readonly PodVariant[]>
  getTemplates(remoteVariantId: string): Promise<readonly PodTemplate[]>

  validateFile(file: {
    filename: string
    mimeType: string
    sizeBytes: number
    widthPx: number
    heightPx: number
    dpi: number
    colorProfile?: string
    hasTransparency?: boolean
  }): Promise<{ valid: boolean; issues: readonly string[]; warnings?: readonly string[] }>

  uploadPrintFile(file: {
    filename: string
    mimeType: string
    content: Buffer | Uint8Array
    hash: string
  }): Promise<{ remoteFileId: string; downloadUrl: string }>

  preflight(input: PodPreflightInput): Promise<PodPreflightResult>
  estimateCost(input: PodCostEstimateInput): Promise<PodCostEstimate>
  createOrder(input: PodCreateOrderInput): Promise<PodOrderResult>
  getOrder(externalOrderId: string): Promise<PodOrderResult>
  cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }>

  verifyWebhook(
    rawBody: string,
    signature: string,
    secret: string,
    headers?: Record<string, string>,
  ): NormalizedPodEvent | null
}
