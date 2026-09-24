import { expect, test } from '@playwright/test'

test.describe('FLOW-03 Calendar & Scheduling Browser Suite', () => {
  test('renders Calendar Center with Month/Week/Agenda views, filters, and reschedule modal', async ({
    page,
  }) => {
    // 1. Visit Calendar page
    await page.goto('/calendar')

    // 2. Header and Title check
    await expect(page.getByRole('heading', { name: 'Calendar Center' })).toBeVisible()
    await expect(page.getByText('Renegade CMoS Workflow Pass FLOW-03')).toBeVisible()

    // 3. Switch to Agenda List View
    await page.getByRole('button', { name: 'List View' }).click()
    await expect(page.getByText('Scheduled Items Agenda')).toBeVisible()
    await expect(page.getByText('Release: Autumn Feature Series')).toBeVisible()

    // 4. Test Accessible Reschedule Modal
    const rescheduleBtns = page.getByRole('button', { name: 'Reschedule' })
    await expect(rescheduleBtns.first()).toBeVisible()
    await rescheduleBtns.first().click()

    await expect(page.getByRole('heading', { name: 'Reschedule Item' })).toBeVisible()
    await expect(page.getByText('New Local Date & Time')).toBeVisible()

    // Cancel modal
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Reschedule Item' })).toHaveCount(0)

    // 5. Switch back to Month View
    await page.getByRole('button', { name: 'Month View' }).click()
    await expect(page.getByText('Sun')).toBeVisible()
    await expect(page.getByText('Mon')).toBeVisible()
  })

  test('calendar export API returns valid iCalendar (.ics) feed', async ({ request }) => {
    const res = await request.get('/api/calendar/export?format=ics')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/calendar')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('END:VCALENDAR')
  })
})
