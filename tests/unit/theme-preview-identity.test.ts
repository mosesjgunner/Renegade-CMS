import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  token: 'preview-token',
}))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('next/headers.js', () => ({
  cookies: async () => ({ get: () => ({ value: state.token }) }),
  headers: async () => new Headers(),
}))
vi.mock('../../src/modules/core/config', () => ({
  loadConfig: () => ({ payloadSecret: 'test-secret' }),
}))
vi.mock('../../src/modules/operations/passkey-auth', () => ({
  requireAdminUser: async () => {
    if (!state.user) throw new Error('Invalid session')
    return state.user
  },
}))
vi.mock('../../src/modules/presentation/lifecycle', () => ({
  themePool: () => ({}),
  resolveConfiguration: vi.fn(async (_pool, _site, preview) => preview ?? null),
}))
import { requestTheme } from '../../src/modules/presentation/request-theme'
const fullAuth = vi.fn(() => {
  throw new Error('Permission calculation reentered theme resolution')
})
const payload = {
  find: async () => ({ docs: [{ site: 'site-a' }] }),
  auth: fullAuth,
} as unknown as Payload
beforeEach(() => {
  state.user = null
  fullAuth.mockClear()
})
describe('theme preview identity verification', () => {
  it('verifies an owner session without recursive collection permission calculation', async () => {
    state.user = { id: 'owner-a', role: 'owner' }
    expect(await requestTheme(payload)).toEqual({ actor: 'owner-a', token: 'preview-token' })
    expect(fullAuth).not.toHaveBeenCalled()
  })
  it('keeps the active theme for an invalid session', async () => {
    expect(await requestTheme(payload)).toBeNull()
  })
  it('keeps the active theme for an administrator session', async () => {
    state.user = { id: 'admin-a', role: 'administrator' }
    expect(await requestTheme(payload)).toBeNull()
  })
})
