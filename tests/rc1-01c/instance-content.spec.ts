import { expect, test } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'

const instances = [
  {
    project: 'rc101clean',
    origin: 'https://rc1-01c-lean.test',
    slug: 'lean-01c-site',
    label: 'Lean 01C Site',
    worktree: 'C:/Projects/RENEGADE CMS/rc1-01c-lean',
  },
  {
    project: 'rc101cstd',
    origin: 'https://rc1-01c-std.test',
    slug: 'standard-01c-site',
    label: 'Standard 01C Site',
    worktree: 'C:/Projects/RENEGADE CMS/rc1-01c-std',
  },
] as const

function token(project: string) {
  const result = spawnSync(
    'docker',
    ['exec', `${project}-renegade-web-1`, 'npm', 'run', 'installation:recover'],
    { encoding: 'utf8' },
  )
  expect(result.status).toBe(0)
  const value = (result.stdout + result.stderr).match(
    /Renegade CMS setup token \(expires in 15 minutes; use once\): ([A-Za-z0-9_-]{43})/,
  )?.[1]
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return value!
}

function persisted(project: string) {
  const sql = `SELECT json_build_object('install',(SELECT state FROM installation_state),'sites',(SELECT json_agg(json_build_object('slug',slug,'name',name) ORDER BY slug) FROM sites),'content',(SELECT json_agg(json_build_object('path',canonical_path,'title',title) ORDER BY canonical_path) FROM content),'settings',(SELECT json_build_object('siteName',site_name,'title',default_title,'origin',canonical_origin,'indexing',indexing_mode) FROM site_settings LIMIT 1))`
  const result = execFileSync(
    'docker',
    ['exec', `${project}-postgres-1`, 'psql', '-U', 'renegade', '-d', 'renegade', '-Atc', sql],
    { encoding: 'utf8' },
  )
  return JSON.parse(result.trim())
}

function compose(project: string, worktree: string, operation: 'down' | 'up') {
  const args = [
    'compose',
    '--project-name',
    project,
    '--env-file',
    `${worktree}/.env.production`,
    '-f',
    'compose.production.yaml',
    '-f',
    'compose.network.yaml',
    ...(operation === 'down' ? ['down'] : ['up', '-d', '--no-build', '--wait']),
  ]
  const result = spawnSync('docker', args, { cwd: worktree, encoding: 'utf8', timeout: 120000 })
  if (result.status !== 0)
    throw new Error(`${project} ${operation} failed: ${result.stderr.slice(-1000)}`)
}

test('Lean and Standard setup content and settings survive independent stack restarts', async ({
  browser,
}) => {
  const snapshots = new Map<string, unknown>()
  for (const instance of instances) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    const session = await context.newCDPSession(page)
    await session.send('WebAuthn.enable')
    await session.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
    const setupToken = token(instance.project)
    await page.goto(`${instance.origin}/setup`)
    await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()
    await page.getByLabel('Bootstrap token').fill(setupToken)
    await page.getByLabel('Owner email').fill(`owner@${instance.slug}.test`)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Site or publication name').fill(instance.label)
    await page.getByLabel('Site slug').fill(instance.slug)
    await page.getByLabel('Primary URL').fill(instance.origin)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
    await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({
      timeout: 30000,
    })
    await page.screenshot({
      path: `docs/rc/evidence/rc1/18-pass/01C/${instance.project}-setup.png`,
      fullPage: true,
    })
    const before = persisted(instance.project)
    expect(before.install).toBe('complete')
    expect(before.sites).toEqual([{ slug: instance.slug, name: instance.label }])
    expect(before.content.length).toBeGreaterThan(0)
    expect(before.settings).toMatchObject({
      siteName: instance.label,
      title: instance.label,
      origin: instance.origin,
    })
    snapshots.set(instance.project, before)
    await context.close()
  }

  expect(snapshots.get('rc101clean')).not.toEqual(snapshots.get('rc101cstd'))
  for (const instance of instances) {
    compose(instance.project, instance.worktree, 'down')
    const other = instances.find((candidate) => candidate.project !== instance.project)!
    expect(persisted(other.project)).toEqual(snapshots.get(other.project))
    compose(instance.project, instance.worktree, 'up')
    expect(persisted(instance.project)).toEqual(snapshots.get(instance.project))
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.goto(`${instance.origin}/setup`)
    await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible()
    await context.close()
  }
})
