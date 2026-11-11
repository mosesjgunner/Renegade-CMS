import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([
  { name: session.cookieName, value: session.token, url: BASE },
  { name: 'renegade-active-site', value: '252e70d3-c68e-4694-afda-1b54548e8135', url: BASE },
])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)) })
await page.goto(BASE + '/admin/collections/content/create?contentType=article', { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 45000))
const probe = await page.evaluate(`(() => {
  const ce = document.querySelectorAll('[contenteditable]')
  const out = { url: location.href, contenteditables: [], titlePresent: !!document.getElementById('field-title'),
    bodyText: document.body.innerText.slice(0, 400) }
  ce.forEach((el) => out.contenteditables.push({ cls: (el.className || '').toString().slice(0, 120), aria: el.getAttribute('aria-label'), role: el.getAttribute('role') }))
  return out
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-editor.json', JSON.stringify({ probe, errors: errors.slice(0, 10) }, null, 2))
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/probe-editor.png', fullPage: true, timeout: 120000 }).catch(() => {})
console.log('PROBE_DONE')
await browser.close().catch(() => {})
process.exit(0)
