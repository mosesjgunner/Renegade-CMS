import { describe, expect, it } from 'vitest'
import {
  analyzeCannibalization,
  computeLexicalSimilarity,
} from '../../src/modules/public/cannibalization'
import type { RenderedPage } from '../../src/modules/public/discovery-audit'

describe('DISC-05 Lexical Similarity & Cannibalization Analysis', () => {
  it('computes lexical similarity between similar titles', () => {
    const textA = 'Complete Guide to Renegade CMS Installation and Setup'
    const textB = 'Guide to Installing and Setting Up Renegade CMS'

    const { similarity, sharedTokens } = computeLexicalSimilarity(textA, textB)
    expect(similarity).toBeGreaterThanOrEqual(0.55)
    expect(sharedTokens).toContain('renegade')
    expect(sharedTokens).toContain('cms')
  })

  it('generates cautious editorial cannibalization review issues for near-duplicate titles', () => {
    const pages: RenderedPage[] = [
      {
        url: 'https://example.test/post-1',
        status: 200,
        finalUrl: 'https://example.test/post-1',
        title: 'Ultimate Headless CMS Architecture Guide 2026',
        description: null,
        canonical: 'https://example.test/post-1',
        robots: null,
        headings: ['h1:Ultimate Headless CMS Architecture Guide 2026'],
        links: [],
        issues: [],
        text: '',
      },
      {
        url: 'https://example.test/post-2',
        status: 200,
        finalUrl: 'https://example.test/post-2',
        title: 'Headless CMS Architecture Guide and Best Practices 2026',
        description: null,
        canonical: 'https://example.test/post-2',
        robots: null,
        headings: ['h1:Headless CMS Architecture Guide and Best Practices 2026'],
        links: [],
        issues: [],
        text: '',
      },
      {
        url: 'https://example.test/post-3',
        status: 200,
        finalUrl: 'https://example.test/post-3',
        title: 'Unrelated Recipe for Chocolate Cake',
        description: null,
        canonical: 'https://example.test/post-3',
        robots: null,
        headings: ['h1:Unrelated Recipe for Chocolate Cake'],
        links: [],
        issues: [],
        text: '',
      },
    ]

    const result = analyzeCannibalization(pages, 0.5)
    expect(result.reviews).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].ruleId).toBe('DISC-05-CANNIBALIZATION-REVIEW')
    expect(result.issues[0].evidence).toContain('Editorial suggestion only')
    expect(result.issues[0].evidence).toContain('not a ranking prediction')
  })
})
