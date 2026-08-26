import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  grantCampaignEntitlement,
  publicCampaignProjection,
  verifyCryptoObservation,
} from '../../src/modules/commerce/contracts'
import {
  createFixtureCryptoAdapter,
  createFixturePodAdapter,
  submitPodOrderOnce,
  verifySubmittedCryptoTransaction,
} from '../../src/modules/commerce/service'

const invoice = {
  network: 'evm:1',
  asset: 'USDC',
  exactAmountAtomic: '1000000',
  destination: '0xCreator',
  qrPayload: 'ethereum:0xCreator?amount=1000000&chain_id=1',
  expiresAt: '2026-09-01T00:00:00.000Z',
  requiredConfirmations: 2,
  state: 'created' as const,
  confirmations: 0,
  transactionIds: [],
}
const observation = {
  transactionId: '0xtx',
  network: 'evm:1',
  asset: 'USDC',
  destination: '0xCreator',
  amountAtomic: '1000000',
  confirmations: 2,
  observedAt: '2026-08-25T00:00:00.000Z',
}

describe('Prompt 13 crypto, crowdfunding, and POD acceptance contracts', () => {
  it('confirms only an adapter-observed exact crypto payment and handles confirmation/reorg', async () => {
    expect(
      (
        await verifySubmittedCryptoTransaction({
          adapter: createFixtureCryptoAdapter('evm', [observation]),
          invoice,
          transactionId: '0xtx',
          now: observation.observedAt,
        })
      ).accepted,
    ).toBe(true)
    expect(
      verifyCryptoObservation(invoice, { ...observation, confirmations: 1 }, observation.observedAt)
        .invoice.state,
    ).toBe('confirming')
    expect(
      verifyCryptoObservation(invoice, { ...observation, orphaned: true }, observation.observedAt)
        .invoice.state,
    ).toBe('reorged')
    await expect(
      verifySubmittedCryptoTransaction({
        adapter: createFixtureCryptoAdapter('evm'),
        invoice,
        transactionId: 'client-claim',
        now: observation.observedAt,
      }),
    ).rejects.toThrow('not found')
  })
  it('rejects wrong routing, duplicates and amount variance, and records expiry as late', () => {
    expect(() =>
      verifyCryptoObservation(
        invoice,
        { ...observation, network: 'evm:137' },
        observation.observedAt,
      ),
    ).toThrow('network')
    expect(() =>
      verifyCryptoObservation(
        invoice,
        { ...observation, destination: '0xWrong' },
        observation.observedAt,
      ),
    ).toThrow('destination')
    expect(
      verifyCryptoObservation(
        invoice,
        { ...observation, amountAtomic: '999999' },
        observation.observedAt,
      ).invoice.state,
    ).toBe('underpaid')
    expect(
      verifyCryptoObservation(
        invoice,
        { ...observation, amountAtomic: '1000001' },
        observation.observedAt,
      ).invoice.state,
    ).toBe('overpaid')
    expect(() =>
      verifyCryptoObservation(
        { ...invoice, transactionIds: ['0xtx'] },
        observation,
        observation.observedAt,
      ),
    ).toThrow('Duplicate')
    expect(
      verifyCryptoObservation(
        { ...invoice, expiresAt: '2026-08-24T00:00:00.000Z' },
        observation,
        observation.observedAt,
      ).invoice.state,
    ).toBe('late')
  })
  it('grants a campaign entitlement and never leaks private campaign updates', () => {
    const grant = grantCampaignEntitlement({
      supporterId: 'supporter',
      campaignId: 'campaign',
      paymentIntentId: 'pi',
      entitlement: 'reward.pdf',
      now: observation.observedAt,
      fulfillmentReference: { productId: 'reward' },
    })
    expect(grant.source).toBe('campaign:campaign')
    expect(
      publicCampaignProjection({
        visibility: 'public' as const,
        progress: { raisedMinor: '1000' },
        updates: [{ visibility: 'public' }, { visibility: 'private' }],
      })?.updates,
    ).toHaveLength(1)
    expect(
      publicCampaignProjection({ visibility: 'private' as const, progress: {}, updates: [] }),
    ).toBeNull()
  })
  it('submits POD once, verifies webhook signatures, blocks restricted artwork, and scopes provider failure', async () => {
    const adapter = createFixturePodAdapter('printful', 'secret')
    const items = [{ sku: 'shirt-l', artwork: { id: 'art', rightsStatus: 'approved' } }]
    expect(
      (await submitPodOrderOnce({ orderId: 'order', idempotencyKey: 'pod:order', adapter, items }))
        .replay,
    ).toBe(false)
    expect(
      (
        await submitPodOrderOnce({
          orderId: 'order',
          idempotencyKey: 'pod:order',
          previous: { idempotencyKey: 'pod:order', externalOrderId: 'printful:order' },
          adapter,
          items,
        })
      ).replay,
    ).toBe(true)
    expect(() =>
      submitPodOrderOnce({
        orderId: 'blocked',
        idempotencyKey: 'blocked',
        adapter,
        items: [{ sku: 'x', artwork: { id: 'restricted', rightsStatus: 'restricted' } }],
      }),
    ).toThrow('not approved')
    const raw = JSON.stringify({
      id: 'fulfill-1',
      externalOrderId: 'printful:order',
      state: 'shipped',
      tracking: 'TRACK',
    })
    expect(
      adapter.verifyWebhook(raw, createHmac('sha256', 'secret').update(raw).digest('hex'))
        ?.tracking,
    ).toBe('TRACK')
    expect(adapter.verifyWebhook(raw, 'replay')).toBeNull()
    expect(
      (
        await submitPodOrderOnce({
          orderId: 'failed',
          idempotencyKey: 'failed',
          adapter: createFixturePodAdapter('printify', 'secret', true),
          items,
        })
      ).state,
    ).toBe('failed')
  })
})
