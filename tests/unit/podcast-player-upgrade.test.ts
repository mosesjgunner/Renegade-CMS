/**
 * POD-14 — public listener player upgrade (server-rendered markup
 * proofs; interactive behaviour is covered by the pure model suite
 * in podcast-studio-intelligence.test.ts):
 *
 * - Locked (members-only) state: the rendered output contains NO
 *   audio element, NO enclosure URL, and no download link — even
 *   though a src was handed to the component.
 * - Unlocked state: player renders the audio element with the src,
 *   chapter navigation, transcript, speed control, sleep timer and
 *   share-at-timestamp controls.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, it } from 'vitest'

import { PodcastPlayer } from '../../src/modules/media/PodcastPlayer'

const ENCLOSURE = '/media/enclosure-asset-123'

describe('POD-14 public player upgrade', () => {
  it('locked members-only state leaks no enclosure URL anywhere in the output', () => {
    const html = renderToStaticMarkup(
      createElement(PodcastPlayer, {
        src: ENCLOSURE,
        title: 'Secret Episode',
        locked: true,
        chapters: [{ title: 'Intro', startTime: 0 }],
        transcript: [{ startSeconds: 0, endSeconds: 4, text: 'secret words' }],
      }),
    )
    expect(html).toContain('Members only')
    expect(html).toContain('Secret Episode')
    expect(html).not.toContain(ENCLOSURE)
    expect(html).not.toContain('<audio')
    expect(html).not.toContain('download')
    expect(html).not.toContain('secret words')
    expect(html).toContain('data-locked="true"')
  })

  it('unlocked player renders chapters, transcript, speed, sleep timer and share controls', () => {
    const html = renderToStaticMarkup(
      createElement(PodcastPlayer, {
        src: ENCLOSURE,
        title: 'Public Episode',
        chapters: [
          { title: 'Intro', startTime: 0 },
          { title: 'Main', startTime: 30, image: 'img-asset-9' },
        ],
        transcript: [{ startSeconds: 0, endSeconds: 4, text: 'hello listeners', speaker: 'Host' }],
      }),
    )
    expect(html).toContain('<audio')
    expect(html).toContain(ENCLOSURE)
    expect(html).toContain('Episode chapters')
    expect(html).toContain('Main')
    expect(html).toContain('/media/img-asset-9')
    expect(html).toContain('Episode transcript')
    expect(html).toContain('hello listeners')
    expect(html).toContain('Playback speed')
    expect(html).toContain('Sleep timer')
    expect(html).toContain('End of episode')
    expect(html).toContain('Share at')
    expect(html).toContain('Keyboard:')
  })
})
