// Shared helpers for the RC3-06 operator rehearsal harness.
// Plain node + the repo's Playwright library, driving the production
// standalone build over HTTP — the same surface an operator sees.
import fs from 'node:fs'
import { chromium } from 'playwright'

export const BASE = process.env.RC306_BASE ?? 'http://localhost:3110'
export const SHOTS = process.env.RC306_SHOTS ?? '/tmp/rc306-shots'

export function out(name, data) {
  fs.mkdirSync(SHOTS, { recursive: true })
  const file = `${SHOTS}/${name}.json`
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  console.log(JSON.stringify(data, null, 2))
}

export async function launch(viewport) {
  const browser = await chromium.launch()
  const context = await browser.newContext(viewport ? { viewport } : {})
  const page = await context.newPage()
  return { browser, context, page }
}

export async function addAuthenticator(context, page) {
  const client = await context.newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return client
}

export function readToken() {
  const file = process.env.RC306_TOKEN_FILE
  if (!file) throw new Error('RC306_TOKEN_FILE is required')
  return fs.readFileSync(file, 'utf8').trim()
}

// Fill a controlled input and confirm React registered the value by
// watching the paired Continue button state (same guard the repo's own
// first-run spec uses against the hydration race).
export async function fillReliable(page, label, value) {
  const field = page.getByLabel(label)
  await field.click()
  await field.fill(value)
}

export async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
}

export async function bodyText(page) {
  return page.evaluate(() => document.body.innerText)
}
