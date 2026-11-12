/* eslint-disable @typescript-eslint/no-explicit-any */
// RC2-F-01 setup: enable checkout in site settings (operator global, in-process
// because the REST path for globals is the DEBT-16 wall), and create the
// deterministic-test merchant connection + payment capability for Site A.
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'

describe('RC2-F-01 commerce setup', () => {
  it('enables checkout and provisions the sandbox merchant for Site A', async () => {
    const payload: any = await getPayload({ config })
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
    const siteId = String(world.siteA.siteId)

    const settings: any = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: {
          ...((settings.canonicalOriginsBySite as Record<string, unknown> | null) ?? {}),
          [siteId]: 'http://a.rc2-a04.test:39071',
        },
        adminExperience: {
          ...(settings.adminExperience ?? {}),
          optionalCapabilities: {
            ...(settings.adminExperience?.optionalCapabilities ?? {}),
            commerceCheckout: true,
          },
        },
      },
      overrideAccess: true,
    })

    const merchant: any = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `F-01 Sandbox Merchant ${world.suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    const capability: any = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: `local-card-f01-${world.suffix}`,
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: true,
        health: 'healthy',
      },
      overrideAccess: true,
    })

    writeFileSync(
      '/tmp/f01-setup.json',
      JSON.stringify({
        siteId,
        merchantId: String(merchant.id),
        capabilityId: String(capability.id),
      }),
    )
    expect(capability.id).toBeTruthy()
  }, 120000)
})
