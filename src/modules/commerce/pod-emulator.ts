import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  POD_ADAPTER_CONTRACT_VERSION,
  type PodProviderAdapter,
  type PodProviderCapabilityMatrix,
  type PodCatalogItem,
  type PodVariant,
  type PodTemplate,
  type PodPreflightInput,
  type PodPreflightResult,
  type PodCostEstimateInput,
  type PodCostEstimate,
  type PodCreateOrderInput,
  type PodOrderResult,
  type NormalizedPodEvent,
  type PodProviderState,
  type PodLineFulfillment,
  PodProviderError,
} from './pod-contract'

export const EMULATOR_CAPABILITIES: PodProviderCapabilityMatrix = {
  supportedPrintAreas: ['front', 'back', 'sleeve_left', 'sleeve_right', 'all_over'],
  supportsCancellation: true,
  supportsPartialShipments: true,
  supportsLivePreflight: true,
  supportsLiveCostEstimation: true,
  supportsAutomaticReprint: true,
  supportsReturnRouting: true,
  supportsPoBoxDelivery: false,
}

const DEFAULT_CATALOG: readonly PodCatalogItem[] = [
  {
    id: 'emu-tee-101',
    name: 'Renegade Heavyweight Cotton Tee',
    brand: 'Renegade Supply',
    model: 'R-101',
    techniques: ['DTG'],
    description: '100% carded ringspun cotton, 220 GSM.',
  },
  {
    id: 'emu-hoodie-202',
    name: 'Renegade Classic Pullover Hoodie',
    brand: 'Renegade Supply',
    model: 'R-202',
    techniques: ['DTG', 'Embroidery'],
    description: 'Heavyweight organic fleece hoodie.',
  },
]

const DEFAULT_VARIANTS: Record<string, readonly PodVariant[]> = {
  'emu-tee-101': [
    {
      id: 'emu-tee-s-blk',
      productId: 'emu-tee-101',
      name: 'Heavyweight Cotton Tee - S / Black',
      sku: 'EMU-TEE-S-BLK',
      color: 'black',
      size: 's',
      costMinor: '1250',
      currency: 'USD',
      available: true,
      weightGrams: 200,
      dimensionsMm: { length: 280, width: 200, height: 15 },
    },
    {
      id: 'emu-tee-m-blk',
      productId: 'emu-tee-101',
      name: 'Heavyweight Cotton Tee - M / Black',
      sku: 'EMU-TEE-M-BLK',
      color: 'black',
      size: 'm',
      costMinor: '1250',
      currency: 'USD',
      available: true,
      weightGrams: 220,
      dimensionsMm: { length: 290, width: 210, height: 15 },
    },
    {
      id: 'emu-tee-l-blk',
      productId: 'emu-tee-101',
      name: 'Heavyweight Cotton Tee - L / Black',
      sku: 'EMU-TEE-L-BLK',
      color: 'black',
      size: 'l',
      costMinor: '1250',
      currency: 'USD',
      available: true,
      weightGrams: 240,
      dimensionsMm: { length: 300, width: 220, height: 15 },
    },
    {
      id: 'emu-tee-m-wht',
      productId: 'emu-tee-101',
      name: 'Heavyweight Cotton Tee - M / White',
      sku: 'EMU-TEE-M-WHT',
      color: 'white',
      size: 'm',
      costMinor: '1150',
      currency: 'USD',
      available: true,
      weightGrams: 220,
      dimensionsMm: { length: 290, width: 210, height: 15 },
    },
  ],
  'emu-hoodie-202': [
    {
      id: 'emu-hood-m-blk',
      productId: 'emu-hoodie-202',
      name: 'Pullover Hoodie - M / Black',
      sku: 'EMU-HOOD-M-BLK',
      color: 'black',
      size: 'm',
      costMinor: '2600',
      currency: 'USD',
      available: true,
      weightGrams: 550,
      dimensionsMm: { length: 350, width: 280, height: 40 },
    },
  ],
}

type StoredOrder = {
  orderId: string
  idempotencyKey: string
  externalOrderId: string
  state: PodProviderState
  recipient: PodCreateOrderInput['recipient']
  items: PodCreateOrderInput['items']
  fulfillments: PodLineFulfillment[]
  costMinor: string
  currency: string
  createdAt: string
  updatedAt: string
}

export class PodEmulatorAdapter implements PodProviderAdapter {
  readonly key = 'pod-emulator'
  readonly contractVersion = POD_ADAPTER_CONTRACT_VERSION
  readonly capabilities = EMULATOR_CAPABILITIES
  readonly metadata = {
    implementationVersion: '1.0.0',
    providerApiVersion: '2026-v1',
    mode: 'deterministic-emulator' as const,
    liveCreationOptInRequired: false,
  }

  private isHealthy = true
  private healthReason?: string
  private simulatedLatencyMs = 0

  private readonly ordersByIdempotency = new Map<string, StoredOrder>()
  private readonly ordersByExternalId = new Map<string, StoredOrder>()
  private readonly uploadedFiles = new Map<
    string,
    { filename: string; mimeType: string; hash: string }
  >()

  constructor(options?: { healthy?: boolean; latencyMs?: number }) {
    if (options?.healthy !== undefined) this.isHealthy = options.healthy
    if (options?.latencyMs !== undefined) this.simulatedLatencyMs = options.latencyMs
  }

  setHealth(healthy: boolean, reason?: string) {
    this.isHealthy = healthy
    this.healthReason = reason
  }

  reset() {
    this.ordersByIdempotency.clear()
    this.ordersByExternalId.clear()
    this.uploadedFiles.clear()
    this.isHealthy = true
    this.healthReason = undefined
  }

  async health(): Promise<{
    ready: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    reason?: string
    latencyMs?: number
  }> {
    if (!this.isHealthy) {
      return {
        ready: false,
        health: 'unavailable',
        reason: this.healthReason ?? 'Emulator manually set to unhealthy',
        latencyMs: this.simulatedLatencyMs,
      }
    }
    return {
      ready: true,
      health: 'healthy',
      latencyMs: this.simulatedLatencyMs,
    }
  }

  async getCatalog(): Promise<readonly PodCatalogItem[]> {
    this.assertHealthy()
    return DEFAULT_CATALOG
  }

  async getVariants(remoteProductId: string): Promise<readonly PodVariant[]> {
    this.assertHealthy()
    return DEFAULT_VARIANTS[remoteProductId] ?? []
  }

  async getTemplates(remoteVariantId: string): Promise<readonly PodTemplate[]> {
    this.assertHealthy()
    return [
      {
        id: `tpl-${remoteVariantId}-front`,
        variantId: remoteVariantId,
        printArea: 'front',
        templateWidthMm: 300,
        templateHeightMm: 400,
        minDpi: 150,
        recommendedDpi: 300,
        printAreaBounds: {
          topMm: 50,
          leftMm: 50,
          widthMm: 280,
          heightMm: 380,
        },
        formatRequirements: {
          allowedMimeTypes: ['image/png', 'image/tiff', 'application/pdf'],
          maxSizeBytes: 50 * 1024 * 1024,
        },
      },
      {
        id: `tpl-${remoteVariantId}-back`,
        variantId: remoteVariantId,
        printArea: 'back',
        templateWidthMm: 300,
        templateHeightMm: 400,
        minDpi: 150,
        recommendedDpi: 300,
        printAreaBounds: {
          topMm: 50,
          leftMm: 50,
          widthMm: 280,
          heightMm: 380,
        },
        formatRequirements: {
          allowedMimeTypes: ['image/png', 'image/tiff', 'application/pdf'],
          maxSizeBytes: 50 * 1024 * 1024,
        },
      },
    ]
  }

  async validateFile(file: {
    filename: string
    mimeType: string
    sizeBytes: number
    widthPx: number
    heightPx: number
    dpi: number
    colorProfile?: string
    hasTransparency?: boolean
  }): Promise<{ valid: boolean; issues: readonly string[]; warnings?: readonly string[] }> {
    const issues: string[] = []
    const warnings: string[] = []

    const allowedMime = ['image/png', 'image/tiff', 'application/pdf']
    if (!allowedMime.includes(file.mimeType)) {
      issues.push(`Unsupported file format: ${file.mimeType}. Allowed: ${allowedMime.join(', ')}`)
    }
    if (file.sizeBytes > 50 * 1024 * 1024) {
      issues.push('File size exceeds maximum 50MB limit.')
    }
    if (file.dpi < 150) {
      issues.push(`Artwork DPI (${file.dpi}) is below the required 150 DPI minimum.`)
    } else if (file.dpi < 300) {
      warnings.push(`Artwork DPI is ${file.dpi}; 300 DPI recommended for sharp print clarity.`)
    }
    if (file.widthPx < 1000 || file.heightPx < 1000) {
      issues.push('Artwork pixel dimensions must be at least 1000x1000 pixels.')
    }

    return { valid: issues.length === 0, issues, warnings }
  }

  async uploadPrintFile(file: {
    filename: string
    mimeType: string
    content: Buffer | Uint8Array
    hash: string
  }): Promise<{ remoteFileId: string; downloadUrl: string }> {
    this.assertHealthy()
    const remoteFileId = `emu-file-${file.hash.slice(0, 16)}`
    this.uploadedFiles.set(remoteFileId, {
      filename: file.filename,
      mimeType: file.mimeType,
      hash: file.hash,
    })
    return {
      remoteFileId,
      downloadUrl: `https://emulator.renegade.internal/files/${remoteFileId}`,
    }
  }

  async preflight(input: PodPreflightInput): Promise<PodPreflightResult> {
    this.assertHealthy()
    const issues: string[] = []

    // Effective DPI calculation: print dimension in inches = mm / 25.4
    const printWidthInches = input.placement.widthMm / 25.4
    const effectiveDpi = Math.round(input.artwork.widthPx / Math.max(0.1, printWidthInches))

    if (effectiveDpi < 150) {
      issues.push(
        `Effective DPI is ${effectiveDpi}, which is below the minimum required 150 DPI for a ${input.placement.widthMm}mm width print area.`,
      )
    }

    if (input.placement.widthMm <= 0 || input.placement.heightMm <= 0) {
      issues.push('Placement dimensions must be positive integers.')
    }

    const now = new Date().toISOString()
    const mockupHash = createHash('sha256')
      .update(`${input.variantId}:${input.printArea}:${input.artwork.hash}`)
      .digest('hex')

    return {
      passed: issues.length === 0,
      effectiveDpi,
      issues,
      mockupUrl: `https://emulator.renegade.internal/mockups/${mockupHash.slice(0, 16)}.png`,
      provenance: {
        source: 'provider',
        generatedAt: now,
        hash: mockupHash,
      },
    }
  }

  async estimateCost(input: PodCostEstimateInput): Promise<PodCostEstimate> {
    this.assertHealthy()
    let variantCost = 1250n
    for (const vList of Object.values(DEFAULT_VARIANTS)) {
      const match = vList.find((v) => v.id === input.variantId)
      if (match) {
        variantCost = BigInt(match.costMinor)
        break
      }
    }

    const qty = BigInt(input.quantity)
    const productionCostMinor = (variantCost * qty).toString()
    // Simple deterministic shipping estimate: domestic US $4.50, international $9.00
    const shippingCostMinor = input.recipientAddress.country.toUpperCase() === 'US' ? '450' : '900'
    const taxCostMinor = '0'
    const totalCostMinor = (
      BigInt(productionCostMinor) +
      BigInt(shippingCostMinor) +
      BigInt(taxCostMinor)
    ).toString()

    return {
      productionCostMinor,
      shippingCostMinor,
      taxCostMinor,
      totalCostMinor,
      currency: 'USD',
      available: true,
      estimatedDaysMin: 3,
      estimatedDaysMax: 7,
    }
  }

  async createOrder(input: PodCreateOrderInput): Promise<PodOrderResult> {
    this.assertHealthy()

    // 1. Idempotency Check
    const existing = this.ordersByIdempotency.get(input.idempotencyKey)
    if (existing) {
      return {
        externalOrderId: existing.externalOrderId,
        state: existing.state,
        costMinor: existing.costMinor,
        currency: existing.currency,
        fulfillments: existing.fulfillments,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      }
    }

    // 2. Validate Address Boundary
    if (!input.recipient.address1 || !input.recipient.city || !input.recipient.country) {
      throw new PodProviderError(
        'address-rejected',
        'Incomplete shipping address: street address, city, and country are required.',
        false,
        true,
      )
    }

    const addrLine = `${input.recipient.address1} ${input.recipient.address2 ?? ''}`.toLowerCase()
    if (/\bp\.?\s*o\.?\s*box\b/i.test(addrLine)) {
      throw new PodProviderError(
        'address-rejected',
        'Provider does not deliver print-on-demand items to P.O. Box addresses.',
        false,
        true,
      )
    }

    // 3. Validate Items
    if (!input.items.length) {
      throw new PodProviderError(
        'invalid-request',
        'Cannot create POD order with no items.',
        false,
        true,
      )
    }

    // Compute Cost
    let totalCost = 0n
    for (const item of input.items) {
      let cost = 1250n
      for (const vList of Object.values(DEFAULT_VARIANTS)) {
        const found = vList.find((v) => v.id === item.variantId)
        if (found) {
          cost = BigInt(found.costMinor)
          break
        }
      }
      totalCost += cost * BigInt(item.quantity)
    }
    totalCost += 450n // shipping

    const now = new Date().toISOString()
    const externalOrderId = `emu_ord_${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 16)}`

    const order: StoredOrder = {
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      externalOrderId,
      state: 'submitted',
      recipient: input.recipient,
      items: input.items,
      fulfillments: [],
      costMinor: totalCost.toString(),
      currency: 'USD',
      createdAt: now,
      updatedAt: now,
    }

    this.ordersByIdempotency.set(input.idempotencyKey, order)
    this.ordersByExternalId.set(externalOrderId, order)

    return {
      externalOrderId,
      state: 'submitted',
      costMinor: order.costMinor,
      currency: order.currency,
      fulfillments: [],
      createdAt: now,
      updatedAt: now,
    }
  }

  async getOrder(externalOrderId: string): Promise<PodOrderResult> {
    this.assertHealthy()
    const order = this.ordersByExternalId.get(externalOrderId)
    if (!order) {
      throw new PodProviderError(
        'not-found',
        `POD order ${externalOrderId} was not found on emulator.`,
        false,
        true,
      )
    }
    return {
      externalOrderId: order.externalOrderId,
      state: order.state,
      costMinor: order.costMinor,
      currency: order.currency,
      fulfillments: order.fulfillments,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }
  }

  async cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    this.assertHealthy()
    const order = this.ordersByExternalId.get(externalOrderId)
    if (!order) {
      throw new PodProviderError(
        'not-found',
        `POD order ${externalOrderId} was not found to cancel.`,
        false,
        true,
      )
    }

    // Cancellation boundary: only allowed in submitted or on_hold states
    if (order.state === 'in_production') {
      return {
        cancelled: false,
        reason: 'Order is already in production with provider and cannot be cancelled.',
      }
    }
    if (['shipped', 'partially_shipped', 'delivered'].includes(order.state)) {
      return {
        cancelled: false,
        reason: `Order has already shipped (state: ${order.state}) and cannot be cancelled.`,
      }
    }
    if (order.state === 'cancelled') {
      return { cancelled: true, reason: 'Order was already cancelled.' }
    }

    order.state = 'cancelled'
    order.updatedAt = new Date().toISOString()
    return { cancelled: true, reason: reason ?? 'Cancelled by operator request.' }
  }

  // --- Test & Simulation Controls ---

  advanceOrderState(
    externalOrderId: string,
    nextState: PodProviderState,
    fulfillments?: PodLineFulfillment[],
  ): StoredOrder {
    const order = this.ordersByExternalId.get(externalOrderId)
    if (!order) throw new Error(`Order ${externalOrderId} not found in emulator.`)
    order.state = nextState
    order.updatedAt = new Date().toISOString()
    if (fulfillments) order.fulfillments = fulfillments
    return order
  }

  simulatePartialShipment(
    externalOrderId: string,
    shippedLineIndices: readonly number[],
    carrier = 'USPS',
    trackingNumber = '9400100000000000000000',
  ): { order: StoredOrder; fulfillment: PodLineFulfillment } {
    const order = this.ordersByExternalId.get(externalOrderId)
    if (!order) throw new Error(`Order ${externalOrderId} not found in emulator.`)

    const fulfillment: PodLineFulfillment = {
      fulfillmentId: `ful-${createHash('sha256')
        .update(`${externalOrderId}:${shippedLineIndices.join(',')}`)
        .digest('hex')
        .slice(0, 10)}`,
      status: 'shipped',
      lineIndices: shippedLineIndices,
      carrier,
      trackingNumber,
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
      shippedAt: new Date().toISOString(),
    }

    order.fulfillments.push(fulfillment)
    // Check if all lines are shipped
    const allLines = new Set<number>()
    for (let i = 0; i < order.items.length; i++) allLines.add(i)
    const fulfilledLines = new Set<number>()
    for (const f of order.fulfillments) {
      for (const idx of f.lineIndices) fulfilledLines.add(idx)
    }

    order.state = fulfilledLines.size >= allLines.size ? 'shipped' : 'partially_shipped'
    order.updatedAt = new Date().toISOString()

    return { order, fulfillment }
  }

  generateSignedWebhook(
    secret: string,
    event: NormalizedPodEvent,
  ): { rawBody: string; signature: string } {
    const rawBody = JSON.stringify(event)
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
    return { rawBody, signature }
  }

  verifyWebhook(rawBody: string, signature: string, secret: string): NormalizedPodEvent | null {
    if (!signature || !secret) return null
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null
    }
    try {
      return JSON.parse(rawBody) as NormalizedPodEvent
    } catch {
      return null
    }
  }

  private assertHealthy() {
    if (!this.isHealthy) {
      throw new PodProviderError(
        'provider-unavailable',
        this.healthReason ?? 'Emulator provider is currently unavailable.',
        true,
        false,
      )
    }
  }
}
