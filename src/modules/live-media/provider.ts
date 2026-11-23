export type ProviderId = 'mediamtx' | 'cloudflare'
export type LiveState = 'starting' | 'live' | 'reconnecting' | 'ended'

export interface LiveSession {
  id: string
  roomId: string
  provider: ProviderId
  providerRef: string
  state: LiveState
  recording: boolean
  startedAt: Date
  wentLiveAt: Date | null
  endedAt: Date | null
}

export interface LiveMediaCapabilities {
  ingest: readonly ('whip' | 'rtmp' | 'rtmps')[]
  playback: readonly ('hls' | 'whep')[]
  protectedAudience: boolean
  perRequestAuthorization: boolean
  tokenTtlSeconds: number | null
  immediateRevocation: boolean
  recording: boolean
  resources: string
  cost: string
}

export interface LiveConnection {
  whipUrl: string
  authorization?: string
  iceServers: RTCIceServer[]
}

export interface LivePlayback {
  live: string | null
  replays: { href: string; contentType: 'hls' | 'mp4' }[]
}

export interface ProviderStatus {
  connected: boolean
  configured: boolean
  bytesIn?: number
  bytesOut?: number
}

export interface LiveMediaProvider {
  id: ProviderId
  capabilities: LiveMediaCapabilities
  provision(session: LiveSession): Promise<void>
  connect(session: LiveSession, publisherToken: string): Promise<LiveConnection>
  start(session: LiveSession): Promise<void>
  heartbeat(session: LiveSession): Promise<ProviderStatus>
  getPlayback(session: LiveSession): Promise<LivePlayback>
  end(session: LiveSession): Promise<void>
  record(session: LiveSession, enabled: boolean): Promise<void>
  reconcile(session: LiveSession): Promise<ProviderStatus>
  revoke(session: LiveSession): Promise<void>
  health(): Promise<{ ready: boolean }>
}

export class LiveMediaError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message)
  }
}

export async function providerFetch(url: string | URL, init: RequestInit = {}) {
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(4500),
    })
  } catch {
    throw new LiveMediaError('The live media provider is unreachable.')
  }
}
