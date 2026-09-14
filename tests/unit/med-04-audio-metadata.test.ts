import { describe, expect, it } from 'vitest'
import {
  extractAudioMetadata,
  measurePcmLoudness,
  processAudioRecipe,
} from '../../src/modules/media/audio'

/**
 * Creates a valid RIFF/WAVE 16-bit PCM buffer with a sine wave audio tone.
 */
function createWavBuffer(durationSeconds: number, sampleRate = 44100, channels = 2): Uint8Array {
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const numSamples = Math.floor(sampleRate * durationSeconds)
  const dataSize = numSamples * blockAlign
  const totalSize = 44 + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // 'RIFF'
  view.setUint32(4, totalSize - 8, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // 'WAVE'

  // fmt subchunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // 'fmt '
  view.setUint32(16, 16, true) // Subchunk1Size
  view.setUint16(20, 1, true) // AudioFormat 1 = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true) // 16 bits per sample

  // data subchunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // 'data'
  view.setUint32(40, dataSize, true)

  // Write a 440Hz sine wave into PCM samples
  const freq = 440
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = Math.floor(Math.sin(2 * Math.PI * freq * t) * 16000) // ~ -6 dBFS
    for (let ch = 0; ch < channels; ch++) {
      view.setInt16(44 + (i * channels + ch) * 2, sample, true)
    }
  }

  return bytes
}

/**
 * Creates valid MPEG-1 Layer III (MP3) frames.
 */
function createMp3Buffer(frameCount = 20): Uint8Array {
  // MPEG-1, Layer III, 128 kbps, 44100 Hz, stereo:
  // Frame size = 144 * 128000 / 44100 = 417.96 -> 417 bytes (or 418 with padding)
  // Header: 0xFF, 0xFB, 0x90, 0x00 (11111111 11111011 10010000 00000000)
  const frameSize = 417
  const totalBytes = frameCount * frameSize
  const bytes = new Uint8Array(totalBytes)

  for (let i = 0; i < frameCount; i++) {
    const offset = i * frameSize
    bytes[offset] = 0xff
    bytes[offset + 1] = 0xfb
    bytes[offset + 2] = 0x90
    bytes[offset + 3] = 0x00
    // Fill remaining frame bytes with dummy audio payload
    bytes.fill(0x55, offset + 4, offset + frameSize)
  }

  return bytes
}

describe('MED-04 audio metadata extraction and recipes', () => {
  it('extracts container, codec, duration, sample rate, channels, and loudness from WAV audio', () => {
    const wavBytes = createWavBuffer(2.5, 44100, 2)
    const metadata = extractAudioMetadata(wavBytes)

    expect(metadata).toBeDefined()
    expect(metadata?.container).toBe('wav')
    expect(metadata?.codec).toBe('PCM')
    expect(metadata?.mimeType).toBe('audio/wav')
    expect(metadata?.channels).toBe(2)
    expect(metadata?.sampleRate).toBe(44100)
    expect(metadata?.bitrateKbps).toBe(1411) // 44100 * 2 * 16 / 1000 = 1411.2 kbps
    expect(metadata?.durationSeconds).toBeCloseTo(2.5, 1)
    expect(metadata?.sizeBytes).toBe(wavBytes.byteLength)
    expect(metadata?.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)

    // Loudness measurement
    expect(metadata?.loudness).toBeDefined()
    expect(metadata?.loudness?.integratedLufs).toBeLessThan(0)
    expect(metadata?.loudness?.integratedLufs).toBeGreaterThan(-40)
    expect(metadata?.loudness?.truePeakDbfs).toBeLessThan(0)
  })

  it('extracts container, codec, duration, and bitrate from MPEG-1 Layer III (MP3) frames', () => {
    const mp3Bytes = createMp3Buffer(50) // 50 frames
    const metadata = extractAudioMetadata(mp3Bytes)

    expect(metadata).toBeDefined()
    expect(metadata?.container).toBe('mp3')
    expect(metadata?.codec).toBe('MP3')
    expect(metadata?.mimeType).toBe('audio/mpeg')
    expect(metadata?.bitrateKbps).toBe(128)
    expect(metadata?.sampleRate).toBe(44100)
    expect(metadata?.channels).toBe(2)
    expect(metadata?.durationSeconds).toBeGreaterThan(1.0)
    expect(metadata?.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('measures PCM loudness accurately adhering to ITU-R BS.1770 standards', () => {
    const samples = new Int16Array(44100) // 1 second
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.floor(Math.sin((2 * Math.PI * 1000 * i) / 44100) * 16384)
    }

    const loudness = measurePcmLoudness(samples)
    expect(loudness.integratedLufs).toBeCloseTo(-9.7, 1)
    expect(loudness.truePeakDbfs).toBeCloseTo(-6.0, 1)
    expect(loudness.measuredAt).toBeDefined()
  })

  it('executes versioned audio loudness recipe without destructive modifications', async () => {
    const wavBytes = createWavBuffer(1.0, 44100, 1)
    const assetRecord = {
      id: 'audio-asset-1',
      kind: 'audio',
      storageLocation: 'local://audio/sample.wav',
      mimeType: 'audio/wav',
      checksum: 'sha256:abc123mock',
      durationSeconds: 1.0,
      audioMetadata: {
        container: 'wav',
        codec: 'PCM',
      },
    }

    const updatedData: Record<string, unknown> = {}

    const payloadMock = {
      async findByID() {
        return assetRecord
      },
      async update(args: { id: string; data: Record<string, unknown> }) {
        Object.assign(updatedData, args.data)
        return { ...assetRecord, ...args.data }
      },
    }

    const configMock = {
      storage: {
        driver: 'local',
        mediaDir: './media',
        maxUploadBytes: 10000000,
      },
    } as unknown as import('../../src/modules/core/config').AppConfig

    const mockStorage = {
      provider: 'local' as const,
      capabilities: { atomicWrite: true, privateObjects: true, checksumAddressed: true },
      put: async () => undefined,
      get: async () => wavBytes,
      remove: async () => undefined,
    }

    const result = await processAudioRecipe(
      payloadMock as unknown as import('payload').Payload,
      configMock,
      'audio-asset-1',
      'podcast-standard-lufs16',
      mockStorage,
    )

    expect(result.loudness).toBeDefined()
    expect(result.loudness?.integratedLufs).toBe(-16) // Target LUFS for broadcast recipe
    expect(
      (updatedData.audioMetadata as { loudness?: { integratedLufs?: number } })?.loudness
        ?.integratedLufs,
    ).toBe(-16)
    // Original location unchanged
    expect((updatedData as Record<string, unknown>).storageLocation).toBeUndefined()
  })

  it('returns undefined for non-audio or invalid data', () => {
    const randomBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55])
    expect(extractAudioMetadata(randomBytes)).toBeUndefined()
  })
})
