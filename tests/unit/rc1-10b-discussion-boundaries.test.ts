import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addComment, replyToForumThread } from '@/modules/community/service'
import { resetApiRateLimitsForTest } from '@/modules/integrations/rate-limit'

const context = {
  siteId: 'site-a',
  actor: {
    kind: 'member' as const,
    memberId: 'alice',
    status: 'active' as const,
    isStaff: false,
    isModerator: false,
  },
}
const discussion = {
  id: 'thread-a',
  kind: 'thread',
  site: 'site-a',
  status: 'open',
  visibility: 'public',
  commentsPolicy: 'open',
  moderationState: 'clear',
  canonicalPath: '/forum/topic',
}

beforeEach(() => resetApiRateLimitsForTest())

describe('discussion reference boundaries', () => {
  it.each(['parentPostId', 'quotePostId'] as const)(
    'rejects a foreign forum %s before writing',
    async (field) => {
      const create = vi.fn()
      const payload = {
        findByID: vi.fn(async ({ collection }: { collection: string }) =>
          collection === 'discussions'
            ? discussion
            : { discussion: 'thread-b', status: 'published', moderationState: 'clear' },
        ),
        create,
      } as never
      await expect(
        replyToForumThread(
          payload,
          {
            siteId: 'site-a',
            discussionId: 'thread-a',
            authorMemberId: 'alice',
            body: 'reply',
            [field]: 'foreign-post',
          },
          context,
        ),
      ).rejects.toMatchObject({ status: 404, code: 'POST_NOT_FOUND' })
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('rejects a foreign article comment parent before writing', async () => {
    const create = vi.fn()
    const payload = {
      find: vi.fn(async () => ({ docs: [discussion] })),
      update: vi.fn(),
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'content'
          ? {
              site: 'site-a',
              status: 'published',
              commentsPolicy: 'open',
              canonicalPath: '/forum/topic',
              title: 'Title',
            }
          : {
              discussion: 'thread-b',
              status: 'published',
              moderationState: 'clear',
            },
      ),
      create,
    } as never
    await expect(
      addComment(
        payload,
        {
          siteId: 'site-a',
          attachedToCollection: 'content',
          attachedToId: 'article-a',
          title: 'Title',
          canonicalPath: '/forum/topic',
          authorMemberId: 'alice',
          body: 'reply',
          parentPostId: 'foreign-post',
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'POST_NOT_FOUND' })
    expect(create).not.toHaveBeenCalled()
  })
})
