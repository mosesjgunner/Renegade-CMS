import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'
import { finalizeMemberDeletion, issueMagicLink } from '@/modules/identity/member-identity'

test('COMM-02 member can edit field visibility in the browser without exposing raw profile APIs', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  let memberId = ''
  try {
    const issued = await issueMagicLink(payload as never, `comm02-${randomUUID()}@example.test`)
    expect(issued.token).toBeTruthy()
    await page.goto(`/member-auth/verify?token=${encodeURIComponent(issued.token!)}`)
    await expect(page.getByRole('status')).toHaveText('Signed in.')
    await page.getByRole('link', { name: 'Member settings' }).click()
    await expect(page.getByRole('heading', { name: 'Member settings' })).toBeVisible()
    const me = await page.request.get('/api/member-auth/me')
    expect(me.ok()).toBe(true)
    memberId = (await me.json()).memberId
    await page
      .getByRole('textbox', { name: 'Bio', exact: true })
      .fill('Browser-owned profile story')
    await page.getByLabel('Visibility', { exact: true }).selectOption('public')
    await page.getByLabel('Bio audience').selectOption('private')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByRole('status')).toHaveText('Profile saved.')
    await expect(page.getByRole('region', { name: 'Profile preview' })).toContainText(
      'Browser-owned profile story',
    )
    await expect(page.getByLabel('Avatar crop horizontal focus')).toBeVisible()
    await expect(page.getByLabel('Avatar crop vertical focus')).toBeVisible()
    await page.getByLabel('Upload avatar').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      // Valid 1x1 PNG; browser upload exercises the member endpoint rather
      // than creating a profile record through direct HTTP mutation.
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    // The file selection above is the visible user action. The authenticated
    // self view below waits for its persisted result without coupling the
    // acceptance contract to a transient status-region render.
    await expect
      .poll(async () => ((await page.request.get('/api/member-auth/me')).json()).then(({ profile }) => profile.avatar))
      .toBeTruthy()
    const afterUpload = await page.request.get('/api/member-auth/me')
    const uploadedProfile = (await afterUpload.json()).profile
    expect(uploadedProfile.avatar).toBeTruthy()
    // A selected-but-unapproved asset is neither exposed through the public
    // profile projection nor fetchable through the public media route.
    const publicProjection = await page.request.get(
      `/api/community/profiles/${uploadedProfile.handle}`,
    )
    expect((await publicProjection.json()).profile).not.toHaveProperty('avatarUrl')
    expect((await page.request.get(`/media/${uploadedProfile.avatar}`)).status()).toBe(404)
    const updated = await page.request.get('/api/member-auth/me')
    expect((await updated.json()).profile).toMatchObject({
      bio: 'Browser-owned profile story',
      visibility: 'public',
      fieldAudience: { bio: 'private' },
    })
    expect((await request.get('/api/profiles?limit=1')).status()).toBe(403)
  } finally {
    if (memberId) await finalizeMemberDeletion(payload as never, memberId)
    await payload.db.destroy?.()
  }
})
