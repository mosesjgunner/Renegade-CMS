import { describe, expect, it } from 'vitest'
import {
  assertDigitalDeliveryConfigured,
  assertDigitalAssetsReady,
  deliveryGrantAvailable,
} from '../../src/modules/commerce/digital-delivery'

describe('digital checkout readiness and receipt downloads', () => {
  it('requires the stored asset to be private, healthy and on the purchase site', async () => {
    const product = {
      digitalDelivery: {
        assets: [
          {
            mediaId: 'asset',
            rightsStatus: 'approved',
            malwareStatus: 'clean',
            publicOriginal: false,
          },
        ],
      },
    }
    const payload = (asset: unknown) => ({ findByID: async () => asset }) as never
    const asset = { site: 'site', publicPolicy: 'private', processingState: 'ready' }
    await expect(
      assertDigitalAssetsReady(payload(asset), [product], 'site'),
    ).resolves.toBeUndefined()
    for (const denied of [
      null,
      { ...asset, publicPolicy: 'published-use' },
      { ...asset, site: 'foreign' },
      { ...asset, processingState: 'quarantined' },
    ]) {
      await expect(assertDigitalAssetsReady(payload(denied), [product], 'site')).rejects.toThrow(
        'before paying',
      )
    }
  })
  it('rejects a downloadable purchase without its signing key while permitting ordinary goods', () => {
    expect(() =>
      assertDigitalDeliveryConfigured(
        [{ digitalDelivery: { assets: [{ mediaId: 'asset' }] } }],
        '',
      ),
    ).toThrow('before paying')
    expect(() => assertDigitalDeliveryConfigured([{}], '')).not.toThrow()
    expect(() =>
      assertDigitalDeliveryConfigured(
        [{ digitalDelivery: { assets: [{ mediaId: 'asset' }] } }],
        'a-long-private-signing-key',
      ),
    ).not.toThrow()
  })

  it('hides consumed, revoked, expired and future entitlement downloads', () => {
    const grant = { id: 'grant', entitlement: {}, downloadLimit: 1, downloadCount: 0 }
    expect(deliveryGrantAvailable(grant)).toBe(true)
    expect(deliveryGrantAvailable({ ...grant, downloadCount: 1 })).toBe(false)
    expect(deliveryGrantAvailable({ ...grant, revokedAt: new Date().toISOString() })).toBe(false)
    expect(deliveryGrantAvailable({ ...grant, expiresAt: '2020-01-01T00:00:00Z' })).toBe(false)
    expect(
      deliveryGrantAvailable({ ...grant, entitlement: { revokedAt: new Date().toISOString() } }),
    ).toBe(false)
    expect(
      deliveryGrantAvailable({ ...grant, entitlement: { startsAt: '2100-01-01T00:00:00Z' } }),
    ).toBe(false)
  })
})
