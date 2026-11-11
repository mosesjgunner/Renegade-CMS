// GUI-05D matrix probe: dashboard / redirects / rendered-quality on the cycle-17 build.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const BASE = process.env.GUI01B_BASE || 'http://127.0.0.1:39071'
const OUT = process.env.GUI01B_OUT || '/home/hatch/workspace/gui01b-logs'
const session = JSON.parse(readFileSync(process.env.GUI01B_SESSION_FILE || '/tmp/gui01b-session.json', 'utf8'))
const exe = process.env.CHROME_EXE || '/home/hatch/.cache/ms-playwright/chromium-1181/chrome-linux/chrome'

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

async function visit(path, name, checks) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3500)
  const found = await page.evaluate((needles) => {
    const text = document.body.innerText
    const out = {}
    for (const n of needles) out[n] = text.includes(n)
    out.overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    return out
  }, checks)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, JSON.stringify(found))
  return found
}

await visit('/admin', 'dash-desktop', ['Write Article', 'New Page', 'Upload Media', 'Waiting for review', 'Recent drafts', 'Site setup and details'])
await visit('/admin/redirects', 'redirects-desktop', ['Redirects', 'Create New Redirect Rule', 'Active Redirect Rules'])
await page.fill('input[placeholder="Search from or to path..."]', 'zzz-no-match-zzz')
await page.waitForTimeout(800)
const noMatch = await page.evaluate(() => document.body.innerText.includes('No rules match'))
console.log('redirects-nomatch-state', JSON.stringify({ noMatch }))
await page.screenshot({ path: `${OUT}/redirects-nomatch.png` })
await visit('/admin/rendered-quality', 'quality-desktop', ['Rendered Quality & Discovery', 'Run Rendered Audit'])

const dark = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await dark.addCookies([{ name: session.cookieName, value: session.token, url: BASE }, { name: 'payload-theme', value: 'dark', url: BASE }])
const dp = await dark.newPage()
dp.on('pageerror', (e) => errors.push('dark:' + String(e).slice(0, 150)))
await dp.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 60000 })
await dp.waitForTimeout(3500)
await dp.screenshot({ path: `${OUT}/dash-dark.png` })
console.log('dash-dark captured')

const mob = await browser.newContext({ viewport: { width: 375, height: 800 } })
await mob.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const mp = await mob.newPage()
mp.on('pageerror', (e) => errors.push('mob:' + String(e).slice(0, 150)))
await mp.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 60000 })
await mp.waitForTimeout(3500)
const mobOverflow = await mp.evaluate(() => document.documentElement.scrollWidth > 376)
console.log('dash-mobile', JSON.stringify({ pageOverflow: mobOverflow }))
await mp.screenshot({ path: `${OUT}/dash-mobile.png` })

console.log('PAGEERRORS', JSON.stringify(errors.slice(0, 6)), 'count', errors.length)
await browser.close()
