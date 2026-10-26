import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { telecomDeliveryTask, selectTelecomAdapter } from '../../src/modules/telecom/tasks'
import {
  getTelecomEmulatorReceipts,
  resetTelecomEmulator,
} from '../../src/modules/telecom/emulator'

const handler = telecomDeliveryTask.handler as unknown as (args: unknown) => Promise<unknown>
beforeEach(() => {
  vi.stubEnv('TELECOM_MODE', 'emulator')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T02:00:00Z'))
  resetTelecomEmulator()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})
function fixture(enabled = true) {
  const row = {
    id: 'telecom-one',
    status: 'queued',
    attempts: 0,
    site: 'site-one',
    message: { purpose: 'marketing' },
    subscriber: { id: 'sub-one', member: 'member-one' },
    recipientPhone: '+14155550199',
    recipientPhoneHash: 'controlled',
    idempotencyKey: '09c-telecom',
    messageSnapshot: {
      purpose: 'marketing',
      body: 'Controlled body',
      notificationKind: 'message.created',
    },
  }
  const payload = {
    findByID: vi.fn(async () => structuredClone(row)),
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === 'consent-events'
          ? [{ purpose: 'marketing', event: 'preference-granted' }]
          : collection === 'profiles'
            ? [
                {
                  timeZone: 'UTC',
                  preferences: { relationshipNotifications: { messages: enabled } },
                },
              ]
            : [],
    })),
    update: vi.fn(async ({ data }: { data: object }) => Object.assign(row, data)),
    jobs: { queue: vi.fn(async () => ({})) },
  }
  return { row, payload }
}
describe('09C telecom event preferences and quiet-hour continuation', () => {
  it('keeps the transport disabled unless explicitly configured', () => {
    vi.stubEnv('TELECOM_MODE', '')
    expect(selectTelecomAdapter().id).toBe('disabled-telecom')
  })
  it('persists a delayed job and sends exactly once when the real clock reaches the next window', async () => {
    const { row, payload } = fixture()
    await handler({ input: { deliveryId: row.id }, req: { payload } })
    expect(row).toMatchObject({
      status: 'queued',
      attempts: 0,
      quietHoursDelayedUntil: '2026-10-21T08:00:00.000Z',
    })
    expect(payload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({ waitUntil: new Date('2026-10-21T08:00:00Z') }),
    )
    await handler({ input: { deliveryId: row.id }, req: { payload } })
    expect(payload.jobs.queue).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-10-21T08:00:01Z'))
    await handler({ input: { deliveryId: row.id }, req: { payload } })
    await handler({ input: { deliveryId: row.id }, req: { payload } })
    expect(row).toMatchObject({ status: 'accepted', attempts: 1, provider: 'telecom-emulator' })
    expect(getTelecomEmulatorReceipts()).toHaveLength(1)
  })
  it('rechecks a disabled event preference before dispatch and emits no receipt', async () => {
    const { row, payload } = fixture(false)
    await handler({ input: { deliveryId: row.id }, req: { payload } })
    expect(row).toMatchObject({
      status: 'cancelled',
      attempts: 0,
      outcome: { code: 'event-preference-disabled' },
    })
    expect(getTelecomEmulatorReceipts()).toHaveLength(0)
  })
})
