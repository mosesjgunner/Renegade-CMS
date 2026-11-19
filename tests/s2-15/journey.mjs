/* S2-15 browser journey: screenshots of the conversion review inside
 * the real builder and of the published converted page, desktop and
 * mobile. Runs against the served production build; the manifest comes
 * from live-proof.spec.ts (gui01b-logs/s2-15-journey.json).
 * Env: S2_15_SHOTS (output dir). */
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync } from 'node:fs'

const manifest = JSON.parse(
  readFileSync('/home/hatch/workspace/gui01b-logs/s2-15-journey.json', 'utf8'),
)
const SHOTS =
  process.env.S2_15_SHOTS ||
  '/home/hatch/workspace/goals/renegade-cmos-rc-release/files/system-2-v12-evidence/screenshots'
mkdirSync(SHOTS, { recursive: true })
for (const key of ['NO_PROXY', 'no_proxy']) {
  const cur = process.env[key] || ''
  const want = [manifest.hostA, manifest.hostB]
  process.env[key] = [...new Set([...cur.split(','), ...want])].filter(Boolean).join(',')
}

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  headless: true,
  args: [
    `--host-resolver-rules=MAP ${manifest.hostA} 127.0.0.1, MAP ${manifest.hostB} 127.0.0.1`,
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstModeV2',
    '--no-sandbox',
  ],
})

/* Builder with the conversion review panel (owner session). */
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await admin.addCookies([
  { name: 'renegade-passkey', value: manifest.ownerToken, url: manifest.base + '/' },
])
const page = await admin.newPage()
await page.goto(`${manifest.base}/builder/${manifest.convertedLayoutId}`, {
  waitUntil: 'domcontentloaded',
})
try {
  await page.getByText('Conversion review', { exact: true }).waitFor({ timeout: 30000 })
  stage('builder shows the conversion review panel', true)
} catch {
  stage('builder shows the conversion review panel', false, 'panel text not found')
}
await page.screenshot({ path: `${SHOTS}/builder-conversion-review-desktop.png`, fullPage: true })
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
await mobile.addCookies([
  { name: 'renegade-passkey', value: manifest.ownerToken, url: manifest.base + '/' },
])
const mobilePage = await mobile.newPage()
await mobilePage.goto(`${manifest.base}/builder/${manifest.convertedLayoutId}`, {
  waitUntil: 'domcontentloaded',
})
await mobilePage.waitForTimeout(3000)
await mobilePage.screenshot({
  path: `${SHOTS}/builder-conversion-review-mobile.png`,
  fullPage: true,
})

/* Published converted page, public, both viewports. */
const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const pubPage = await pub.newPage()
const pubUrl = `http://${manifest.hostA}:${new URL(manifest.base).port}/converted-live`
const response = await pubPage.goto(pubUrl, { waitUntil: 'domcontentloaded' })
stage(
  'published converted page loads publicly',
  response?.status() === 200,
  `status ${response?.status()}`,
)
const text = await pubPage.textContent('body')
stage(
  'published page carries converted + replacement content',
  text.includes('Clean intro paragraph.') && text.includes('Plans from $10.'),
)
await pubPage.screenshot({ path: `${SHOTS}/converted-page-desktop.png`, fullPage: true })
const pubMobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const pubMobilePage = await pubMobile.newPage()
await pubMobilePage.goto(pubUrl, { waitUntil: 'domcontentloaded' })
await pubMobilePage.screenshot({ path: `${SHOTS}/converted-page-mobile.png`, fullPage: true })

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`JOURNEY: ${results.length - failed}/${results.length} stages passed`)
process.exit(failed ? 1 : 0)
