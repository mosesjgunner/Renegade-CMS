import { LiveMediaError, providerFetch, type LiveMediaProvider, type LiveSession } from './provider'

const mediaPath = (session: LiveSession) => `/live-media/${session.id}`

export function mediaMtx(
  control: string,
  recordings: string,
  iceServers: RTCIceServer[],
): LiveMediaProvider {
  async function api(path: string, method = 'GET', body?: object) {
    return providerFetch(new URL(path, control), {
      method,
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    })
  }
  const failed = () => new LiveMediaError('MediaMTX could not apply the requested operation.')

  const provision = async (session: LiveSession) => {
    const config = await api(`/v3/config/paths/get/${session.providerRef}`)
    if (config.ok) return
    if (config.status !== 404) throw failed()
    const added = await api(`/v3/config/paths/add/${session.providerRef}`, 'POST', {
      source: 'publisher',
      record: session.recording,
    })
    if (!added.ok) throw failed()
  }
  const status = async (session: LiveSession) => {
    const result = await api(`/v3/paths/get/${session.providerRef}`)
    if (result.status === 404) {
      const config = await api(`/v3/config/paths/get/${session.providerRef}`)
      if (config.ok || config.status === 404) return { configured: config.ok, connected: false }
      throw failed()
    }
    if (!result.ok) throw failed()
    const path = (await result.json()) as {
      ready?: boolean
      bytesReceived?: number
      bytesSent?: number
    }
    return {
      configured: true,
      connected: path.ready === true,
      bytesIn: path.bytesReceived,
      bytesOut: path.bytesSent,
    }
  }
  const end = async (session: LiveSession) => {
    const active = await api(`/v3/paths/get/${session.providerRef}`)
    if (!active.ok && active.status !== 404) throw failed()
    const source: { type?: string; id?: string } | null = active.ok
      ? (await active.json()).source
      : null
    if (source?.type === 'webRTCSession' && /^[0-9a-f-]{36}$/.test(source.id ?? '')) {
      const kicked = await api(`/v3/webrtcsessions/kick/${source.id}`, 'POST')
      if (!kicked.ok && kicked.status !== 404) throw failed()
    }
    const result = await api(`/v3/config/paths/delete/${session.providerRef}`, 'DELETE')
    if (!result.ok && result.status !== 404) throw failed()
  }
  return {
    id: 'mediamtx',
    capabilities: {
      ingest: ['whip'],
      playback: ['hls'],
      protectedAudience: true,
      perRequestAuthorization: true,
      tokenTtlSeconds: 90,
      immediateRevocation: true,
      recording: true,
      resources: 'MediaMTX and HTTP gateway, UDP ingress, viewer egress, optional recording volume',
      cost: 'Self-hosted compute, network egress, and disk. No per-minute MediaMTX software charge.',
    },
    provision,
    start: provision,
    async connect(session, publisherToken) {
      return {
        whipUrl: `${mediaPath(session)}/whip`,
        authorization: `Bearer ${publisherToken}`,
        iceServers,
      }
    },
    heartbeat: status,
    reconcile: status,
    async getPlayback(session) {
      if (!session.endedAt)
        return {
          live: session.state === 'live' ? `${mediaPath(session)}/hls/index.m3u8` : null,
          replays: [],
        }
      if (!session.recording) return { live: null, replays: [] }
      const response = await providerFetch(new URL(`/list?path=${session.providerRef}`, recordings))
      if (response.status === 404) return { live: null, replays: [] }
      if (!response.ok) throw failed()
      const ranges = (await response.json()) as Array<{ start?: string; duration?: number }>
      return {
        live: null,
        replays: ranges
          .filter(
            ({ start, duration }) =>
              typeof start === 'string' &&
              Number.isFinite(Date.parse(start)) &&
              typeof duration === 'number' &&
              Number.isFinite(duration) &&
              duration > 0,
          )
          .map(({ start, duration }) => ({
            href: `${mediaPath(session)}/replay?start=${encodeURIComponent(start!)}&duration=${duration}`,
            contentType: 'mp4' as const,
          })),
      }
    },
    end,
    revoke: end,
    async record(session, enabled) {
      if (
        !(await api(`/v3/config/paths/patch/${session.providerRef}`, 'PATCH', { record: enabled }))
          .ok
      )
        throw failed()
    },
    async health() {
      return { ready: (await api('/v3/paths/list')).ok }
    },
  }
}
