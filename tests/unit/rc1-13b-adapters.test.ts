import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  PrintifyPodAdapter,
  normalizePrintifyOrderState,
} from '../../src/modules/commerce/pod-printify'
import { adapterForPodConnection } from '../../src/modules/commerce/pod-adapters'
import { encryptCredential } from '../../src/modules/commerce/pod-connection'
import { PodSimulatorAdapter } from '../../src/modules/commerce/pod-simulator'

afterEach(() => vi.unstubAllEnvs())
describe('13B adapter selection and safe configuration', () => {
  it.each(['printful', 'printify'])(
    'selects the configured %s adapter without substituting an emulator',
    (key) => {
      vi.stubEnv('RENEGADE_POD_SIMULATOR_URL', '')
      const adapter = adapterForPodConnection({
        id: 'local',
        providerKey: key,
        status: 'active',
        encryptedApiKey: encryptCredential('local-never-live-token'),
        remoteStoreId: 'shop-local',
      })
      expect(adapter.key).toBe(key)
      expect(adapter.metadata.mode).toBe('live-configured')
    },
  )
  it('keeps missing credentials and unsupported providers unavailable', () => {
    vi.stubEnv('RENEGADE_POD_SIMULATOR_URL', '')
    expect(() => adapterForPodConnection({ providerKey: 'printify', status: 'active' })).toThrow(
      'not configured',
    )
    expect(() =>
      adapterForPodConnection({
        providerKey: 'unknown',
        status: 'active',
        encryptedApiKey: encryptCredential('local-only-token'),
      }),
    ).toThrow('not supported')
  })
  it.each([
    'http://example.test',
    'https://127.0.0.1',
    'http://localhost',
    'http://user:pass@127.0.0.1',
  ])('rejects simulator endpoint %s', (endpoint) => {
    vi.stubEnv('RENEGADE_POD_SIMULATOR_ENABLED', 'true')
    expect(() => new PodSimulatorAdapter(endpoint, 'printify', 'connection')).toThrow('loopback')
  })
  it('rejects simulator configuration in production and when not explicitly enabled', () => {
    vi.stubEnv('RENEGADE_POD_SIMULATOR_ENABLED', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    expect(
      () => new PodSimulatorAdapter('http://127.0.0.1:39026', 'printful', 'connection'),
    ).toThrow()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('RENEGADE_POD_SIMULATOR_ENABLED', '')
    expect(
      () => new PodSimulatorAdapter('http://127.0.0.1:39026', 'printful', 'connection'),
    ).toThrow()
  })
  it('process-local emulator cannot claim durable operator submission', () => {
    vi.stubEnv('RENEGADE_POD_SIMULATOR_URL', '')
    expect(() =>
      adapterForPodConnection({ providerKey: 'pod-emulator', status: 'active' }, 'orders'),
    ).toThrow('durable')
  })
  it('disabled connections cannot create or reconcile through another adapter', () => {
    expect(() =>
      adapterForPodConnection({ status: 'disabled', providerKey: 'pod-emulator' }),
    ).toThrow('disabled')
  })
})
describe('13B Printify response truth', () => {
  it.each([
    ['on-hold', 'on_hold'],
    ['pending', 'submitted'],
    ['in-production', 'in_production'],
    ['fulfilled', 'shipped'],
    ['has-issues', 'failed'],
    ['unexpected', 'exception'],
  ])('maps actual %s to %s', (input, expected) =>
    expect(normalizePrintifyOrderState(input)).toBe(expected),
  )
  it('retains real response identity and unknown provider status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'actual-id', status: 'new-status' }), {
        headers: { 'x-request-id': 'request-local' },
      }),
    )
    const adapter = new PrintifyPodAdapter({
      apiKey: 'local-only-token',
      shopId: 'shop-local',
      fetchFn,
    })
    expect(await adapter.getOrder('actual-id')).toMatchObject({
      externalOrderId: 'actual-id',
      state: 'exception',
      providerStatus: 'new-status',
      requestId: 'request-local',
    })
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.printify.com/v1/shops/shop-local/orders/actual-id.json',
    )
  })
  it('malformed provider JSON cannot become accepted fulfillment', async () => {
    const adapter = new PrintifyPodAdapter({
      apiKey: 'local-only-token',
      shopId: 'shop-local',
      fetchFn: vi.fn().mockResolvedValue(new Response('{}')),
    })
    await expect(adapter.getOrder('missing')).rejects.toMatchObject({ outcomeKnown: false })
  })
  it('live creation stays off without explicit opt-in', async () => {
    vi.stubEnv('RENEGADE_POD_ALLOW_LIVE_CREATION', '')
    const fetchFn = vi.fn()
    const adapter = new PrintifyPodAdapter({
      apiKey: 'local-only-token',
      shopId: 'shop-local',
      fetchFn,
    })
    await expect(
      adapter.createOrder({
        orderId: 'local',
        idempotencyKey: 'local',
        recipient: {
          name: 'Local',
          address1: '1 Test',
          city: 'Austin',
          country: 'US',
          postalCode: '78701',
        },
        items: [],
      }),
    ).rejects.toThrow('disabled')
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
