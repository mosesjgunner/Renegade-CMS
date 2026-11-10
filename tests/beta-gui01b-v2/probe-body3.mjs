import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const chunks = []
page.on('response', (r) => { const u = r.url(); if (u.includes('_next/static') && u.endsWith('.js')) chunks.push(u.split('/').pop()) })
const errors = []
page.on('pageerror', (e) => errors.push(String(e && e.message || e).slice(0, 300)))
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 30000))
const deep = await page.evaluate(`(() => {
  const title = document.getElementById('field-title')
  const form = title?.closest('form')
  const html = form ? form.innerHTML : ''
  const bodyIdx = html.indexOf('field-body')
  return {
    formBytes: html.length,
    hasFieldBody: bodyIdx >= 0,
    bodySnippet: bodyIdx >= 0 ? html.slice(Math.max(0, bodyIdx - 200), bodyIdx + 400) : null,
    hasWritingCanvasMarker: html.includes('writing-editor') || html.includes('canvas'),
    draftAutosavePresent: html.includes('Draft autosave') || !!document.querySelector('[aria-label="Draft autosave"]'),
    autosaveText: (document.querySelector('[aria-label="Draft autosave"]')?.textContent || '').trim().slice(0, 80),
    totalDivs: form ? form.querySelectorAll('div').length : 0,
  }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-body3.json', JSON.stringify({ deep, chunkCount: chunks.length, errors: errors.slice(0, 6) }, null, 2))
console.log('PROBE4_DONE')
await browser.close().catch(() => {})
process.exit(0)
