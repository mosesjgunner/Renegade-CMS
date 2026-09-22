'use client'

import React, { useState, useEffect, useCallback } from 'react'

import type { CommentNode } from '@/modules/community/thread-lifecycle'

interface CommentItem {
  id: string
  body: string
  createdAt: string
  parent?: string | null
  authorMember?: string
  authorProfile?: {
    displayName: string
    handle: string
    avatarUrl?: string | null
  }
  moderationState?: string
  tombstoneLabel?: string | null
  isTombstone?: boolean
  reactions?: Record<string, number>
  viewerReactions?: string[]
}

interface CommentSectionProps {
  attachedToId: string
  attachedToCollection?: 'content' | 'media-assets' | 'albums'
  canonicalPath: string
  title?: string
  siteId?: string
  initialComments?: Array<CommentItem | CommentNode | Record<string, unknown>>
}

export function CommentSection({
  attachedToId,
  attachedToCollection = 'content',
  canonicalPath,
  title = 'Discussion',
  siteId = 'default',
  initialComments,
}: CommentSectionProps) {
  const formattedInitial: CommentItem[] = (initialComments ?? []).map((c: any) => ({
    id: String(c.id),
    body: String(c.bodyHtml ?? c.bodyRaw ?? c.body ?? ''),
    createdAt: String(c.createdAt ?? c.created_at ?? new Date().toISOString()),
    parent: c.parentId ?? c.parent_id ?? c.parent ?? null,
    authorMember: c.authorId ?? c.author_id ?? c.authorMember,
    reactions: c.reactions ?? {},
  }))
  const [comments, setComments] = useState<CommentItem[]>(formattedInitial)
  const [loading, setLoading] = useState(initialComments === undefined)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Fetch current logged-in member
  useEffect(() => {
    let isMounted = true
    async function checkAuth() {
      try {
        const res = await fetch('/api/member-auth/me')
        if (res.ok) {
          const data = await res.json()
          if (isMounted && data.member?.id) {
            setCurrentMemberId(data.member.id)
          }
        }
      } catch {
        // anonymous viewer
      }
    }
    checkAuth()
    return () => {
      isMounted = false
    }
  }, [])

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/community/comments?attachedToId=${encodeURIComponent(attachedToId)}&siteId=${encodeURIComponent(siteId)}`,
      )
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments ?? [])
      }
    } catch {
      // silently ignore network failure on initial load
    } finally {
      setLoading(false)
    }
  }, [attachedToId, siteId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleSubmit = async (e: React.FormEvent, parentPostId?: string) => {
    e.preventDefault()
    const text = parentPostId ? replyText.trim() : commentText.trim()
    if (!text) return

    try {
      setSubmitting(true)
      setError(null)
      setSuccess(null)

      const res = await fetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          attachedToId,
          attachedToCollection,
          canonicalPath,
          title,
          body: text,
          parentPostId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to post comment')
      } else {
        if (parentPostId) {
          setReplyText('')
          setReplyingToId(null)
        } else {
          setCommentText('')
        }
        setSuccess('Comment posted successfully')
        fetchComments()
      }
    } catch {
      setError('An unexpected error occurred while posting')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveEdit = async (commentId: string) => {
    if (!editingText.trim()) return

    try {
      setActionLoading(true)
      setError(null)

      const res = await fetch('/api/community/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          commentId,
          body: editingText.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update comment')
      } else {
        setEditingCommentId(null)
        setEditingText('')
        fetchComments()
      }
    } catch {
      setError('Failed to update comment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return

    try {
      setActionLoading(true)
      setError(null)

      const res = await fetch('/api/community/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          commentId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to delete comment')
      } else {
        fetchComments()
      }
    } catch {
      setError('Failed to delete comment')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReaction = async (postId: string, emoji: string) => {
    try {
      const res = await fetch('/api/community/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          targetType: 'post',
          targetId: postId,
          emoji,
        }),
      })
      if (res.ok) {
        fetchComments()
      }
    } catch {
      // ignore
    }
  }

  const handleReport = async (postId: string) => {
    const reason = prompt('Please enter a reason for reporting this comment:')
    if (!reason) return

    try {
      const res = await fetch('/api/community/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          targetType: 'post',
          targetId: postId,
          reason,
        }),
      })
      if (res.ok) {
        alert('Thank you. The comment has been reported to moderators.')
      } else {
        const d = await res.json()
        alert(d.error || 'Failed to submit report')
      }
    } catch {
      alert('Failed to submit report')
    }
  }

  return (
    <section
      aria-label="Community Discussion"
      className="border-t border-stone-200 dark:border-stone-800 pt-8 mt-12 space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          Community Discussion ({comments.length})
        </h2>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-md bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm border border-red-200 dark:border-red-900"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="p-4 rounded-md bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-sm border border-green-200 dark:border-green-900"
        >
          {success}
        </div>
      )}

      {/* Post comment form */}
      <form onSubmit={(e) => handleSubmit(e)} className="space-y-3">
        <label htmlFor="comment-input" className="sr-only">
          Add to the discussion
        </label>
        <textarea
          id="comment-input"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Share your perspective or ask a question..."
          rows={3}
          className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
          disabled={submitting}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !commentText.trim()}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-colors shadow-sm"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      {/* Comments listing */}
      {loading ? (
        <div className="text-center py-8 text-stone-500 text-sm">Loading discussion...</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-stone-500 dark:text-stone-400 text-sm italic">
          No comments yet. Be the first to start the conversation!
        </div>
      ) : (
        <div className="space-y-4 divide-y divide-stone-100 dark:divide-stone-800">
          {comments.map((comment) => {
            const isAuthor = Boolean(
              currentMemberId &&
                comment.authorMember &&
                (comment.authorMember === currentMemberId ||
                  (typeof comment.authorMember === 'object' &&
                    (comment.authorMember as { id?: string }).id === currentMemberId)),
            )
            const isEditing = editingCommentId === comment.id

            return (
              <article
                key={comment.id}
                className={`pt-4 first:pt-0 space-y-2 ${comment.parent ? 'ml-6 pl-4 border-l-2 border-stone-200 dark:border-stone-800' : ''}`}
              >
                {comment.isTombstone ? (
                  <div className="py-2 text-sm italic text-stone-400 dark:text-stone-500 bg-stone-50/50 dark:bg-stone-900/30 px-3 rounded">
                    {comment.body}
                  </div>
                ) : (
                  <>
                    <header className="flex items-center justify-between text-xs text-stone-500">
                      <div className="flex items-center gap-2">
                        {comment.authorProfile?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={comment.authorProfile.avatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : null}
                        <span className="font-semibold text-stone-800 dark:text-stone-200">
                          {comment.authorProfile?.displayName || 'Community Member'}
                        </span>
                        {comment.authorProfile?.handle && (
                          <span className="text-stone-400">@{comment.authorProfile.handle}</span>
                        )}
                        <span>·</span>
                        <time dateTime={comment.createdAt}>
                          {new Date(comment.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </time>
                      </div>

                      <div className="flex items-center gap-3">
                        {isAuthor && !isEditing && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(comment.id)
                                setEditingText(comment.body)
                              }}
                              disabled={actionLoading}
                              className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment.id)}
                              disabled={actionLoading}
                              className="hover:text-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReport(comment.id)}
                          className="hover:text-red-500 transition-colors"
                          title="Report comment"
                        >
                          Report
                        </button>
                      </div>
                    </header>

                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(null)
                              setEditingText('')
                            }}
                            className="px-3 py-1 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(comment.id)}
                            disabled={actionLoading || !editingText.trim()}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-stone-800 dark:text-stone-200 whitespace-pre-line leading-relaxed">
                        {comment.body}
                      </div>
                    )}

                    <footer className="flex items-center gap-3 pt-1">
                      <div className="flex items-center gap-1.5">
                        {['👍', '❤️', '🔥', '👏'].map((emoji) => {
                          const hasReacted = comment.viewerReactions?.includes(emoji)
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleReaction(comment.id, emoji)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                                hasReacted
                                  ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold'
                                  : 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                              }`}
                            >
                              <span>{emoji}</span>
                              {comment.reactions?.[emoji] ? (
                                <span className="font-medium">{comment.reactions[emoji]}</span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToId(replyingToId === comment.id ? null : comment.id)
                          setReplyText('')
                        }}
                        className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 font-medium"
                      >
                        Reply
                      </button>
                    </footer>

                    {replyingToId === comment.id ? (
                      <form
                        onSubmit={(e) => handleSubmit(e, comment.id)}
                        className="mt-3 pl-3 border-l-2 border-red-400 space-y-2"
                      >
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a reply..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToId(null)
                              setReplyText('')
                            }}
                            className="px-3 py-1 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={submitting || !replyText.trim()}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            Post Reply
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

