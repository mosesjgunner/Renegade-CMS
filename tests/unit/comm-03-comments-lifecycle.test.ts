import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getOrCreateAttachedDiscussion,
  addComment,
  listDiscussionComments,
  editComment,
  deleteComment,
  CommunityError,
} from '@/modules/community/service'
import type { CommunityActor, CommunityPolicyContext } from '@/modules/community/contracts'
import { resetApiRateLimitsForTest } from '@/modules/integrations/rate-limit'

describe('COMM-03: Comments & Discussions Lifecycle Vertical Slice', () => {
  const siteId = 'site-renegade'
  const articleId = 'article-can-100'

  const authorActor: CommunityActor = {
    kind: 'member',
    memberId: 'member-alice',
    isStaff: false,
    isModerator: false,
    status: 'active',
  }

  const otherMemberActor: CommunityActor = {
    kind: 'member',
    memberId: 'member-bob',
    isStaff: false,
    isModerator: false,
    status: 'active',
  }

  const moderatorActor: CommunityActor = {
    kind: 'member',
    memberId: 'member-charlie-mod',
    isStaff: false,
    isModerator: true,
    status: 'active',
  }

  const anonymousActor: CommunityActor = {
    kind: 'anonymous',
    isStaff: false,
    isModerator: false,
  }

  const authorContext: CommunityPolicyContext = { siteId, actor: authorActor }
  const otherContext: CommunityPolicyContext = { siteId, actor: otherMemberActor }
  const modContext: CommunityPolicyContext = { siteId, actor: moderatorActor }
  const anonContext: CommunityPolicyContext = { siteId, actor: anonymousActor }

  beforeEach(() => {
    resetApiRateLimitsForTest()
  })

  describe('1. Stable Canonical ID Binding', () => {
    it('binds discussions by canonical content ID and updates path on slug change without orphaning thread', async () => {
      let storedDiscussion: any = null

      const find = vi.fn(async ({ collection, where }: any) => {
        if (collection === 'discussions') {
          return { docs: storedDiscussion ? [storedDiscussion] : [] }
        }
        return { docs: [] }
      })

      const create = vi.fn(async ({ collection, data }: any) => {
        if (collection === 'discussions') {
          storedDiscussion = { id: 'disc-uuid-1', ...data }
          return storedDiscussion
        }
        return { id: 'created-id', ...data }
      })

      const update = vi.fn(async ({ collection, id, data }: any) => {
        if (collection === 'discussions') {
          storedDiscussion = { ...storedDiscussion, ...data }
          return storedDiscussion
        }
        return { id, ...data }
      })

      const payload = { find, create, update } as any

      // 1. Initial creation for article-can-100
      const disc1 = await getOrCreateAttachedDiscussion(payload, {
        siteId,
        attachedToCollection: 'content',
        attachedToId: articleId,
        title: 'Initial Article Title',
        canonicalPath: '/articles/initial-slug',
      })

      expect(disc1.id).toBe('disc-uuid-1')
      expect(disc1.canonicalPath).toBe('/articles/initial-slug')
      expect(create).toHaveBeenCalledTimes(1)

      // Verify that query was by attachedTo.value (stable ID), not slug
      const findCall = find.mock.calls[0][0]
      const whereConditions = JSON.stringify(findCall.where)
      expect(whereConditions).toContain(articleId)

      // 2. Parent article undergoes a URL slug change and title update
      const disc2 = await getOrCreateAttachedDiscussion(payload, {
        siteId,
        attachedToCollection: 'content',
        attachedToId: articleId,
        title: 'Renamed Article Title',
        canonicalPath: '/articles/brand-new-slug-2026',
      })

      // Must return the SAME discussion without orphaning comments
      expect(disc2.id).toBe('disc-uuid-1')
      expect(disc2.canonicalPath).toBe('/articles/brand-new-slug-2026')
      expect(disc2.title).toBe('Renamed Article Title')
      expect(create).toHaveBeenCalledTimes(1) // No second discussion created
      expect(update).toHaveBeenCalledTimes(1) // Updated canonicalPath and title
    })
  })

  describe('2. Comment Creation, Order & Anonymous Policy', () => {
    it('creates comments with sequential permalinks, displayOrder, and rejects anonymous comments', async () => {
      const discussionDoc = {
        id: 'disc-uuid-1',
        site: siteId,
        title: 'Article Discussion',
        canonicalPath: '/articles/my-post',
        status: 'open',
        commentsPolicy: 'open',
        moderationState: 'clear',
      }

      let postCount = 0
      const find = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussions') return { docs: [discussionDoc] }
        if (collection === 'discussion-posts') return { docs: [], totalDocs: postCount }
        return { docs: [] }
      })

      const create = vi.fn(async ({ collection, data }: any) => {
        if (collection === 'discussion-posts') {
          postCount++
          return { id: `post-${postCount}`, ...data }
        }
        return { id: 'created-id', ...data }
      })

      const payload = { find, create, update: vi.fn() } as any

      // 1. Authenticated author posts comment
      const comment1 = await addComment(
        payload,
        {
          siteId,
          attachedToCollection: 'content',
          attachedToId: articleId,
          title: 'Article Discussion',
          canonicalPath: '/articles/my-post',
          authorMemberId: 'member-alice',
          body: 'First comment on decentralized publishing.',
        },
        authorContext,
      )

      expect(comment1.id).toBe('post-1')
      expect(comment1.displayOrder).toBe(1)
      expect(comment1.permalink).toBe('/articles/my-post#comment-1')
      expect(comment1.paginationAnchor).toBe('comment-1')

      // 2. Anonymous user attempts to comment
      await expect(
        addComment(
          payload,
          {
            siteId,
            attachedToCollection: 'content',
            attachedToId: articleId,
            title: 'Article Discussion',
            canonicalPath: '/articles/my-post',
            authorMemberId: 'anon',
            body: 'Anonymous comment attempt',
          },
          anonContext,
        ),
      ).rejects.toThrowError(CommunityError)
    })

    it('rejects commenting on closed or locked discussions', async () => {
      const closedDiscussion = {
        id: 'disc-closed',
        site: siteId,
        title: 'Closed Article',
        canonicalPath: '/articles/closed',
        status: 'open',
        commentsPolicy: 'closed',
        moderationState: 'clear',
      }

      const payload = {
        find: vi.fn(async () => ({ docs: [closedDiscussion] })),
        create: vi.fn(),
        update: vi.fn(),
      } as any

      await expect(
        addComment(
          payload,
          {
            siteId,
            attachedToCollection: 'content',
            attachedToId: articleId,
            title: 'Closed Article',
            canonicalPath: '/articles/closed',
            authorMemberId: 'member-alice',
            body: 'Should fail',
          },
          authorContext,
        ),
      ).rejects.toMatchObject({ status: 403, code: 'comments_closed' })
    })
  })

  describe('3. Comment Listing, Profile Projection & Reactions', () => {
    it('populates public authorProfile and aggregates reaction counts without leaking sensitive data', async () => {
      const discussionDoc = {
        id: 'disc-1',
        site: siteId,
        visibility: 'public',
        moderationState: 'clear',
        status: 'open',
      }

      const posts = [
        {
          id: 'post-1',
          discussion: 'disc-1',
          authorMember: 'member-alice',
          body: 'Public insight.',
          displayOrder: 1,
          status: 'published',
          visibility: 'public',
          moderationState: 'clear',
        },
      ]

      const aliceProfile = {
        id: 'prof-alice',
        site: siteId,
        member: 'member-alice',
        displayName: 'Alice Reporter',
        handle: 'alice_investigates',
        avatarUrl: '/media/alice.jpg',
        visibility: 'public',
        // Internal fields that MUST NOT leak:
        email: 'alice@private.org',
        passwordHash: 'secret-hash',
      }

      const findByID = vi.fn(async () => discussionDoc)
      const find = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussion-posts') return { docs: posts }
        if (collection === 'profiles') return { docs: [aliceProfile] }
        if (collection === 'relationships') return { docs: [] }
        return { docs: [] }
      })

      // Mock database queries for community_reactions
      const queryDb = vi.fn(async (text: string, params: any[]) => {
        if (text.includes('GROUP BY target_id, emoji')) {
          return {
            rows: [
              { target_id: 'post-1', emoji: '👍', count: 3 },
              { target_id: 'post-1', emoji: '🔥', count: 1 },
            ],
          }
        }
        if (text.includes('member_id = $2')) {
          // Viewer (bob) reacted with 👍
          return {
            rows: [{ target_id: 'post-1', emoji: '👍' }],
          }
        }
        return { rows: [] }
      })

      const payload = {
        findByID,
        find,
        db: { pool: { query: queryDb } },
      } as any

      const results = await listDiscussionComments(payload, 'disc-1', otherContext)

      expect(results).toHaveLength(1)
      const post = results[0]
      expect(post.body).toBe('Public insight.')
      expect(post.isTombstone).toBe(false)

      // Verified author profile projection:
      expect(post.authorProfile).toEqual({
        displayName: 'Alice Reporter',
        handle: 'alice_investigates',
        avatarUrl: '/media/alice.jpg',
      })
      // Ensure zero sensitive fields leaked:
      expect((post.authorProfile as any)?.email).toBeUndefined()
      expect((post.authorProfile as any)?.passwordHash).toBeUndefined()

      // Verified reaction aggregation:
      expect(post.reactions).toEqual({ '👍': 3, '🔥': 1 })
      expect(post.viewerReactions).toEqual(['👍'])
    })

    it('enforces site tenancy and rejects cross-site comment access', async () => {
      const discussionDoc = {
        id: 'disc-tenant-a',
        site: 'site-alpha',
        visibility: 'public',
        moderationState: 'clear',
        status: 'open',
      }

      const payload = {
        findByID: vi.fn(async () => discussionDoc),
      } as any

      const crossSiteContext: CommunityPolicyContext = {
        siteId: 'site-beta-attacker',
        actor: authorActor,
      }

      await expect(
        listDiscussionComments(payload, 'disc-tenant-a', crossSiteContext),
      ).rejects.toMatchObject({
        status: 404,
        code: 'SITE_MISMATCH',
      })
    })
  })

  describe('4. Comment Editing by Author', () => {
    it('allows author to edit their own comment and updates body', async () => {
      const discussionDoc = { id: 'disc-1', site: siteId }
      let postDoc = {
        id: 'post-1',
        discussion: 'disc-1',
        authorMember: 'member-alice',
        body: 'Original draft statement.',
        status: 'published',
        moderationState: 'clear',
      }

      const findByID = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussion-posts') return postDoc
        if (collection === 'discussions') return discussionDoc
        return null
      })

      const update = vi.fn(async ({ data }: any) => {
        postDoc = { ...postDoc, ...data }
        return postDoc
      })

      const payload = { findByID, update } as any

      const updated = await editComment(
        payload,
        {
          siteId,
          commentId: 'post-1',
          authorMemberId: 'member-alice',
          body: 'Corrected and revised statement.',
        },
        authorContext,
      )

      expect(updated.body).toBe('Corrected and revised statement.')
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('rejects editing another member comment or setting an empty body', async () => {
      const discussionDoc = { id: 'disc-1', site: siteId }
      const postDoc = {
        id: 'post-1',
        discussion: 'disc-1',
        authorMember: 'member-alice',
        body: 'Alice original comment.',
        status: 'published',
        moderationState: 'clear',
      }

      const payload = {
        findByID: vi.fn(async ({ collection }: any) => {
          if (collection === 'discussion-posts') return postDoc
          if (collection === 'discussions') return discussionDoc
          return null
        }),
        update: vi.fn(),
      } as any

      // Bob tries to edit Alice's comment
      await expect(
        editComment(
          payload,
          {
            siteId,
            commentId: 'post-1',
            authorMemberId: 'member-bob',
            body: 'Tampered comment',
          },
          otherContext,
        ),
      ).rejects.toMatchObject({ status: 403, code: 'ownership_required' })

      // Alice tries to edit with empty string
      await expect(
        editComment(
          payload,
          {
            siteId,
            commentId: 'post-1',
            authorMemberId: 'member-alice',
            body: '   ',
          },
          authorContext,
        ),
      ).rejects.toMatchObject({ status: 400, code: 'EMPTY_BODY' })
    })
  })

  describe('5. Soft-Deletion, Tombstone State & Auditability', () => {
    it('creates a tombstone on author deletion and masks body during listing', async () => {
      const discussionDoc = {
        id: 'disc-1',
        site: siteId,
        visibility: 'public',
        moderationState: 'clear',
        status: 'open',
      }

      let postDoc: any = {
        id: 'post-1',
        discussion: 'disc-1',
        authorMember: 'member-alice',
        body: 'Sensitive personal disclosure that author deletes.',
        status: 'published',
        moderationState: 'clear',
        displayOrder: 1,
      }

      const findByID = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussion-posts') return postDoc
        if (collection === 'discussions') return discussionDoc
        return null
      })

      const update = vi.fn(async ({ collection, data }: any) => {
        if (collection === 'discussion-posts') {
          postDoc = { ...postDoc, ...data }
          return postDoc
        }
        return data
      })

      const find = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussion-posts') return { docs: [postDoc] }
        return { docs: [] }
      })

      const payload = { findByID, update, find } as any

      // 1. Author deletes their comment
      const deleteResult = await deleteComment(
        payload,
        {
          siteId,
          commentId: 'post-1',
          actor: authorActor,
        },
        authorContext,
      )

      expect(deleteResult.success).toBe(true)
      expect(deleteResult.tombstoneLabel).toBe('[Comment deleted by author]')
      expect(postDoc.status).toBe('removed')
      expect(postDoc.tombstoneLabel).toBe('[Comment deleted by author]')

      // 2. Listing comments returns the masked tombstone without original content or author profile
      const comments = await listDiscussionComments(payload, 'disc-1', anonContext)
      expect(comments).toHaveLength(1)
      const tombstoneComment = comments[0]

      expect(tombstoneComment.isTombstone).toBe(true)
      expect(tombstoneComment.body).toBe('[Comment deleted by author]')
      expect(tombstoneComment.authorProfile).toBeUndefined()
      expect(tombstoneComment.reactions).toEqual({})
      // The original body is never leaked:
      expect(tombstoneComment.body).not.toContain('Sensitive personal disclosure')

      // 3. Attempting to edit a tombstone comment is rejected
      await expect(
        editComment(
          payload,
          {
            siteId,
            commentId: 'post-1',
            authorMemberId: 'member-alice',
            body: 'Resurrected comment',
          },
          authorContext,
        ),
      ).rejects.toMatchObject({ status: 400, code: 'cannot_edit_removed_content' })
    })

    it('allows moderator to remove a comment with moderator tombstone label', async () => {
      const discussionDoc = { id: 'disc-1', site: siteId }
      let postDoc: any = {
        id: 'post-2',
        discussion: 'disc-1',
        authorMember: 'member-alice',
        body: 'Spam or harassment content.',
        status: 'published',
        moderationState: 'clear',
      }

      const findByID = vi.fn(async ({ collection }: any) => {
        if (collection === 'discussion-posts') return postDoc
        if (collection === 'discussions') return discussionDoc
        return null
      })

      const update = vi.fn(async ({ data }: any) => {
        postDoc = { ...postDoc, ...data }
        return postDoc
      })

      const payload = { findByID, update } as any

      const result = await deleteComment(
        payload,
        {
          siteId,
          commentId: 'post-2',
          actor: moderatorActor,
          reason: 'Violates community guidelines',
        },
        modContext,
      )

      expect(result.success).toBe(true)
      expect(result.tombstoneLabel).toBe('[Comment removed by moderator]')
      expect(postDoc.status).toBe('removed')
      expect(postDoc.moderationState).toBe('removed')
      expect(postDoc.tombstoneLabel).toBe('[Comment removed by moderator]')
    })
  })
})
