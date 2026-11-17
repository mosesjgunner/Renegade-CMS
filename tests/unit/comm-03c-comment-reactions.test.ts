import { describe, expect, it, vi } from 'vitest'

import { down, up } from '@/migrations/20260921_030000_comm_03c_comment_reactions'

/**
 * COMM-03C migration history. The toggle/rebuild behavior tests that
 * lived here retired with the v1 reaction store in the RC2-DEBT-20
 * fold; the folded toggle contract is pinned in
 * comm-03-folded-comments.test.ts. The migration itself is immutable
 * history — it created the (now orphaned, code-unreferenced)
 * comment_reactions / comment_reaction_counters tables — so its
 * reversibility pin stays.
 */
describe('COMM-03C comment reactions migration', () => {
  it('migrates raw reactions, a unique tuple, and a disposable counter projection reversibly', async () => {
    const execute = vi.fn(async (_sql?: unknown) => undefined)
    await up({ db: { execute } } as never)
    await down({ db: { execute } } as never)
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('comment_reactions_unique')
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('comment_reaction_counters')
  })
})
