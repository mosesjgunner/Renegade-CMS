/**
 * RC2-H-01 live accessibility/responsive probe — authenticated editor + public
 * article, measured (not eyeballed): overflow, dark mode, 200% zoom proxy,
 * keyboard path, focus visibility, aria-current, WCAG contrast sampling,
 * touch targets, empty + error states, focus-mode presence.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const base = 'http://localhost:39071'
// The sandbox proxy must not see the .test hosts (it sinkholes them);
// Chromium reads no_proxy from its environment at launch.
process.env.no_proxy = `${process.env.no_proxy ?? ''},a.rc2-a04.test,b.rc2-a04.test`
process.env.NO_PROXY = process.env.no_proxy
const shots = '/home/hatch/workspace/gui01b-logs/h01'
mkdirSync(shots, { recursive: true })
const results = []
const note = (id, ok, detail) => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`)
}
const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    `--host-resolver-rules=MAP a.rc2-a04.test 127.0.0.1, MAP b.rc2-a04.test 127.0.0.1`,
  ],
})
async function authedContext(opts = {}) {
  const ctx = await browser.newContext(opts)
  await ctx.addCookies([{ name: 'renegade-passkey', value: world.cookies.adminA, url: base }])
  return ctx
}
const overflowOf = (page) =>
  page.evaluate(() => {
    const el = document.scrollingElement
    return {
      sw: el.scrollWidth,
      iw: window.innerWidth,
      overflow: el.scrollWidth > window.innerWidth + 1,
    }
  })
const editorUrl = `${base}/admin/collections/content/${world.siteA.draftArticleId}`

// 1-3. Editor viewports, dark, zoom.
for (const [name, opts] of [
  ['375', { viewport: { width: 375, height: 740 } }],
  ['768', { viewport: { width: 768, height: 1024 } }],
  ['1440', { viewport: { width: 1440, height: 900 } }],
  ['dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }],
  ['zoom200', { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 }],
]) {
  const ctx = await authedContext(opts)
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1800)
  const o = await overflowOf(page)
  let detail = `scrollWidth ${o.sw} vs inner ${o.iw}`
  if (o.overflow) {
    const wide = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > window.innerWidth + 1) {
          out.push(
            `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 44)} right=${Math.round(r.right)}`,
          )
        }
      }
      return out.slice(0, 3)
    })
    detail += ` — widest: ${wide.join(' | ')}`
  }
  note(`editor-${name}`, !o.overflow, detail)
  await page.screenshot({ path: `${shots}/editor-${name}.png` })
  await ctx.close()
}

// 4-5. Keyboard path + focus visibility on the editor.
{
  const ctx = await authedContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const seq = []
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab')
    seq.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'BODY'
        const cs = getComputedStyle(el)
        const visible =
          cs.outlineStyle !== 'none' ||
          cs.boxShadow !== 'none' ||
          el.getAttribute('data-focused') !== null
        const label =
          el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 22) || el.tagName
        return `${el.tagName.toLowerCase()}[${label}] focusRing=${visible}`
      }),
    )
  }
  const reachedSave = seq.some((s) => /save/i.test(s))
  const reachedEditor = seq.some((s) => /textbox|rich|body/i.test(s)) || seq.length >= 30
  note(
    'keyboard-path',
    reachedSave,
    `save reached=${reachedSave}; stops: ${seq.slice(0, 8).join(' > ')}`,
  )
  const noRing = seq.filter((s) => s.includes('focusRing=false') && !s.startsWith('BODY')).length
  note('focus-visibility', noRing <= 3, `${noRing}/30 stops without an outline/shadow indicator`)
  console.log('   tab sequence:', seq.join('\n   '))
  await ctx.close()
}

// 6. aria-current: admin nav on the editor; public nav on the article.
{
  const ctx = await authedContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const adminCurrent = await page.evaluate(
    () => document.querySelectorAll('nav [aria-current], .nav [aria-current]').length,
  )
  note('aria-current-admin', adminCurrent > 0, `${adminCurrent} aria-current markers in admin nav`)
  const pub = await ctx.newPage()
  await pub
    .goto(`http://a.rc2-a04.test:39071${world.siteA.publishedCanonicalPath}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    .catch(() => {})
  await pub
    .waitForFunction(
      () => document.querySelector('h1')?.textContent?.includes('Site A Published'),
      {
        timeout: 30_000,
      },
    )
    .catch(() => {})
  const pubInfo = await pub.evaluate(() => ({
    current: document.querySelectorAll('nav [aria-current], header [aria-current]').length,
    overflow: document.scrollingElement.scrollWidth > window.innerWidth + 1,
  }))
  note(
    'aria-current-public',
    pubInfo.current > 0,
    `${pubInfo.current} aria-current markers in public nav`,
  )
  note('public-article-overflow-1440', !pubInfo.overflow, 'public article at 1440')
  await pub.screenshot({ path: `${shots}/public-article-1440.png` })
  // The article path matches no menu item by design; the mechanism's real
  // test is a page that IS a menu destination (the site home).
  await pub
    .goto(`http://a.rc2-a04.test:39071/`, { waitUntil: 'networkidle', timeout: 60_000 })
    .catch(() => {})
  await pub
    .waitForFunction(() => document.querySelectorAll('nav [aria-current]').length > 0, {
      timeout: 15_000,
    })
    .catch(() => {})
  const homeCurrent = await pub.evaluate(
    () => document.querySelectorAll('nav [aria-current], header [aria-current]').length,
  )
  note(
    'aria-current-public-home',
    homeCurrent > 0,
    `${homeCurrent} aria-current markers on the home page nav`,
  )
  await ctx.close()
}

// 7. Contrast sampling (editor + public article): visible text elements, WCAG ratio.
const contrastProbe = async (page) =>
  page.evaluate(() => {
    const lum = (r, g, b) => {
      const f = (c) => {
        c /= 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const parse = (s) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s)
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
    }
    const bgOf = (el) => {
      let n = el
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0) return c
        n = n.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }
    const out = []
    const els = [...document.querySelectorAll('p, span, a, button, label, h1, h2, h3, td, li')]
      .filter((el) => el.offsetParent !== null && (el.textContent ?? '').trim().length > 1)
      .slice(0, 300)
    for (const el of els) {
      const cs = getComputedStyle(el)
      const fg = parse(cs.color)
      const bg = bgOf(el)
      if (!fg || !bg) continue
      const L1 = lum(fg.r, fg.g, fg.b)
      const L2 = lum(bg.r, bg.g, bg.b)
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const size = parseFloat(cs.fontSize)
      const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700)
      out.push({
        text: (el.textContent ?? '').trim().slice(0, 30),
        ratio: Math.round(ratio * 100) / 100,
        need: large ? 3 : 4.5,
        cls: (el.getAttribute('class') ?? '').slice(0, 40),
      })
    }
    return out
  })
{
  const ctx = await authedContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const samples = await contrastProbe(page)
  const bad = samples.filter((s) => s.ratio < s.need)
  note(
    'contrast-editor',
    bad.length === 0,
    `${bad.length}/${samples.length} text samples below WCAG AA`,
  )
  for (const b of bad.slice(0, 8))
    console.log(`   LOW ${b.ratio} (needs ${b.need}) "${b.text}" .${b.cls}`)
  const pub = await ctx.newPage()
  await pub
    .goto(`http://a.rc2-a04.test:39071${world.siteA.publishedCanonicalPath}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    .catch(() => {})
  await pub
    .waitForFunction(
      () => document.querySelector('h1')?.textContent?.includes('Site A Published'),
      {
        timeout: 30_000,
      },
    )
    .catch(() => {})
  const pubSamples = await contrastProbe(pub)
  const pubBad = pubSamples.filter((s) => s.ratio < s.need)
  note('contrast-public', pubBad.length === 0, `${pubBad.length}/${pubSamples.length} below AA`)
  for (const b of pubBad.slice(0, 8))
    console.log(`   LOW ${b.ratio} (needs ${b.need}) "${b.text}" .${b.cls}`)
  await ctx.close()
}

// 8. Touch targets at 375 in the editor.
{
  const ctx = await authedContext({ viewport: { width: 375, height: 740 } })
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const targets = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll('a, button, input, select, textarea, [role="button"]'),
    ].filter((el) => el.offsetParent !== null)
    const small = els
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })
      .filter((t) => t.w > 0 && (t.h < 24 || t.w < 24))
    return { total: els.length, small }
  })
  note(
    'touch-targets-375',
    targets.small.length === 0,
    `${targets.small.length}/${targets.total} interactive elements under 24px in a dimension`,
  )
  for (const t of targets.small.slice(0, 8)) console.log(`   SMALL ${t.w}x${t.h} "${t.label}"`)
  await ctx.close()
}

// 9-10. Empty + error states.
{
  const ctx = await authedContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page
    .goto(`${base}/admin/collections/content?search=zzz-no-match-h01`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    .catch(() => {})
  await page.waitForTimeout(1500)
  const emptyText = await page.evaluate(() => document.body.innerText.slice(0, 4000))
  note(
    'empty-state',
    /no .* found|nothing|no results|0 results/i.test(emptyText),
    'list empty state renders text',
  )
  await page.screenshot({ path: `${shots}/empty-state.png` })
  await page
    .goto(`${base}/admin/collections/content/create`, { waitUntil: 'networkidle', timeout: 60_000 })
    .catch(() => {})
  await page.waitForTimeout(1800)
  const saveBtn = page.getByRole('button', { name: /^save/i }).first()
  await saveBtn.click().catch(() => {})
  await page.waitForTimeout(1800)
  const errInfo = await page.evaluate(() => ({
    alerts: document.querySelectorAll('[role="alert"]').length,
    invalid: document.querySelectorAll('[aria-invalid="true"]').length,
    errorText: /required|error|invalid/i.test(document.body.innerText),
  }))
  note(
    'error-state',
    errInfo.errorText && (errInfo.alerts > 0 || errInfo.invalid > 0),
    JSON.stringify(errInfo),
  )
  await page.screenshot({ path: `${shots}/error-state.png` })
  await ctx.close()
}

// 11. Focus mode presence.
{
  const ctx = await authedContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const toggle = page.getByRole('button', { name: /^focus mode$/i }).first()
  const present = (await toggle.count()) > 0
  if (!present) {
    note('focus-mode', false, 'no Focus mode control in the editor')
  } else {
    await toggle.click()
    await page.waitForTimeout(600)
    const entered = await page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).display !== 'none' && el.offsetParent !== null : false
      }
      return {
        cls: document.documentElement.classList.contains('rg-focus-mode'),
        navVisible: vis('.nav'),
        sidebarVisible: vis('.document-fields__sidebar-wrap'),
        canvasVisible: vis('[data-lexical-editor="true"], [contenteditable="true"]'),
        pressed: document.querySelector('button[aria-pressed="true"]') !== null,
      }
    })
    await page.screenshot({ path: `${shots}/focus-mode.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const exited = await page.evaluate(() => ({
      cls: document.documentElement.classList.contains('rg-focus-mode'),
      navVisible: (() => {
        const el = document.querySelector('.nav')
        return el ? getComputedStyle(el).display !== 'none' : false
      })(),
    }))
    note(
      'focus-mode',
      entered.cls &&
        !entered.navVisible &&
        !entered.sidebarVisible &&
        entered.canvasVisible &&
        entered.pressed &&
        !exited.cls &&
        exited.navVisible,
      JSON.stringify({ entered, exited }),
    )
  }
  await ctx.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(
  `H-01 PROBE: ${results.length - failed}/${results.length} checks green, ${failed} findings`,
)
await browser.close()
process.exit(0)
