import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { inspectMedia } from '../../src/modules/media/storage'
import { localVideoRecipe, validateWebVtt } from '../../src/modules/media/video'
import { VideoPlayer } from '../../src/modules/media/VideoPlayer'

describe('MED-05 video contract', () => {
  it('validates WebVTT cues and rejects malformed or active content', () => {
    expect(
      validateWebVtt(new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello\n'))
        .cueCount,
    ).toBe(1)
    expect(() => validateWebVtt(new TextEncoder().encode('not captions'))).toThrow(/WebVTT/)
    expect(() => validateWebVtt(new TextEncoder().encode('WEBVTT\n<script>bad</script>'))).toThrow(
      /unsafe/,
    )
  })
  it('refuses truncated MP4 headers before creating a source asset', () => {
    const bytes = new Uint8Array(12)
    bytes.set(new TextEncoder().encode('ftyp'), 4)
    expect(() => inspectMedia(bytes)).toThrow(/Corrupt MP4/)
  })
  it('publishes native HLS/MP4 fallback, captions, and poster', () => {
    const html = renderToStaticMarkup(
      <VideoPlayer
        title="Field report"
        src="/baseline.mp4"
        hlsSrc="/stream.m3u8"
        poster="/poster.jpg"
        captions={[{ src: '/captions/en', language: 'en', label: 'English', default: true }]}
      />,
    )
    expect(html).toContain('<video')
    expect(html).toContain('controls=""')
    expect(html).toContain('application/vnd.apple.mpegurl')
    expect(html).toContain('video/mp4')
    expect(html).toContain('<track')
    expect(localVideoRecipe.maxInputBytes).toBe(250 * 1024 * 1024)
    expect(localVideoRecipe.maxDurationSeconds).toBe(900)
  })
})
