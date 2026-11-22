import { describe, expect, it } from 'vitest'

import { AI_TASKS } from '../../src/modules/ai/contracts'
import {
  REPURPOSE_HANDLERS,
  REPURPOSE_TASK_KEY,
  deriveRepurposeDraft,
  repurposeSourceChecksum,
  resolveRepurposeHandler,
  truncateAtWord,
  type RepurposeSource,
} from '../../src/modules/editorial/repurpose'

/**
 * RC3-14 / DEBT-04: `content.repurpose` was declared in the AI task
 * registry with no handler. These tests pin the two halves of the fix:
 * the declared task now resolves to a real handler, and the derivation
 * that handler runs is deterministic (same source in, same draft out).
 */
const source: RepurposeSource = {
  id: 'source-1',
  siteId: 'site-1',
  title: 'The Long Story',
  summary: 'A short summary.',
  plainText:
    'Democracy is not a spectator sport. '.repeat(30) +
    'The ledger follows the money from authorization to expenditure.',
  canonicalUrl: '/articles/the-long-story',
  status: 'published',
  updatedAt: '2026-11-21T00:00:00.000Z',
}

describe('RC3-14 repurpose handler registration (DEBT-04)', () => {
  it('the declared content.repurpose task resolves to a real handler', () => {
    expect(AI_TASKS[REPURPOSE_TASK_KEY]).toBeTruthy()
    const handler = resolveRepurposeHandler(REPURPOSE_TASK_KEY)
    expect(handler).toBe(REPURPOSE_HANDLERS[REPURPOSE_TASK_KEY])
    expect(typeof handler.derive).toBe('function')
    expect(typeof handler.stage).toBe('function')
    expect(typeof handler.decide).toBe('function')
    expect(typeof handler.readback).toBe('function')
    expect(resolveRepurposeHandler('content.does-not-exist')).toBeUndefined()
  })
})

describe('RC3-14 deterministic repurpose derivation', () => {
  it('derives identical output for identical input, for every target kind', () => {
    for (const kind of ['social-post', 'newsletter-section', 'article-draft'] as const) {
      const first = deriveRepurposeDraft(source, kind)
      const second = deriveRepurposeDraft(source, kind)
      expect(second).toEqual(first)
      expect(first.sourceChecksum).toBe(repurposeSourceChecksum(source))
    }
  })

  it('changes the checksum when the source changes', () => {
    const changed = deriveRepurposeDraft({ ...source, plainText: 'Different body.' }, 'social-post')
    expect(changed.sourceChecksum).not.toBe(repurposeSourceChecksum(source))
  })

  it('social-post derivation truncates and appends the canonical URL', () => {
    const derived = deriveRepurposeDraft(source, 'social-post')
    expect(derived.draftText.endsWith('/articles/the-long-story')).toBe(true)
    expect(derived.draftText.length).toBeLessThanOrEqual(240 + 1 + 24)
    expect(derived.draftText).toContain('…')
  })

  it('newsletter derivation truncates at a word boundary within 600 chars', () => {
    const derived = deriveRepurposeDraft(source, 'newsletter-section')
    expect(derived.draftText.length).toBeLessThanOrEqual(601)
    expect(derived.draftTitle).toBe('The Long Story')
  })

  it('article-draft derivation keeps the full normalized text', () => {
    const derived = deriveRepurposeDraft(source, 'article-draft')
    expect(derived.draftText).toContain('The ledger follows the money')
    expect(derived.draftText).not.toContain('  ')
  })

  it('truncateAtWord never splits mid-word when a boundary exists', () => {
    expect(truncateAtWord('alpha beta gamma delta', 12)).toBe('alpha beta…')
    expect(truncateAtWord('short', 12)).toBe('short')
  })
})
