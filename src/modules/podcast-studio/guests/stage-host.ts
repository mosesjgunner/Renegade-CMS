import { RECONNECT_MAX_ATTEMPTS, reconnectDelayMs } from './peer-session'
import {
  stageCameraAllowed,
  stageConnection,
  stageDescription,
  stageSignal,
  type StageControls,
} from './stage-browser'
import type { createStageProgram } from './stage-program'

export type StageProgram = ReturnType<typeof createStageProgram>

export function startHostPeer(input: {
  sessionId: string
  inviteId: string
  program: StageProgram
  onState: (state: string) => void
  onCamera: (track: MediaStreamTrack | null) => void
}) {
  const { inviteId, program } = input
  const signalling = stageSignal(input)
  const abort = new AbortController()
  let pc: RTCPeerConnection | undefined
  let attempt = ''
  let retries = 0
  let retryAt = 0
  let controls: StageControls = { muted: false, recording: false }
  let sentControls: StageControls | undefined

  const clear = () => {
    pc?.close()
    pc = undefined
    program.clearGuest(inviteId)
    input.onCamera(null)
  }

  const close = () => {
    abort.abort()
    clear()
  }

  async function run() {
    while (!abort.signal.aborted) {
      try {
        const room = await signalling.poll(abort.signal)
        if (abort.signal.aborted) return
        if (room.lobbyState !== 'admitted') {
          input.onState('Guest left')
          close()
          return
        }
        if (!room.ice) throw new Error('ICE configuration unavailable.')
        if (pc?.connectionState === 'connected') {
          retries = 0
          retryAt = 0
          input.onState('Connected')
        } else {
          if (!retryAt) retryAt = Date.now() + (pc ? reconnectDelayMs(retries) : 0)
          if (Date.now() >= retryAt) {
            if (retries >= RECONNECT_MAX_ATTEMPTS) {
              input.onState('Reconnect budget exhausted')
              close()
              return
            }
            clear()
            input.onState(retries ? 'Reconnecting' : 'Connecting')
            retries++
            attempt = crypto.randomUUID()
            const next = stageConnection(room.ice)
            pc = next
            next.addTransceiver(program.guestReturn(inviteId), { direction: 'sendrecv' })
            next.addTransceiver(program.visual, { direction: 'sendrecv' })
            const sdp = await stageDescription(next, await next.createOffer(), abort.signal)
            await signalling.send('offer', { sdp, attempt, ...controls }, abort.signal)
            retryAt = Date.now() + 15_000 + reconnectDelayMs(retries - 1)
          }
        }
        for (const message of room.messages) {
          const { payload } = message
          if (
            pc &&
            message.type === 'answer' &&
            payload.attempt === attempt &&
            typeof payload.sdp === 'string' &&
            pc.signalingState === 'have-local-offer'
          ) {
            const connection = pc
            connection.ontrack = ({ track, transceiver }) => {
              if (abort.signal.aborted || pc !== connection) return
              if (track.kind === 'audio') {
                program.input(inviteId, track)
                program.mute(inviteId, controls.muted)
              } else {
                input.onCamera(track)
                program.attachCamera(
                  inviteId,
                  track,
                  stageCameraAllowed(inviteId, transceiver.mid, payload),
                )
              }
            }
            try {
              await connection.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
            } catch {
              clear()
              retryAt = Date.now() + reconnectDelayMs(retries - 1)
            }
          }
          if (
            message.type === 'hello' &&
            payload.attempt === attempt &&
            payload.cameraWithdrawn === true
          ) {
            program.removeCamera(inviteId)
            input.onCamera(null)
          }
          signalling.consumed(message)
        }
        if (controls !== sentControls) {
          const current = controls
          await signalling.send('hello', { stageControls: current, attempt }, abort.signal)
          sentControls = current
        }
      } catch {
        if (!abort.signal.aborted) {
          input.onState('Signalling interrupted')
          clear()
          if (retries < RECONNECT_MAX_ATTEMPTS) retries++
          if (!retryAt || retryAt < Date.now()) retryAt = Date.now() + reconnectDelayMs(retries)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
  }
  void run()
  return {
    setControls(next: StageControls) {
      controls = next
      program.mute(inviteId, next.muted)
    },
    close,
  }
}
