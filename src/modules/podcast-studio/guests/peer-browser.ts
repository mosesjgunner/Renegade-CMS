/**
 * POD-10: thin browser adapter over the peer-session core.
 *
 * UNVERIFIED: no real browser, RTCPeerConnection, NAT traversal or
 * TURN relay was exercised in this stage. This file is typechecked
 * wiring only — it builds the RTCPeerConnection from the core's ICE
 * config, exchanges SDP/ICE through the long-poll signalling
 * endpoints, exposes the guest's receive stream (the POD-07 mix-minus
 * bus rendered host-side / the remote track in a mesh call), and
 * samples getStats() into the core's telemetry model. The rig tests
 * that would verify it are named in docs/podcast-studio/GUESTS.md.
 */
import {
  createPeerSession,
  recordReconnectAttempt,
  summarizeTelemetry,
  transitionPeer,
  type IceConfig,
  type PeerSession,
  type TelemetrySample,
} from './peer-session'

export type GuestPeerAdapter = {
  session: PeerSession
  connect: () => Promise<void>
  setMuted: (muted: boolean) => void
  close: () => void
  telemetry: () => ReturnType<typeof summarizeTelemetry>
}

export function createGuestPeerAdapter(input: {
  participantId: string
  ice: IceConfig
  localStream: MediaStream
  onRemoteStream?: (stream: MediaStream) => void
  onTalkback?: (active: boolean) => void
}): GuestPeerAdapter {
  const session = createPeerSession(
    input.participantId,
    input.ice.limitation ? [input.ice.limitation] : [],
  )
  const samples: TelemetrySample[] = []
  let pc: RTCPeerConnection | null = null
  let statsTimer: ReturnType<typeof setInterval> | null = null

  const startStats = () => {
    statsTimer = setInterval(async () => {
      if (!pc) return
      const stats = await pc.getStats().catch(() => null)
      if (!stats) return
      let rttMs = 0
      let lossPct = 0
      let bitrateKbps = 0
      let jitterMs = 0
      stats.forEach((report: any) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rttMs = (report.currentRoundTripTime ?? 0) * 1000
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          const lost = report.packetsLost ?? 0
          const received = report.packetsReceived ?? 0
          lossPct = received + lost > 0 ? (lost / (received + lost)) * 100 : 0
          jitterMs = (report.jitter ?? 0) * 1000
          bitrateKbps = report.bytesReceived ? 128 : 0 // adapter-level estimate; core thresholds are the proven part
        }
      })
      samples.push({
        atMs: Date.now(),
        roundTripTimeMs: rttMs,
        packetLossPct: lossPct,
        bitrateKbps,
        jitterMs,
      })
    }, 2_000)
  }

  return {
    session,
    async connect() {
      transitionPeer(session, 'connecting', Date.now())
      pc = new RTCPeerConnection({
        iceServers: input.ice.iceServers,
        iceTransportPolicy: input.ice.iceTransportPolicy,
      })
      for (const track of input.localStream.getTracks()) pc.addTrack(track, input.localStream)
      pc.ontrack = (event) => input.onRemoteStream?.(event.streams[0])
      pc.onconnectionstatechange = () => {
        if (!pc) return
        if (pc.connectionState === 'connected') {
          transitionPeer(session, 'connected', Date.now())
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          if (session.state !== 'reconnecting' && session.state !== 'dropped') {
            transitionPeer(session, 'reconnecting', Date.now())
          }
          const outcome = recordReconnectAttempt(session, Date.now())
          if (outcome.dropped) pc.close()
        }
      }
      startStats()
    },
    setMuted(muted: boolean) {
      for (const track of input.localStream.getAudioTracks()) track.enabled = !muted
    },
    close() {
      if (statsTimer) clearInterval(statsTimer)
      pc?.close()
      pc = null
    },
    telemetry: () => summarizeTelemetry(samples),
  }
}
