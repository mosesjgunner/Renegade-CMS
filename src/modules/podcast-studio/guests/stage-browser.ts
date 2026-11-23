import type { IceConfig } from './peer-session'
import { cameraTrackDefinition } from '../recording/camera-tracks'
import { cameraTrackConsentGranted } from '../contracts/track-manifest'

const endpoint = '/api/podcast-studio/guests/signalling'

export type StageMessage = {
  id: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
}
export type StageControls = { muted: boolean; recording: boolean }

export function stageSignal(input: { sessionId: string; inviteId: string; credential?: string }) {
  const headers = {
    'Content-Type': 'application/json',
    ...(input.credential ? { Authorization: `Bearer ${input.credential}` } : {}),
  }
  const params = new URLSearchParams({ inviteId: input.inviteId, sessionId: input.sessionId })
  let cursor: StageMessage | undefined
  return {
    async poll(signal: AbortSignal) {
      if (cursor) {
        params.set('after', cursor.createdAt)
        params.set('afterId', cursor.id)
      }
      const response = await fetch(`${endpoint}?${params}`, {
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      })
      if ([401, 403, 404].includes(response.status)) return { lobbyState: 'left', messages: [] }
      if (!response.ok) throw new Error(`Stage poll failed (${response.status}).`)
      const result = (await response.json()) as {
        lobbyState: string
        messages: StageMessage[]
        ice?: IceConfig
      }
      return result
    },
    consumed(message: StageMessage) {
      cursor = message
    },
    async send(
      type: 'offer' | 'answer' | 'hello' | 'bye',
      payload: Record<string, unknown>,
      signal: AbortSignal,
    ) {
      const response = await fetch(endpoint, {
        headers,
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        method: 'POST',
        body: JSON.stringify({
          inviteId: input.inviteId,
          sessionId: input.sessionId,
          type,
          payload,
        }),
      })
      if (!response.ok) throw new Error(`Stage signal failed (${response.status}).`)
    },
  }
}

export function setStageTrackEnabled(track: MediaStreamTrack, enabled: boolean) {
  track.enabled = enabled
}

export function stageConnection(ice: IceConfig) {
  return new RTCPeerConnection({
    iceServers: ice.iceServers,
    iceTransportPolicy: ice.iceTransportPolicy,
  })
}

// Gather before signalling so SDP and its candidates cross the durable log atomically.
export async function stageDescription(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
  signal: AbortSignal,
) {
  await pc.setLocalDescription(description)
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      pc.removeEventListener('icegatheringstatechange', check)
    }
    const abort = () => {
      finish()
      reject(new Error('Stage connection closed.'))
    }
    const check = () => {
      if (pc.iceGatheringState !== 'complete') return
      finish()
      resolve()
    }
    const timeout = setTimeout(() => {
      finish()
      reject(new Error('ICE gathering timed out.'))
    }, 10_000)
    signal.addEventListener('abort', abort, { once: true })
    pc.addEventListener('icegatheringstatechange', check)
    if (signal.aborted) abort()
    else check()
  })
  return pc.localDescription?.sdp
}

export function stageCameraAllowed(
  inviteId: string,
  mid: string | null,
  payload: Record<string, unknown>,
) {
  const definition = cameraTrackDefinition({
    participantId: inviteId,
    consent: payload.cameraConsent === true,
  })
  return (
    mid !== null &&
    payload.cameraMid === mid &&
    payload.cameraTrackId === definition.trackId &&
    cameraTrackConsentGranted(definition)
  )
}
