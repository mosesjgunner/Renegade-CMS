import { describe, expect, it } from 'vitest'
import {
  applyPosCompletion,
  createCryptoInvoice,
  invoiceFingerprint,
  observeCryptoPayment,
  posCanOperate,
  quoteIsUsable,
  type CryptoQuote,
  type PosPayment,
} from '../../src/modules/commerce/pos'

const quote: CryptoQuote = {
  provider: 'fixture-rate',
  fiatCurrency: 'USD',
  fiatAmountMinor: '1250',
  network: 'bitcoin',
  asset: 'BTC',
  assetAmount: '0.0002',
  rate: '62500000',
  quotedAt: '2099-08-25T00:00:00.000Z',
  expiresAt: '2099-08-25T00:10:00.000Z',
  manual: false,
}
const invoice = createCryptoInvoice({
  paymentIntentId: 'pi-pos',
  merchantConnectionId: 'merchant-a',
  network: 'bitcoin',
  asset: 'BTC',
  destination: 'bc1qmerchantfixture',
  exactAmount: '0.0002',
  reference: 'order-pos-1',
  expiresAt: quote.expiresAt,
  quote,
})
const base: PosPayment = {
  state: 'awaiting_payment',
  requiredConfirmations: 2,
  observations: [],
  inventoryApplied: false,
  receiptIssued: false,
}
const observation = (
  more: Partial<{
    id: string
    transactionHash: string
    paymentIntentId: string
    network: string
    asset: string
    destination: string
    amount: string
    confirmations: number
    reorged: boolean
  }> = {},
) => ({
  id: 'obs-1',
  transactionHash: 'tx-1',
  paymentIntentId: 'pi-pos',
  network: 'bitcoin',
  asset: 'BTC',
  destination: 'bc1qmerchantfixture',
  amount: '0.0002',
  confirmations: 0,
  observedAt: '2099-08-25T00:01:00.000Z',
  ...more,
})

describe('local crypto POS', () => {
  it('binds an exact-amount QR URI to one intent without secrets', () => {
    expect(invoice.uri).toContain('bitcoin:bc1qmerchantfixture?')
    expect(invoice.uri).toContain('amount=0.0002')
    expect(invoice.uri).toContain('intent=pi-pos')
    expect(invoice.privateKeyBoundary).toBe('never-received')
    expect(invoiceFingerprint(invoice)).toMatch(/^sha256:/)
  })
  it('rejects wrong destination, network, asset, amount, and expired invoices', () => {
    expect(() =>
      observeCryptoPayment(base, invoice, observation({ destination: 'bc1qother' })),
    ).toThrow('destination')
    expect(() => observeCryptoPayment(base, invoice, observation({ network: 'ethereum' }))).toThrow(
      'network',
    )
    expect(() => observeCryptoPayment(base, invoice, observation({ asset: 'ETH' }))).toThrow(
      'asset',
    )
    expect(observeCryptoPayment(base, invoice, observation({ amount: '0.0001' })).state).toBe(
      'underpaid',
    )
    expect(observeCryptoPayment(base, invoice, observation({ amount: '0.0003' })).state).toBe(
      'overpaid',
    )
    expect(
      observeCryptoPayment(base, invoice, observation(), '2099-08-25T00:11:00.000Z').state,
    ).toBe('expired')
  })
  it('progresses only from server observation and applies inventory/receipt once', () => {
    const detected = observeCryptoPayment(base, invoice, observation())
    expect(detected.state).toBe('detected')
    const confirming = observeCryptoPayment(base, invoice, observation({ confirmations: 1 }))
    expect(confirming.state).toBe('confirming')
    const confirmed = observeCryptoPayment(base, invoice, observation({ confirmations: 2 }))
    expect(confirmed.state).toBe('confirmed')
    const complete = applyPosCompletion(confirmed)
    expect(applyPosCompletion(complete)).toEqual(complete)
    expect(observeCryptoPayment(confirmed, invoice, observation({ confirmations: 2 }))).toEqual(
      confirmed,
    )
  })
  it('requires reconciliation on a reorg and isolates merchant wallet/permission scope', () => {
    expect(observeCryptoPayment(base, invoice, observation({ reorged: true })).state).toBe(
      'reconciliation_required',
    )
    expect(
      posCanOperate({
        actorRole: 'staff',
        merchantConnectionId: 'merchant-a',
        spaceMerchantConnectionId: 'merchant-a',
        enabled: true,
      }),
    ).toBe(true)
    expect(
      posCanOperate({
        actorRole: 'staff',
        merchantConnectionId: 'merchant-a',
        spaceMerchantConnectionId: 'merchant-b',
        enabled: true,
      }),
    ).toBe(false)
    expect(
      posCanOperate({
        actorRole: 'member',
        merchantConnectionId: 'merchant-a',
        spaceMerchantConnectionId: 'merchant-a',
        enabled: true,
      }),
    ).toBe(false)
  })
  it('retains quote expiry and supports explicitly marked manual fallback only', () => {
    expect(quoteIsUsable(quote, '2099-08-25T00:09:00.000Z')).toBe(true)
    expect(quoteIsUsable(quote, '2099-08-25T00:11:00.000Z')).toBe(false)
    expect(
      createCryptoInvoice({
        ...invoice,
        quote: { ...quote, manual: true, expiresAt: '2000-01-01T00:00:00.000Z' },
      }).quote.manual,
    ).toBe(true)
  })
})

it('uses remote adapter evidence rather than a customer success assertion', async () => {
  const {
    clientCryptoSuccessCannotConfirmPayment,
    posInventoryIdempotencyKey,
    verifyInvoiceServerSide,
  } = await import('../../src/modules/commerce/pos')
  expect(clientCryptoSuccessCannotConfirmPayment()).toBe(false)
  expect(posInventoryIdempotencyKey('order-1', 'shirt-blue')).toBe(
    'pos.inventory:order-1:shirt-blue',
  )
  const verified = await verifyInvoiceServerSide(
    { key: 'fixture-indexer', observe: async () => [observation({ confirmations: 2 })] },
    base,
    invoice,
  )
  expect(verified.state).toBe('confirmed')
})
