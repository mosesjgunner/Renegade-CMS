import { describe, expect, it } from 'vitest'
import {
  appendFinancialEvent,
  quoteOrderLines,
  type PaymentIntent,
} from '../../src/modules/commerce/contracts'
import { assertCheckoutQuote, snapshotQuotedLines } from '../../src/modules/commerce/service'

const scope = { siteId: 'site', spaceId: 'space', merchantConnectionId: 'merchant' }
describe('Commerce canonical contract', () => {
  it('prices only published server catalog data and rejects client-total tampering', () => {
    const lines = snapshotQuotedLines({
      currency: 'USD',
      cartLines: [
        {
          productId: 'p',
          variantSku: 'v',
          quantity: 2,
          merchantConnectionId: 'merchant',
          kind: 'digital',
        },
      ],
      products: [
        {
          id: 'p',
          name: 'Guide',
          state: 'published',
          kind: 'digital',
          variants: [{ sku: 'v', title: 'PDF' }],
          prices: [{ currency: 'USD', amountMinor: '1250', variantSku: 'v' }],
        },
      ],
    })
    expect(quoteOrderLines(lines)).toEqual({ amountMinor: '2500', currency: 'USD' })
    expect(() => assertCheckoutQuote({ lines, currency: 'USD', amountMinor: '1' })).toThrow(
      'differs',
    )
  })
  it('does not let an out-of-order success resurrect a cancelled payment', () => {
    const intent: PaymentIntent = {
      id: 'pi',
      scope,
      capabilityId: 'card',
      state: 'cancelled',
      expiresAt: '2026-12-01T00:00:00Z',
      money: {
        amountMinor: '2500',
        currency: 'USD',
        quotedAt: '2026-01-01T00:00:00Z',
        quoteSource: 'catalog',
        buyerConfirmedConversion: false,
      },
      financialEvents: [],
    }
    expect(
      appendFinancialEvent(intent, {
        id: 'late',
        intentId: 'pi',
        kind: 'confirmed',
        money: intent.money,
        providerEventId: 'evt-late',
        occurredAt: '2026-01-01T00:01:00Z',
      }).state,
    ).toBe('cancelled')
  })
})
