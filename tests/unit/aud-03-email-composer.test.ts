import { describe, expect, it } from 'vitest'
import {
  approvedRenderSnapshot,
  rebaseContentCard,
  renderEmailDesign,
  sourceIsStale,
  validateEmailDesign,
  type MessageDesign,
} from '../../src/modules/audience/email-composer'

const design = (): MessageDesign => ({
  version: 1,
  templateVersion: 'newsletter-v1',
  locale: 'en',
  tokens: { accent: '#164e9b' },
  plainTextStrategy: 'generated',
  personalization: { missingValue: 'fallback', fallbacks: { 'recipient.firstName': 'Reader' } },
  blocks: [
    { type: 'heading', text: 'Hello {{recipient.firstName}}' },
    {
      type: 'image',
      assetId: 'media-1',
      src: 'https://cdn.example.test/hero.jpg',
      alt: 'Newsroom',
    },
    {
      type: 'content-card',
      source: {
        contentId: 'article-1',
        revisionId: 'rev-1',
        url: 'https://news.example.test/story',
        title: 'Canonical story',
      },
    },
    {
      type: 'legal',
      address: '1 Main Street',
      preferenceUrl: 'https://news.example.test/preferences',
      unsubscribeUrl: 'https://news.example.test/unsubscribe',
    },
  ],
})
describe('AUD-03 deterministic email channel projection', () => {
  it('renders escaped personalized HTML/plain text and stable approved snapshots', () => {
    const first = renderEmailDesign(design(), {
      origin: 'https://news.example.test',
      recipient: { 'recipient.firstName': '<Ada>' },
    })
    const second = renderEmailDesign(design(), {
      origin: 'https://news.example.test',
      recipient: { 'recipient.firstName': '<Ada>' },
    })
    expect(first.html).toContain('&lt;Ada&gt;')
    expect(first.text).toContain('Ada')
    expect(first.hash).toBe(second.hash)
    expect(
      approvedRenderSnapshot(design(), {
        origin: 'https://news.example.test',
        subject: 'Weekly',
        recipient: { 'recipient.firstName': 'Ada' },
      }).html,
    ).toContain('role="main"')
  })
  it('rejects arbitrary tokens and mandates controls for marketing', () => {
    const unsafe = design()
    unsafe.blocks[0] = { type: 'text', text: '{{recipient.constructor}}' }
    expect(() => renderEmailDesign(unsafe, { origin: 'https://news.example.test' })).toThrow(
      'Unsupported personalization',
    )
    const noLegal = design()
    noLegal.blocks = noLegal.blocks.filter((b) => b.type !== 'legal')
    expect(validateEmailDesign(noLegal, 'bulk')).toContain(
      'Marketing messages require exactly one legal preference block.',
    )
  })
  it('marks source revision drift and rebases source facts without overwriting projection copy', () => {
    const card = design().blocks[2] as Extract<
      MessageDesign['blocks'][number],
      { type: 'content-card' }
    >
    expect(sourceIsStale(card, 'rev-2')).toBe(true)
    const changed = rebaseContentCard(
      { ...card, title: 'Editor headline' },
      { ...card.source, revisionId: 'rev-2', title: 'New canonical title' },
    )
    expect(changed.title).toBe('Editor headline')
    expect(changed.source.revisionId).toBe('rev-2')
  })
})
