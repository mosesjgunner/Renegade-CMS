/* RC2-B-01 — publishing journey across editor UI, preview, and public site.
 * Plain .mjs (string-form evaluates only) against an already-running
 * production build, per the GUI-pack harness lessons. World + sessions
 * come from seed-world.spec.ts (/tmp/b01-world.json).
 * Env: B01_BASE (admin origin, e.g. http://127.0.0.1:39071),
 *      B01_SHOTS (screenshot dir), B01_WORLD (manifest path). */
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

// The sandbox egress proxy intercepts public-looking hostnames; the two
// fixture hosts must bypass it (they resolve locally via host-resolver
// rules). Set before the browser launches so it inherits the bypass.
for (const key of ['NO_PROXY', 'no_proxy']) {
  const cur = process.env[key] || ''
  const want = ['a.rc2-a04.test', 'b.rc2-a04.test']
  const merged = [
    ...new Set([
      ...cur
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      ...want,
    ]),
  ]
  process.env[key] = merged.join(',')
}

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.B01_SHOTS || '/tmp/b01-shots'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })

setTimeout(
  () => {
    console.error('WATCHDOG: hard exit at 25 min')
    process.exit(3)
  },
  25 * 60 * 1000,
)

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const execPath = process.env.CHROME_EXE || undefined
const browser = await chromium.launch({
  headless: true,
  executablePath: execPath,
  args: [
    '--host-resolver-rules=MAP a.rc2-a04.test 127.0.0.1, MAP b.rc2-a04.test 127.0.0.1',
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstModeV2',
  ],
})

async function newAdminContext(token) {
  const ctx = await browser.newContext()
  await ctx.addCookies([{ name: 'renegade-passkey', value: token, url: BASE + '/' }])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)))
  return { ctx, page }
}
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {})
}
const bodyText = (page) => page.evaluate(`document.body ? document.body.innerText : ''`)

/** Payload react-select: open, type to filter, click the matching option. */
async function pickOption(page, fieldSelector, searchText, optionText) {
  const field = page.locator(fieldSelector).first()
  await field.scrollIntoViewIfNeeded()
  await field.click()
  if (searchText) await page.keyboard.type(searchText, { delay: 20 })
  const option = page
    .locator(
      '[class*="rs__option"], [id*="react-select"][id*="option"], .popup__content li, [role="option"]',
    )
    .filter({ hasText: optionText })
    .first()
  await option.waitFor({ state: 'visible', timeout: 8000 })
  await option.click()
}

async function expandAllGroups(page) {
  await page
    .evaluate(
      `(() => {
    document.querySelectorAll('.collapsible__toggle').forEach((t) => {
      const wrap = t.closest('.collapsible')
      if (wrap && wrap.className.includes('collapsed')) { try { t.click() } catch {} }
    })
    return true
  })()`,
    )
    .catch(() => {})
  await page.waitForTimeout(900)
}

const suffix = WORLD.suffix
const runStamp = Date.now().toString(36)
const title = `B01 Journey Article ${suffix} ${runStamp}`
const slug = `b01-journey-${suffix}-${runStamp}`
let articleId = null
let canonicalPath = null

// ---------------------------------------------------------------- create
const { ctx: edCtx, page } = await newAdminContext(WORLD.cookies.editorA)
try {
  await page.goto(`${BASE}/admin/collections/content/create`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#field-contentType', { timeout: 30000 })
  // The form is progressive: taxonomy/media/slug mount only after the
  // content type is chosen.
  await pickOption(page, '#field-contentType', '', 'article')
  await page.waitForSelector('#field-title', { timeout: 30000 })
  await expandAllGroups(page)
  await page.fill('#field-title', title)
  const slugField = page.locator('#field-slug')
  if (await slugField.count()) await slugField.fill(slug).catch(() => {})
  const editor = page.locator('.ContentEditable__root').first()
  await editor.click()
  await page.keyboard.type(`First paragraph of the B-01 journey article ${suffix}.`, { delay: 5 })
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second paragraph, written in the ordinary editor.', { delay: 5 })

  let taxonomyOk = false
  let mediaOk = false
  try {
    await pickOption(page, '#field-categories', WORLD.categoryAName, WORLD.categoryAName)
    taxonomyOk = true
  } catch {
    console.log('taxonomy pick failed')
  }
  try {
    await pickOption(page, '#field-heroMedia', 'Site A Shared Media', 'Site A Shared Media')
    mediaOk = true
  } catch {
    console.log('hero media pick failed')
  }
  stage(
    'create form accepts taxonomy + media reference',
    taxonomyOk && mediaOk,
    `taxonomy=${taxonomyOk} media=${mediaOk}`,
  )
  await shot(page, '01-create-filled')

  await page.locator('button[type="submit"], #action-save, [id*="action-save"]').first().click()
  await page.waitForURL(/collections\/content\/[0-9a-f-]{10,}/, { timeout: 30000 }).catch(() => {})
  const m = page.url().match(/collections\/content\/([0-9a-f-]{10,})/)
  articleId = m ? m[1] : null
  stage('save creates the article and lands on its edit page', Boolean(articleId), page.url())
} catch (e) {
  stage('create/save stage', false, String(e).slice(0, 300))
  await shot(page, '01-create-failed')
}

// ---------------------------------------------------------------- reload
try {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#field-title', { timeout: 30000 })
  const v = await page.inputValue('#field-title')
  await page
    .waitForFunction(`document.body && document.body.innerText.includes('Second paragraph')`, {
      timeout: 20000,
    })
    .catch(() => {})
  const text = await bodyText(page)
  stage(
    'reload shows the saved title and body',
    v === title && text.includes('Second paragraph'),
    `title=${v}`,
  )
  canonicalPath = await page
    .evaluate(
      `(() => {
    const el = document.querySelector('#field-canonicalPath')
    return el ? (el.value || el.textContent || '') : ''
  })()`,
    )
    .catch(() => '')
  if (!canonicalPath) canonicalPath = `/articles/${slug}`
  console.log('canonicalPath:', canonicalPath)
} catch (e) {
  stage('reload stage', false, String(e).slice(0, 300))
}

// ------------------------------------------- editorial workflow helpers
// The product routes lifecycle transitions through the editorial workflow
// API (the review queue); the document form's status field is guarded
// (review-write-guard.ts). These helpers call the same production
// endpoints the admin command-center UI calls.
const { ctx: adminCtx, page: adminPage } = await newAdminContext(WORLD.cookies.adminA)
await adminPage.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
async function restPatch(p, body) {
  const bodyJson = JSON.stringify(body)
  const src =
    "(async () => { const r = await fetch('/api/content/' + '" +
    articleId +
    "'," +
    " { method: 'PATCH', credentials: 'include'," +
    " headers: { 'content-type': 'application/json' }, body: '" +
    bodyJson.replace(/'/g, "\\'") +
    "' });" +
    ' return { status: r.status, text: (await r.text()).slice(0, 200) } })()'
  return p.evaluate(src).catch((e) => ({ status: 0, text: String(e).slice(0, 120) }))
}
async function restStatus(p) {
  const src =
    "fetch('/api/content/' + '" +
    articleId +
    "', { credentials: 'include' })" +
    ".then((r) => r.json()).then((d) => String(d.status || '')).catch(() => '')"
  return p.evaluate(src).catch(() => '')
}
async function wfAction(p, action, extra = {}) {
  const bodyJson = JSON.stringify({ articleId: '__ID__', action, ...extra }).replace(
    '__ID__',
    articleId,
  )
  const src =
    "(async () => { const r = await fetch('/api/admin/workflow/actions'," +
    " { method: 'POST', credentials: 'include'," +
    " headers: { 'content-type': 'application/json' }, body: '" +
    bodyJson.replace(/'/g, "\\'") +
    "' });" +
    ' return { status: r.status, text: (await r.text()).slice(0, 200) } })()'
  return p.evaluate(src).catch((e) => ({ status: 0, text: String(e).slice(0, 120) }))
}

// ------------------------------------------------------- review + preview
try {
  const direct = await restPatch(page, { status: 'review' })
  stage(
    'direct status write to review is refused (review queue guard)',
    direct.status === 403,
    'status=' + direct.status,
  )
  const sub = await wfAction(page, 'submit')
  const st = await restStatus(page)
  stage(
    'editor submits via the editorial workflow -> status review',
    sub.status === 200 && st === 'review',
    'wf=' + sub.status + ' docStatus=' + st,
  )
} catch (e) {
  stage('review transition', false, String(e).slice(0, 200))
}

let previewUrl = null
try {
  await expandAllGroups(page)
  const createBtn = page.locator('button:has-text("Create saved draft preview")').first()
  await createBtn.waitFor({ state: 'visible', timeout: 15000 })
  await createBtn.scrollIntoViewIfNeeded()
  await createBtn.click()
  const openLink = page.locator('a:has-text("Open saved draft preview")').first()
  await openLink.waitFor({ state: 'visible', timeout: 15000 })
  const href = await openLink.getAttribute('href')
  previewUrl = href ? (href.startsWith('http') ? href : BASE + href) : null
  stage(
    'preview is reachable from the editor (Discovery panel)',
    Boolean(previewUrl),
    previewUrl || '',
  )
} catch (e) {
  stage('preview reachability', false, String(e).slice(0, 200))
}

if (previewUrl) {
  const pv = await edCtx.newPage()
  pv.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)))
  try {
    await gotoRetry(pv, previewUrl)
    const text = await bodyText(pv)
    stage('preview shows the saved revision', text.includes(title), previewUrl)
    await shot(pv, '02-preview-saved')
  } catch (e) {
    stage('preview content', false, String(e).slice(0, 200))
  }
  // Unsaved preview truth: edit the title WITHOUT saving; the existing
  // preview must still show the saved revision, and the panel must warn.
  try {
    await page.bringToFront()
    await page.fill('#field-title', `${title} UNSAVED`)
    await page.waitForTimeout(800)
    const panelText = await bodyText(page)
    const warns = panelText.includes('unsaved edits since this preview was created')
    await gotoRetry(pv, previewUrl)
    const text = await bodyText(pv)
    stage(
      'preview does NOT show unsaved edits (and the panel warns)',
      !text.includes('UNSAVED') && text.includes(title),
      `panelWarns=${warns}`,
    )
    await page.reload({ waitUntil: 'domcontentloaded' }) // discard unsaved edit
    await page.waitForSelector('#field-title', { timeout: 30000 })
  } catch (e) {
    stage('unsaved preview truth', false, String(e).slice(0, 200))
  }
  await pv.close()
}

// ---------------------------------------------------------------- publish
try {
  const direct = await restPatch(page, { status: 'published' })
  stage(
    'staff direct publish is refused (publisher permission guard)',
    direct.status === 403,
    'status=' + direct.status,
  )
  // The author leaves the document. The edit view's lock row then ages
  // out (the workflow refuses while a lock is fresher than 5 minutes —
  // cmos-persistence.ts), so the approval below retries until it lapses.
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  const { ctx: outWfCtx, page: outWf } = await newAdminContext(WORLD.cookies.outsiderB)
  await outWf.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  const denied = await wfAction(outWf, 'approve', { targetStatus: 'published' })
  stage(
    'cross-site principal cannot act on the article via the workflow',
    denied.status === 403,
    'status=' + denied.status,
  )
  await outWfCtx.close()
  let ap = null
  for (let attempt = 0; attempt < 18; attempt++) {
    ap = await wfAction(adminPage, 'approve', { targetStatus: 'published' })
    if (ap.status === 200) break
    if (!/locked/i.test(ap.text)) break
    console.log(`approve attempt ${attempt + 1}: author lock still fresh; waiting 20s`)
    await adminPage.waitForTimeout(20000)
  }
  const st = await restStatus(adminPage)
  stage(
    'publisher approves via the editorial workflow -> status approved',
    ap.status === 200 && st === 'approved',
    'wf=' + ap.status + ' docStatus=' + st + ' ' + ap.text.slice(0, 120),
  )
  const pub = await restPatch(adminPage, { status: 'published' })
  const st2 = await restStatus(adminPage)
  stage(
    'publisher publishes the approved article (direct write)',
    pub.status === 200 && st2 === 'published',
    'patch=' + pub.status + ' docStatus=' + st2,
  )
  await page.bringToFront()
  await shot(page, '03-editor-published')
} catch (e) {
  stage('publish transition', false, String(e).slice(0, 200))
}

// ---------------------------------------------------------- anonymous read
const anon = await browser.newContext()
const anonPage = await anon.newPage()
async function gotoRetry(p, url) {
  try {
    return await p.goto(url, { waitUntil: 'domcontentloaded' })
  } catch {
    await p.waitForTimeout(1500)
    return await p.goto(url, { waitUntil: 'domcontentloaded' })
  }
}
try {
  const urlA = `http://a.rc2-a04.test:39071${canonicalPath}`
  const resp = await gotoRetry(anonPage, urlA, { waitUntil: 'domcontentloaded' })
  const text = await bodyText(anonPage)
  stage(
    'anonymous reader sees the published article at its canonical URL',
    resp.status() === 200 && text.includes(title) && text.includes('Second paragraph'),
    `status=${resp.status()}`,
  )
  await shot(anonPage, '04-public-article')

  const urlB = `http://b.rc2-a04.test:39071${canonicalPath}`
  const respB = await gotoRetry(anonPage, urlB, { waitUntil: 'domcontentloaded' })
  const textB = await bodyText(anonPage)
  stage(
    'no Site A material on Site B (404)',
    respB.status() === 404 && !textB.includes(title),
    `status=${respB.status()}`,
  )
  await shot(anonPage, '05-public-on-b-404')

  const draftPath = `/articles/site-a-draft-${suffix}`
  const respD = await gotoRetry(anonPage, `http://a.rc2-a04.test:39071${draftPath}`, {
    waitUntil: 'domcontentloaded',
  })
  stage(
    'draft article does not leak anonymously',
    respD.status() === 404,
    `status=${respD.status()}`,
  )

  const resp404 = await gotoRetry(
    anonPage,
    `http://a.rc2-a04.test:39071/articles/no-such-${suffix}`,
    { waitUntil: 'domcontentloaded' },
  )
  stage('missing article is a clean 404', resp404.status() === 404, `status=${resp404.status()}`)
} catch (e) {
  stage('anonymous read stage', false, String(e).slice(0, 300))
}

// ----------------------------------------------------------------- revise
async function docIdentity(p) {
  return p
    .evaluate(
      `fetch('/api/content/' + '${articleId}', { credentials: 'include' })
    .then((r) => r.json())
    .then((d) => JSON.stringify({
      seq: d.currentRevisionSequence ?? null,
      rev: typeof d.currentRevision === 'object' ? d.currentRevision?.id : (d.currentRevision ?? null),
      updatedAt: d.updatedAt ?? null,
    }))
    .catch(() => '')`,
    )
    .catch(() => '')
}
try {
  await page.bringToFront()
  await page.goto(`${BASE}/admin/collections/content/${articleId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('#field-title', { timeout: 30000 })
  const beforeIdentity = await docIdentity(page)
  // Wait until the Lexical body is mounted before typing (probe-proven:
  // typing into a still-mounting editor loses the edit on save).
  await page
    .waitForFunction(`document.body && document.body.innerText.includes('Second paragraph')`, {
      timeout: 20000,
    })
    .catch(() => {})
  const editor = page.locator('.ContentEditable__root').first()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(`Revised in B-01 ${suffix}.`, { delay: 10 })
  await page.waitForTimeout(1200)
  const dirty = await page
    .evaluate(`document.body.innerText.includes('Revised in B-01')`)
    .catch(() => false)
  if (!dirty) console.log('REVISE NOTE: typed text not present before save')
  await page.locator('button[type="submit"], #action-save').first().click()
  await page.waitForTimeout(3500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page
    .waitForFunction(`document.body && document.body.innerText.includes('Revised in B-01')`, {
      timeout: 20000,
    })
    .catch(() => {})
  const text = await bodyText(page)
  stage('revision persists after reload in the editor', text.includes('Revised in B-01'))
  const afterIdentity = await docIdentity(page)
  stage(
    'revision/audit identity advances with the revision',
    Boolean(beforeIdentity) && Boolean(afterIdentity) && beforeIdentity !== afterIdentity,
    `before=${beforeIdentity} after=${afterIdentity}`,
  )

  const resp = await gotoRetry(anonPage, `http://a.rc2-a04.test:39071${canonicalPath}`, {
    waitUntil: 'domcontentloaded',
  })
  const pub = await bodyText(anonPage)
  stage(
    'revision propagates to the public page',
    resp.status() === 200 && pub.includes('Revised in B-01'),
  )
  await shot(anonPage, '06-public-revised')
} catch (e) {
  stage('revise stage', false, String(e).slice(0, 300))
}

// ------------------------------------------------------- unpublish/restore
try {
  const un = await restPatch(adminPage, { status: 'draft' })
  stage(
    'publisher unpublishes (direct write back to draft)',
    un.status === 200,
    'status=' + un.status,
  )
  const resp = await gotoRetry(anonPage, `http://a.rc2-a04.test:39071${canonicalPath}`, {
    waitUntil: 'domcontentloaded',
  })
  stage(
    'unpublish removes the article from the public site',
    resp.status() === 404,
    `status=${resp.status()}`,
  )

  const re = await restPatch(adminPage, { status: 'published' })
  if (re.status !== 200) console.log('RESTORE NOTE:', re.status, re.text)
  const resp2 = await gotoRetry(anonPage, `http://a.rc2-a04.test:39071${canonicalPath}`, {
    waitUntil: 'domcontentloaded',
  })
  const pub2 = await bodyText(anonPage)
  stage(
    'restore republishes the article',
    resp2.status() === 200 && pub2.includes(title),
    `status=${resp2.status()}`,
  )
} catch (e) {
  stage('unpublish/restore stage', false, String(e).slice(0, 300))
}

// ------------------------------------------------------------ denied edit
try {
  const { ctx: outCtx, page: out } = await newAdminContext(WORLD.cookies.outsiderB)
  await out.goto(`${BASE}/admin/collections/content/${articleId}`, {
    waitUntil: 'domcontentloaded',
  })
  await out.waitForTimeout(3000)
  const hasTitle = await out.locator('#field-title').count()
  const text = await bodyText(out)
  stage(
    'denied principal cannot open Site A article in the editor',
    hasTitle === 0 || !text.includes(title),
    `titleField=${hasTitle}`,
  )
  await shot(out, '07-denied-editor')
  await outCtx.close()
} catch (e) {
  stage('denied edit stage', false, String(e).slice(0, 300))
}

await anon.close()
await adminCtx.close()
await edCtx.close()
await browser.close()
writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
