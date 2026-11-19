import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@payload-config'
import { readFileSync, writeFileSync } from 'node:fs'

// RC2-DEBT-08 fixture: an active donation campaign on the B-01 world
// site A, with the site-settings commerceCheckout capability switched
// ON. Probed over HTTP against a floor-profile (RENEGADE_MODULES empty)
// boot of the same build — the capability and the module gate are
// separate axes, and the floor behavior at their intersection is what
// DEBT-08 asks about.
describe('fixall-audit donation seed', () => {
  it('creates an active campaign and enables the checkout capability', async () => {
    const payload = await getPayload({ config })
    const world = JSON.parse(
      readFileSync('/home/hatch/workspace/gui01b-logs/b01-world-backup.json', 'utf8'),
    )
    const suffix = Math.random().toString(36).slice(2, 8)
    const campaign = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: world.siteA.siteId,
        campaignKey: `fixall-audit-${suffix}`,
        version: 1,
        title: 'Fixall Audit Fund',
        purpose: 'DEBT-08 floor-profile probe campaign.',
        allowedAmounts: ['1000'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax deductibility represented.'],
        lifecycle: 'draft',
      },
      overrideAccess: true,
    } as never)
    await payload.update({
      collection: 'donation-campaigns',
      id: campaign.id,
      data: { lifecycle: 'active' },
      overrideAccess: true,
    } as never)
    const settings: any = await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        adminExperience: {
          ...(settings.adminExperience ?? {}),
          optionalCapabilities: {
            ...(settings.adminExperience?.optionalCapabilities ?? {}),
            commerceCheckout: true,
          },
        },
      },
      overrideAccess: true,
    } as never)
    writeFileSync(
      '/tmp/fixall-donation.json',
      JSON.stringify({ campaignId: campaign.id, host: world.siteA.host }),
    )
    expect(campaign.id).toBeTruthy()
  }, 120_000)
})
