import { expect, test } from '@playwright/test'

test.describe('authenticated integration boundaries', () => {
  test.use({ storageState: 'scratch/rc01-owner.json' })
  test('menus load canonical published targets without invalid enum values', async ({
    request,
  }) => {
    const response = await request.get('/api/admin/navigation')
    expect(response.status()).toBe(200)
    const data = await response.json()
    expect(data.publicationId).toBeTruthy()
    expect(data.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Home', contentType: 'page', canonicalPath: '/home' }),
      ]),
    )
    expect(data.navigation).toHaveProperty('primary')
  })
  test('audience reports unavailable without fabricated campaigns', async ({ request }) => {
    const response = await request.get('/api/admin/audience/command-center')
    expect(response.status()).toBe(503)
    const data = await response.json()
    expect(data.error).toContain('unavailable')
    expect(data).not.toHaveProperty('recentCampaigns')
  })
  test('moderation exposes its blocked authorization state instead of an empty successful report', async ({
    page,
  }) => {
    await page.goto('/admin/moderation')
    await expect(
      page.getByText(
        'Moderation data is unavailable. Verify your site and moderation permissions before taking action.',
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page.getByText('No open community reports found', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry moderation access' })).toBeVisible()
  })
  for (const route of ['social', 'fulfillment']) {
    test(`${route} does not mount demo operational controls`, async ({ page }) => {
      await page.goto(`/admin/${route}`)
      await expect(page.getByRole('status')).toContainText('unavailable')
      await expect(page.getByText('Printful Production API')).toHaveCount(0)
      await expect(page.getByText('@renegade@mastodon.social')).toHaveCount(0)
    })
  }
})

test.describe('anonymous integration boundaries', () => {
  for (const route of ['social', 'fulfillment', 'audience']) {
    test(`${route} redirects before privileged client mounting`, async ({ page }) => {
      const calls: string[] = []
      page.on('request', (request) => {
        if (request.url().includes('/api/admin/')) calls.push(request.url())
      })
      await page.goto(`/admin/${route}`)
      await expect(page).toHaveURL(/\/login/)
      expect(calls).toEqual([])
    })
  }
  test('audience API denies anonymous access', async ({ request }) => {
    expect((await request.get('/api/admin/audience/command-center')).status()).toBe(403)
  })
})
