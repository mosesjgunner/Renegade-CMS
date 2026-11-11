import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 15000))
const info = await page.evaluate(`(() => {
  const ce = document.querySelector('.ContentEditable__root')
  if (!ce) return { found: false }
  const chain = []
  let el = ce
  for (let i = 0; i < 9 && el; i++) { chain.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.split(' ').join('.') : '')); el = el.parentElement }
  const cs = getComputedStyle(ce)
  const toolbar = document.querySelector('[class*=toolbar], [class*=Toolbar]')
  const main = ce.closest('.document-fields__main')
  const outer = []
  let o = main
  for (let i = 0; i < 5 && o; i++) { outer.push(o.tagName.toLowerCase() + '.' + (typeof o.className === 'string' ? o.className.split(' ').join('.') : '')); o = o.parentElement }
  const hdr = document.querySelector('.doc-header, [class*=doc-header], [class*=DocHeader]')
  const hdrTitle = hdr ? hdr.querySelector('h1, [class*=title]') : null
  const entry = document.querySelector('.render-fields > .field-type.ui')
  const entryText = entry ? entry.innerText.slice(0, 120) : null
  const sidebar = document.querySelector('.document-fields__sidebar, [class*=sidebar-fields], [class*=Sidebar]')
  const titleLabel = document.querySelector('label[for="field-title"]')
  const bodyLabel = document.querySelector('.field-type.rich-text-lexical .field-label, .field-type.rich-text-lexical label')
  const titleInput = document.getElementById('field-title')
  const tchain = []
  let t = titleInput
  for (let i = 0; i < 5 && t; i++) { tchain.push(t.tagName.toLowerCase() + '.' + (typeof t.className === 'string' ? t.className.split(' ').join('.') : '')); t = t.parentElement }
  return { found: true, chain, minHeight: cs.minHeight, fontSize: cs.fontSize, padding: cs.padding, toolbarClass: toolbar ? toolbar.className : null, outer, tchain,
    hdrClass: hdr ? hdr.className : null, hdrTitleText: hdrTitle ? hdrTitle.innerText.slice(0, 40) : null, hdrTitleClass: hdrTitle ? hdrTitle.className : null,
    entryClass: entry ? entry.className : null, entryText,
    sidebarClass: sidebar ? sidebar.className : null,
    titleLabelClass: titleLabel ? titleLabel.className : null,
    bodyLabelText: bodyLabel ? bodyLabel.innerText : null, bodyLabelClass: bodyLabel ? bodyLabel.className : null }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-dom.json', JSON.stringify(info, null, 2))
console.log('DOMPROBE_DONE')
await browser.close().catch(() => {})
process.exit(0)
// appended probe for 04G targets (runs after main probe by re-navigation below)
