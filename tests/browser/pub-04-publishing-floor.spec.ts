import { test, expect } from '@playwright/test'

test.describe('PUB-04 publishing floor browser acceptance', () => {
  test('renders clean first-party starter presentation without CMS promotional copy', async ({
    page,
  }) => {
    // 1. Home page inspection
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()

    // Verify promotional text is NOT present in customer-facing layout
    const pageText = await page.textContent('body')
    expect(pageText).not.toContain(
      'Free, portable publishing and personal-brand platform under AGPL-3.0',
    )
    expect(pageText).not.toContain('Payload Studio')

    // 2. Verify navigation links
    const homeLink = page.locator('header a[href="/"]').first()
    await expect(homeLink).toBeVisible()

    // 3. Articles archive page
    await page.goto('/articles')
    await expect(page.getByRole('heading', { name: 'Articles Archive' })).toBeVisible()
    await expect(page.locator('a[href="/search"]').first()).toBeVisible()

    // 4. Public search page
    await page.goto('/search')
    await expect(page.getByPlaceholder(/Search keywords/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()

    // Perform a search
    await page.getByPlaceholder(/Search keywords/i).fill('demo')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\/search\?q=demo/)

    // 5. Intentional 404 page
    const res = await page.goto('/random-nonexistent-page-404')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /return home/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /search site/i })).toBeVisible()
  })
})
