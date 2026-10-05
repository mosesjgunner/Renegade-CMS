import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const evidence = 'docs/rc/evidence/rc-04'
const workerMode = () =>
  existsSync('scratch/rc04-worker-restart.json')
    ? JSON.parse(readFileSync('scratch/rc04-worker-restart.json', 'utf8')).mode
    : 'starting'
const decoded = (raw: string) =>
  Buffer.from(
    raw
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))),
    'latin1',
  ).toString('utf8')
function mails(email: string) {
  return readdirSync('scratch/rc04-mail')
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(`scratch/rc04-mail/${name}`, 'utf8')))
    .filter((mail) => mail.recipient.includes(email))
    .map((mail) => ({ ...mail, raw: readFileSync(`scratch/rc04-mail/${mail.file}`, 'utf8') }))
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

test('visitor newsletter, real MIME, suppression, re-subscribe and operator delivery recovery', async ({
  page,
  browser,
  context,
}) => {
  const errors: string[] = []
  let visitor: BrowserContext | undefined
  page.on('pageerror', (error) => errors.push(error.message))
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  try {
    await operator(page)
    await context.storageState({ path: 'scratch/rc04-operator.json' })
    const site = (await api(page, 'GET', '/api/sites?depth=0')).docs[0]
    const list = (
      await api(
        page,
        'POST',
        '/api/audience-lists',
        { site: site.id, name: 'RC04 newsletter', status: 'active', doubleOptIn: true },
        201,
      )
    ).doc
    visitor = await browser.newContext({
      baseURL: process.env.APP_URL,
      ignoreHTTPSErrors: true,
    })
    await visitor.tracing.start({ screenshots: true, snapshots: true, sources: true })
    const publicPage = await visitor.newPage()
    const email = `rc04-reader-${Date.now()}@example.test`
    await publicPage.goto('/subscribe')
    await publicPage.getByLabel('Email Address', { exact: true }).fill(email)
    await publicPage.getByLabel('Consent to receive emails').check()
    await publicPage.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await expect(publicPage.getByRole('status')).toContainText('Check your inbox')
    const confirmation = await delivered(email, 'Confirm your subscription')
    await api(publicPage, 'POST', '/api/subscribers/subscribe', { email }, 202)
    const subscribers = (
      await api(page, 'GET', `/api/subscribers?where[email][equals]=${email}&depth=0`)
    ).docs
    expect(subscribers).toHaveLength(1)
    const subscriber = subscribers[0]
    expect(subscriber.status).toBe('pending')
    const consent = (
      await api(
        page,
        'GET',
        `/api/consent-events?where[subscriber][equals]=${subscriber.id}&depth=0`,
      )
    ).docs
    expect(consent[0].evidence.wordingVersion).toBe('newsletter-v1')
    const confirmLink = link(confirmation, '/subscribe/confirm')
    expect(confirmLink).toBeTruthy()
    await publicPage.goto(confirmLink!)
    await publicPage.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(publicPage.getByRole('status')).toContainText(/confirm/i)
    expect((await api(page, 'GET', `/api/subscribers/${subscriber.id}?depth=0`)).status).toBe(
      'active',
    )
    await page.goto('/admin/email-composer')
    await expect(page.getByRole('heading', { name: 'Email composer' })).toBeVisible()
    const design = {
      version: 1,
      templateVersion: 'rc04-v1',
      locale: 'en',
      tokens: {},
      blocks: [
        { type: 'heading', text: 'RC04 café and civic updates' },
        { type: 'text', text: 'A real supported email design.' },
        { type: 'button', label: 'Read the publication', href: process.env.APP_URL },
        {
          type: 'legal',
          address: '123 Civic Street, Test City',
          preferenceUrl: '/subscribe/preferences',
        },
      ],
      plainTextStrategy: 'generated',
      personalization: { missingValue: 'fallback', fallbacks: {} },
    }
    await api(
      page,
      'POST',
      '/api/email-messages',
      {
        site: site.id,
        subject: 'Unreviewed scheduled creation',
        blocks: [{ type: 'text', text: 'Must not queue.' }],
        kind: 'bulk',
        status: 'scheduled',
        scheduledFor: new Date().toISOString(),
        audience: { lists: [list.id] },
      },
      400,
    )
    const message = (
      await api(
        page,
        'POST',
        '/api/email-messages',
        {
          site: site.id,
          subject: 'RC04 café newsletter',
          blocks: [{ type: 'text', text: 'RC04 café and civic updates' }],
          messageDesign: design,
          kind: 'bulk',
          status: 'draft',
          audience: { lists: [list.id] },
        },
        201,
      )
    ).doc
    await api(page, 'PATCH', `/api/email-messages/${message.id}`, { status: 'review' })
    await api(page, 'PATCH', `/api/email-messages/${message.id}`, {
      status: 'scheduled',
      scheduledFor: new Date(Date.now() + 10_000).toISOString(),
    })
    const newsletter = await delivered(email, 'List-Unsubscribe')
    expect(newsletter.raw).toContain('MIME-Version: 1.0')
    expect(newsletter.raw).toMatch(/Content-Type: multipart\/alternative/)
    expect(newsletter.raw).toMatch(/charset=utf-8/i)
    expect(decoded(newsletter.raw)).toContain('RC04 café and civic updates')
    expect(newsletter.raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    const preference = link(newsletter, '/subscribe/preferences')
    const unsubscribe = link(newsletter, '/unsubscribe')
    expect(preference).toBeTruthy()
    expect(unsubscribe).toBeTruthy()
    await publicPage.goto(preference!)
    await publicPage.getByRole('button', { name: 'Save preferences' }).click()
    await expect(publicPage.getByRole('status')).toHaveText('Preferences saved.')
    expect((await api(page, 'GET', `/api/subscribers/${subscriber.id}?depth=0`)).status).toBe(
      'unsubscribed',
    )
    await publicPage.goto(unsubscribe!)
    await publicPage.getByRole('button', { name: 'Unsubscribe', exact: true }).click()
    await expect(publicPage.getByRole('status')).toContainText('unsubscribed')
    await api(publicPage, 'POST', '/api/subscribers/subscribe', { email }, 202)
    expect(
      (await api(page, 'GET', '/api/suppressions?depth=0')).docs.some(
        (doc: { emailHash: string }) => doc.emailHash === subscriber.emailHash,
      ),
    ).toBe(true)
    const reconfirmation = await delivered(
      email,
      'Confirm your subscription',
      Number(newsletter.file.split('.')[0]),
    )
    await publicPage.goto(link(reconfirmation, '/subscribe/confirm')!)
    await publicPage.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(publicPage.getByRole('status')).toContainText(/confirm/i)
    expect((await api(page, 'GET', `/api/subscribers/${subscriber.id}?depth=0`)).status).toBe(
      'active',
    )
    // A real SMTP rejection exercises worker failure and automatic retry, rather than calling its handler.
    writeFileSync('scratch/rc04-smtp-mode.txt', 'temporary')
    const failedMessage = (
      await api(
        page,
        'POST',
        '/api/email-messages',
        {
          site: site.id,
          subject: 'RC04 recovery',
          blocks: [{ type: 'text', text: 'Failure and retry evidence' }],
          kind: 'bulk',
          status: 'draft',
          audience: { lists: [list.id] },
        },
        201,
      )
    ).doc
    await api(page, 'PATCH', `/api/email-messages/${failedMessage.id}`, { status: 'review' })
    await api(page, 'PATCH', `/api/email-messages/${failedMessage.id}`, {
      status: 'scheduled',
      scheduledFor: new Date().toISOString(),
    })
    let failed: Record<string, unknown> = {}
    await expect
      .poll(
        async () => {
          const docs = (
            await api(
              page,
              'GET',
              `/api/email-deliveries?where[message][equals]=${failedMessage.id}&depth=0`,
            )
          ).docs
          failed = docs[0] ?? {}
          return Boolean((failed.outcome as { retryable?: boolean } | undefined)?.retryable)
        },
        { timeout: 70_000 },
      )
      .toBe(true)
    expect((failed.outcome as { retryable: boolean }).retryable).toBe(true)
    writeFileSync('scratch/rc04-smtp-mode.txt', 'accept')
    await delivered(email, 'RC04 recovery')
    await expect
      .poll(
        async () => (await api(page, 'GET', `/api/email-deliveries/${failed.id}?depth=0`)).status,
      )
      .toBe('accepted')
    await page.goto('/admin/collections/email-deliveries')
    await expect(page.getByRole('heading', { name: /Email Deliveries/i })).toBeVisible()
    writeFileSync('scratch/rc04-worker-mode.txt', 'disabled')
    await expect.poll(workerMode).toBe('disabled')
    const disabledMessage = (
      await api(
        page,
        'POST',
        '/api/email-messages',
        {
          site: site.id,
          subject: 'RC04 unconfigured recovery',
          blocks: [{ type: 'text', text: 'No configured email adapter' }],
          kind: 'bulk',
          status: 'draft',
          audience: { lists: [list.id] },
        },
        201,
      )
    ).doc
    await api(page, 'PATCH', `/api/email-messages/${disabledMessage.id}`, { status: 'review' })
    await api(page, 'PATCH', `/api/email-messages/${disabledMessage.id}`, {
      status: 'scheduled',
      scheduledFor: new Date().toISOString(),
    })
    let disabled: { id?: string; status?: string; outcome?: { code: string } } = {}
    await expect
      .poll(
        async () => {
          disabled =
            (
              await api(
                page,
                'GET',
                `/api/email-deliveries?where[message][equals]=${disabledMessage.id}&depth=0`,
              )
            ).docs[0] ?? {}
          return disabled.status
        },
        { timeout: 70_000 },
      )
      .toBe('failed')
    expect(disabled.outcome?.code).toBe('email_capability_disabled')
    expect(
      mails(email).some((mail) => decoded(mail.raw).includes('RC04 unconfigured recovery')),
    ).toBe(false)
    writeFileSync('scratch/rc04-worker-mode.txt', 'smtp')
    await expect.poll(workerMode).toBe('smtp')
    await page.goto('/admin/email-composer')
    await page.getByLabel('Delivery ID').fill(disabled.id!)
    await page.getByRole('button', { name: 'Retry delivery' }).click()
    await expect(page.locator('main p[role="status"]')).toContainText('Retry queued')
    const recoveredMail = await delivered(email, 'RC04 unconfigured recovery')
    await expect
      .poll(
        async () => (await api(page, 'GET', `/api/email-deliveries/${disabled.id}?depth=0`)).status,
      )
      .toBe('accepted')
    const oneClickHeader = recoveredMail.raw
      .replace(/\r\n[ \t]+/g, '')
      .match(/List-Unsubscribe:\s*<([^>]+)>/i)![1]
    const oneClick = await publicPage.request.post(oneClickHeader, {
      data: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(oneClick.status()).toBe(200)
    expect((await oneClick.json()).status).toBe('unsubscribed')
    await page.goto('/admin/collections/suppressions')
    await expect(page.getByRole('heading', { name: /Suppressions/ })).toBeVisible()
    await page.screenshot({ path: `${evidence}/operator-suppressions.png`, fullPage: true })
    await publicPage.screenshot({ path: `${evidence}/audience-confirmed.png`, fullPage: true })
    writeFileSync(
      `${evidence}/audience-email.json`,
      JSON.stringify(
        {
          siteId: site.id,
          subscriberId: subscriber.id,
          messageId: message.id,
          failureDeliveryId: failed.id,
          disabledDeliveryId: disabled.id,
          disabledTransportNoFalseSuccess: true,
          operatorRetryAfterConfiguration: true,
          mimeSha256: createHash('sha256').update(newsletter.raw).digest('hex'),
          mime: { multipart: true, utf8: true, oneClick: true, preferences: true },
          suppressionThenConfirmedResubscribe: true,
          localSmtpOnly: true,
          pageErrors: errors,
        },
        null,
        2,
      ),
    )
    writeFileSync(
      `${evidence}/delivered-newsletter-redacted.eml`,
      newsletter.raw.replace(/token(?:=3D|=)[A-Za-z0-9_.-]+/g, 'token=[REDACTED]'),
    )
    expect(errors).toEqual([])
  } finally {
    writeFileSync('scratch/rc04-smtp-mode.txt', 'accept')
    if (visitor) {
      await visitor.tracing.stop({ path: `${evidence}/visitor-trace.zip` })
      await visitor.close()
    }
    await context.tracing.stop({ path: `${evidence}/audience-trace.zip` })
  }
})

test('real members, forum reply notification, preferences, moderation, private messages and session persistence', async ({
  page,
  browser,
  context,
}) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const contexts: BrowserContext[] = []
  try {
    // Second copy can use a separately retained recovery code; the first test saves its authenticated operator state.
    await context.addCookies(JSON.parse(readFileSync('scratch/rc04-operator.json', 'utf8')).cookies)
    const site = (await api(page, 'GET', '/api/sites?depth=0')).docs[0]
    const section = (
      await api(
        page,
        'POST',
        '/api/forum-sections',
        { site: site.id, name: 'RC04 community', slug: `rc04-${Date.now()}` },
        201,
      )
    ).doc
    const forum = (
      await api(
        page,
        'POST',
        '/api/forums',
        {
          site: site.id,
          section: section.id,
          name: 'RC04 members',
          slug: `rc04-members-${Date.now()}`,
        },
        201,
      )
    ).doc
    const pages: Page[] = []
    const profiles: Array<{ memberId: string; profile: { handle: string } }> = []
    const emails = ['alice', 'bob', 'moderator'].map(
      (name) => `rc04-${name}-${Date.now()}@example.test`,
    )
    for (const email of emails) {
      const session = await browser.newContext({
        baseURL: process.env.APP_URL,
        ignoreHTTPSErrors: true,
      })
      contexts.push(session)
      await session.tracing.start({ screenshots: true, snapshots: true, sources: true })
      const memberPage = await session.newPage()
      pages.push(memberPage)
      profiles.push(await member(memberPage, email))
    }
    const [alice, bob, moderator] = pages
    const [a, b, m] = profiles
    const acceptanceList = (await api(page, 'GET', '/api/audience-lists?depth=0')).docs.find(
      (item: { name: string }) => item.name === 'RC04 newsletter',
    )
    await api(
      bob,
      'POST',
      '/api/subscribers/subscribe',
      { email: emails[1], siteId: site.id, listId: acceptanceList.id },
      202,
    )
    const bobConfirmation = await delivered(emails[1], 'Confirm')
    await bob.goto(link(bobConfirmation, '/subscribe/confirm')!)
    await bob.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(bob.getByRole('status')).toContainText(/confirm/i)
    const consentMessage = (
      await api(
        page,
        'POST',
        '/api/email-messages',
        {
          site: site.id,
          name: 'RC04 community consent',
          locale: 'en',
          subject: 'RC04 community consent',
          blocks: [{ type: 'text', text: 'Manage your publication consent.' }],
          kind: 'bulk',
          status: 'draft',
          audience: { lists: [acceptanceList.id] },
        },
        201,
      )
    ).doc
    await api(page, 'PATCH', `/api/email-messages/${consentMessage.id}`, { status: 'review' })
    await api(page, 'PATCH', `/api/email-messages/${consentMessage.id}`, {
      status: 'scheduled',
      scheduledFor: new Date().toISOString(),
    })
    const consentMail = await delivered(emails[1], 'RC04 community consent')
    await bob.goto(link(consentMail, '/unsubscribe')!)
    await bob.getByRole('button', { name: 'Unsubscribe', exact: true }).click()
    await expect(bob.getByRole('status')).toContainText('unsubscribed')
    const bobSubscriber = (
      await api(
        page,
        'GET',
        `/api/subscribers?where[email][equals]=${encodeURIComponent(emails[1])}&depth=0`,
      )
    ).docs[0]
    expect(bobSubscriber.status).toBe('unsubscribed')
    await alice.goto('/members/settings')
    await alice.getByLabel('Display name', { exact: true }).fill('Alice RC04')
    await alice.getByLabel('Bio', { exact: true }).fill('RC04 secret bio')
    await alice.getByLabel('Visibility', { exact: true }).selectOption('private')
    await alice.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(alice.getByText('Profile saved.', { exact: true })).toBeVisible()
    await api(
      alice,
      'PATCH',
      '/api/member-auth/profile',
      { relationshipNotifications: { messages: false } },
      410,
    )
    await api(bob, 'GET', `/api/community/profiles/${a.profile.handle}`, undefined, 404)
    const thread = await api(
      bob,
      'POST',
      '/api/community/threads',
      {
        siteId: site.id,
        forumId: forum.id,
        title: `RC04 thread ${Date.now()}`,
        body: 'Bob starts a real discussion.',
      },
      201,
    )
    await api(alice, 'POST', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: b.memberId,
      kind: 'follow',
    })
    const reply = await api(
      alice,
      'POST',
      '/api/community/posts',
      {
        siteId: site.id,
        discussionId: thread.discussion.id,
        body: 'Alice replies across surfaces.',
      },
      201,
    )
    const notifications = await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`)
    expect(notifications.notifications.length).toBeGreaterThan(0)
    expect(mails(emails[1])).toHaveLength(3) // Sign-in, confirmation and consent newsletter only.
    await bob.goto('/notifications')
    await expect(bob.getByRole('heading', { name: /Notifications/ })).toBeVisible()
    await bob.screenshot({ path: `${evidence}/member-notifications.png`, fullPage: true })
    const firstNotification = notifications.notifications[0]
    await api(bob, 'PATCH', '/api/community/notifications', {
      siteId: site.id,
      notificationId: firstNotification.id,
    })
    expect(
      (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`)).notifications.find(
        (item: { id: string }) => item.id === firstNotification.id,
      ).read,
    ).toBe(true)
    await api(bob, 'PATCH', '/api/community/notification-preferences', {
      siteId: site.id,
      channel: 'in_app',
      frequency: 'off',
    })
    const count = (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`))
      .notifications.length
    const outboundCount = mails(emails[1]).length
    await api(
      alice,
      'POST',
      '/api/community/posts',
      {
        siteId: site.id,
        discussionId: thread.discussion.id,
        body: 'No notification when Bob opts out.',
      },
      201,
    )
    expect(
      (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`)).notifications,
    ).toHaveLength(count)
    expect(mails(emails[1])).toHaveLength(outboundCount)
    await api(
      bob,
      'PATCH',
      '/api/community/notification-preferences',
      { siteId: site.id, channel: 'email', frequency: 'immediate' },
      410,
    )
    // Canonical role grant through the supported authenticated operator collection.
    await api(
      page,
      'POST',
      '/api/member-site-roles',
      { site: site.id, member: m.memberId, role: 'moderator' },
      201,
    )
    const report = await api(
      bob,
      'POST',
      '/api/community/reports',
      { siteId: site.id, targetType: 'post', targetId: reply.post.id, reason: 'spam' },
      201,
    )
    await api(
      alice,
      'POST',
      '/api/community/moderation',
      {
        siteId: site.id,
        caseId: report.caseId,
        targetType: 'post',
        targetId: reply.post.id,
        action: 'hide',
        reason: 'unauthorized',
      },
      403,
    )
    const queue = await api(moderator, 'GET', `/api/community/reports?siteId=${site.id}`)
    expect(queue.cases.some((item: { id: string }) => item.id === report.caseId)).toBe(true)
    await moderator
      .context()
      .addCookies(JSON.parse(readFileSync('scratch/rc04-operator.json', 'utf8')).cookies)
    await moderator.goto('/admin/moderation')
    await expect(
      moderator.getByRole('heading', { name: 'Incoming Community Reports' }),
    ).toBeVisible()
    await moderator
      .getByRole('article')
      .filter({ hasText: reply.post.id.slice(0, 16) })
      .click()
    await moderator.getByRole('combobox', { name: /Moderation Action/ }).selectOption('remove')
    await moderator
      .getByLabel('Audit Reason (required)', { exact: true })
      .fill('Acceptance evidence')
    await moderator.getByRole('button', { name: 'Execute Decision', exact: true }).click()
    await expect(
      moderator.getByRole('status').filter({ hasText: 'successfully applied' }),
    ).toBeVisible()
    await moderator.screenshot({ path: `${evidence}/moderation-action.png`, fullPage: true })
    const audit = await api(moderator, 'GET', `/api/community/moderation?siteId=${site.id}`)
    expect(audit.auditLog.length).toBeGreaterThan(0)
    expect(audit.auditValid).toBe(true)
    expect(
      (
        await api(
          bob,
          'GET',
          `/api/community/posts?siteId=${site.id}&discussionId=${thread.discussion.id}`,
        )
      ).posts.some((post: { id: string }) => post.id === reply.post.id),
    ).toBe(false)
    await bob.goto(thread.discussion.canonicalPath)
    await expect(
      bob.getByRole('heading', { name: thread.discussion.title, exact: true }),
    ).toBeVisible()
    await expect(bob.getByText('Bob starts a real discussion.', { exact: true })).toBeVisible()
    expect(await bob.locator('body').innerText()).not.toContain('Alice replies across surfaces.')
    await api(page, 'PATCH', `/api/discussions/${thread.discussion.id}`, { visibility: 'private' })
    await api(
      alice,
      'GET',
      `/api/community/threads?siteId=${site.id}&threadId=${thread.discussion.id}`,
      undefined,
      404,
    )
    await api(
      alice,
      'GET',
      `/api/community/posts?siteId=${site.id}&discussionId=${thread.discussion.id}`,
      undefined,
      403,
    )
    const privateView = await alice.goto(thread.discussion.canonicalPath)
    expect(privateView?.status()).toBe(404)
    expect(await alice.locator('body').innerText()).not.toContain('Bob starts a real discussion.')
    await api(page, 'PATCH', `/api/discussions/${thread.discussion.id}`, {
      visibility: 'public',
      commentsPolicy: 'closed',
    })
    await api(
      alice,
      'POST',
      '/api/community/posts',
      {
        siteId: site.id,
        discussionId: thread.discussion.id,
        body: 'Closed comments deny replies.',
      },
      403,
    )
    await api(page, 'PATCH', `/api/discussions/${thread.discussion.id}`, { commentsPolicy: 'open' })
    const threadReport = await api(
      bob,
      'POST',
      '/api/community/reports',
      { siteId: site.id, targetType: 'discussion', targetId: thread.discussion.id, reason: 'spam' },
      201,
    )
    await api(moderator, 'POST', '/api/community/moderation', {
      siteId: site.id,
      caseId: threadReport.caseId,
      targetType: 'discussion',
      targetId: thread.discussion.id,
      action: 'lock_thread',
      scope: 'object',
      scopeId: thread.discussion.id,
      reason: 'Acceptance lock',
    })
    await api(
      alice,
      'POST',
      '/api/community/posts',
      {
        siteId: site.id,
        discussionId: thread.discussion.id,
        body: 'Cannot reply to locked thread.',
      },
      403,
    )
    const conversation = (
      await api(
        alice,
        'POST',
        '/api/community/conversations',
        { siteId: site.id, targetMemberId: b.memberId },
        201,
      )
    ).conversation
    const message = await api(
      alice,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: conversation.id,
        body: 'Private RC04 message',
        idempotencyKey: `rc04-${Date.now()}`,
      },
      201,
    )
    expect(
      (
        await api(
          bob,
          'GET',
          `/api/community/messages?siteId=${site.id}&conversationId=${conversation.id}`,
        )
      ).messages.some((item: { id: string }) => item.id === message.message.id),
    ).toBe(true)
    await api(
      moderator,
      'GET',
      `/api/community/messages?siteId=${site.id}&conversationId=${conversation.id}`,
      undefined,
      403,
    )
    await api(
      alice,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: conversation.id,
        body: 'Guessed attachment',
        idempotencyKey: `guess-${Date.now()}`,
        attachmentIds: ['00000000-0000-0000-0000-000000000001'],
      },
      403,
    )
    await api(
      alice,
      'POST',
      '/api/v1/attachments/presign',
      { siteId: site.id, filename: 'private.pdf', mimeType: 'application/pdf', size: 64 },
      410,
    )
    const group = (
      await api(
        alice,
        'POST',
        '/api/community/conversations',
        {
          siteId: site.id,
          kind: 'group',
          memberIds: [b.memberId, m.memberId],
          title: 'RC04 group',
        },
        201,
      )
    ).conversation
    await api(
      alice,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: group.id,
        body: 'Group RC04 message',
        idempotencyKey: `group-${Date.now()}`,
      },
      201,
    )
    expect(
      (
        await api(
          moderator,
          'GET',
          `/api/community/messages?siteId=${site.id}&conversationId=${group.id}`,
        )
      ).messages.some((item: { body_html: string }) =>
        item.body_html.includes('Group RC04 message'),
      ),
    ).toBe(true)
    await bob.goto('/messages')
    await expect(bob.getByRole('heading', { name: 'Messages', exact: true })).toBeVisible()
    await expect(bob.getByText('RC04 group', { exact: true })).toBeVisible()
    await bob.screenshot({ path: `${evidence}/member-messages.png`, fullPage: true })
    await api(bob, 'PATCH', '/api/community/notification-preferences', {
      siteId: site.id,
      channel: 'in_app',
      frequency: 'immediate',
    })
    await api(bob, 'POST', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: a.memberId,
      kind: 'mute',
    })
    const mutedCount = (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`))
      .notifications.length
    await api(
      alice,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: conversation.id,
        body: 'Muted message retained privately',
        idempotencyKey: `mute-${Date.now()}`,
      },
      201,
    )
    expect(
      (await api(bob, 'GET', `/api/community/notifications?siteId=${site.id}`)).notifications
        .length,
    ).toBe(mutedCount)
    await api(alice, 'POST', '/api/member-auth/delete', {}, 410)
    await api(moderator, 'POST', '/api/community/moderation', {
      siteId: site.id,
      caseId: report.caseId,
      targetType: 'post',
      targetId: reply.post.id,
      action: 'suspend_posting',
      scope: 'site_global',
      reason: 'Acceptance suspended posting',
    })
    const suspended = await api(
      alice,
      'POST',
      '/api/community/threads',
      {
        siteId: site.id,
        forumId: forum.id,
        title: 'Suspension blocks new threads',
        body: 'This must not be created.',
      },
      403,
    )
    expect(suspended.code).toBe('MEMBER_POSTING_SUSPENDED')
    expect(
      (await api(moderator, 'GET', `/api/community/moderation?siteId=${site.id}`)).auditValid,
    ).toBe(true)
    const exported = await api(alice, 'GET', `/api/member-auth/export?memberId=${b.memberId}`)
    expect(JSON.stringify(exported)).not.toContain(emails[1])
    await api(bob, 'POST', '/api/community/relationships', {
      siteId: site.id,
      targetMemberId: a.memberId,
      kind: 'block',
    })
    await api(
      alice,
      'POST',
      '/api/community/messages',
      {
        siteId: site.id,
        conversationId: conversation.id,
        body: 'Blocked message',
        idempotencyKey: `block-${Date.now()}`,
      },
      403,
    )
    await api(alice, 'POST', '/api/member-auth/logout')
    await api(alice, 'GET', '/api/member-auth/me', undefined, 401)
    const fresh = await browser.newContext({
      baseURL: process.env.APP_URL,
      ignoreHTTPSErrors: true,
    })
    contexts.push(fresh)
    await fresh.tracing.start({ screenshots: true, snapshots: true, sources: true })
    const freshPage = await fresh.newPage()
    const persistent = await member(freshPage, emails[0])
    expect(persistent.memberId).toBe(a.memberId)
    expect(persistent.profile.displayName).toBe('Alice RC04')
    await freshPage.goto('/members/settings')
    await expect(freshPage.getByLabel('Visibility', { exact: true })).toHaveValue('private')
    writeFileSync(
      `${evidence}/community-privacy.json`,
      JSON.stringify(
        {
          siteId: site.id,
          memberIds: profiles.map((profile) => profile.memberId),
          threadId: thread.discussion.id,
          replyId: reply.post.id,
          reportId: report.reportId,
          conversationId: conversation.id,
          inAppOffPreventsNewNotification: true,
          externalCommunityDeliveryDeferred: true,
          noMailAfterReply: true,
          suppressedSubscriberRetainsPermittedInApp: true,
          suppressedMemberId: b.memberId,
          moderatorPrivateMessageDenial: true,
          blockDenial: true,
          mutePreventsNotification: true,
          groupMessage: true,
          notificationRead: true,
          lockedReplyDenial: true,
          closedReplyDenial: true,
          privateThreadApiAndSSRDenial: true,
          moderationThroughUI: true,
          renderedForumAndRemovedPostExclusion: true,
          suspendedPostingDenial: true,
          permanentDeletionDeferred: true,
          freshSessionPersistence: true,
          auditValid: audit.auditValid,
        },
        null,
        2,
      ),
    )
  } finally {
    for (const [index, session] of contexts.entries()) {
      await session.tracing.stop({ path: `${evidence}/member-${index}-trace.zip` })
      await session.close()
    }
    await context.tracing.stop({ path: `${evidence}/community-trace.zip` })
  }
})

test('public malformed input, abuse limits and deferred form boundary', async ({
  page,
  context,
}) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  try {
    // The preceding real journey runs longer than the implemented one-minute window.
    const statuses: number[] = []
    for (const email of [
      null,
      [],
      {},
      'invalid',
      'still-invalid',
      42,
      false,
      '',
      'invalid',
      'invalid',
    ]) {
      const response = await page.request.post('/api/subscribers/subscribe', { data: { email } })
      statuses.push(response.status())
      expect([400, 429]).toContain(response.status())
    }
    expect(statuses).toContain(400)
    expect(statuses).toContain(429)
    await api(page, 'GET', '/api/forms/deferred-example', undefined, 410)
    await api(page, 'POST', '/api/forms/deferred-example', {}, 410)
    await api(page, 'POST', '/api/admin/audience/retry', { deliveryId: 'guessed' }, 403)
    writeFileSync(
      `${evidence}/public-abuse.json`,
      JSON.stringify(
        {
          statuses,
          processLocalLimit: true,
          deferredFormGET: 410,
          deferredFormPOST: 410,
          anonymousRetryDenied: 403,
        },
        null,
        2,
      ),
    )
  } finally {
    await context.tracing.stop({ path: `${evidence}/public-abuse-trace.zip` })
  }
})
