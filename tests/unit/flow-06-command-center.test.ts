import { describe, expect, it, beforeEach } from 'vitest'
import {
  createReviewComment,
  resolveReviewComment,
  markCommentAddressed,
  getCommentsForArticle,
  getUnresolvedComments,
  compareEditorialRevisions,
  clearCommentsStore,
} from '../../src/modules/editorial/comments'
import {
  BUILTIN_SIMPLE_WORKFLOW_TEMPLATE,
  CMoSWorkflowEngine,
  type WorkflowItem,
  type EditorialActor,
} from '../../src/modules/editorial/cmos-workflow'

describe('Workflow Pass FLOW-06 — Command Center & Multi-User Governance Unit Suite', () => {
  beforeEach(() => {
    clearCommentsStore()
  })

  describe('1. Editorial Review Comments Across Body, Media, SEO, and Layout', () => {
    it('creates targeted review comments across body, media, SEO, and layout with deep action links', () => {
      const c1 = createReviewComment({
        articleId: 'art-001',
        articleTitle: 'Autumn Campaign Feature',
        revisionSequence: 1,
        target: 'body',
        targetAnchor: 'para-3',
        authorId: 'editor-alex',
        authorName: 'Alex River',
        authorRole: 'editor',
        content: 'Please verify the campaign claims in paragraph 3.',
      })

      const c2 = createReviewComment({
        articleId: 'art-001',
        articleTitle: 'Autumn Campaign Feature',
        revisionSequence: 1,
        target: 'media',
        targetAnchor: 'hero-image',
        authorId: 'editor-alex',
        authorName: 'Alex River',
        authorRole: 'editor',
        content: 'Hero image needs high-contrast alt text and photographer credit.',
      })

      const c3 = createReviewComment({
        articleId: 'art-001',
        articleTitle: 'Autumn Campaign Feature',
        revisionSequence: 1,
        target: 'seo',
        authorId: 'editor-alex',
        authorName: 'Alex River',
        authorRole: 'editor',
        content: 'Meta description exceeds 160 characters; please condense.',
      })

      const c4 = createReviewComment({
        articleId: 'art-001',
        articleTitle: 'Autumn Campaign Feature',
        revisionSequence: 1,
        target: 'layout',
        authorId: 'editor-alex',
        authorName: 'Alex River',
        authorRole: 'editor',
        content: 'Campaign CTA button is misaligned in tablet viewport.',
      })

      expect(c1.status).toBe('open')
      expect(c1.directLink).toContain('/admin/workflow?tab=comments&articleId=art-001')
      expect(c1.directLink).toContain('focus=body')

      expect(c2.target).toBe('media')
      expect(c3.target).toBe('seo')
      expect(c4.target).toBe('layout')

      const unresolved = getUnresolvedComments({ articleId: 'art-001' })
      expect(unresolved).toHaveLength(4)

      // Mark c1 addressed by author
      markCommentAddressed(c1.id)
      const afterAddressed = getUnresolvedComments({ articleId: 'art-001' })
      expect(afterAddressed).toHaveLength(4) // Addressed is still open until resolved by reviewer

      // Resolve c1 by editor
      const resolved = resolveReviewComment(
        c1.id,
        { id: 'editor-alex', name: 'Alex River', role: 'editor' },
        'Verified updated claims.',
      )
      expect(resolved.status).toBe('resolved')
      expect(resolved.resolvedBy).toBe('Alex River')
      expect(resolved.resolutionNote).toBe('Verified updated claims.')

      const remainingUnresolved = getUnresolvedComments({ articleId: 'art-001' })
      expect(remainingUnresolved).toHaveLength(3)
    })
  })

  describe('2. Side-by-Side Revision Comparison Diffing', () => {
    it('accurately identifies structural diffs across title, summary, body, media, SEO, and layout', () => {
      const revA = {
        articleId: 'post-100',
        revisionSequence: 1,
        title: 'Original Draft Title',
        summary: 'Short draft summary.',
        body: 'Initial paragraph with placeholder information.',
        media: { heroImage: 'media-v1', altText: 'placeholder' },
        seoTitle: 'Draft Title',
        seoDescription: 'Draft Description',
        layout: { template: 'standard-article', slots: { sidebar: true } },
      }

      const revB = {
        articleId: 'post-100',
        revisionSequence: 2,
        title: 'Revised Canonical Title',
        summary: 'Comprehensive editorial summary addressing reviewer feedback.',
        body: 'Initial paragraph revised with verified data and campaign CTA.',
        media: { heroImage: 'media-v2', altText: 'Editorial photo by River Morgan' },
        seoTitle: 'Revised Canonical Title | Renegade',
        seoDescription: 'Optimized description for search discovery.',
        layout: { template: 'campaign-story', slots: { heroBanner: true } },
      }

      const diff = compareEditorialRevisions(revA, revB)

      expect(diff.overallChanged).toBe(true)
      expect(diff.titleChanged).toBe(true)
      expect(diff.summaryChanged).toBe(true)
      expect(diff.bodyChanged).toBe(true)
      expect(diff.mediaChanged).toBe(true)
      expect(diff.seoChanged).toBe(true)
      expect(diff.layoutChanged).toBe(true)
      expect(diff.differences).toHaveLength(6)

      const categories = diff.differences.map((d) => d.category)
      expect(categories).toContain('general')
      expect(categories).toContain('body')
      expect(categories).toContain('media')
      expect(categories).toContain('seo')
      expect(categories).toContain('layout')
    })
  })

  describe('3. Multi-User Role Permissions & Approval Staleness Invariant', () => {
    it('strictly enforces role boundaries and flags approval staleness on subsequent draft mutations', () => {
      const authorActor: EditorialActor = { id: 'author-river', role: 'author' }
      const editorActor: EditorialActor = { id: 'editor-alex', role: 'editor' }

      const initialItem: WorkflowItem = {
        id: 'item-200',
        siteId: 'site-demo',
        contentType: 'post',
        status: 'draft',
        templateId: BUILTIN_SIMPLE_WORKFLOW_TEMPLATE.id,
        assignment: {
          ownerId: 'author-river',
          editorId: 'editor-alex',
          reviewerIds: ['editor-alex'],
          dueDate: '2026-09-25T12:00:00.000Z',
          priority: 'high',
          watchers: [],
        },
        currentRevisionId: 'rev-item-200-1',
        currentRevisionSequence: 1,
        currentRevisionHash: 'sha256-rev1',
        latestPublishedRevisionId: null,
        staleApproval: false,
        staleReason: null,
        reviewDecisions: [],
        auditTrail: [],
        queueMembership: 'assigned',
        updatedAt: '2026-09-19T10:00:00.000Z',
      }

      const engine = new CMoSWorkflowEngine(initialItem)

      // Author submits for review
      engine.submitForReview(authorActor, { now: '2026-09-19T10:05:00.000Z' })
      expect(engine.getItem().status).toBe('review')

      // Author CANNOT self-approve (preventSelfApproval: true)
      expect(() => {
        engine.decideReview(authorActor, 'approved', 'Author self sign-off', {
          now: '2026-09-19T10:10:00.000Z',
        })
      }).toThrow()

      // Editor reviews and requests changes
      engine.decideReview(editorActor, 'changes-requested', 'Needs body clarification', {
        now: '2026-09-19T10:15:00.000Z',
      })
      expect(engine.getItem().status).toBe('changes-requested')

      // Author revises draft to revision sequence 2
      engine.markNewDraftSaved(authorActor, 2, 'sha256-rev2', { now: '2026-09-19T10:20:00.000Z' })
      expect(engine.getItem().currentRevisionSequence).toBe(2)

      // Author submits revision 2
      engine.submitForReview(authorActor, { now: '2026-09-19T10:25:00.000Z' })

      // Editor approves exact revision 2
      engine.decideReview(editorActor, 'approved', 'Looks great, approved!', {
        now: '2026-09-19T10:30:00.000Z',
      })
      expect(engine.getItem().status).toBe('approved')
      expect(engine.getItem().staleApproval).toBe(false)

      // Author makes an unexpected edit, saving revision 3 AFTER approval
      engine.markNewDraftSaved(authorActor, 3, 'sha256-rev3', { now: '2026-09-19T10:35:00.000Z' })
      const postEditItem = engine.getItem()

      // Invariant: Approval MUST be marked STALE
      expect(postEditItem.staleApproval).toBe(true)
      expect(postEditItem.staleReason).toContain(
        'New draft revision (seq #3) created after approval decision',
      )
      expect(postEditItem.status).toBe('updated')

      // Verify audit trail captures the staleness event (newest is first)
      const latestAudit = postEditItem.auditTrail[0]
      expect(latestAudit.action).toBe('workflow.draft_saved')
      expect(latestAudit.staleApproval).toBe(true)
      expect(latestAudit.targetRevisionSequence).toBe(3)
    })
  })
})
