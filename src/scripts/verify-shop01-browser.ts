import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import config from '../payload.config'
import { getPayload } from 'payload'
import { createPasskeySession } from '../modules/operations/passkey-auth'
import { loadConfig } from '../modules/core/config'

const baseURL = process.env.SHOP_BROWSER_URL ?? 'http://localhost:3110'

export async function verifyShop01Browser() {
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  try {
    // Fixture identity/site setup only. Catalog creation and every lifecycle
    // transition below use the visible command-center controls.
    const site = await payload.create({
      collection: 'sites',
      data: { name: 'Renegade Party', slug: `renegade-party-${suffix}`, lifecycle: 'active' },
      overrideAccess: true,
    } as never)
    await payload.create({
      collection: 'publications',
      data: {
        site: site.id,
        name: 'Renegade Party',
        slug: `party-${suffix}`,
        canonicalBasePath: '/',
        status: 'active',
        visibility: 'public',
      },
      overrideAccess: true,
    } as never)
    const user = await payload.create({
      collection: 'users',
      data: { email: `catalog-${suffix}@renegade.test`, role: 'owner' },
      overrideAccess: true,
    } as never)
    const session = await createPasskeySession(
      { id: String(user.id), email: String((user as any).email) },
      loadConfig().payloadSecret,
      async (sessionId, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [sessionId, user.id, expiresAt],
        )
      },
    )
    const now = new Date().toISOString()
    const products = [
      {
        siteId: String(site.id),
        slug: 'field-kit',
        canonicalPath: '/store/field-kit',
        name: 'Renegade Field Kit',
        summary: 'A native physical field kit.',
        description: 'Printed materials for local organizing.',
        capabilities: ['shippable'],
        optionDimensions: [{ key: 'edition', label: 'Edition', values: ['first'] }],
        variants: [
          {
            sku: 'KIT-FIRST',
            title: 'First edition',
            optionValues: { edition: 'first' },
            weightGrams: 300,
            dimensionsMm: { length: 210, width: 148, height: 20 },
            inventory: { policy: 'tracked', quantity: 12 },
          },
        ],
        offers: [
          {
            id: 'kit-usd',
            version: 1,
            status: 'active',
            variantSku: 'KIT-FIRST',
            amountMinor: '2500',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
        disclosures: [{ text: 'Ships from the Renegade Party fulfillment desk.' }],
        seo: { title: 'Renegade Field Kit', description: 'Native physical organizing kit.' },
      },
      {
        siteId: String(site.id),
        slug: 'organizing-lamp',
        canonicalPath: '/store/organizing-lamp',
        name: 'Organizing Reading Lamp',
        summary: 'Affiliate reading lamp.',
        capabilities: ['affiliate'],
        optionDimensions: [],
        variants: [
          {
            sku: 'LAMP-REMOTE',
            title: 'Reading lamp',
            optionValues: {},
            inventory: { policy: 'affiliate' },
          },
        ],
        offers: [
          {
            id: 'lamp-usd',
            version: 1,
            status: 'active',
            variantSku: 'LAMP-REMOTE',
            amountMinor: '3999',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
        affiliate: {
          destinationUrl: 'https://seller.example/lamp',
          disclosure: 'We may earn a commission from qualifying purchases.',
          observedAt: now,
          freshnessHours: 24,
          trackingParameters: { utm_source: 'renegade' },
          remotePrice: { amountMinor: '3999', currency: 'USD' },
          remoteAvailability: 'in-stock',
        },
        seo: {
          title: 'Organizing Reading Lamp',
          description: 'Affiliate offer with current seller evidence.',
        },
      },
      {
        siteId: String(site.id),
        slug: 'renegade-shirt',
        canonicalPath: '/store/renegade-shirt',
        name: 'Renegade Party Shirt',
        summary: 'Manually reviewed print-on-demand shirt.',
        capabilities: ['shippable', 'pod'],
        optionDimensions: [
          { key: 'size', label: 'Size', values: ['m'] },
          { key: 'color', label: 'Color', values: ['black'] },
        ],
        variants: [
          {
            sku: 'SHIRT-M-BLK',
            title: 'Medium black',
            optionValues: { size: 'm', color: 'black' },
            weightGrams: 180,
            dimensionsMm: { length: 300, width: 240, height: 20 },
            inventory: { policy: 'pod' },
          },
        ],
        offers: [
          {
            id: 'shirt-usd',
            version: 1,
            status: 'active',
            variantSku: 'SHIRT-M-BLK',
            amountMinor: '2800',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
        podMappings: [
          {
            providerKey: 'fixture-pod',
            remoteProductId: 'remote-shirt',
            remoteVariantId: 'remote-m-black',
            variantSku: 'SHIRT-M-BLK',
            optionValues: { size: 'm', color: 'black' },
            artworkRevisionId: 'art-rev-7',
            mockupProvenance: { source: 'provider', generatedAt: now },
            snapshot: { costMinor: '1100', currency: 'USD', available: true, observedAt: now },
            reviewStatus: 'approved',
          },
        ],
        seo: { title: 'Renegade Party Shirt', description: 'Reviewed POD product.' },
      },
    ]
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    await context.addCookies([{ name: 'renegade-passkey', value: session.token, url: baseURL }])
    await page.goto(`${baseURL}/admin/catalog`)
    await page.getByLabel('Catalog JSON').fill(JSON.stringify(products))
    await page.getByRole('button', { name: 'Apply validated import' }).click()
    await page.getByText('apply: 3 create, 0 update, 0 unchanged, 0 errors.').waitFor()
    for (const name of products.map((product) => product.name)) {
      const row = page.getByRole('row', { name: new RegExp(name) })
      await row.getByRole('button', { name: 'Request review' }).click()
      await row.getByRole('button', { name: 'Approve' }).click()
      await row.getByRole('button', { name: 'Publish' }).click()
      await row.getByText('published').waitFor()
    }
    await page.goto(`${baseURL}/store`)
    for (const product of products)
      await page.getByRole('link', { name: `View ${product.name}` }).waitFor()
    await page.goto(`${baseURL}/store/organizing-lamp`)
    await page.getByText('Affiliate disclosure:').waitFor()
    await page.getByText('We may earn a commission from qualifying purchases.').waitFor()
    await page.getByRole('link', { name: /View at seller/ }).waitFor()
    await page.goto(`${baseURL}/store/renegade-shirt`)
    await page.getByText('Availability confirmed at provider handoff').waitFor()
    const schema = await page.locator('script[type="application/ld+json"]').textContent()
    if (!schema?.includes('Product') || !schema.includes('2800'))
      throw new Error('Product schema is absent.')
    const denied = await page.request.get(`${baseURL}/api/commerce/download/not-a-valid-grant`)
    if (denied.status() !== 404) throw new Error('Private download denial failed.')
    console.log('SHOP-01 browser acceptance passed.')
    await browser.close()
  } finally {
    await payload.db.destroy?.()
  }
}

if (process.argv[1]?.endsWith('verify-shop01-browser.ts'))
  verifyShop01Browser().catch((error) => {
    console.error(error)
    process.exit(1)
  })
