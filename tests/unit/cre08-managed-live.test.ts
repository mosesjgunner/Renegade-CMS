import { generateKeyPairSync } from 'node:crypto'
import { decodeJwt } from 'jose'
import { afterEach, expect, it, vi } from 'vitest'
import { cloudflareStream } from '../../src/modules/live-media/cloudflare'
import type { LiveSession } from '../../src/modules/live-media/provider'

const input = 'a'.repeat(32)
const customerHost = 'customer-test.cloudflarestream.com'
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' })
  .toString()
const session: LiveSession = {
  id: 'session',
  roomId: 'room',
  provider: 'cloudflare',
  providerRef: input,
  state: 'live',
  recording: true,
  startedAt: new Date('2026-11-22T17:00:00Z'),
  wentLiveAt: new Date('2026-11-22T17:00:15Z'),
  endedAt: null,
}
const provider = cloudflareStream({
  account: 'b'.repeat(32),
  apiToken: 'fixture-api-token',
  keyId: 'fixture-key',
  privateKey,
  customerHost,
})
const envelope = (result: unknown) => Response.json({ success: true, result })

afterEach(() => vi.unstubAllGlobals())

it('reads documented live states, uses a signed live-input link and disables the managed input on end', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      envelope({
        enabled: true,
        status: 'reconnected',
        recording: { mode: 'automatic', requireSignedURLs: true },
        webRTC: { url: `https://${customerHost}/fixture-publish-key/webRTC/publish` },
      }),
    )
    .mockResolvedValueOnce(envelope({ enabled: true, status: 'reconnected' }))
    .mockResolvedValueOnce(envelope({ enabled: false }))
  vi.stubGlobal('fetch', fetch)
  await provider.provision(session)
  expect(await provider.heartbeat(session)).toEqual({ connected: true, configured: true })
  const playback = await provider.getPlayback(session)
  const url = new URL(playback.live!)
  const signature = decodeJwt(url.pathname.split('/')[1])
  expect(url.hostname).toBe(customerHost)
  expect(signature.sub).toBe(input)
  expect(signature.exp! - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(240)
  expect(provider.capabilities).toMatchObject({
    protectedAudience: false,
    immediateRevocation: false,
  })
  await provider.end(session)
  expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', body: '{"enabled":false}' })
})

it('refuses unsigned managed inputs and excludes old or unsigned replays', async () => {
  const recordings = [
    {
      uid: '1'.repeat(32),
      created: '2026-11-22T16:00:00Z',
      readyToStream: true,
      requireSignedURLs: true,
    },
    {
      uid: '2'.repeat(32),
      created: '2026-11-22T17:00:00Z',
      readyToStream: true,
      requireSignedURLs: false,
    },
    {
      uid: '3'.repeat(32),
      created: '2026-11-22T17:00:00Z',
      readyToStream: true,
      requireSignedURLs: true,
    },
  ].map((item) => ({ ...item, status: { state: 'ready' } }))
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        envelope({ recording: { mode: 'automatic', requireSignedURLs: false } }),
      )
      .mockResolvedValueOnce(envelope(recordings)),
  )
  await expect(provider.provision(session)).rejects.toThrow('require signed URLs')
  const ended = { ...session, state: 'ended' as const, endedAt: new Date('2026-11-22T18:00:00Z') }
  const playback = await provider.getPlayback(ended)
  expect(playback.replays).toHaveLength(1)
  expect(decodeJwt(new URL(playback.replays[0].href).pathname.split('/')[1]).sub).toBe(
    '3'.repeat(32),
  )
})
