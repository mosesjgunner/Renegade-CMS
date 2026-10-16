import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  send: vi.fn(),
  reconcile: vi.fn(),
  adapterId: 'smtp',
}))
vi.mock('../../src/modules/core/config', () => ({ loadConfig: () => ({}) }))
vi.mock('../../src/modules/email/delivery', () => ({
  selectEmailDeliveryAdapter: () => ({
    id: state.adapterId,
    send: state.send,
    reconcile: state.reconcile,
  }),
}))
vi.mock('../../src/modules/community/external-notifications', () => ({ communityEmailTask: {} }))
vi.mock('../../src/modules/audience/form-tasks', () => ({ formIntakeTask: {} }))
import { emailDeliveryTask } from '../../src/modules/audience/tasks'

describe('interrupted audience transport acceptance', () => {
  beforeEach(() => {
    state.send.mockReset()
    state.reconcile.mockReset().mockResolvedValue(undefined)
    state.adapterId = 'smtp'
  })
  async function recover(status: string, provider: string | null = 'smtp') {
    const delivery = {
      id: 'delivery-1',
      status,
      provider,
      attempts: 1,
      idempotencyKey: 'stable-send-key',
      message: { kind: 'transactional' },
    }
    const payload = {
      findByID: vi.fn().mockResolvedValue(delivery),
      update: vi.fn().mockResolvedValue({}),
    }
    const handler = emailDeliveryTask.handler as unknown as (args: unknown) => Promise<unknown>
    await handler({ input: { deliveryId: delivery.id }, req: { payload } })
    return payload
  }
  it('quarantines a persisted sending state and never resends an uncertain SMTP acceptance', async () => {
    const payload = await recover('sending')
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'unknown',
          outcome: expect.objectContaining({ retryable: false, code: 'interrupted_send' }),
        }),
      }),
    )
    expect(state.reconcile).toHaveBeenCalledWith({
      idempotencyKey: 'stable-send-key',
      providerMessageId: undefined,
    })
    expect(state.send).not.toHaveBeenCalled()
    expect(payload.update).toHaveBeenCalledTimes(1)
  })
  it('accepts only confirmed reconciliation from the original provider without another send', async () => {
    state.reconcile.mockResolvedValue({
      ok: true,
      provider: 'smtp',
      providerMessageId: 'confirmed-1',
    })
    const payload = await recover('sending')
    expect(payload.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'accepted',
          provider: 'smtp',
          providerMessageId: 'confirmed-1',
        }),
      }),
    )
    expect(state.send).not.toHaveBeenCalled()
  })
  it.each(['sending', 'unknown'])(
    'does not reconcile %s through a different provider',
    async (status) => {
      state.adapterId = 'different-provider'
      await recover(status)
      expect(state.reconcile).not.toHaveBeenCalled()
      expect(state.send).not.toHaveBeenCalled()
    },
  )
  it('holds legacy interrupted deliveries whose original provider is unknown', async () => {
    const payload = await recover('sending', null)
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(state.send).not.toHaveBeenCalled()
  })
})
