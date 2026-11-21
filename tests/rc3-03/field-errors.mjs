/**
 * RC3-03 browser regression — field-level editor errors (F1/F2).
 *
 * Executable form of tests/browser/rc3-03-field-errors.spec.ts for the
 * rig's probe harness (tests/rc2-h01/probe.mjs precedent): runs against
 * a served production build with the RC2 world seeded into the same
 * database (manifest at RC303_WORLD, default
 * ~/workspace/gui01b-logs/rc303/world.json; base at RC303_BASE,
 * default http://127.0.0.1:3103). Exits 1 when any check fails.
 *
 * Contract per case (native field, custom HeadlineField, nested array
 * subfield): a failed save renders the error AT the field, announced
 * as role=alert, wired to the control via aria-invalid +
 * aria-describedby, moves focus to the failing control, and a
 * correction saves and persists across reload. On the RC2 baseline
 * every check below fails: the REST response carries prose only
 * ({message}, no per-field data), so nothing renders at the field.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const base = process.env.RC303_BASE ?? 'http://127.0.0.1:3103'
const worldPath = process.env.RC303_WORLD ?? '/home/hatch/workspace/gui01b-logs/rc303/world.json'
const world = JSON.parse(readFileSync(worldPath, 'utf8'))
const cookie = `renegade-passkey=${world.cookies.adminA}`

const results = []
const check = (id, ok, detail) => {
  results.push({ id, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`)
}

// ---------- Part 1: REST serialization carries per-field paths ----------
const api = async (path, body) => {
  const res = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const fieldPaths = (json) =>
  (json?.errors ?? []).flatMap((e) => (e?.data?.errors ?? []).map((d) => d?.path)).filter(Boolean)

const native = await api('/content', { site: world.siteA.siteId, title: 'RC303 Native Check' })
check(
  'api-native-path',
  native.status === 400 && fieldPaths(native.json).includes('contentType'),
  `status=${native.status} paths=${JSON.stringify(fieldPaths(native.json))}`,
)
const hook = await api('/content', {})
check(
  'api-hook-path',
  hook.status === 400 && fieldPaths(hook.json).includes('title'),
  `status=${hook.status} paths=${JSON.stringify(fieldPaths(hook.json))}`,
)
const nestedApi = await api('/content', {
  site: world.siteA.siteId,
  title: 'RC303 Nested Check',
  contentType: 'article',
  correctionNotices: [
    { detail: 'A correction without its label.', issuedAt: '2026-11-20T12:00:00.000Z' },
  ],
})
check(
  'api-nested-path',
  nestedApi.status === 400 && fieldPaths(nestedApi.json).includes('correctionNotices.0.label'),
  `status=${nestedApi.status} paths=${JSON.stringify(fieldPaths(nestedApi.json))}`,
)
// Unrelated internal errors keep their generic public shape: an
// unauthenticated write is refused without field data or internals.
const refused = await fetch(`${base}/api/content`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ site: world.siteA.siteId, title: 'x', contentType: 'article' }),
})
check(
  'api-unauthenticated-no-leak',
  refused.status >= 400 && !(await refused.text()).includes('correctionNotices'),
  `status=${refused.status}`,
)

// ---------- Part 2: the editor renders, wires, focuses, persists ----------
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'renegade-passkey', value: world.cookies.adminA, url: base }])
const page = await ctx.newPage()
if (process.env.RC303_DEBUG) {
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.request().method() !== 'GET') {
      console.log('RESP', res.request().method(), res.status(), res.url())
    }
  })
}

const openEditor = async (url) => {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1800)
}
const save = async () => {
  // A beat between the last edit and the click: on this rig, clicking
  // in the same tick as a fill can submit the pre-edit form state.
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^save/i }).first().click()
  await page.waitForTimeout(3000)
}
const fieldState = (name) =>
  page.evaluate((inputName) => {
    const input = document.querySelector(
      `input[name="${inputName}"], textarea[name="${inputName}"]`,
    )
    if (!input) return { missing: true }
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    const errorId = describedBy.split(/\s+/).find((t) => t.includes('error'))
    const error = errorId ? document.getElementById(errorId) : null
    return {
      invalid: input.getAttribute('aria-invalid'),
      describedBy,
      errorText: error ? (error.textContent ?? '').trim() : null,
      errorRole: error?.getAttribute('role') ?? null,
      errorVisible: error ? error.offsetParent !== null : false,
      focused: document.activeElement === input,
      value: input.value,
    }
  }, name)
const expectFieldCase = async (id, name) => {
  // Poll: the rig is slow, and the failed save's round trip plus the
  // form's re-render take variable time.
  let s = await fieldState(name)
  for (let attempt = 0; attempt < 15 && s.invalid !== 'true'; attempt += 1) {
    await page.waitForTimeout(1000)
    s = await fieldState(name)
  }
  check(
    id,
    s.invalid === 'true' &&
      Boolean(s.errorText) &&
      s.errorRole === 'alert' &&
      s.errorVisible &&
      s.focused,
    JSON.stringify(s),
  )
}
const expand = async (label) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((labelText) => {
      const span = [...document.querySelectorAll('.row-label')].find(
        (el) => el.textContent?.trim() === labelText,
      )
      const toggle = span?.closest('.collapsible-field')?.querySelector('.collapsible__toggle')
      if (toggle?.className.includes('--collapsed')) toggle.click()
    }, label)
    await page.waitForTimeout(900)
    const open = await page.evaluate((labelText) => {
      const span = [...document.querySelectorAll('.row-label')].find(
        (el) => el.textContent?.trim() === labelText,
      )
      const toggle = span?.closest('.collapsible-field')?.querySelector('.collapsible__toggle')
      return toggle ? !toggle.className.includes('--collapsed') : false
    }, label)
    if (open) return
  }
  throw new Error(`could not expand ${label}`)
}

const editorUrl = `${base}/admin/collections/content/${world.siteA.draftArticleId}`

// (b) custom HeadlineField.
await openEditor(editorUrl)
const title = page.locator('input[name="title"]').first()
await title.click()
await title.fill('')
await save()
await expectFieldCase('browser-custom-title', 'title')
await title.fill('RC303 Corrected Headline')
await save()
await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(1800)
const titleAfter = await fieldState('title')
check(
  'browser-custom-title-persists',
  titleAfter.value === 'RC303 Corrected Headline',
  `value=${JSON.stringify(titleAfter.value)}`,
)

// (a) native field (category name).
await openEditor(`${base}/admin/collections/categories/${world.categoryAId}`)
const nameInput = page.locator('input[name="name"]').first()
await nameInput.click()
await nameInput.fill('')
await save()
await expectFieldCase('browser-native-name', 'name')
await nameInput.fill('RC303 Category Corrected')
await save()
await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(1800)
const nameAfter = await fieldState('name')
check(
  'browser-native-name-persists',
  nameAfter.value === 'RC303 Category Corrected',
  `value=${JSON.stringify(nameAfter.value)}`,
)

// (c) nested array subfield (correction notice label). The world is
// shared across runs, so the new row's index is the current row count.
const draftBefore = await (
  await fetch(`${base}/api/content/${world.siteA.draftArticleId}?depth=0`, {
    headers: { cookie },
  })
).json()
const rowIndex = (draftBefore.correctionNotices ?? []).length
const labelName = `correctionNotices.${rowIndex}.label`
await openEditor(editorUrl)
await expand('Article details and classification')
const addNotice = page.getByRole('button', { name: 'Add Correction Notice' })
await addNotice.waitFor({ state: 'visible', timeout: 15_000 })
await addNotice.click()
await page.waitForTimeout(800)
await page
  .locator(`textarea[name="correctionNotices.${rowIndex}.detail"]`)
  .first()
  .fill('A correction without its label.')
const issued = page.locator(`#field-correctionNotices__${rowIndex}__issuedAt input`).first()
await issued.click()
await issued.fill('11/20/2026')
await page.keyboard.press('Enter')
await save()
await expectFieldCase('browser-nested-label', labelName)
await page.locator(`input[name="${labelName}"]`).first().fill('Correction')
await save()
// Persistence is proven at the server, not just in the reloaded form:
// the saved document itself must carry the corrected label.
const draftAfter = await (
  await fetch(`${base}/api/content/${world.siteA.draftArticleId}?depth=0`, {
    headers: { cookie },
  })
).json()
check(
  'browser-nested-label-persists',
  draftAfter.correctionNotices?.[rowIndex]?.label === 'Correction',
  `label=${JSON.stringify(draftAfter.correctionNotices?.[rowIndex]?.label)}`,
)

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`RC3-03 FIELD ERRORS: ${results.length - failed}/${results.length} checks green`)
process.exit(failed ? 1 : 0)
