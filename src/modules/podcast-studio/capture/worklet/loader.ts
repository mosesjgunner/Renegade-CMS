/**
 * POD-06 — AudioWorklet processor loader (thin browser adapter).
 *
 * Registers the PCM capture processor with an AudioContext via
 * `audioWorklet.addModule` using a Blob URL built from the canonical source
 * in `pcm-capture-processor.ts`. Idempotent per context.
 *
 * UNVERIFIED: no real browser AudioWorklet was exercised in POD-06; this is
 * typechecked wiring only. Safari/Firefox worklet behaviour stays
 * UNVERIFIED until the rig test in the POD-06 handoff runs.
 */

import {
  PCM_CAPTURE_PROCESSOR_NAME,
  pcmCaptureProcessorSource,
  type PcmChunkMessage,
} from './pcm-capture-processor'

type WorkletContextLike = {
  audioWorklet: { addModule(url: string): Promise<void> }
  createMediaStreamSource(stream: MediaStream): AudioNode
}

const registeredContexts = new WeakSet<object>()

export const ensurePcmCaptureProcessor = async (context: WorkletContextLike): Promise<void> => {
  if (registeredContexts.has(context as unknown as object)) return
  const blob = new Blob([pcmCaptureProcessorSource], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    await context.audioWorklet.addModule(url)
  } finally {
    URL.revokeObjectURL(url)
  }
  registeredContexts.add(context as unknown as object)
}

export type CaptureNodeHandle = {
  node: AudioWorkletNode
  disconnect(): void
}

/**
 * Connects a mic stream through the capture processor; every 250 ms chunk
 * is delivered to `onChunk` as canonical interleaved Float32 PCM.
 */
export const connectCaptureNode = async (
  context: AudioContext,
  stream: MediaStream,
  onChunk: (message: PcmChunkMessage) => void,
): Promise<CaptureNodeHandle> => {
  await ensurePcmCaptureProcessor(context as unknown as WorkletContextLike)
  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, PCM_CAPTURE_PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  })
  node.port.onmessage = (event: MessageEvent<PcmChunkMessage>) => {
    if (event.data?.type === 'pcm-chunk') onChunk(event.data)
  }
  source.connect(node)
  return {
    node,
    disconnect() {
      try {
        source.disconnect()
      } catch {
        // Already disconnected.
      }
      try {
        node.disconnect()
      } catch {
        // Already disconnected.
      }
    },
  }
}
