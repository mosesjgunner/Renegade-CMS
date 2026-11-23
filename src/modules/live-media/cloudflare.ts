import { createPrivateKey } from 'node:crypto'
import { SignJWT } from 'jose'
import { LiveMediaError, providerFetch, type LiveMediaProvider, type LiveSession } from './provider'

type Input = {
  enabled?: boolean
  recording?: { requireSignedURLs?: boolean; mode?: string }
  status?: string | { current?: { state?: string } } | null
  webRTC?: { url?: string }
  playback?: { hls?: string }
}
type Recording = {
  uid?: string
  created?: string
  readyToStream?: boolean
  status?: { state?: string }
  requireSignedURLs?: boolean
}

export function cloudflareStream(config: {
  account: string
  apiToken: string
  keyId: string
  privateKey: string
  customerHost: string
}): LiveMediaProvider {
  const account = `https://api.cloudflare.com/client/v4/accounts/${config.account}/stream`
  const failed = () =>
    new LiveMediaError('Cloudflare Stream could not apply the requested operation.')

  async function api<T>(path: string, method = 'GET', data?: object): Promise<T> {
    const response = await providerFetch(account + path, {
      method,
      headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
    if (!response.ok) throw failed()
    const body = (await response.json()) as { success?: boolean; result?: T }
    if (body.success !== true || body.result === undefined) throw failed()
    return body.result
  }
  const inputPath = (session: LiveSession) => `/live_inputs/${session.providerRef}`
  const input = (session: LiveSession) => api<Input>(inputPath(session))
  const signed = async (id: string) => {
    let key
    try {
      key = createPrivateKey(config.privateKey)
    } catch {
      throw failed()
    }
    const expires = Math.floor(Date.now() / 120_000) * 120 + 240
    const token = await new SignJWT({ kid: config.keyId })
      .setProtectedHeader({ alg: 'RS256', kid: config.keyId })
      .setSubject(id)
      .setExpirationTime(expires)
      .sign(key)
    return `https://${config.customerHost}/${token}/manifest/video.m3u8`
  }
  const status = async (session: LiveSession) => {
    const current = await input(session)
    const state =
      typeof current.status === 'string' ? current.status : current.status?.current?.state
    return {
      configured: current.enabled === true,
      connected: state === 'connected' || state === 'reconnected',
    }
  }
  const end = async (session: LiveSession) => {
    await api<Input>(inputPath(session), 'PUT', { enabled: false })
  }
  return {
    id: 'cloudflare',
    capabilities: {
      ingest: ['whip'],
      playback: ['hls'],
      protectedAudience: false,
      perRequestAuthorization: false,
      tokenTtlSeconds: 240,
      immediateRevocation: false,
      recording: true,
      resources: 'Cloudflare Stream account, dedicated live input, API credential, signing key',
      cost: 'Cloudflare Stream bills by stored and delivered minutes.',
    },
    async provision(session) {
      const current = await input(session)
      if (current.recording?.requireSignedURLs !== true || current.recording.mode !== 'automatic')
        throw new LiveMediaError(
          'The managed input must require signed URLs and use automatic recording.',
        )
    },
    async connect(session) {
      const value = (await input(session)).webRTC?.url
      if (!value) throw failed()
      const url = new URL(value)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== config.customerHost ||
        url.username ||
        url.password
      )
        throw failed()
      return { whipUrl: url.href, iceServers: [] }
    },
    async start(session) {
      if (!(await input(session)).enabled)
        await api<Input>(inputPath(session), 'PUT', { enabled: true })
    },
    heartbeat: status,
    reconcile: status,
    async getPlayback(session) {
      if (!session.endedAt)
        return {
          live: session.state === 'live' ? await signed(session.providerRef) : null,
          replays: [],
        }
      const recordings = await api<Recording[]>(`${inputPath(session)}/videos`)
      const ready = recordings.filter(
        (item) =>
          item.readyToStream === true &&
          item.requireSignedURLs === true &&
          item.status?.state === 'ready' &&
          Date.parse(item.created ?? '') >= session.startedAt.getTime() - 1000 &&
          /^[a-f0-9]{32}$/.test(item.uid ?? ''),
      )
      return {
        live: null,
        replays: await Promise.all(
          ready.map(async (item) => ({
            href: await signed(item.uid!),
            contentType: 'hls' as const,
          })),
        ),
      }
    },
    end,
    revoke: end,
    async record(_session, enabled) {
      if (!enabled) throw new LiveMediaError('Managed HLS inputs use automatic recording.', 409)
    },
    async health() {
      await api<Input[]>('/live_inputs?per_page=1')
      return { ready: true }
    },
  }
}
