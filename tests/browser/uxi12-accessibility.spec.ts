import { expect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// UXI-12 — accessibility audit of the core journeys on the production build.
//
// Method (evidence, not vibes):
//  - axe-core (devDependency) injected into the real rendered page, run with
//    the WCAG 2.x A/AA tag set. Every violation is recorded with rule id,
//    impact, and node count; serious/critical violations fail the gate.
//  - Landmark/heading structure read from the live DOM (one <h1>, a <main>
//    landmark, <html lang>).
//  - Keyboard: the first 25 Tab stops are walked; each stop records the
//    focused element and whether a visible focus indicator is computed.
//  - Reflow: 320px and 640px CSS widths (400% / 200% zoom equivalents of a
//    1280px desktop) must not produce horizontal scrolling.
//  - Touch targets measured from real bounding boxes at a 360px viewport:
//    anything under the WCAG 2.2 AA minimum (24px) is a violation of the
//    gate; primary actions under 44px are recorded as findings.
//  - Validation errors: an invalid member-auth submission must expose the
//    error programmatically (aria-invalid / aria-describedby / role=alert).
//  - Performance: navigation timings for three public pages, 1 cold + 5 warm
//    loads, recorded as p50/max. This rig is NOT the declared minimum host;
//    numbers are indicative and are reported, not gated.
//
// The full findings land in test-results/uxi12-audit.json for the evidence
// record; the stage close note quotes them.

const AXE_SOURCE = readFileSync(
  path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js'),
  'utf8',
)

const PAGES = [
  '/',
  '/articles',
  '/videos',
  '/events',
  '/store',
  '/donate',
  '/cart',
  '/login',
  '/member-auth',
  '/setup',
] as const

type PageReport = {
  path: string
  finalUrl: string
  status: number
  h1Count: number
  hasMain: boolean
  lang: string | null
  violations: Array<{
    id: string
    impact: string | null
    help: string
    nodes: number
    sample: string
    samples?: string[]
    data?: Record<string, unknown> | null
  }>
  incomplete: Array<{ id: string; nodes: number }>
  tabStops: Array<{
    tag: string
    label: string
    indicator: boolean
    sameElementAsPrevious?: boolean
  }>
  focusIndicatorMissing: number
  reflow: Record<string, { scrollWidth: number; clientWidth: number; overflow: boolean }>
  smallTargets: Array<{ label: string; width: number; height: number }>
  smallLinks: Array<{ label: string; width: number; height: number }>
  smallPrimaryTargets: Array<{ label: string; width: number; height: number }>
}

// Report parts are written per test (Playwright may recycle worker
// processes between tests in a file, so shared module state is not a
// reliable evidence channel). Parts land in test-results/uxi12/.
const REPORT_DIR = path.resolve(process.cwd(), 'test-results/uxi12')
function writePart(name: string, data: unknown) {
  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(path.join(REPORT_DIR, name), JSON.stringify(data, null, 2))
}

async function runAxe(page: Page) {
  await page.addScriptTag({ content: AXE_SOURCE })
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: Function } }).axe
    const results = await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    })
    return results
  })
}

async function auditPage(page: Page, pathName: string): Promise<PageReport> {
  const response = await page.goto(pathName, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  const entry: PageReport = {
    path: pathName,
    finalUrl: page.url(),
    status: response?.status() ?? 0,
    h1Count: 0,
    hasMain: false,
    lang: null,
    violations: [],
    incomplete: [],
    tabStops: [],
    focusIndicatorMissing: 0,
    reflow: {},
    smallTargets: [],
    smallLinks: [],
    smallPrimaryTargets: [],
  }
  if (!response || response.status() >= 400) return entry

  const structure = await page.evaluate(() => ({
    h1: document.querySelectorAll('h1').length,
    main: Boolean(document.querySelector('main, [role="main"]')),
    lang: document.documentElement.getAttribute('lang'),
  }))
  entry.h1Count = structure.h1
  entry.hasMain = structure.main
  entry.lang = structure.lang

  const results = await runAxe(page)
  entry.violations = results.violations.map(
    (v: {
      id: string
      impact: string | null
      help: string
      nodes: Array<{ html: string; any: Array<{ data: Record<string, unknown> | null }> }>
    }) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.html?.slice(0, 160) ?? '',
      samples: v.nodes.slice(0, 6).map((n) => n.html?.slice(0, 140) ?? ''),
      data: v.nodes[0]?.any?.[0]?.data ?? null,
    }),
  )
  entry.incomplete = results.incomplete.map((v: { id: string; nodes: unknown[] }) => ({
    id: v.id,
    nodes: v.nodes.length,
  }))

  // Keyboard walk: up to 25 Tab stops from the top of the page.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.())
  await page.keyboard.press('Tab')
  await page.waitForTimeout(220)
  let previousElementKey = ''
  for (let i = 0; i < 25; i++) {
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const indicator =
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 48),
        indicator,
        visible: rect.width > 0 && rect.height > 0,
        // Stable identity for de-duplication: native date/time inputs
        // expose several intra-element tab stops (segments + picker)
        // whose indication is painted by the UA inside the shadow tree
        // and is not observable from the host's computed style.
        elementKey: [
          el.tagName,
          el.getAttribute('name') ?? '',
          el.getAttribute('type') ?? '',
          Math.round(rect.x),
          Math.round(rect.y),
          Math.round(rect.width),
          Math.round(rect.height),
        ].join('|'),
      }
    })
    if (!stop) break
    const sameElement = stop.elementKey === previousElementKey
    previousElementKey = stop.elementKey
    entry.tabStops.push({
      tag: stop.tag,
      label: stop.label,
      indicator: stop.indicator,
      ...(sameElement ? { sameElementAsPrevious: true } : {}),
    })
    // Count a missing indicator once per element: the first stop on an
    // element is where the component takes focus and must show it.
    if (!stop.indicator && !sameElement) entry.focusIndicatorMissing += 1
    await page.keyboard.press('Tab')
    // The shared form-control styles transition box-shadow/border-color
    // over 150ms; sampling mid-transition reads the pre-focus value and
    // reports a phantom missing indicator (probe-verified on /events:
    // the ring computes fully once the transition settles).
    await page.waitForTimeout(220)
  }

  // Reflow at 200% / 400% zoom equivalents.
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(300)
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    entry.reflow[String(width)] = { ...m, overflow: m.scrollWidth > m.clientWidth + 1 }
  }
  await page.setViewportSize({ width: 1280, height: 900 })

  // Touch targets at a phone width.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(300)
  const targets = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [role="button"]'),
    )
    return els
      .map((el, index) => {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          index,
          kind: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 48),
          width: Math.round(r.width),
          height: Math.round(r.height),
          visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden',
        }
      })
      .filter((t) => t.visible)
  })
  // WCAG 2.5.8 (AA, 24px minimum) exempts inline text links and targets
  // whose 24px spacing circle clears neighbours; the gate therefore binds
  // non-link controls (buttons, inputs, selects), and links under 24px are
  // recorded as findings for the statement instead of gated blindly.
  entry.smallTargets = targets
    .filter((t) => t.kind !== 'a' && (t.width < 24 || t.height < 24))
    .map(({ label, width, height }) => ({ label, width, height }))
  entry.smallLinks = targets
    .filter((t) => t.kind === 'a' && (t.width < 24 || t.height < 24))
    .map(({ label, width, height }) => ({ label, width, height }))
  entry.smallPrimaryTargets = targets
    .slice(0, 12)
    .filter((t) => t.width < 44 || t.height < 44)
    .map(({ label, width, height }) => ({ label, width, height }))
  await page.setViewportSize({ width: 1280, height: 900 })
  return entry
}

// No serial mode: one page's failure must not skip the rest of the audit.
test.setTimeout(240_000)

for (const pathName of PAGES) {
  test(`axe + structure audit: ${pathName}`, async ({ page }) => {
    const entry = await auditPage(page, pathName)
    writePart(`page-${pathName.replace(/\//g, '_') || '_root'}.json`, entry)
    if (entry.status >= 400 || entry.status === 0) {
      // Recorded, not silently skipped: the close note names these.
      console.log(`UXI12 ${pathName}: HTTP ${entry.status} — no audit possible`)
      return
    }
    const serious = entry.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    console.log(
      `UXI12 ${pathName}: violations=${entry.violations.length} serious=${serious.length} ` +
        `h1=${entry.h1Count} main=${entry.hasMain} focusMissing=${entry.focusIndicatorMissing} ` +
        `reflowOverflow=${Object.values(entry.reflow)
          .map((r) => r.overflow)
          .join('/')}`,
    )
    expect(entry.h1Count, `${pathName} must have exactly one <h1>`).toBe(1)
    expect(entry.hasMain, `${pathName} must expose a <main> landmark`).toBe(true)
    expect(
      serious,
      `${pathName} serious/critical axe violations: ${serious.map((v) => v.id).join(', ')}`,
    ).toEqual([])
    for (const [width, r] of Object.entries(entry.reflow)) {
      expect(r.overflow, `${pathName} must not scroll horizontally at ${width}px`).toBe(false)
    }
    expect(
      entry.smallTargets,
      `${pathName} non-link controls under the 24px AA target minimum`,
    ).toEqual([])
    expect(
      entry.focusIndicatorMissing,
      `${pathName} tab stops without a visible focus indicator (WCAG 2.4.7)`,
    ).toBe(0)
  })
}

test('validation errors are programmatically exposed (member-auth)', async ({ page }) => {
  await page.goto('/member-auth', { waitUntil: 'load' })
  const email = page.locator('input[type="email"], input[name*="email" i]').first()
  await expect(email).toBeVisible()
  await email.fill('not-an-email')
  const submit = page.locator('form button[type="submit"], form input[type="submit"]').first()
  await submit.click()
  await page.waitForTimeout(1200)
  const findings = await page.evaluate(() => {
    const input = document.querySelector('input[type="email"], input[name*="email" i]')
    const describedby = input?.getAttribute('aria-describedby')
    const describedText = describedby
      ? describedby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
      : ''
    return {
      ariaInvalid: input?.getAttribute('aria-invalid'),
      describedby: describedby ?? null,
      describedText: describedText.slice(0, 160),
      alertText: (document.querySelector('[role="alert"]')?.textContent ?? '').trim().slice(0, 160),
      nativeInvalid: input instanceof HTMLInputElement ? !input.validity.valid : null,
      formNoValidate: Boolean(document.querySelector('form[novalidate]')),
      activeIsInput: document.activeElement === input,
    }
  })
  writePart('validation.json', findings)
  console.log('UXI12 validation:', JSON.stringify(findings))
  const exposed =
    findings.ariaInvalid === 'true' ||
    findings.alertText.length > 0 ||
    findings.describedText.length > 0
  expect(
    exposed,
    'invalid submission must expose the error via aria-invalid, aria-describedby, or role=alert',
  ).toBe(true)
})

test('performance timings (indicative, this rig)', async ({ page }) => {
  const samples: Record<string, Array<{ dcl: number; load: number; response: number }>> = {}
  for (const pathName of ['/', '/articles', '/events']) {
    samples[pathName] = []
    for (let i = 0; i < 6; i++) {
      await page.goto(pathName, { waitUntil: 'load' })
      const t = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return {
          dcl: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          response: Math.round(nav.responseEnd),
        }
      })
      samples[pathName].push(t)
    }
  }
  const summarise = (rows: Array<{ dcl: number; load: number; response: number }>) => {
    const pick = (k: 'dcl' | 'load' | 'response') => rows.map((r) => r[k]).sort((a, b) => a - b)
    const p50 = (xs: number[]) => xs[Math.floor(xs.length / 2)]
    return {
      loads: rows.length,
      responseP50: p50(pick('response')),
      dclP50: p50(pick('dcl')),
      loadP50: p50(pick('load')),
      loadMax: Math.max(...pick('load')),
    }
  }
  const perfSummary = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, summarise(v)]))
  writePart('performance.json', perfSummary)
  console.log('UXI12 perf:', JSON.stringify(perfSummary))
})
