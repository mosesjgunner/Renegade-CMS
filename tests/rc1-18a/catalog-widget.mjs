import assert from 'node:assert/strict'
import http from 'node:http'
import { writeFileSync } from 'node:fs'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'

// Browser rendering contract only: loopback catalog fixture, no product/provider persistence claim.
const bundle = await build({
  stdin: {
    contents:
      "import React from 'react'; import {createRoot} from 'react-dom/client'; import {LiveProductShowcase} from './src/modules/commerce/LiveProductShowcase'; createRoot(document.getElementById('root')).render(React.createElement(LiveProductShowcase));",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
})
let mode = 'products'
const requests = []
const server = http.createServer((request, response) => {
  if (request.url === '/widget.js') {
    response.setHeader('content-type', 'text/javascript')
    response.end(bundle.outputFiles[0].contents)
    return
  }
  if (request.url === '/api/catalog') {
    requests.push({ path: request.url, mode, cookie: request.headers.cookie ?? null })
    response.setHeader('content-type', 'application/json')
    response.statusCode = mode === 'error' ? 503 : 200
    response.end(
      JSON.stringify({
        products:
          mode === 'products'
            ? [
                {
                  id: 'fixture-tee',
                  name: 'Solidarity Heavyweight Tee',
                  price: '$32.00',
                  path: '/store/solidarity-heavyweight-tee',
                  available: true,
                },
              ]
            : [],
      }),
    )
    return
  }
  response.setHeader('content-type', 'text/html')
  response.end('<div id="root"></div><script src="/widget.js"></script>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const origin = `http://127.0.0.1:${server.address().port}`
  let releaseCatalog
  const blocked = new Promise((resolve) => {
    releaseCatalog = resolve
  })
  await page.route('**/api/catalog', async (route) => {
    await blocked
    await route.continue()
  })
  await page.goto(origin)
  await page.getByText(/Loading products/).waitFor()
  assert.equal(await page.locator('article').count(), 0)
  releaseCatalog()
  const link = page.getByRole('link', { name: 'Solidarity Heavyweight Tee' })
  await link.waitFor()
  assert.equal(await link.getAttribute('href'), '/store/solidarity-heavyweight-tee')
  assert.match(await page.locator('article').innerText(), /\$32\.00/)
  assert.match(await page.locator('article').innerText(), /Available/)
  mode = 'empty'
  await page.reload()
  await page.getByText('No products are published yet.').waitFor()
  assert.equal(await page.locator('article').count(), 0)
  mode = 'error'
  await page.reload()
  await page.getByText('Catalog unavailable.').waitFor()
  assert.equal(await page.locator('article').count(), 0)
  assert.equal(requests.length, 3)
  assert.ok(requests.every((request) => request.cookie === null))
  writeFileSync(
    'scratch/rc118a-repair/widget.json',
    JSON.stringify(
      {
        passed: 3,
        failed: 0,
        skipped: 0,
        cases: [
          'loading then fetched fixture name/price/link/availability',
          'empty catalog with no invented products',
          'HTTP 503 with safe unavailable state and no products',
        ],
        requests,
        boundary:
          'Real Chromium and actual widget; isolated loopback catalog fixture only, not a persisted product or provider outcome',
      },
      null,
      2,
    ) + '\n',
  )
  console.log('Catalog widget browser contracts: 3 passed, 0 failed, 0 skipped')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
