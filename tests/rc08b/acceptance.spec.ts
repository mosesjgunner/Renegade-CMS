import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'

const evidence = 'docs/rc/evidence/rc-08b'
const decoded = (raw: string) =>
  Buffer.from(
    raw
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))),
    'latin1',
  ).toString('utf8')
function mails(email: string) {
  return readdirSync('scratch/rc08b-mail')
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(`scratch/rc08b-mail/${name}`, 'utf8')))
    .filter((mail) => mail.recipient.includes(email))
    .map((mail) => ({ ...mail, raw: readFileSync(`scratch/rc08b-mail/${mail.file}`, 'utf8') }))
    .sort((a, b) => Number(a.file.split('.')[0]) - Number(b.file.split('.')[0]))
}
async function delivered(email: string, subject?: string, after = 0) {
  await expect
    .poll(
      () =>
        mails(email).filter(
          (mail) =>
            Number(mail.file.split('.')[0]) > after &&
            (!subject || decoded(mail.raw).includes(subject)),
        ).length,
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0)
  return mails(email)
    .filter(
      (mail) =>
        Number(mail.file.split('.')[0]) > after &&
        (!subject || decoded(mail.raw).includes(subject)),
    )
    .at(-1)!
}
const link = (mail: { raw: string }, path: string) =>
  [...decoded(mail.raw).matchAll(/https?:\/\/[^\s<>"']+/g)]
    .map((match) => match[0])
    .find((value) => {
      try {
        const url = new URL(value)
        return url.pathname === path && url.searchParams.has('token')
      } catch {
        return false
      }
    })
async function api(page: Page, method: string, path: string, data?: unknown, expected = 200) {
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'renegade-member-csrf',
  )?.value
  const response = await page.request.fetch(path, {
    method,
    data,
    headers: csrf ? { 'x-member-csrf': csrf } : {},
  })
  const text = await response.text()
  expect(response.status(), `${method} ${path}: ${text.slice(0, 1800)}`).toBe(expected)
  return text ? JSON.parse(text) : {}
}
async function operator(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Emergency Recovery Code', exact: true }).click()
  await page.getByLabel('Owner Email', { exact: true }).fill('editor@renegadeparty.test')
  await page
    .getByLabel('Emergency Recovery Code', { exact: true })
    .fill(readFileSync('scratch/rc03-recovery-code.txt', 'utf8').trim())
  await page.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
  await expect(page).toHaveURL(/\/admin/)
}
async function member(page: Page, email: string) {
  const previous = mails(email).at(-1)
  await page.goto('/member-auth')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByRole('button', { name: /Email.*link|Send.*link/i }).click()
  const mail = await delivered(
    email,
    'single-use link',
    previous ? Number(previous.file.split('.')[0]) : 0,
  )
  const url = link(mail, '/member-auth/verify')
  expect(url).toBeTruthy()
  await page.goto(url!)
  await expect(page.getByRole('status')).toHaveText('Signed in.')
  return api(page, 'GET', '/api/member-auth/me')
}

test('RC08B ordinary operator, visitor, member and restart acceptance', async ({
  page,
  browser,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  let visitor: BrowserContext | undefined, second: BrowserContext | undefined
  const suffix = String(Date.now()),
    title = `RC08B browser event ${suffix}`
  try {
    await operator(page)
    const site = (await api(page, 'GET', '/api/sites?depth=0')).docs[0]
    const other = (
      await api(
        page,
        'POST',
        '/api/sites',
        {
          name: 'RC08B other site',
          slug: `other-${suffix}`,
          lifecycle: 'active',
          communityRegistrationPolicy: 'open',
          commentReactionCodes: ['heart'],
        },
        201,
      )
    ).doc
    const settings = await api(page, 'GET', '/api/globals/site-settings')
    await api(page, 'POST', '/api/globals/site-settings', {
      canonicalOriginsBySite: {
        ...settings.canonicalOriginsBySite,
        [site.id]: process.env.APP_URL,
        [other.id]: 'https://other.rc08b.test',
      },
    })
    const event = (
      await api(
        page,
        'POST',
        '/api/events',
        {
          site: site.id,
          title,
          slug: `browser-event-${suffix}`,
          startsAt: '2027-03-07T15:00:00Z',
          timeZone: 'America/Chicago',
          status: 'published',
          visibility: 'public',
          recurrence: { frequency: 'weekly', count: 3 },
        },
        201,
      )
    ).doc
    const foreign = (
      await api(
        page,
        'POST',
        '/api/events',
        {
          site: other.id,
          title: `Foreign ${suffix}`,
          slug: `foreign-${suffix}`,
          startsAt: '2027-03-07T15:00:00Z',
          timeZone: 'UTC',
          status: 'published',
          visibility: 'public',
        },
        201,
      )
    ).doc
    const timeline = (
      await api(
        page,
        'POST',
        '/api/timelines',
        {
          site: site.id,
          title: `RC08B timeline ${suffix}`,
          slug: `browser-timeline-${suffix}`,
          status: 'draft',
          visibility: 'public',
          orderingMode: 'manual',
        },
        201,
      )
    ).doc
    await api(
      page,
      'POST',
      '/api/timeline-memberships',
      { timeline: timeline.id, event: event.id, position: 1 },
      201,
    )
    const published = (
      await api(page, 'PATCH', `/api/timelines/${timeline.id}`, {
        status: 'published',
        summary: 'Persisted timeline',
      })
    ).doc
    await api(
      page,
      'POST',
      '/api/timeline-memberships',
      { timeline: timeline.id, event: foreign.id },
      403,
    )
    const form = (
      await api(
        page,
        'POST',
        '/api/form-definitions',
        {
          site: site.id,
          name: `RC08B contact ${suffix}`,
          publicPath: `/forms/contact-${suffix}`,
          actions: [
            { type: 'create-contact' },
            { type: 'create-task', title: `RC08B browser intake ${suffix}` },
          ],
        },
        201,
      )
    ).doc
    const schema = {
      version: 1,
      locale: 'en',
      fields: [
        { key: 'email', type: 'email', label: 'Email', required: true },
        { key: 'consent', type: 'checkbox', label: 'Contact consent', required: true },
      ],
    }
    const saved = (
      await api(
        page,
        'POST',
        '/api/form-schemas',
        {
          form: form.id,
          version: 1,
          state: 'published',
          locale: 'en',
          schema,
          consentText: 'I consent to contact about this request.',
          consentRevision: 'rc08b-browser-v1',
        },
        201,
      )
    ).doc
    await api(page, 'PATCH', `/api/form-definitions/${form.id}`, { activeSchema: saved.id })
    await api(page, 'PATCH', `/api/form-definitions/${form.id}`, { site: other.id }, 403)
    await page.goto('/admin/collections/form-definitions')
    await expect(page.getByText(form.name, { exact: true }).first()).toBeVisible()
    visitor = await browser.newContext({ baseURL: process.env.APP_URL, ignoreHTTPSErrors: true })
    const reader = await visitor.newPage()
    reader.on('pageerror', (error) => errors.push(error.message))
    await reader.goto('/calendar?month=2027-03')
    await expect(reader.getByRole('heading', { name: 'Event calendar' })).toBeVisible()
    await expect(reader.getByRole('link', { name: title, exact: true })).toHaveCount(3)
    expect(await reader.locator('main').textContent()).not.toContain(`Foreign ${suffix}`)
    await reader.getByRole('link', { name: 'Next month', exact: true }).click()
    await expect(reader).toHaveURL(/month=2027-04/)
    const feed = await reader.request.get('/events/feed.ics')
    expect(feed.status()).toBe(200)
    const bytes = await feed.text()
    expect(bytes).toContain(title)
    expect(bytes).not.toContain(`Foreign ${suffix}`)
    expect(bytes.match(new RegExp(`UID:${event.id}-`, 'g'))).toHaveLength(3)
    await reader.goto(published.canonicalPath)
    await expect(reader.getByRole('heading', { name: timeline.title })).toBeVisible()
    await expect(reader.getByRole('link', { name: title, exact: true })).toBeVisible()
    await reader.goto(`/forms/contact-${suffix}`)
    await reader.getByLabel('Email *', { exact: true }).fill(`contact-${suffix}@example.test`)
    await reader.getByLabel('Contact consent *', { exact: true }).check()
    await reader.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(reader.getByRole('status')).toContainText('submission was received')
    await expect
      .poll(
        async () => {
          const data = await api(
            page,
            'GET',
            `/api/form-submissions?where[form][equals]=${form.id}&depth=0`,
          )
          return data.docs[0]?.status
        },
        { timeout: 90000 },
      )
      .toBe('triaged')
    const intake = (
      await api(page, 'GET', `/api/form-submissions?where[form][equals]=${form.id}&depth=0`)
    ).docs[0]
    expect(intake.actionState.map((step: { status: string }) => step.status)).toEqual([
      'completed',
      'completed',
    ])
    expect(intake.consentSnapshot.revision).toBe('rc08b-browser-v1')
    expect((await reader.request.get('/api/form-submissions')).status()).toBe(403)
    expect((await reader.request.get('/api/forms/deferred-example')).status()).toBe(404)
    expect(
      (
        await reader.request.post(`/api/forms/${form.id}`, {
          data: {
            values: { email: 'invalid', consent: false },
            idempotencyKey: `invalid-${suffix}`,
          },
        })
      ).status(),
    ).toBe(422)
    const own = await member(reader, `member-${suffix}@example.test`),
      memberId = own.profile?.memberId ?? own.memberId
    expect(memberId).toBeTruthy()
    await reader.goto('/members/settings')
    await expect(reader.getByRole('heading', { name: /settings/i }).first()).toBeVisible()
    await api(reader, 'PATCH', '/api/member-auth/profile', {
      relationshipNotifications: { follows: false, mentions: false, messages: false },
    })
    await api(reader, 'PATCH', '/api/community/notification-preferences', {
      siteId: site.id,
      channel: 'email',
      frequency: 'immediate',
      email: `member-${suffix}@example.test`,
    })
    await api(
      reader,
      'PATCH',
      '/api/community/notification-preferences',
      { siteId: other.id, channel: 'email', frequency: 'off' },
      403,
    )
    await api(
      reader,
      'PATCH',
      '/api/community/notification-preferences',
      {
        siteId: site.id,
        channel: 'email',
        frequency: 'immediate',
        email: 'unverified@example.test',
      },
      422,
    )
    const missingCsrf = await reader.request.patch('/api/community/notification-preferences', {
      data: { siteId: site.id, channel: 'in_app', frequency: 'off' },
    })
    expect(missingCsrf.status()).toBe(403)
    second = await browser.newContext({ baseURL: process.env.APP_URL, ignoreHTTPSErrors: true })
    const peer = await second.newPage()
    const peerIdentity = await member(peer, `peer-${suffix}@example.test`)
    const peerId = peerIdentity.profile?.memberId ?? peerIdentity.memberId
    expect(peerId).toBeTruthy()
    await api(peer, 'POST', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: memberId,
      kind: 'follow',
    })
    await api(reader, 'PATCH', '/api/member-auth/profile', {
      relationshipNotifications: { follows: true, messages: true, mentions: true },
    })
    await api(peer, 'DELETE', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: memberId,
      kind: 'follow',
    })
    writeFileSync('scratch/rc08b-smtp-mode.txt', 'temporary')
    await api(peer, 'POST', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: memberId,
      kind: 'follow',
    })
    await expect
      .poll(
        async () => {
          const status = await api(page, 'GET', '/api/admin/audience/intake')
          return status.communityDeliveries.some(
            (row: { status: string; error: string }) =>
              row.status === 'pending' &&
              row.error === 'Transport outcome: temporary_provider_error',
          )
        },
        { timeout: 90000 },
      )
      .toBe(true)
    writeFileSync('scratch/rc08b-smtp-mode.txt', 'accept')
    const mail = await delivered(`member-${suffix}@example.test`, 'Community updates')
    expect(decoded(mail.raw)).not.toContain(`peer-${suffix}`)
    const unsubscribe = link(mail, '/api/community/notification-unsubscribe')
    expect(unsubscribe).toBeTruthy()
    const beforePreference = await api(
      reader,
      'GET',
      `/api/community/notification-preferences?siteId=${site.id}`,
    )
    expect(beforePreference.preferences.email).toBe('immediate')
    await reader.goto(unsubscribe!)
    await reader.getByRole('button', { name: 'Turn off community email' }).click()
    await expect(reader.locator('body')).toContainText('Community email is off')
    expect(
      (await api(reader, 'GET', `/api/community/notification-preferences?siteId=${site.id}`))
        .preferences.email,
    ).toBe('off')
    const group = (
      await api(
        reader,
        'POST',
        '/api/community/conversations',
        { siteId: site.id, kind: 'group', memberIds: [peerId], title: 'RC08B private group' },
        201,
      )
    ).conversation
    await api(
      reader,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: group.id,
        body: `Owned private browser message ${suffix}`,
        idempotencyKey: `private-${suffix}`,
      },
      201,
    )
    await api(
      reader,
      'POST',
      '/api/community/messages',
      {
        siteId: other.id,
        conversationId: group.id,
        body: 'Foreign site attempt',
        idempotencyKey: `foreign-private-${suffix}`,
      },
      404,
    )
    const exported = await api(reader, 'GET', '/api/member-auth/export')
    expect(exported.schemaVersion).toBe(2)
    expect(exported.contributions.comments).toEqual([])
    expect(JSON.stringify(exported.conversations.messages)).toContain(
      `Owned private browser message ${suffix}`,
    )
    await api(reader, 'GET', `/api/member-auth/export?memberId=${peerId}`, undefined, 403)
    const peerExport = await peer.request.get('/api/member-auth/export')
    expect(peerExport.status()).toBe(200)
    const anonymous = await browser.newContext({
      baseURL: process.env.APP_URL,
      ignoreHTTPSErrors: true,
    })
    try {
      expect((await anonymous.request.get('/api/member-auth/export')).status()).toBe(401)
      expect((await anonymous.request.get('/api/admin/audience/intake')).status()).toBe(403)
    } finally {
      await anonymous.close()
    }
    writeFileSync('scratch/rc08b-restart.txt', suffix)
    await expect
      .poll(
        () =>
          existsSync('scratch/rc08b-restarted.json')
            ? JSON.parse(readFileSync('scratch/rc08b-restarted.json', 'utf8')).epoch
            : '',
        { timeout: 60000 },
      )
      .toBe(suffix)
    await expect
      .poll(
        async () => {
          try {
            return (await reader.request.get('/api/setup/readiness')).status()
          } catch {
            return 0
          }
        },
        { timeout: 60000 },
      )
      .toBe(200)
    await reader.goto(`/forms/contact-${suffix}`)
    await expect(reader.getByRole('heading', { name: form.name })).toBeVisible()
    expect((await api(page, 'GET', `/api/form-submissions/${intake.id}?depth=0`)).status).not.toBe(
      '',
    )
    expect(
      (await api(reader, 'GET', `/api/community/notification-preferences?siteId=${site.id}`))
        .preferences.email,
    ).toBe('off')
    const persistedExport = await api(reader, 'GET', '/api/member-auth/export')
    expect(JSON.stringify(persistedExport.conversations.messages)).toContain(
      `Owned private browser message ${suffix}`,
    )
    const after = await api(reader, 'GET', '/api/member-auth/me')
    expect(after.profile.relationshipNotifications).toMatchObject({
      follows: true,
      messages: true,
      mentions: true,
    })
    await reader.goto('/calendar?month=2027-03')
    await expect(reader.getByRole('link', { name: title, exact: true })).toHaveCount(3)
    await api(page, 'DELETE', `/api/events/${event.id}`)
    await reader.goto(published.canonicalPath)
    await expect(reader.getByText('No public events are available in this timeline.')).toBeVisible()
    expect((await reader.request.get(`/events/${event.slug}/ics`)).status()).toBe(404)
    await reader.goto('/graphics-studio')
    await expect(reader.getByRole('button', { name: 'Save to Media' })).toHaveCount(0)
    await reader.goto('/social-studio')
    await expect(reader.getByRole('button', { name: /Publish Broadcast|Schedule/ })).toHaveCount(0)
    await reader.screenshot({ path: `${evidence}/completed-browser.png`, fullPage: true })
    expect(errors).toEqual([])
    writeFileSync(
      `${evidence}/browser-assertions.json`,
      JSON.stringify(
        {
          siteId: site.id,
          otherSiteId: other.id,
          eventId: event.id,
          formId: form.id,
          submissionId: intake.id,
          memberId,
          peerId,
          restart: JSON.parse(readFileSync('scratch/rc08b-restarted.json', 'utf8')),
          consoleErrors: errors,
          boundary: 'Local HTTPS and SMTP; no live provider or aggregate release claim',
        },
        null,
        2,
      ),
    )
  } finally {
    writeFileSync('scratch/rc08b-smtp-mode.txt', 'accept')
    mkdirSync('scratch/rc08b-private-traces', { recursive: true })
    await context.tracing.stop({ path: `scratch/rc08b-private-traces/operator-${suffix}.zip` })
    await visitor?.close()
    await second?.close()
  }
})
