// RC3-06 leg 2 (server-kill half): fill the wizard to step 3 so a
// server-side draft exists, signal the shell (READY file), wait while
// the shell kills and restarts the server (WAIT file appears), then
// reopen /setup in the same browser and report whether the draft and
// the installation state survived a hard server death mid-setup.
import fs from 'node:fs'
import {
  addAuthenticator,
  BASE,
  bodyText,
  fillReliable,
  launch,
  out,
  readToken,
  shot,
} from './lib.mjs'

const token = readToken()
const email = process.env.RC306_EMAIL ?? 'owner@rc306.test'
const readyFile = process.env.RC306_READY_FILE ?? '/tmp/rc306-kill-ready'
const waitFile = process.env.RC306_WAIT_FILE ?? '/tmp/rc306-kill-done'

const { browser, context, page } = await launch()
const result = {}
try {
  await addAuthenticator(context, page)
  await page.goto(BASE + '/setup')
  await page.getByRole('heading', { name: 'Make this site yours.' }).waitFor({ timeout: 30_000 })
  await fillReliable(page, 'Bootstrap token', token)
  await fillReliable(page, 'Owner email', email)
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue')
      return btn && !btn.disabled
    },
    { timeout: 15_000 },
  )
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site or publication name').waitFor({ timeout: 15_000 })
  await fillReliable(page, 'Site or publication name', 'Server Kill Site')
  await fillReliable(page, 'Site slug', 'server-kill-site')
  await fillReliable(page, 'Primary URL', 'http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(2000) // let the draft checkpoint land
  result.draftSavedBeforeKill = true

  fs.writeFileSync(readyFile, 'ready')
  const deadline = Date.now() + 180_000
  while (!fs.existsSync(waitFile)) {
    if (Date.now() > deadline) throw new Error('timed out waiting for server restart signal')
    await new Promise((r) => setTimeout(r, 500))
  }

  const page2 = await context.newPage()
  await addAuthenticator(context, page2)
  await page2.goto(BASE + '/setup')
  await page2.waitForTimeout(2500)
  const text = await bodyText(page2)
  result.afterRestart = {
    showsWizard: text.includes('Make this site yours.'),
    setupComplete: text.includes('Setup Complete'),
    siteNameRestored: text.includes('Server Kill Site'),
    excerpt: text.slice(0, 500),
  }
  const nameField = page2.getByLabel('Site or publication name')
  if (await nameField.count()) result.afterRestart.nameFieldValue = await nameField.inputValue()
  await shot(page2, 'leg2-serverkill-resume')
  out('leg2-serverkill', result)
} finally {
  await browser.close()
}
