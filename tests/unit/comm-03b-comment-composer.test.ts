import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CommentComposerError,
  consumeCommentRateLimit,
  editThreadComment,
  extractMentions,
  linkResolvedMentions,
  postThreadComment,
  resetCommentRateLimitsForTest,
  resolveSiteMentions,
  sanitizeCommentHtml,
  toDeterministicUuid,
} from '@/modules/community/comment-composer'
import type { CommunityActor } from '@/modules/community/contracts'

const siteId = '00000000-0000-7000-8000-000000000001'
const siteOther = '00000000-0000-7000-8000-000000000099'
const threadId = '00000000-0000-7000-8000-000000000002'
const authorId = '00000000-0000-7000-8000-000000000003'
const staffId = '00000000-0000-7000-8000-000000000004'

function mockPayloadWithQuery(
  queryFn: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>,
  findFn?: (args: Record<string, unknown>) => Promise<{ docs: unknown[] }>,
) {
  return {
    find: vi.fn(findFn ?? (async () => ({ docs: [] }))),
    findByID: vi.fn(async () => null),
    db: { pool: { query: queryFn } },
  } as never
}

describe('COMM-03B: Safe Comment Composer, Rich-Text Sanitization, Mentions, Edit Window, & Idempotency', () => {
  beforeEach(() => {
    resetCommentRateLimitsForTest()
  })

  // =========================================================================
  // 1. Rich-Text & XSS Sanitization Tests
  // =========================================================================
  describe('1. Rich-Text Sanitization & Anti-XSS Protection', () => {
    it('strips script tags and executable contents completely', () => {
      const payload = '<script>alert("XSS")</script>'
      const sanitized = sanitizeCommentHtml(payload)
      expect(sanitized).toBe('')
      expect(sanitized).not.toContain('script')
      expect(sanitized).not.toContain('alert')
    })

    it('strips style tags, inline style attributes, and CSS background injection', () => {
      const payload1 = '<style>body { display: none; }</style><p>Visible</p>'
      expect(sanitizeCommentHtml(payload1)).toBe('<p>Visible</p>')

      const payload2 = '<p style="color: red; background: url(javascript:alert(1));">Content</p>'
      expect(sanitizeCommentHtml(payload2)).toBe('<p>Content</p>')
    })

    it('strips image, iframe, svg, and object tags with event handlers', () => {
      const payload =
        '<img src="x" onerror="alert(1)"><iframe src="https://evil.com"></iframe><svg onload="alert(1)"><circle cx="5"/></svg>'
      const sanitized = sanitizeCommentHtml(payload)
      expect(sanitized).toBe('')
      expect(sanitized).not.toContain('onerror')
      expect(sanitized).not.toContain('onload')
      expect(sanitized).not.toContain('evil.com')
    })

    it('strips dangerous href protocols: javascript, vbscript, and data URIs', () => {
      const p1 = '<a href="javascript:alert(1)">Click</a>'
      expect(sanitizeCommentHtml(p1)).toBe('<a>Click</a>')

      const p2 = '<a href="vbscript:msgbox(1)">Click</a>'
      expect(sanitizeCommentHtml(p2)).toBe('<a>Click</a>')

      const p3 = '<a href="data:text/html,<script>alert(1)</script>">Click</a>'
      expect(sanitizeCommentHtml(p3)).toBe('<a>Click</a>')

      const p4 = '<a href="java&#x09;script:alert(1)">Click</a>'
      expect(sanitizeCommentHtml(p4)).toBe('<a>Click</a>')

      const p5 = '<a href="  javascript:alert(1)">Click</a>'
      expect(sanitizeCommentHtml(p5)).toBe('<a>Click</a>')
    })

    it('strips event handlers on allowed tags', () => {
      const payload =
        '<p onclick="alert(1)" onmouseover="alert(2)" onfocus="alert(3)">Safe Paragraph</p>'
      expect(sanitizeCommentHtml(payload)).toBe('<p>Safe Paragraph</p>')
    })

    it('handles polyglot, comment, and malformed HTML payloads safely without execution', () => {
      const polyglot1 = '<<SCRIPT>alert("XSS");//<</SCRIPT>'
      const res1 = sanitizeCommentHtml(polyglot1)
      expect(res1).not.toContain('<script')
      expect(res1).not.toContain('alert("XSS")')

      const polyglot2 =
        'javascript:/*--></title></style></textarea></noscript>*/<script>alert(1)</script>'
      const res2 = sanitizeCommentHtml(polyglot2)
      expect(res2).not.toContain('<script')
      expect(res2).not.toContain('alert(1)')

      const comments = '<!-- <script>alert(1)</script> --><p>Safe text</p>'
      expect(sanitizeCommentHtml(comments)).toBe('<p>Safe text</p>')

      const unclosed = '<p>Unclosed paragraph <b>and bold'
      const cleanUnclosed = sanitizeCommentHtml(unclosed)
      expect(cleanUnclosed).toContain('Unclosed paragraph')
      expect(cleanUnclosed).not.toContain('<script')
    })

    it('preserves all allowed markup and safe link protocols (http, https, mailto)', () => {
      const allowed =
        '<p>Hello <b>bold</b>, <i>italic</i>, <em>emphasis</em>, <strong>strong</strong>, <code>code</code>.</p>' +
        '<blockquote>A quote</blockquote>' +
        '<ul><li>Item 1</li><li>Item 2</li></ul>' +
        '<ol><li>First</li><li>Second</li></ol>' +
        '<p><a href="https://renegade.org">Renegade</a> and <a href="http://example.com">Example</a> and <a href="mailto:info@renegade.org">Contact</a></p>'

      const sanitized = sanitizeCommentHtml(allowed)
      expect(sanitized).toBe(allowed)
    })
  })

  // =========================================================================
  // 2. Mentions Extraction, Site-Scoped Resolution & Inert Unresolved Mentions
  // =========================================================================
  describe('2. Mentions Extraction and Site-Scoped Resolution', () => {
    it('extracts mentions matching @([a-zA-Z0-9_\\-.]{3,30})', () => {
      const text = 'Hello @alice, @bob-smith, @carol.jones, and @d_123! But not @ab (too short).'
      const extracted = extractMentions(text)
      expect(extracted).toContain('alice')
      expect(extracted).toContain('bob-smith')
      expect(extracted).toContain('carol.jones')
      expect(extracted).toContain('d_123')
      expect(extracted).not.toContain('ab')
    })

    it('resolves mentions only against active members scoped to the same site', async () => {
      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('FROM profiles p')) {
          const handles = (values?.[0] as string[]) ?? []
          const rows = []
          if (handles.includes('alice')) {
            rows.push({ handle: 'alice', member_id: 'member-alice' })
          }
          return { rows }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const resolved = await resolveSiteMentions(payload, siteId, ['alice', 'bob'])

      expect(resolved.has('alice')).toBe(true)
      expect(resolved.get('alice')?.memberId).toBe('member-alice')
      expect(resolved.has('bob')).toBe(false)
    })

    it('leaves unresolved mentions as inert plain text without links or side effects', () => {
      const html = '<p>Check with @unknown_user and @ghost_member on this.</p>'
      const resolvedMap = new Map<string, { memberId: string; handle: string }>()

      const linked = linkResolvedMentions(html, resolvedMap)
      expect(linked).toBe('<p>Check with @unknown_user and @ghost_member on this.</p>')
      expect(linked).not.toContain('<a')
    })

    it('does NOT resolve cross-site handles: cross-site handles remain inert plain text', async () => {
      const query = vi.fn(async (text: string, values?: unknown[]) => {
        const querySiteId = values?.[1]
        // Member belongs to siteOther, NOT siteId
        if (querySiteId === siteOther) {
          return { rows: [{ handle: 'cross_member', member_id: 'member-cross' }] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)

      // Post on siteId where cross_member is NOT scoped
      const resolved = await resolveSiteMentions(payload, siteId, ['cross_member'])
      expect(resolved.has('cross_member')).toBe(false)

      const text = '<p>Hello @cross_member!</p>'
      const linked = linkResolvedMentions(text, resolved)
      expect(linked).toBe('<p>Hello @cross_member!</p>')
      expect(linked).not.toContain('<a href=')
    })

    it('links resolved mentions to /members/{handle} without double-linking inside existing <a> tags or <code>', () => {
      const html =
        '<p>Hello @alice, visit <a href="https://example.com">@alice website</a>, and see <code>@alice code</code>.</p>'
      const resolvedMap = new Map([['alice', { memberId: 'm-1', handle: 'alice' }]])

      const linked = linkResolvedMentions(html, resolvedMap)
      expect(linked).toBe(
        '<p>Hello <a href="/members/alice">@alice</a>, visit <a href="https://example.com">@alice website</a>, and see <code>@alice code</code>.</p>',
      )
    })
  })

  // =========================================================================
  // 3. Idempotency Key & Concurrency Deduplication
  // =========================================================================
  describe('3. Idempotency Key & Concurrency Deduplication', () => {
    it('requires Idempotency-Key header', async () => {
      const payload = mockPayloadWithQuery(async () => ({ rows: [] }))
      await expect(
        postThreadComment(payload, {
          siteId,
          threadId,
          authorId,
          body: 'Hello',
          idempotencyKey: '',
        }),
      ).rejects.toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' })
    })

    it('maps idempotency key deterministically to valid client_mutation_id UUID', () => {
      const key1 = 'client-req-001'
      const uuid1 = toDeterministicUuid(key1)
      const uuid2 = toDeterministicUuid(key1)
      expect(uuid1).toBe(uuid2)
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

      const existingUuid = '11111111-2222-3333-4444-555555555555'
      expect(toDeterministicUuid(existingUuid)).toBe(existingUuid)
    })

    it('duplicate idempotency key under concurrency creates exactly one comment', async () => {
      let storedComment: Record<string, unknown> | null = null
      let insertCount = 0

      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('SELECT * FROM comments WHERE thread_id = $1 AND client_mutation_id = $2')) {
          return { rows: storedComment ? [storedComment] : [] }
        }
        if (text.includes('INSERT INTO comments')) {
          if (storedComment) {
            // Simulate PostgreSQL 23505 unique constraint violation on duplicate client_mutation_id
            const error = new Error('duplicate key value violates unique constraint "comments_client_mutation_unique"')
            ;(error as unknown as { code: string }).code = '23505'
            throw error
          }
          insertCount++
          storedComment = {
            id: 'comment-uuid-001',
            thread_id: values?.[0],
            parent_id: values?.[1],
            root_id: values?.[2],
            author_id: values?.[3],
            author_type: values?.[4],
            depth: values?.[5],
            body_raw: values?.[6],
            body_html: values?.[7],
            client_mutation_id: values?.[8],
            created_at: new Date().toISOString(),
          }
          return { rows: [storedComment] }
        }
        if (text.includes('SELECT id, site_id')) {
          return { rows: [{ id: threadId, siteId, isClosed: false, isFrozen: false }] }
        }
        if (text.includes('FROM profiles p')) {
          return { rows: [] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const idempotencyKey = 'concurrent-idem-key-100'

      // Execute 20 concurrent requests with the identical idempotency key
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          postThreadComment(payload, {
            siteId,
            threadId,
            authorId,
            body: '<p>Concurrent test comment</p>',
            idempotencyKey,
          }),
        ),
      )

      expect(insertCount).toBe(1)
      const uniqueCommentIds = new Set(results.map((r) => r.comment.id))
      expect(uniqueCommentIds.size).toBe(1)
      expect(Array.from(uniqueCommentIds)[0]).toBe('comment-uuid-001')

      // 1 created initially, other 19 replayed
      const replayedCount = results.filter((r) => r.replayed).length
      expect(replayedCount).toBe(19)
    })

    it('duplicate request within 60 seconds returns original comment without second insert', async () => {
      const commentCreatedAt = new Date()
      const existing = {
        id: 'original-comment-id',
        thread_id: threadId,
        author_id: authorId,
        body_raw: 'First post',
        body_html: '<p>First post</p>',
        client_mutation_id: toDeterministicUuid('key-within-60s'),
        created_at: commentCreatedAt.toISOString(),
      }

      const query = vi.fn(async (text: string) => {
        if (text.includes('SELECT * FROM comments WHERE thread_id = $1 AND client_mutation_id = $2')) {
          return { rows: [existing] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 45_000) // 45s later

      const result = await postThreadComment(payload, {
        siteId,
        threadId,
        authorId,
        body: 'First post',
        idempotencyKey: 'key-within-60s',
        now,
      })

      expect(result.replayed).toBe(true)
      expect(result.comment.id).toBe('original-comment-id')
      // No INSERT query made
      const calls = query.mock.calls.map(([sql]) => String(sql))
      expect(calls.some((sql) => sql.includes('INSERT INTO comments'))).toBe(false)
    })
  })

  // =========================================================================
  // 4. Edit Window: 15-Minute Author Rule vs Staff Rules
  // =========================================================================
  describe('4. Comment Edit Window (15-Minute Rule & Staff Moderation)', () => {
    const commentCreatedAt = new Date('2026-09-21T12:00:00.000Z')
    const baseComment = {
      id: 'comment-edit-1',
      thread_id: threadId,
      threadSiteId: siteId,
      author_id: authorId,
      body_raw: 'Original raw text',
      body_html: '<p>Original raw text</p>',
      created_at: commentCreatedAt.toISOString(),
      status: 'visible',
    }

    const authorActor: CommunityActor = {
      kind: 'member',
      memberId: authorId,
      isStaff: false,
      isModerator: false,
    }

    const otherMemberActor: CommunityActor = {
      kind: 'member',
      memberId: 'other-member-99',
      isStaff: false,
      isModerator: false,
    }

    const staffActorWithoutPerm: CommunityActor & { permissions: string[] } = {
      kind: 'user',
      userId: staffId,
      isStaff: true,
      isModerator: false,
      permissions: ['content.read'],
    }

    const staffActorWithModerate: CommunityActor & { permissions: string[] } = {
      kind: 'user',
      userId: staffId,
      isStaff: true,
      isModerator: false,
      permissions: ['staff:community_moderate'],
    }

    it('allows author edits within 15 minutes and records revision', async () => {
      let updatedComment: Record<string, unknown> | null = null
      let revisionRecorded = false

      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('SELECT c.*, t.site_id')) {
          return { rows: [baseComment] }
        }
        if (text.includes('INSERT INTO comment_revisions')) {
          revisionRecorded = true
          expect(values?.[0]).toBe('comment-edit-1')
          expect(values?.[2]).toBe('Original raw text')
          return { rows: [{ id: 'rev-1' }] }
        }
        if (text.includes('UPDATE comments')) {
          updatedComment = {
            ...baseComment,
            body_raw: values?.[0],
            body_html: values?.[1],
            updated_at: new Date().toISOString(),
          }
          return { rows: [updatedComment] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 10 * 60 * 1000) // 10 minutes later

      const res = await editThreadComment(payload, {
        siteId,
        threadId,
        commentId: 'comment-edit-1',
        newBody: '<p>Updated by author</p>',
        actor: authorActor,
        reason: 'Fixed typo',
        now,
      })

      expect(res).toBeDefined()
      expect(revisionRecorded).toBe(true)
      expect(res?.body_raw).toBe('<p>Updated by author</p>')
    })

    it('allows author edits at exactly 14m59s', async () => {
      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('SELECT c.*, t.site_id')) return { rows: [baseComment] }
        if (text.includes('INSERT INTO comment_revisions')) return { rows: [{ id: 'rev-2' }] }
        if (text.includes('UPDATE comments')) {
          return { rows: [{ ...baseComment, body_raw: values?.[0], body_html: values?.[1] }] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 14 * 60 * 1000 + 59 * 1000) // 14m59s

      const res = await editThreadComment(payload, {
        siteId,
        threadId,
        commentId: 'comment-edit-1',
        newBody: 'Allowed edit',
        actor: authorActor,
        now,
      })
      expect(res).toBeDefined()
    })

    it('rejects author edits after 15 minutes (at 15m01s)', async () => {
      const query = vi.fn(async (text: string) => {
        if (text.includes('SELECT c.*, t.site_id')) return { rows: [baseComment] }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 15 * 60 * 1000 + 1000) // 15m01s

      await expect(
        editThreadComment(payload, {
          siteId,
          threadId,
          commentId: 'comment-edit-1',
          newBody: 'Late edit',
          actor: authorActor,
          now,
        }),
      ).rejects.toMatchObject({ status: 403, code: 'EDIT_WINDOW_EXPIRED' })
    })

    it('rejects other non-author members within 15 minutes', async () => {
      const query = vi.fn(async (text: string) => {
        if (text.includes('SELECT c.*, t.site_id')) return { rows: [baseComment] }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 5 * 60 * 1000) // 5 minutes

      await expect(
        editThreadComment(payload, {
          siteId,
          threadId,
          commentId: 'comment-edit-1',
          newBody: 'Hijack attempt',
          actor: otherMemberActor,
          now,
        }),
      ).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED_COMMENT_EDIT' })
    })

    it('rejects staff edits after 15 minutes if staff lacks staff:community_moderate', async () => {
      const query = vi.fn(async (text: string) => {
        if (text.includes('SELECT c.*, t.site_id')) return { rows: [baseComment] }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 30 * 60 * 1000) // 30 minutes

      await expect(
        editThreadComment(payload, {
          siteId,
          threadId,
          commentId: 'comment-edit-1',
          newBody: 'Staff unmoderated edit',
          actor: staffActorWithoutPerm,
          now,
        }),
      ).rejects.toMatchObject({ status: 403, code: 'EDIT_WINDOW_EXPIRED' })
    })

    it('allows staff edits after 15 minutes with staff:community_moderate', async () => {
      let revisionRecorded = false
      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('SELECT c.*, t.site_id')) return { rows: [baseComment] }
        if (text.includes('INSERT INTO comment_revisions')) {
          revisionRecorded = true
          return { rows: [{ id: 'rev-staff' }] }
        }
        if (text.includes('UPDATE comments')) {
          return { rows: [{ ...baseComment, body_raw: values?.[0], body_html: values?.[1] }] }
        }
        return { rows: [] }
      })

      const payload = mockPayloadWithQuery(query)
      const now = new Date(commentCreatedAt.getTime() + 45 * 60 * 1000) // 45 minutes later

      const res = await editThreadComment(payload, {
        siteId,
        threadId,
        commentId: 'comment-edit-1',
        newBody: '<p>Moderated content replaced by staff</p>',
        actor: staffActorWithModerate,
        reason: 'Violation of conduct policy',
        now,
      })

      expect(res).toBeDefined()
      expect(revisionRecorded).toBe(true)
    })
  })

  // =========================================================================
  // 5. Rate Limiting: 5 comments per rolling 60 seconds
  // =========================================================================
  describe('5. Rolling 60-Second Comment Rate Limiting', () => {
    it('allows 5 comments within 60 seconds, rejects the 6th with 429', () => {
      const testMember = 'rate-test-member-001'
      const baseTime = Date.now()

      // 1st comment: allowed
      expect(consumeCommentRateLimit(testMember, baseTime).allowed).toBe(true)
      // 2nd comment: allowed
      expect(consumeCommentRateLimit(testMember, baseTime + 5_000).allowed).toBe(true)
      // 3rd comment: allowed
      expect(consumeCommentRateLimit(testMember, baseTime + 10_000).allowed).toBe(true)
      // 4th comment: allowed
      expect(consumeCommentRateLimit(testMember, baseTime + 15_000).allowed).toBe(true)
      // 5th comment: allowed
      expect(consumeCommentRateLimit(testMember, baseTime + 20_000).allowed).toBe(true)

      // 6th comment: REJECTED
      const sixth = consumeCommentRateLimit(testMember, baseTime + 25_000)
      expect(sixth.allowed).toBe(false)
      expect(sixth.retryAfter).toBeGreaterThan(0)
    })

    it('postThreadComment throws CommentComposerError 429 on 6th comment', async () => {
      const query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('INSERT INTO comments')) {
          return { rows: [{ id: 'c-new', body_raw: values?.[6] }] }
        }
        return { rows: [] }
      })
      const payload = mockPayloadWithQuery(query)

      const testMember = 'rate-test-member-002'
      const baseTime = Date.now()

      for (let i = 1; i <= 5; i++) {
        const res = await postThreadComment(payload, {
          siteId,
          threadId,
          authorId: testMember,
          body: `Comment ${i}`,
          idempotencyKey: `rate-key-${i}`,
          now: new Date(baseTime + i * 1000),
        })
        expect(res.comment).toBeDefined()
      }

      // 6th comment throws
      await expect(
        postThreadComment(payload, {
          siteId,
          threadId,
          authorId: testMember,
          body: 'Comment 6',
          idempotencyKey: 'rate-key-6',
          now: new Date(baseTime + 10_000),
        }),
      ).rejects.toMatchObject({
        status: 429,
        code: 'COMMENT_RATE_LIMITED',
      })
    })
  })

  // =========================================================================
  // 6. HTTP Route Handlers
  // =========================================================================
  describe('6. HTTP Route Handlers', () => {
    it('POST /api/v1/sites/:site_id/threads/:thread_id/comments requires Idempotency-Key', async () => {
      const { POST } = await import(
        '@/app/(frontend)/api/v1/sites/[site_id]/threads/[thread_id]/comments/route'
      )

      const req = new Request(`http://localhost/api/v1/sites/${siteId}/threads/${threadId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Hello world' }),
      })

      const res = await POST(req, {
        params: Promise.resolve({ site_id: siteId, thread_id: threadId }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    })

    it('POST /api/v1/sites/:site_id/threads/:thread_id/comments rejects empty body', async () => {
      const { POST } = await import(
        '@/app/(frontend)/api/v1/sites/[site_id]/threads/[thread_id]/comments/route'
      )

      const req = new Request(`http://localhost/api/v1/sites/${siteId}/threads/${threadId}/comments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'idem-test-empty',
          'x-member-id': authorId,
        },
        body: JSON.stringify({ body: '   ' }),
      })

      const res = await POST(req, {
        params: Promise.resolve({ site_id: siteId, thread_id: threadId }),
      })

      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.error?.code).toBe('EMPTY_COMMENT_BODY')
    })
  })
})
