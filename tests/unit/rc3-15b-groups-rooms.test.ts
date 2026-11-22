import { describe, expect, it } from 'vitest'
import {
  GROUP_PRODUCT_LABEL,
  slugifyGroupName,
  validateJoinAnswers,
  validateJoinQuestions,
} from '../../src/modules/community/groups'
import { isAudienceSubset } from '../../src/modules/community/rooms'

/**
 * RC3-15B unit proof: the pure rules of groups & rooms — slug shape,
 * the join-question caps (COM-GRP-1: at most three), answer matching,
 * recap containment arithmetic, and the single-place product label
 * (Circles D1: the name is a working label in exactly one config
 * place so a rename stays a copy change).
 */

describe('RC3-15B group slug', () => {
  it('slugifies names deterministically', () => {
    expect(slugifyGroupName('Reading Circle!')).toBe('reading-circle')
    expect(slugifyGroupName('  Weird   Spacing--Here ')).toBe('weird-spacing-here')
    expect(slugifyGroupName('Café Society')).toBe('caf-society')
  })

  it('falls back to a stable slug for names with no slug content', () => {
    expect(slugifyGroupName('!!!')).toBe('group')
    expect(slugifyGroupName('   ')).toBe('group')
  })
})

describe('RC3-15B join questions and answers', () => {
  it('accepts zero to three questions', () => {
    expect(validateJoinQuestions(undefined)).toEqual([])
    expect(validateJoinQuestions([])).toEqual([])
    expect(validateJoinQuestions(['Why?', 'How did you hear?', 'Agree to norms?'])).toHaveLength(3)
  })

  it('rejects more than three questions and blanks', () => {
    expect(() => validateJoinQuestions(['a', 'b', 'c', 'd'])).toThrowError(/at most 3/)
    expect(() => validateJoinQuestions(['ok', '  '])).toThrowError(/1-200/)
    expect(() => validateJoinQuestions(['x'.repeat(201)])).toThrowError(/1-200/)
  })

  it('requires one answer per question', () => {
    const questions = validateJoinQuestions(['Why?', 'Norms?'])
    expect(validateJoinAnswers(questions, ['Because.', 'Yes.'])).toEqual(['Because.', 'Yes.'])
    expect(() => validateJoinAnswers(questions, ['only one'])).toThrowError(/Answer every/)
    expect(() => validateJoinAnswers(questions, ['a', ''])).toThrowError(/1-500/)
    expect(validateJoinAnswers([], undefined)).toEqual([])
  })
})

describe('RC3-15B recap containment arithmetic', () => {
  it('an empty destination is contained in anything', () => {
    expect(isAudienceSubset(new Set(), new Set())).toBe(true)
    expect(isAudienceSubset(new Set(), new Set(['a']))).toBe(true)
  })

  it('equal and strict subsets are contained', () => {
    expect(isAudienceSubset(new Set(['a', 'b']), new Set(['a', 'b', 'c']))).toBe(true)
    expect(isAudienceSubset(new Set(['a']), new Set(['a']))).toBe(true)
  })

  it('any member outside the source breaks containment', () => {
    expect(isAudienceSubset(new Set(['a', 'x']), new Set(['a', 'b']))).toBe(false)
    expect(isAudienceSubset(new Set(['x']), new Set())).toBe(false)
  })
})

describe('RC3-15B product label', () => {
  it('keeps the working label in its single configuration place', () => {
    expect(GROUP_PRODUCT_LABEL).toBe('Circles')
  })
})
