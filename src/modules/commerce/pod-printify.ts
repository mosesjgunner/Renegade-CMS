import { createHmac, timingSafeEqual } from 'node:crypto'
import { PrintfulPodAdapter, PRINTFUL_CAPABILITIES } from './pod-real-provider'
import {
  PodProviderError,
  type PodCreateOrderInput,
  type PodOrderResult,
  type NormalizedPodEvent,
} from './pod-contract'

export function normalizePrintifyOrderState(status: string): PodOrderResult['state'] {
  switch (status) {
    case 'on-hold':
    case 'payment-not-received':
      return 'on_hold'
    case 'pending':
      return 'submitted'
    case 'sending-to-production':
    case 'in-production':
      return 'in_production'
    case 'partially-fulfilled':
      return 'partially_shipped'
    case 'fulfilled':
      return 'shipped'
    case 'canceled':
      return 'cancelled'
    case 'has-issues':
      return 'failed'
    default:
      return 'exception'
  }
}

export class PrintifyPodAdapter extends PrintfulPodAdapter {
  override readonly key = 'printify'
  private readonly shopId?: string
  private readonly printifyApiKey: string
  private readonly printifyBaseUrl: string
  private readonly clientFetch: typeof fetch
  override readonly capabilities = {
    ...PRINTFUL_CAPABILITIES,
    supportsCancellation: false,
    supportsAutomaticReprint: false,
  }
  override readonly metadata = {
    implementationVersion: 'rc1-13b.printify.v1',
    providerApiVersion: 'v1',
    mode: 'live-configured' as const,
    liveCreationOptInRequired: true,
  }
  constructor(options: {
    apiKey: string
    shopId?: string
    baseUrl?: string
    fetchFn?: typeof fetch
    allowLiveCreation?: boolean
  }) {
    super({
      apiKey: options.apiKey,
      apiBaseUrl: options.baseUrl ?? 'https://api.printify.com/v1',
      fetchFn: options.fetchFn,
      allowLiveCreation: options.allowLiveCreation,
    })
    this.shopId = options.shopId
    this.printifyApiKey = options.apiKey
    this.printifyBaseUrl = options.baseUrl ?? 'https://api.printify.com/v1'
    this.clientFetch = options.fetchFn ?? globalThis.fetch
  }
  private async client(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.printifyBaseUrl}${path}`
    return this.clientFetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.printifyApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Renegade-CMS-POD/1.0',
        ...((init.headers as Record<string, string>) ?? {}),
      },
    })
  }
  override async health() {
    if (!this.shopId)
      return {
        ready: false,
        health: 'unavailable' as const,
        reason: 'Printify shop identity is required before submission.',
      }
    return super.health()
  }
  private parse(data: any, requestId?: string): PodOrderResult {
    if (!data || !data.id || !data.status) {
      throw new PodProviderError(
        'unknown-outcome',
        'Malformed Printify response payload; reconcile before proceeding.',
        false,
        false,
        requestId,
      )
    }
    return {
      externalOrderId: String(data.id),
      providerStatus: String(data.status),
      requestId,
      state: normalizePrintifyOrderState(String(data.status)),
      costMinor:
        data.total_price != null ? String(Math.round(Number(data.total_price))) : undefined,
      currency: data.currency ? String(data.currency) : 'USD',
      fulfillments: Array.isArray(data.shipments)
        ? data.shipments.map((s: any, idx: number) => ({
            fulfillmentId: String(s.id ?? `shipment_${idx}`),
            status:
              data.status === 'fulfilled'
                ? ('shipped' as const)
                : data.status === 'canceled'
                  ? ('cancelled' as const)
                  : ('in_production' as const),
            lineIndices: Array.isArray(s.line_items)
              ? s.line_items.map((_: any, i: number) => i)
              : [0],
            carrier: s.carrier ? String(s.carrier) : undefined,
            trackingNumber: s.number ? String(s.number) : undefined,
            trackingUrl: s.url ? String(s.url) : undefined,
            shippedAt: s.delivered_at ?? s.shipped_at,
          }))
        : [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
  override async createOrder(input: PodCreateOrderInput): Promise<PodOrderResult> {
    if (
      this.metadata.liveCreationOptInRequired &&
      process.env.RENEGADE_POD_ALLOW_LIVE_CREATION !== 'true'
    )
      throw new PodProviderError(
        'configuration',
        'Live Printify creation is disabled. Set RENEGADE_POD_ALLOW_LIVE_CREATION=true to authorize external orders.',
        false,
        true,
      )
    if (!this.shopId)
      throw new PodProviderError('configuration', 'Printify shopId is required.', false, true)
    const lineItems = input.items.map((item) => {
      const parts = item.variantId.split(':')
      const blueprintId = Number(parts[0])
      const variantId = Number(parts[1] ?? parts[0])
      const printAreas = item.printAreas.map((area) => ({
        position: area.area,
        images: [{ id: area.artworkId, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
      }))
      return {
        product_id: item.remoteProductId,
        blueprint_id: blueprintId,
        variant_id: variantId,
        quantity: item.quantity,
        print_areas: printAreas,
      }
    })
    const payload = {
      external_id: input.idempotencyKey,
      label: input.orderId,
      line_items: lineItems,
      shipping_method: 1,
      send_shipping_notification: false,
      address_to: {
        first_name: input.recipient.name.split(' ')[0] ?? '',
        last_name: input.recipient.name.split(' ').slice(1).join(' ') || 'Customer',
        email: input.recipient.email ?? 'orders@renegade.local',
        phone: input.recipient.phone ?? '',
        country: input.recipient.country,
        region: input.recipient.state ?? '',
        address1: input.recipient.address1,
        address2: input.recipient.address2 ?? '',
        city: input.recipient.city,
        zip: input.recipient.postalCode,
      },
    }
    const response = await this.client(`/shops/${this.shopId}/orders.json`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (!response.ok) {
      if (response.status === 400 || response.status === 422)
        throw new PodProviderError(
          'invalid-request',
          `Printify rejected the order payload (HTTP ${response.status}).`,
          false,
          true,
          requestId,
          response.status,
        )
      if (response.status === 401 || response.status === 403)
        throw new PodProviderError(
          'authentication',
          'Printify credentials rejected.',
          false,
          true,
          requestId,
          response.status,
        )
      if (response.status === 404)
        throw new PodProviderError(
          'not-found',
          'Printify target shop/product not found.',
          false,
          true,
          requestId,
          response.status,
        )
      throw new PodProviderError(
        'unknown-outcome',
        'Printify create response was non-terminal; reconcile with external_id before retrying.',
        false,
        false,
        requestId,
        response.status,
      )
    }
    return this.parse(data, requestId)
  }
  override async getOrder(externalOrderId: string): Promise<PodOrderResult> {
    if (!this.shopId)
      throw new PodProviderError('configuration', 'Printify shopId is required.', false, true)
    const response = await this.client(`/shops/${this.shopId}/orders/${externalOrderId}.json`)
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (response.status === 404)
      throw new PodProviderError(
        'not-found',
        `Printify order ${externalOrderId} was not found.`,
        false,
        true,
        requestId,
        404,
      )
    if (!response.ok)
      throw new PodProviderError(
        'provider-unavailable',
        `Printify getOrder failed with HTTP ${response.status}.`,
        true,
        false,
        requestId,
        response.status,
      )
    const data = await response.json().catch(() => ({}))
    return this.parse(data, requestId)
  }
  override async findOrderByIdempotencyKey(key: string): Promise<PodOrderResult | null> {
    if (!this.shopId)
      throw new PodProviderError('configuration', 'Printify shopId is required.', false, true)
    const response = await this.client(`/shops/${this.shopId}/orders.json?limit=50`)
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (!response.ok)
      throw new PodProviderError(
        'provider-unavailable',
        `Printify search failed with HTTP ${response.status}.`,
        true,
        false,
        requestId,
        response.status,
      )
    const value = await response.json()
    const matching = (value.data ?? []).filter(
      (o: { external_id?: string }) => o.external_id === key,
    )
    if (matching.length !== 1) return null
    return this.parse(matching[0], requestId)
  }
  override async cancelOrder() {
    return {
      cancelled: false,
      reason:
        'Cancel through the Printify operator dashboard, then reconcile. Automatic cancellation is unavailable.',
    }
  }
  override verifyWebhook(
    rawBody: string,
    signature: string,
    secret: string,
  ): NormalizedPodEvent | null {
    if (!signature || !secret) return null
    const cleanSig = signature.replace(/^sha256=/, '')
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    if (
      cleanSig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(cleanSig), Buffer.from(expected))
    ) {
      return null
    }
    try {
      const data = JSON.parse(rawBody)
      const externalOrderId = String(data.id ?? data.order_id ?? data.resource?.id ?? '')
      const type = String(data.type ?? data.event ?? '')
      let kind: NormalizedPodEvent['kind'] = 'order_created'
      if (type.includes('ship')) kind = 'shipped'
      else if (type.includes('cancel')) kind = 'cancelled'
      else if (type.includes('fail')) kind = 'failed'
      return {
        providerEventId: String(data.event_id ?? `prn_evt_${Date.now()}_${externalOrderId}`),
        providerKey: this.key,
        externalOrderId,
        kind,
        occurredAt: new Date().toISOString(),
        tracking: data.shipment
          ? {
              carrier: data.shipment.carrier,
              trackingNumber: data.shipment.tracking_number,
              trackingUrl: data.shipment.url,
            }
          : undefined,
        rawEvidence: data,
      }
    } catch {
      return null
    }
  }
}
