import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

async function run() {
  console.log('Launching headless Chromium browser...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  try {
    console.log('Navigating to authentication entrypoint...')
    await page.goto('http://localhost:3000/proof-login.html')

    console.log('Waiting for redirect to Media Command Center...')
    await page.waitForURL('**/admin/media-library?siteId=*', { timeout: 15000 })
    console.log('Successfully navigated to:', page.url())

    // Wait for heading
    await page.waitForSelector('text=Media Command Center', { timeout: 15000 })
    console.log('Found Media Command Center heading.')

    // Click on Assets tab
    const assetsTab = page.locator('button', { hasText: /Assets \(/i })
    await assetsTab.waitFor({ timeout: 10000 })
    await assetsTab.click()
    console.log('Clicked Assets tab.')

    // Find the row for Renegade Brand Banner
    const assetRow = page.locator('tr', { hasText: 'Renegade Brand Banner' })
    await assetRow.waitFor({ timeout: 10000 })
    console.log('Found asset row for Renegade Brand Banner.')

    // Click Edit Image button
    const editBtn = assetRow.locator('button', { hasText: 'Edit Image' })
    await editBtn.waitFor({ timeout: 5000 })
    console.log('Clicking Edit Image button...')
    await editBtn.click()

    // Wait for ImageEditorModal header (h2)
    const modalHeader = page.locator('h2', { hasText: /Editing: Renegade Brand Banner/i })
    await modalHeader.waitFor({ timeout: 10000 })
    console.log('ImageEditorModal is open!')

    // Check modal controls
    const saveModeText = await page.locator('text=Save Mode:').isVisible()
    const formatText = await page.locator('text=Format:').isVisible()
    const reasonText = await page.locator('text=Reason:').isVisible()
    console.log('Modal controls verified:', { saveModeText, formatText, reasonText })

    // Find miniPaint iframe
    const iframeElement = page.locator('iframe[title="miniPaint Editor"]')
    await iframeElement.waitFor({ timeout: 10000 })
    console.log('miniPaint iframe located.')

    // Access frame content
    const frame = page.frameLocator('iframe[title="miniPaint Editor"]')
    const canvas = frame.locator('#canvas_minipaint')
    await canvas.waitFor({ timeout: 20000 })
    console.log('miniPaint canvas element (#canvas_minipaint) is visible!')

    // Wait 2 seconds for layer rendering
    await page.waitForTimeout(2000)

    // Evaluate iframe window state
    const frameHandle = await iframeElement.elementHandle()
    const contentFrame = await frameHandle.contentFrame()
    const editorState = await contentFrame.evaluate(() => {
      const win = window
      const hasMiniPaint = Boolean(win.Layers && win.app)
      const layersCount = win.Layers ? win.Layers.length : 0
      const activeLayer = win.Layers?.get_active_layer ? win.Layers.get_active_layer() : null
      const dimensions = win.Layers?.get_dimensions ? win.Layers.get_dimensions() : null
      return {
        hasMiniPaint,
        layersCount,
        activeLayerName: activeLayer?.name,
        dimensions,
      }
    })
    console.log('miniPaint runtime state in iframe:', JSON.stringify(editorState, null, 2))

    // Take full page screenshot of the open editor
    const screenshotDir = path.resolve('scratch')
    fs.mkdirSync(screenshotDir, { recursive: true })
    const screenshotPath = path.join(screenshotDir, 'minipaint-proof.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log('Proof screenshot saved to:', screenshotPath)

    // Also copy screenshot to artifact directory
    const artifactDir = 'C:\\Users\\moses\\.gemini\\antigravity-ide\\brain\\6f642b8c-3790-4393-8b40-bae9a5a0e598'
    const artifactScreenshotPath = path.join(artifactDir, 'minipaint-proof.png')
    fs.copyFileSync(screenshotPath, artifactScreenshotPath)
    console.log('Screenshot copied to artifact dir:', artifactScreenshotPath)

    console.log('PROVE_OPEN_SUCCESSFUL: true')
  } catch (err) {
    console.error('PROVE_OPEN_FAILED:', err)
    const errScreenshotPath = path.resolve('scratch/error-proof.png')
    await page.screenshot({ path: errScreenshotPath, fullPage: true }).catch(() => {})
    process.exit(1)
  } finally {
    await browser.close()
  }
}

run()
