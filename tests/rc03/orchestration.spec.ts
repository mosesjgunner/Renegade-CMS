import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

test('RC-03 cross-surface orchestration, pending-worker restart, partial failure and receipt recovery', async ({
  page,
  context,
  browser,
}) => {
  const evidence = 'docs/rc/evidence/rc-03'
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const api = async (method: string, path: string, data?: unknown, status = 200) => {
    const response = await page.request.fetch(path, { method, data })
    const body = await response.text()
    expect(response.status(), `${method} ${path}: ${body.slice(0, 2000)}`).toBe(status)
    return JSON.parse(body)
  }
  // The original RC02 one-time code is consumed only on this disposable database copy.
  await page.goto('/login')
  await page.getByRole('button', { name: 'Emergency Recovery Code', exact: true }).click()
  await page.getByLabel('Owner Email', { exact: true }).fill('editor@renegadeparty.test')
  await page
    .getByLabel('Emergency Recovery Code', { exact: true })
    .fill(readFileSync('scratch/rc03-recovery-code.txt', 'utf8').trim())
  await page.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
  await expect(page).toHaveURL(/\/admin/)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  try {
    const site = (await api('GET', '/api/sites?depth=0')).docs[0]
    expect(site.name || site.title).toContain('Renegade')
    const publication = (await api('GET', '/api/publications?depth=0')).docs[0]
    const suffix = Date.now().toString()
    const doc = (
      await api(
        'POST',
        '/api/content',
        {
          site: site.id,
          publication: publication.id,
          contentType: 'article',
          title: `RC03 accountable release ${suffix}`,
          slug: `rc03-release-${suffix}`,
          status: 'draft',
          summary:
            'A coordinated civic publication with two independently observed downstream destinations.',
          body: {
            root: {
              type: 'root',
              version: 1,
              direction: null,
              format: '',
              indent: 0,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  direction: null,
                  format: '',
                  indent: 0,
                  children: [
                    {
                      type: 'text',
                      version: 1,
                      text: 'RC03 draft awaiting review.',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    },
                  ],
                },
              ],
            },
          },
        },
        201,
      )
    ).doc
    const articleId = String(doc.id)
    const workflowAction = async (action: string, extra = {}) =>
      api('POST', '/api/admin/workflow/actions', { articleId, action, ...extra })
    await workflowAction('submit')
    let command = await api('GET', '/api/admin/workflow/command-center')
    expect(
      command.teamQueues.awaitingApproval.some((item: { id: string }) => item.id === articleId),
    ).toBe(true)
    await page.goto('/admin/workflow')
    await expect(page.getByRole('heading', { name: /Workflow Command Center/ })).toBeVisible()
    await page.getByText(`article #${articleId}`, { exact: true }).first().click()
    await page
      .getByPlaceholder('Add review notes, requested changes, or approval comment...')
      .fill('Add the recovery and destination-failure evidence before release.')
    const changed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/workflow/actions') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Request Changes', exact: true }).click()
    const changedResponse = await changed
    expect(changedResponse.status(), await changedResponse.text()).toBe(200)
    expect((await api('GET', `/api/content/${articleId}?depth=0`)).status).toBe('rejected')
    await page.screenshot({ path: `${evidence}/pending-review.png`, fullPage: true })

    await page.goto(`/admin/collections/content/${articleId}`)
    const editor = page.locator('[contenteditable="true"]').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await editor.pressSequentially(
      'Revised evidence: successful publication remains public while a failed destination is repaired.',
    )
    const save = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/content/${articleId}`) &&
        response.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await save).status()).toBe(200)
    await workflowAction('save-draft')
    await workflowAction('submit')
    // Built-in policy forbids single-owner self approval. Verify it and use the supported audited override.
    await api('POST', '/api/admin/workflow/actions', { articleId, action: 'approve' }, 403)
    await workflowAction('emergency-override', {
      targetStatus: 'approved',
      reason:
        'RC02 single-owner acceptance publication; explicit authorized publisher override after requested revision.',
    })
    const companion = (
      await api('GET', `/api/article-family-content?where[content][equals]=${articleId}&depth=0`)
    ).docs[0]
    const revisions = await api(
      'GET',
      `/api/revision-records?where[article][equals]=${companion.id}&depth=0`,
    )
    expect(revisions.totalDocs).toBeGreaterThanOrEqual(2)
    const drafts: string[] = []
    for (const destination of ['good', 'bad']) {
      const account = (
        await api(
          'POST',
          '/api/social-accounts',
          {
            site: site.id,
            publication: publication.id,
            displayName: `RC03 ${destination}`,
            network: 'bluesky',
            actorType: 'publication',
            externalAccountId: `${destination}-${suffix}`,
            capabilityState: 'available',
            connectionReference: `rc03-${destination}`,
            credentialHealth: 'healthy',
            capabilities: {},
          },
          201,
        )
      ).doc
      const draft = (
        await api(
          'POST',
          '/api/social-drafts',
          {
            site: site.id,
            publication: publication.id,
            title: `RC03 ${destination} distribution ${suffix}`,
            sourceContent: articleId,
            sourceRevision: companion.currentRevision,
            status: 'approved',
            canonicalUrl: process.env.APP_URL + doc.canonicalPath,
          },
          201,
        )
      ).doc
      await api(
        'POST',
        '/api/social-network-variants',
        {
          draft: draft.id,
          account: account.id,
          label: `RC03 ${destination} destination`,
          network: 'bluesky',
          text: `RC03 ${destination} civic release ${suffix}`,
          status: 'approved',
          idempotencyKey: `rc03:${suffix}:${destination}`,
        },
        201,
      )
      drafts.push(draft.id)
    }
    await page.goto('/admin/social')
    await expect(
      page.getByText('Connected Distribution Targets (2)', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Provider configuration', exact: true }),
    ).toBeVisible()
    const configured = (await api('GET', '/api/admin/social/accounts')).accounts
    expect(configured).toHaveLength(2)
    expect(
      configured.every(
        (account: { credentialHealth: string }) => account.credentialHealth === 'healthy',
      ),
    ).toBe(true)
    await page.getByRole('link', { name: 'Provider configuration', exact: true }).click()
    await expect(page.getByRole('link', { name: 'RC03 good', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'RC03 bad', exact: true })).toBeVisible()
    await page.screenshot({ path: `${evidence}/provider-configuration.png`, fullPage: true })
    const scheduledFor = new Date(Date.now() + 45_000).toISOString()
    const release = (
      await api('POST', '/api/admin/releases', {
        name: `RC03 orchestration ${suffix}`,
        siteId: site.id,
        publicationId: publication.id,
        plannedInstant: scheduledFor,
        timeZone: 'America/Chicago',
      })
    ).release
    const action = async (action: string, extra = {}) =>
      api('POST', `/api/admin/releases/${release.id}`, { action, ...extra })
    await action('pin-artifact', {
      artifact: {
        targetType: 'article',
        targetId: articleId,
        title: doc.title,
        canonicalUrl: doc.canonicalPath,
        pinnedRevisionId: companion.currentRevision,
        pinnedHash: companion.documentHash,
      },
    })
    await action('pin-artifact', {
      artifact: {
        targetType: 'redirect',
        targetId: `rc03-${suffix}`,
        title: 'Coordinated public redirect',
        redirectRule: {
          fromPath: `/rc03-${suffix}`,
          toPath: doc.canonicalPath,
          statusCode: 308,
          match: 'exact',
          enabled: true,
        },
      },
    })
    for (let index = 0; index < drafts.length; index++)
      await action('pin-artifact', {
        artifact: {
          targetType: 'distribution',
          targetId: drafts[index],
          distributionDraftId: drafts[index],
          title: `RC03 ${index === 0 ? 'good' : 'bad'} downstream`,
          pinnedHash: `rc03-${suffix}-${index}`,
        },
      })
    await page.goto('/admin/releases')
    await page.getByText(release.name, { exact: true }).click()
    const approved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/releases/${release.id}`) &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Approve Release/ }).click()
    expect((await approved).status()).toBe(200)
    const scheduled = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/releases/${release.id}`) &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Schedule Execution/ }).click()
    expect((await scheduled).status()).toBe(200)
    command = await api('GET', '/api/admin/workflow/command-center')
    expect(
      command.calendar.some(
        (entry: { sourceId: string; status: string }) =>
          entry.sourceId === String(release.id) && entry.status === 'scheduled',
      ),
    ).toBe(true)
    expect((await page.request.get(doc.canonicalPath)).status()).toBe(404)
    await page.screenshot({ path: `${evidence}/scheduled-release.png`, fullPage: true })
    const restart = async (label: string) => {
      const request = { label, at: new Date().toISOString() }
      writeFileSync('scratch/rc03-restart-request.json', JSON.stringify(request))
      await expect
        .poll(
          () =>
            existsSync('scratch/rc03-restart-receipt.json')
              ? JSON.parse(readFileSync('scratch/rc03-restart-receipt.json', 'utf8')).request.label
              : '',
          { timeout: 60_000 },
        )
        .toBe(label)
      const receipt = JSON.parse(readFileSync('scratch/rc03-restart-receipt.json', 'utf8'))
      expect(receipt.current.worker).not.toBe(receipt.previous.worker)
      await expect
        .poll(
          async () => {
            try {
              return (await page.request.get('/api/setup/readiness')).status()
            } catch {
              return 0
            }
          },
          { timeout: 60_000 },
        )
        .toBe(200)
      writeFileSync(`${evidence}/${label}.json`, JSON.stringify(receipt, null, 2))
    }
    await restart('pending-worker-restart')
    await expect
      .poll(async () => (await api('GET', `/api/admin/releases/${release.id}`)).release.status, {
        timeout: 100_000,
      })
      .toBe('partially-failed')
    const partial = (await api('GET', `/api/admin/releases/${release.id}`)).release
    expect(partial.artifacts.map((item: { status: string }) => item.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'failed',
    ])
    expect(partial.artifacts[3].error).toContain('repair provider')
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
    const publicPage = await anonymous.newPage()
    await publicPage.goto(process.env.APP_URL + doc.canonicalPath)
    await expect(publicPage.getByRole('heading', { name: doc.title, exact: true })).toBeVisible()
    await expect(publicPage.getByText(/Revised evidence:/)).toBeVisible()
    expect(
      (
        await publicPage.request.get(process.env.APP_URL + `/rc03-${suffix}`, { maxRedirects: 0 })
      ).status(),
    ).toBe(308)
    await anonymous.close()
    await page.goto('/admin/releases')
    await page.getByText(release.name, { exact: true }).click()
    await expect(page.getByText(/RC03 destination disabled; repair provider/).first()).toBeVisible()
    await page.screenshot({ path: `${evidence}/partial-delivery.png`, fullPage: true })
    const retryResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/admin/releases/${release.id}`) &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Retry Failed Steps/ }).click()
    expect((await retryResponse).status()).toBe(200)
    expect((await api('GET', `/api/admin/releases/${release.id}`)).release.status).toBe(
      'partially-failed',
    )
    await restart('partial-worker-restart')
    await page.request.post('http://127.0.0.1:3130/recover')
    expect((await action('retry')).result.status).toBe('partially-failed') // Remote committed, response lost.
    const recovered = await Promise.all([action('retry'), action('retry')])
    expect(recovered.every((result) => result.result.status === 'completed')).toBe(true)
    const final = (await api('GET', `/api/admin/releases/${release.id}`)).release
    expect(final.artifacts.map((item: { attempts: number }) => item.attempts)).toEqual([1, 1, 1, 4])
    const boundary = await (await page.request.get('http://127.0.0.1:3130/state')).json()
    expect(boundary.creates).toEqual({ 'did:plc:good': 1, 'did:plc:bad': 1 })
    expect(boundary.requests).toEqual({ 'did:plc:good': 1, 'did:plc:bad': 3 })
    const published = await api('GET', `/api/article-family-content/${companion.id}?depth=0`)
    expect(
      published.workflowAudit.filter(
        (event: { action: string }) => event.action === 'publication.published',
      ),
    ).toHaveLength(1)
    const queue = await api('GET', '/api/social-queue-items?depth=0')
    expect(
      queue.docs.filter((item: { status: string }) => item.status === 'published'),
    ).toHaveLength(2)
    expect((await api('GET', '/api/external-posts?depth=0')).totalDocs).toBe(2)
    await page.goto('/admin/releases')
    await page.getByText(release.name, { exact: true }).click()
    await expect(page.getByText('COMPLETED', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: `${evidence}/recovered-release.png`, fullPage: true })
    // The actual event subsystem supports future occurrence dates, ordinary admin and public rendering.
    const event = (
      await api(
        'POST',
        '/api/events',
        {
          site: site.id,
          publication: publication.id,
          title: `RC03 future assembly ${suffix}`,
          slug: `rc03-assembly-${suffix}`,
          summary: 'A future civic assembly following the recovered release.',
          status: 'draft',
          startsAt: '2026-11-01T06:30:00.000Z',
          endsAt: '2026-11-01T08:30:00.000Z',
          timeZone: 'America/Chicago',
          visibility: 'public',
          venueName: 'Civic hall',
        },
        201,
      )
    ).doc
    await api('PATCH', `/api/events/${event.id}`, { status: 'published' })
    await page.goto(`/admin/collections/events/${event.id}`)
    await expect(page.getByRole('textbox', { name: 'Title *', exact: true })).toHaveValue(event.title)
    await page.goto(event.canonicalPath)
    await expect(page.getByRole('heading', { name: event.title, exact: true })).toBeVisible()
    await api(
      'POST',
      '/api/timelines',
      {
        site: site.id,
        title: 'Deferred timeline',
        slug: `deferred-${suffix}`,
        visibility: 'public',
      },
      403,
    )
    await api(
      'POST',
      '/api/calendar-entries',
      {
        site: site.id,
        title: 'Deferred calendar',
        startsAt: event.startsAt,
        timeZone: 'America/Chicago',
      },
      403,
    )
    await page.goto('/calendar')
    await expect(
      page.getByRole('heading', { name: 'Interactive calendar deferred for RC' }),
    ).toBeVisible()
    expect((await page.request.get('/api/calendar/export')).status()).toBe(410)
    expect(errors).toEqual([])
    writeFileSync(
      `${evidence}/orchestration.json`,
      JSON.stringify(
        {
          articleId,
          releaseId: release.id,
          scheduledFor,
          partial,
          final,
          boundary,
          event,
          canonicalPublishAudit: published.workflowAudit,
          pageErrors: errors,
        },
        null,
        2,
      ),
    )
  } finally {
    await context.tracing.stop({ path: `${evidence}/orchestration-trace.zip` })
  }
})
