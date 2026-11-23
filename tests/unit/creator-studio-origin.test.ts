import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/modules/core/site-settings', () => ({
  resolveSiteSettings: async () => ({
    canonicalOrigin: 'https://creator.example.test',
    canonicalOriginsBySite: { 'studio-site': 'https://creator.example.test' },
  }),
}))
vi.mock('../../src/modules/identity/member-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/modules/identity/member-identity')>()),
  currentMember: vi.fn(async () => 'verified-member'),
}))

import { submissionActor } from '../../src/modules/creator-studio/submission-http'
import { currentMember } from '../../src/modules/identity/member-identity'

const payload = {} as Payload
const origin = 'https://creator.example.test'
const write = (requestOrigin?: string) =>
  new Request(origin + '/api/creator/capture-sessions', {
    method: 'POST',
    headers: {
      host: 'creator.example.test',
      cookie: 'renegade-member-csrf=test-token',
      'x-member-csrf': 'test-token',
      ...(requestOrigin === undefined ? {} : { origin: requestOrigin }),
    },
  })

describe('Creator Studio write requests', () => {
  it('rejects absent and foreign origins before resolving the member session', async () => {
    for (const value of [undefined, 'null', 'https://other.example.test', origin + ':444']) {
      await expect(submissionActor(payload, write(value))).rejects.toMatchObject({ status: 403 })
    }
    expect(currentMember).not.toHaveBeenCalled()
  })

  it('accepts the configured origin and matching CSRF token', async () => {
    await expect(submissionActor(payload, write(origin))).resolves.toEqual({
      siteId: 'studio-site',
      memberId: 'verified-member',
    })
  })
})
