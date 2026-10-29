import { createHmac, timingSafeEqual } from 'node:crypto'
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
  PodProviderError,
} from './pod-contract'

export const PRINTFUL_CAPABILITIES: PodProviderCapabilityMatrix = {
  supportedPrintAreas: ['front', 'back', 'sleeve_left', 'sleeve_right'],
  supportsCancellation: true,
  supportsPartialShipments: true,
  supportsLivePreflight: false,
  supportsLiveCostEstimation: false,
  supportsAutomaticReprint: false,
  supportsReturnRouting: true,
  supportsPoBoxDelivery: false,
}

export type PrintfulAdapterConfig = Readonly<{
  apiKey: string
  storeId?: string
  apiBaseUrl?: string
  allowLiveCreation?: boolean
  fetchFn?: typeof fetch
}>

/** Unknown provider vocabulary must never imply acceptance or shipment. */
export function normalizePrintfulOrderState(status: string): PodOrderResult['state'] {
  switch (status) {
    case 'draft':
      return 'created'
    case 'pending':
      return 'submitted'
    case 'onhold':
      return 'on_hold'
    case 'inprocess':
      return 'in_production'
    case 'partial':
      return 'partially_shipped'
    case 'fulfilled':
      return 'shipped'
    case 'canceled':
      return 'cancelled'
    case 'failed':
      return 'failed'
    default:
      return 'exception'
  }
}

export class PrintfulPodAdapter implements PodProviderAdapter {
  readonly key: string = 'printful'
  readonly contractVersion = POD_ADAPTER_CONTRACT_VERSION
  readonly capabilities = PRINTFUL_CAPABILITIES
  readonly metadata = {
    implementationVersion: '1.0.0',
    providerApiVersion: 'v1-orders/v2-catalog',
    mode: 'live-configured' as const,
    liveCreationOptInRequired: true,
  }

  private readonly apiKey: string
  private readonly storeId?: string
  private readonly apiBaseUrl: string
  private readonly allowLiveCreation: boolean
  private readonly fetch: typeof fetch

  constructor(config: PrintfulAdapterConfig) {
    if (!config.apiKey || config.apiKey.length < 10) {
      throw new PodProviderError(
        'configuration',
        'Printful API token is missing or too short.',
        false,
        true,
      )
    }
    this.apiKey = config.apiKey
    this.storeId = config.storeId
    this.apiBaseUrl = config.apiBaseUrl ?? 'https://api.printful.com'
    this.fetch = config.fetchFn ?? globalThis.fetch
    this.allowLiveCreation =
      config.allowLiveCreation === true && process.env.RENEGADE_POD_ALLOW_LIVE_CREATION === 'true'
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Renegade-CMS-POD/1.0',
    }
    if (this.storeId) {
      h['X-PF-Store-Id'] = this.storeId
    }
    return h
  }

  async health(): Promise<{
    ready: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    reason?: string
    latencyMs?: number
  }> {
    const start = Date.now()
    try {
      const res = await this.fetch(`${this.apiBaseUrl}/stores`, {
        headers: this.headers(),
      })
      const latencyMs = Date.now() - start
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return {
            ready: false,
            health: 'unavailable',
            reason: 'Printful credentials rejected (401/403).',
            latencyMs,
          }
        }
        return {
          ready: false,
          health: 'degraded',
          reason: `Printful store check returned status ${res.status}.`,
          latencyMs,
        }
      }
      return { ready: true, health: 'healthy', latencyMs }
    } catch (err: unknown) {
      return {
        ready: false,
        health: 'unavailable',
        reason: 'Printful connection unavailable.',
        latencyMs: Date.now() - start,
      }
    }
  }

  async getCatalog(): Promise<readonly PodCatalogItem[]> {
    try {
      const res = await this.fetch(`${this.apiBaseUrl}/v2/catalog-products`, {
        headers: this.headers(),
      })
      if (!res.ok) {
        throw new PodProviderError(
          'provider-unavailable',
          `Failed to fetch Printful catalog products: ${res.statusText}`,
          true,
          false,
        )
      }
      const data = (await res.json()) as {
        data?: Array<{ id: number; title: string; brand?: string; model?: string; image?: string }>
      }
      return (data.data ?? []).map((p) => ({
        id: String(p.id),
        name: p.title,
        brand: p.brand,
        model: p.model,
        image: p.image,
      }))
    } catch (err) {
      if (err instanceof PodProviderError) throw err
      throw new PodProviderError(
        'provider-unavailable',
        'Printful catalog unavailable.',
        true,
        false,
      )
    }
  }

  async getVariants(remoteProductId: string): Promise<readonly PodVariant[]> {
    try {
      const res = await this.fetch(
        `${this.apiBaseUrl}/v2/catalog-products/${encodeURIComponent(remoteProductId)}/catalog-variants`,
        { headers: this.headers() },
      )
      if (!res.ok) {
        throw new PodProviderError(
          'not-found',
          `Failed to fetch Printful variants for product ${remoteProductId}: ${res.statusText}`,
          false,
          true,
        )
      }
      const data = (await res.json()) as {
        data?: Array<{
          id: number
          product_id: number
          name: string
          sku: string
          color: string
          size: string
          price: string
          in_stock: boolean
        }>
      }
      return (data.data ?? []).map((v) => ({
        id: String(v.id),
        productId: String(v.product_id),
        name: v.name,
        sku: v.sku,
        color: v.color?.toLowerCase() ?? 'standard',
        size: v.size?.toLowerCase() ?? 'onesize',
        costMinor: Math.round(parseFloat(v.price || '0') * 100).toString(),
        currency: 'USD',
        available: v.in_stock === true,
      }))
    } catch (err) {
      if (err instanceof PodProviderError) throw err
      throw new PodProviderError(
        'provider-unavailable',
        'Printful variant lookup unavailable.',
        true,
        false,
      )
    }
  }

  async getTemplates(remoteVariantId: string): Promise<readonly PodTemplate[]> {
    // No provider template discovery is implemented. Never manufacture dimensions.
    void remoteVariantId
    return []
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

    const allowed = ['image/png', 'image/tiff', 'application/pdf']
    if (!allowed.includes(file.mimeType)) {
      issues.push(`Unsupported file type: ${file.mimeType}. Printful requires PNG, TIFF, or PDF.`)
    }
    if (file.sizeBytes > 50 * 1024 * 1024) {
      issues.push('File exceeds maximum allowable size of 50MB.')
    }
    if (file.dpi < 150) {
      issues.push(`Artwork DPI (${file.dpi}) is below Printful minimum 150 DPI requirement.`)
    } else if (file.dpi < 300) {
      warnings.push(`Artwork DPI is ${file.dpi}; Printful recommends 300 DPI for best fidelity.`)
    }

    return { valid: issues.length === 0, issues, warnings }
  }

  async uploadPrintFile(file: {
    filename: string
    mimeType: string
    content: Buffer | Uint8Array
    hash: string
  }): Promise<{ remoteFileId: string; downloadUrl: string }> {
    void file
    throw new PodProviderError(
      'configuration',
      'Printful file upload is unavailable: no provider upload response is implemented.',
      false,
      true,
    )
  }

  async preflight(input: PodPreflightInput): Promise<PodPreflightResult> {
    void input
    throw new PodProviderError(
      'configuration',
      'Printful live preflight and mockup generation are unavailable.',
      false,
      true,
    )
  }

  async estimateCost(input: PodCostEstimateInput): Promise<PodCostEstimate> {
    void input
    throw new PodProviderError(
      'configuration',
      'Printful live price and shipping estimation are unavailable.',
      false,
      true,
    )
  }

  async createOrder(input: PodCreateOrderInput): Promise<PodOrderResult> {
    // CRITICAL: Live Creation Protection Gate
    if (!this.allowLiveCreation) {
      throw new PodProviderError(
        'configuration',
        'Live Printful order creation is protected: requires allowLiveCreation: true and RENEGADE_POD_ALLOW_LIVE_CREATION="true". Live order creation is excluded from test suites and CI.',
        false,
        true,
      )
    }

    const body = {
      external_id: input.idempotencyKey,
      recipient: {
        name: input.recipient.name,
        address1: input.recipient.address1,
        address2: input.recipient.address2,
        city: input.recipient.city,
        state_code: input.recipient.state,
        country_code: input.recipient.country,
        zip: input.recipient.postalCode,
        phone: input.recipient.phone,
        email: input.recipient.email,
      },
      items: input.items.map((item) => ({
        variant_id: Number(item.variantId),
        quantity: item.quantity,
        files: item.printAreas.map((pa) => ({
          type: pa.area,
          url: pa.artworkUrl,
        })),
      })),
    }

    try {
      const res = await this.fetch(`${this.apiBaseUrl}/orders`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        await res.body?.cancel()
        throw new PodProviderError(
          'invalid-request',
          `Printful rejected order creation (HTTP ${res.status}).`,
          res.status >= 500,
          res.status < 500,
          res.headers.get('x-request-id') ?? undefined,
          res.status,
        )
      }

      const raw = (await res.json()) as { result: { id: number; status: string } }
      if (!raw.result?.id || !raw.result.status)
        throw new PodProviderError(
          'unknown-outcome',
          'Printful response lacks order identity/status.',
          false,
          false,
        )
      const data = { data: raw.result }
      return {
        externalOrderId: String(data.data.id),
        state: normalizePrintfulOrderState(data.data.status),
        providerStatus: data.data.status,
        requestId: res.headers.get('x-request-id') ?? undefined,
        createdAt: new Date().toISOString(),
      }
    } catch (err) {
      if (err instanceof PodProviderError) throw err
      throw new PodProviderError(
        'provider-unavailable',
        'Printful submission response was lost; reconcile before retrying.',
        true,
        false,
      )
    }
  }

  async getOrder(externalOrderId: string): Promise<PodOrderResult> {
    try {
      const res = await this.fetch(
        `${this.apiBaseUrl}/orders/${encodeURIComponent(externalOrderId)}`,
        {
          headers: this.headers(),
        },
      )
      if (!res.ok) {
        throw new PodProviderError(
          res.status === 404 ? 'not-found' : 'provider-unavailable',
          `Printful lookup returned HTTP ${res.status}.`,
          res.status >= 500 || res.status === 429,
          res.status === 404,
          res.headers.get('x-request-id') ?? undefined,
          res.status,
        )
      }
      const raw = (await res.json()) as {
        result: {
          id: number
          status: string
          costs?: { total: string; currency: string }
          shipments?: Array<{
            id: number
            carrier: string
            tracking_number: string
            tracking_url: string
            ship_date: string
          }>
        }
      }

      if (!raw.result?.id || !raw.result.status)
        throw new PodProviderError(
          'unknown-outcome',
          'Printful response lacks order identity/status.',
          false,
          false,
        )
      const data = { data: raw.result }
      const fulfillments = (data.data.shipments ?? []).map((s) => ({
        fulfillmentId: String(s.id),
        status: 'shipped' as const,
        lineIndices: [], // Provider shipment-to-local-line mapping is not available; do not invent it.
        carrier: s.carrier,
        trackingNumber: s.tracking_number,
        trackingUrl: s.tracking_url,
        shippedAt: s.ship_date,
      }))

      return {
        externalOrderId: String(data.data.id),
        state: normalizePrintfulOrderState(data.data.status),
        providerStatus: data.data.status,
        requestId: res.headers.get('x-request-id') ?? undefined,
        costMinor: data.data.costs
          ? Math.round(parseFloat(data.data.costs.total) * 100).toString()
          : undefined,
        currency: data.data.costs?.currency ?? 'USD',
        fulfillments,
      }
    } catch (err) {
      if (err instanceof PodProviderError) throw err
      throw new PodProviderError(
        'provider-unavailable',
        'Printful order lookup unavailable.',
        true,
        false,
      )
    }
  }

  async findOrderByIdempotencyKey(key: string): Promise<PodOrderResult | null> {
    try {
      return await this.getOrder(`@${key}`)
    } catch (error) {
      if (error instanceof PodProviderError && error.code === 'not-found') return null
      throw error
    }
  }

  async cancelOrder(
    externalOrderId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    try {
      const res = await this.fetch(
        `${this.apiBaseUrl}/orders/${encodeURIComponent(externalOrderId)}`,
        {
          method: 'DELETE',
          headers: this.headers(),
        },
      )
      if (!res.ok) {
        await res.body?.cancel()
        return {
          cancelled: false,
          reason: `Printful rejected cancellation (HTTP ${res.status}).`,
        }
      }
      return { cancelled: true, reason }
    } catch (err) {
      return {
        cancelled: false,
        reason: 'Printful cancellation response unavailable; reconcile before any further action.',
      }
    }
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
      const payload = JSON.parse(rawBody) as {
        type: string
        created: number
        data?: {
          order?: {
            id: number
            external_id?: string
            status: string
          }
          shipment?: {
            id: number
            carrier: string
            tracking_number: string
            tracking_url: string
          }
        }
      }

      const externalOrderId = String(payload.data?.order?.id ?? '')
      if (
        !externalOrderId ||
        !['package_shipped', 'order_canceled', 'order_failed', 'order_created'].includes(
          payload.type,
        ) ||
        !Number.isFinite(payload.created) ||
        payload.created <= 0
      )
        return null
      const occurredAt = new Date((payload.created || Date.now() / 1000) * 1000).toISOString()

      let kind: NormalizedPodEvent['kind'] = 'order_created'
      if (payload.type === 'package_shipped') kind = 'shipped'
      else if (payload.type === 'order_canceled') kind = 'cancelled'
      else if (payload.type === 'order_failed') kind = 'failed'
      else if (payload.type === 'order_created') kind = 'order_created'

      return {
        providerEventId: `pf_evt_${payload.created}_${externalOrderId}`,
        providerKey: this.key,
        externalOrderId,
        kind,
        occurredAt,
        tracking: payload.data?.shipment
          ? {
              carrier: payload.data.shipment.carrier,
              trackingNumber: payload.data.shipment.tracking_number,
              trackingUrl: payload.data.shipment.tracking_url,
            }
          : undefined,
        rawEvidence: payload as Record<string, unknown>,
      }
    } catch {
      return null
    }
  }
}
