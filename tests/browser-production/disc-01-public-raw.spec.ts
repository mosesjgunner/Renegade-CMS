import { expect, test } from '@playwright/test'

const meta = (html: string, pattern: RegExp) => html.match(pattern)?.[1] ?? ''

test('DISC-01 raw public metadata, proxy origin and private surfaces', async ({
  page,
  request,
}) => {
  const post = await request.get('/articles/decentralized-truth')
  expect(post.status()).toBe(200)
  const postHtml = await post.text()
  expect(meta(postHtml, /<link rel="canonical" href="([^"]+)"/)).toBe(
    'https://renegadeparty.org/articles/decentralized-truth',
  )
  expect(postHtml).toContain('<meta name="robots" content="index, follow"')
  expect(meta(postHtml, /<meta property="og:image" content="([^"]+)"/)).toMatch(
    /^https:\/\/renegadeparty\.org\/media\/[^?]+\?variant=og/,
  )
  expect(postHtml).not.toMatch(/storageLocation|storage_location|\.upload-sessions/)

  const proxied = await request.get('/platform', {
    headers: { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' },
  })
  expect(proxied.status()).toBe(200)
  const proxiedHtml = await proxied.text()
  expect(proxiedHtml).toContain('<link rel="canonical" href="https://renegadeparty.org/platform"')
  expect(proxiedHtml).not.toContain('attacker.example')

  for (const path of ['/search?q=truth', '/setup', '/admin', '/definitely-missing-disc-01']) {
    const response = await request.get(path)
    const html = await response.text()
    expect(html, path).toMatch(/<meta name="robots" content="noindex(?:, (?:no)?follow)?"/)
  }

  const draft = await request.get('/articles/draft-article-7b0b9e81')
  expect(draft.status()).toBe(404)
  expect(await draft.text()).toContain('noindex')

  await page.goto('/articles/decentralized-truth')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://renegadeparty.org/articles/decentralized-truth',
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /variant=og/)
})
