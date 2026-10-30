import { PodEmulatorAdapter } from './pod-emulator'
import {
  PodProviderError,
  type PodProviderAdapter,
  type PodOrderResult,
  type NormalizedPodEvent,
} from './pod-contract'
import { PrintfulPodAdapter } from './pod-real-provider'
import { PrintifyPodAdapter } from './pod-printify'

/** Explicit local adapter contract harness. Never selected from browser input or in production. */
export class PodSimulatorAdapter extends PodEmulatorAdapter {
  override readonly key: string
  constructor(
    private readonly endpoint: string,
    providerKey: string,
    private readonly connectionId: string,
  ) {
    super()
    const url = new URL(endpoint)
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.RENEGADE_POD_SIMULATOR_ENABLED !== 'true' ||
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.pathname !== '/'
    )
      throw new PodProviderError(
        'configuration',
        'POD simulator requires explicitly enabled loopback development configuration.',
        false,
        true,
      )
    if (!['printful', 'printify', 'pod-emulator'].includes(providerKey))
      throw new PodProviderError('configuration', 'Unsupported simulator provider.', false, true)
    this.key = providerKey
  }
  private async call<T>(operation: string, input: unknown): Promise<T> {
    try {
      const response = await fetch(
        `${this.endpoint.replace(/\/$/, '')}/adapter/${this.key}/${encodeURIComponent(this.connectionId)}/${operation}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.RENEGADE_POD_SIMULATOR_TOKEN ?? ''}`,
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      )
      const data = await response.json()
      if (!response.ok)
        throw new PodProviderError(
          data.code ?? 'provider-unavailable',
          `Local POD simulator returned HTTP ${response.status}.`,
          data.retryable === true,
          data.outcomeKnown === true,
          response.headers.get('x-request-id') ?? undefined,
          response.status,
        )
      return data as T
    } catch (error) {
      if (error instanceof PodProviderError) throw error
      throw new PodProviderError(
        'unknown-outcome',
        'Local simulator response unavailable; reconcile before retry.',
        false,
        false,
      )
    }
  }
  override health() {
    return this.call<Awaited<ReturnType<PodProviderAdapter['health']>>>('health', {})
  }
  override getCatalog() {
    return this.call<Awaited<ReturnType<PodProviderAdapter['getCatalog']>>>('catalog', {})
  }
  override getVariants(productId: string) {
    return this.call<Awaited<ReturnType<PodProviderAdapter['getVariants']>>>('variants', {
      productId,
    })
  }
  override getTemplates(variantId: string) {
    return this.call<Awaited<ReturnType<PodProviderAdapter['getTemplates']>>>('templates', {
      variantId,
    })
  }
  override preflight(input: Parameters<PodProviderAdapter['preflight']>[0]) {
    return this.call<Awaited<ReturnType<PodProviderAdapter['preflight']>>>('preflight', input)
  }
  override createOrder(input: Parameters<PodProviderAdapter['createOrder']>[0]) {
    return this.call<PodOrderResult>('create', input)
  }
  override getOrder(externalOrderId: string) {
    return this.call<PodOrderResult>('get', { externalOrderId })
  }
  findOrderByIdempotencyKey(idempotencyKey: string) {
    return this.call<PodOrderResult | null>('find', { idempotencyKey })
  }
  override cancelOrder(externalOrderId: string, reason?: string) {
    return this.call<{ cancelled: boolean; reason?: string }>('cancel', { externalOrderId, reason })
  }
  override verifyWebhook(
    rawBody: string,
    signature: string,
    secret: string,
  ): NormalizedPodEvent | null {
    if (this.key === 'printful') {
      const adapter = new PrintfulPodAdapter({ apiKey: 'simulator-test-token-valid' })
      const verified = adapter.verifyWebhook(rawBody, signature, secret)
      if (verified) return verified
    }
    if (this.key === 'printify') {
      const adapter = new PrintifyPodAdapter({ apiKey: 'simulator-test-token-valid' })
      const verified = adapter.verifyWebhook(rawBody, signature, secret)
      if (verified) return verified
    }
    return super.verifyWebhook(rawBody, signature, secret)
  }
}
