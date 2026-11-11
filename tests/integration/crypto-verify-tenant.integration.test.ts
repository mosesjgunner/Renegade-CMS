/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '../../src/app/(frontend)/api/commerce/crypto/verify/route'

/**
 * TA-P0-2 regression: the crypto verification endpoint settles orders from
 * submitted transaction ids. It must (a) bind the request to the tenant
 * that owns the intent (the caller's host must resolve to the intent's
 * site, as every sibling commerce route requires), (b) treat a
 * transaction as single-use across intents (destination and amount repeat
 * across invoices, so one observed transaction must not settle later
 * same-price intents), and (c) refuse to settle on fixture evidence in
 * production posture. Re-posting a transaction against its own intent
 * remains a replay-safe confirmation refresh.
 */

const observation = (transactionId: string) => ({
  transactionId,
  network: 'evm:1',
  asset: 'ETH',
  destination: '0xWALLET',
  amountAtomic: '1000',
  confirmations: 12,
  observedAt: '2026-11-01T00:00:00.000Z',
  orphaned: false,
})

const invoice = (reference: string, transactionIds: string[] = []) => ({
  network: 'evm:1',
  asset: 'ETH',
  exactAmountAtomic: '1000',
  destination: '0xWALLET',
  reference,
  uri: 'ethereum:0xWALLET?amount=1000',
  qrPayload: 'ethereum:0xWALLET?amount=1000',
  expiresAt: '2999-01-01T00:00:00.000Z',
  requiredConfirmations: 6,
  state: transactionIds.length ? 'confirmed' : 'created',
  confirmations: transactionIds.length ? 12 : 0,
  transactionIds,
})

let intents: any[] = []
let sessions: any[] = []
let connections: any[] = []

const { mockFinalizeVerifiedOrder } = vi.hoisted(() => ({
  mockFinalizeVerifiedOrder: vi.fn(async () => ({ order: { id: 'order-1' } })),
}))

const mockPayload = {
  findByID: vi.fn(async (args: any) => {
    const pool =
      args.collection === 'payment-intents'
        ? intents
        : args.collection === 'checkout-sessions'
          ? sessions
          : args.collection === 'merchant-connections'
            ? connections
            : []
    const found = pool.find((item) => String(item.id) === String(args.id))
    if (!found) throw new Error('Not found')
    return found
  }),
  find: vi.fn(async (args: any) => {
    if (args.collection !== 'payment-intents') return { docs: [] }
    const excluded = args.where?.id?.not_equals
    return {
      docs: intents.filter((item) => String(item.id) !== String(excluded)),
    }
  }),
  update: vi.fn(async (args: any) => {
    const pool =
      args.collection === 'payment-intents'
        ? intents
        : args.collection === 'checkout-sessions'
          ? sessions
          : []
    const found = pool.find((item) => String(item.id) === String(args.id))
    if (found) Object.assign(found, args.data)
    return { id: args.id, ...args.data }
  }),
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))
vi.mock('@/modules/commerce/site-scope', () => ({
  catalogSiteForHost: vi.fn(async (_payload: unknown, host: string | null) => {
    if (host === 'shop-a.test') return 'site-a'
    if (host === 'shop-b.test') return 'site-b'
    return ''
  }),
}))
vi.mock('@/modules/commerce/service', async () => {
  const contracts = await import('../../src/modules/commerce/contracts')
  return {
    createFixtureCryptoAdapter: (_key: string, observations: readonly any[] = []) => ({
      key: _key,
      createInvoice: async () => {
        throw new Error('not used by this route test')
      },
      getObservation: async (transactionId: string) =>
        observations.find((item) => item.transactionId === transactionId) ?? null,
    }),
    verifySubmittedCryptoTransaction: async (input: {
      adapter: { getObservation: (tx: string) => Promise<any> }
      invoice: any
      transactionId: string
      now: string
    }) => {
      const obs = await input.adapter.getObservation(input.transactionId)
      if (!obs) throw new Error('Transaction was not found by the configured chain adapter.')
      return contracts.verifyCryptoObservation(input.invoice, obs, input.now)
    },
    finalizeVerifiedOrder: mockFinalizeVerifiedOrder,
  }
})

function verifyRequest(host: string, body: unknown) {
  return new Request(`http://${host}/api/commerce/crypto/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host },
    body: JSON.stringify(body),
  })
}

const originalNodeEnv = process.env.NODE_ENV
const setNodeEnv = (value: string) => {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

describe('Crypto verify — tenant binding, single-use, posture (TA-P0-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intents = [
      {
        id: 'intent-1',
        site: 'site-a',
        merchantConnection: 'conn-a',
        providerKey: 'fixture-eth',
        checkoutSession: 'sess-1',
        state: 'paid',
        cryptoInvoice: invoice('intent-1', ['tx-1']),
      },
      {
        id: 'intent-2',
        site: 'site-a',
        merchantConnection: 'conn-a',
        providerKey: 'fixture-eth',
        checkoutSession: 'sess-2',
        state: 'pending',
        cryptoInvoice: invoice('intent-2'),
      },
    ]
    sessions = [
      { id: 'sess-1', site: 'site-a', state: 'completed' },
      { id: 'sess-2', site: 'site-a', state: 'pending' },
    ]
    connections = [
      {
        id: 'conn-a',
        site: 'site-a',
        configuration: {
          crypto: { fixtureObservations: [observation('tx-1'), observation('tx-9')] },
        },
      },
    ]
  })

  afterEach(() => {
    setNodeEnv(originalNodeEnv as string)
    delete process.env.LOCAL_E2E_TEST_MODE
  })

  it('settles a fresh intent from its own site’s host', async () => {
    const res = await POST(
      verifyRequest('shop-a.test', { intentId: 'intent-2', transactionId: 'tx-9' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.confirmed).toBe(true)
    expect(intents[1].state).toBe('paid')
    expect(sessions[1].state).toBe('completed')
    expect(mockFinalizeVerifiedOrder).toHaveBeenCalledTimes(1)
  })

  it('treats the intent as not found from another site’s host', async () => {
    const res = await POST(
      verifyRequest('shop-b.test', { intentId: 'intent-2', transactionId: 'tx-9' }),
    )

    expect(res.status).toBe(404)
    expect(mockPayload.update).not.toHaveBeenCalled()
    expect(mockFinalizeVerifiedOrder).not.toHaveBeenCalled()
    expect(intents[1].state).toBe('pending')
  })

  it('treats the intent as not found from an unknown host', async () => {
    const res = await POST(
      verifyRequest('unknown.example', { intentId: 'intent-2', transactionId: 'tx-9' }),
    )

    expect(res.status).toBe(404)
    expect(mockPayload.update).not.toHaveBeenCalled()
    expect(mockFinalizeVerifiedOrder).not.toHaveBeenCalled()
  })

  it('rejects replaying a transaction that already settled another intent', async () => {
    const res = await POST(
      verifyRequest('shop-a.test', { intentId: 'intent-2', transactionId: 'tx-1' }),
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toContain('already settled another payment intent')
    expect(intents[1].state).toBe('pending')
    expect(mockFinalizeVerifiedOrder).not.toHaveBeenCalled()
  })

  it('still allows re-posting a transaction against its own intent (confirmation refresh)', async () => {
    const res = await POST(
      verifyRequest('shop-a.test', { intentId: 'intent-1', transactionId: 'tx-1' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.confirmed).toBe(true)
  })

  it('refuses to settle on fixture evidence in production posture', async () => {
    setNodeEnv('production')
    delete process.env.LOCAL_E2E_TEST_MODE

    const res = await POST(
      verifyRequest('shop-a.test', { intentId: 'intent-2', transactionId: 'tx-9' }),
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error).toContain('only fixture evidence is configured')
    expect(intents[1].state).toBe('pending')
    expect(mockFinalizeVerifiedOrder).not.toHaveBeenCalled()
  })
})
