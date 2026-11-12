/* eslint-disable @typescript-eslint/no-explicit-any */
// RC2-F-02 POD service proof: the emulator adapter (the only executable POD
// provider profile in the sandbox), failure visibility, idempotent order
// creation, the honest unavailability of the live Printful adapter without
// credentials, and the manual-fulfillment recovery chain for failed jobs.
import { describe, expect, it } from 'vitest'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import {
  acknowledgeManualFulfillmentPackage,
  handoffFailedPodJobToManual,
  shipManualFulfillmentPackage,
} from '../../src/modules/commerce/manual-fulfillment'

const artwork = (w: number, h: number) => ({
  id: 'art-f02',
  hash: 'hash-art-f02',
  mimeType: 'image/png',
  widthPx: w,
  heightPx: h,
  dpi: 300,
})
const placement = { topMm: 10, leftMm: 10, widthMm: 250, heightMm: 250 }

describe('RC2-F-02 POD paths', () => {
  it('preflight passes print-ready artwork and visibly fails low-resolution artwork', async () => {
    const emulator = new PodEmulatorAdapter()
    const ok = await emulator.preflight({
      variantId: 'emu-tee-s-blk',
      printArea: 'front',
      artwork: artwork(3000, 3000),
      placement,
    })
    expect(ok.passed).toBe(true)
    expect(ok.effectiveDpi).toBeGreaterThanOrEqual(150)
    const bad = await emulator.preflight({
      variantId: 'emu-tee-s-blk',
      printArea: 'front',
      artwork: artwork(300, 300),
      placement,
    })
    expect(bad.passed).toBe(false)
  })

  it('order creation is idempotent on the provider boundary', async () => {
    const emulator = new PodEmulatorAdapter()
    const input: any = {
      orderId: 'f02-order-1',
      idempotencyKey: 'f02-pod-key-1',
      recipient: {
        name: 'F02 Recipient',
        address1: '123 Main St',
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        country: 'US',
      },
      items: [
        {
          variantId: 'emu-tee-s-blk',
          quantity: 1,
          printAreas: [
            {
              area: 'front',
              artworkId: 'art-f02',
              artworkHash: 'hash-art-f02',
              artworkUrl: 'https://example.com/art.png',
              placement,
            },
          ],
        },
      ],
    }
    const first = await emulator.createOrder(input)
    const second = await emulator.createOrder(input)
    expect(first.externalOrderId).toBeTruthy()
    expect(second.externalOrderId).toBe(first.externalOrderId)
  })

  it('the live Printful adapter reports unavailable without credentials and opt-in', async () => {
    const printful = new PrintfulPodAdapter({
      apiKey: 'f02-dummy-key-00',
      allowLiveCreation: false,
      fetchFn: async () => new Response('Forbidden', { status: 403 }),
    } as any)
    const health = await printful.health()
    expect(health.health).toBe('unavailable')
  })

  it('a failed POD job hands off to a manual package the operator can acknowledge and ship', () => {
    const failedJob: any = {
      id: 'f02-pod-job-failed',
      orderId: 'f02-order-1',
      siteId: 'site-a',
      packageIndex: 0,
      state: 'failed',
      lastError: 'Emulator production capacity unavailable.',
      recipientSnapshot: {
        name: 'F02 Recipient',
        addressLine1: '123 Main St',
        city: 'Denver',
        country: 'US',
      },
      itemsSnapshot: [{ sku: 'EMU-TEE-S-BLK', quantity: 1, title: 'Shirt' }],
    }
    const pkg = handoffFailedPodJobToManual(failedJob, 'Emulator production capacity unavailable.')
    expect(pkg.status).toBe('pending_acknowledgement')
    expect(pkg.source).toBe('pod-submission-exhausted')
    const acked = acknowledgeManualFulfillmentPackage(pkg, 'operator-1', 'Workshop team assigned.')
    expect(acked.status).toBe('acknowledged')
    const shipped = shipManualFulfillmentPackage(
      acked,
      {
        carrier: 'USPS',
        trackingNumber: '9400111899223344556677',
        trackingUrl: 'https://tools.usps.com/track?id=9400111899223344556677',
      },
      'operator-1',
    )
    expect(shipped.status).toBe('shipped')
  })
})
