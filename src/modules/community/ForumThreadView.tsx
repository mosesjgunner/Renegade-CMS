'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { discussionRows } from './discussion-tree'

function csrfHeader(): Record<string, string> {
  const token = document.cookie
    .split('; ')
    .find((part) => part.startsWith('renegade-member-csrf='))
    ?.split('=')[1]
  return token ? { 'x-member-csrf': decodeURIComponent(token) } : {}
}

export type ForumPostData = {
  id: string
  body: string
  displayOrder: number
  createdAt: string
  authorMember?: { id?: string; displayName?: string; handle?: string } | string | null
  authorGuest?: { name?: string } | null
  authorProfile?: { displayName?: string; handle?: string } | null
  parent?: string | null
  moderationState?: string
  isTombstone?: boolean
}

export function ForumThreadView({
  siteId,
  discussionId,
  isLocked,
  initialPosts,
  actorMemberId,
  canModerate = false,
  pinned = false,
  commentsPolicy = 'open',
  initialHasNextPage = false,
}: {
  siteId: string
  discussionId: string
  isLocked: boolean
  initialPosts: ForumPostData[]
  actorMemberId?: string
  canModerate?: boolean
  pinned?: boolean
  commentsPolicy?: string
  initialHasNextPage?: boolean
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [posts, setPosts] = useState<ForumPostData[]>(initialPosts)
  const [replyBody, setReplyBody] = useState('')
  const [replyParent, setReplyParent] = useState<string | null>(null)
  const [replying, setReplying] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reactions, setReactions] = useState<Record<string, { count: number; active: boolean }>>({})
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage)
  const [editing, setEditing] = useState<string | null>(null)
  const [editedBody, setEditedBody] = useState('')
  const [moderationReason, setModerationReason] = useState('')
  const closed = isLocked || commentsPolicy === 'closed'

  async function refreshPosts(nextPage = 1) {
    const response = await fetch(
      `/api/community/posts?siteId=${siteId}&discussionId=${discussionId}&page=${nextPage}`,
    )
    if (!response.ok) throw new Error('Could not load discussion. Please retry.')
    const result = await response.json()
    setPosts((previous) =>
      nextPage === 1
        ? (result.posts ?? [])
        : [...previous, ...(result.posts ?? [])].filter(
            (item, index, all) => all.findIndex((entry) => entry.id === item.id) === index,
          ),
    )
    setPage(nextPage)
    setHasNextPage(Boolean(result.hasNextPage))
  }

  async function mutate(path: string, method: string, data: Record<string, unknown>) {
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({ siteId, ...data }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Discussion update failed')
      setStatusMessage('Saved.')
      setEditing(null)
      await refreshPosts()
      router.refresh()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Discussion update failed')
    }
  }

  async function handleReply(e: FormEvent) {
    e.preventDefault()
    if (!replyBody.trim()) return
    setReplying(true)
    setStatusMessage('Posting reply…')

    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({
          siteId,
          discussionId,
          body: replyBody.trim(),
          parentPostId: replyParent ?? undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatusMessage(data.error ?? 'Could not post reply.')
        setReplying(false)
        return
      }

      setReplyBody('')
      setReplyParent(null)
      setStatusMessage('Reply posted.')
      setReplying(false)

      await refreshPosts()
    } catch {
      setStatusMessage('Network error posting reply.')
      setReplying(false)
    }
  }

  async function toggleReaction(postId: string, emoji: string = 'thumbs_up') {
    try {
      const res = await fetch('/api/community/reactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({
          siteId,
          targetType: 'post',
          targetId: postId,
          emoji,
        }),
      })
      if (res.ok) {
        setReactions((prev) => {
          const current = prev[postId] ?? { count: 0, active: false }
          return {
            ...prev,
            [postId]: {
              count: current.active ? Math.max(0, current.count - 1) : current.count + 1,
              active: !current.active,
            },
          }
        })
      }
    } catch {
      // Ignored
    }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault()
    if (!reportingPostId || !reportReason) return

    try {
      const res = await fetch('/api/community/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeader() },
        body: JSON.stringify({
          siteId,
          targetType: 'post',
          targetId: reportingPostId,
          reason: reportReason,
          details: reportDetails,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatusMessage('Report submitted to moderators.')
        setReportingPostId(null)
        setReportReason('')
        setReportDetails('')
      } else {
        setStatusMessage(data.error ?? 'Could not submit report.')
      }
    } catch {
      setStatusMessage('Network error submitting report.')
    }
  }

  return (
    <fieldset
      disabled={!ready}
      aria-label="Topic discussion"
      className="space-y-6 min-w-0 border-0 p-0"
    >
      {canModerate ? (
        <section aria-label="Topic moderation" className="space-y-2 rounded border p-4">
          <label>
            Moderation reason
            <input
              className="form-input"
              value={moderationReason}
              onChange={(event) => setModerationReason(event.target.value)}
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={!moderationReason.trim()}
              onClick={() =>
                void mutate('/api/community/threads', 'PATCH', {
                  discussionId,
                  pinned: !pinned,
                  reason: moderationReason,
                })
              }
            >
              {pinned ? 'Unpin topic' : 'Pin topic'}
            </button>
            <button
              type="button"
              disabled={!moderationReason.trim()}
              onClick={() =>
                void mutate('/api/community/threads', 'PATCH', {
                  discussionId,
                  status: isLocked ? 'open' : 'locked',
                  reason: moderationReason,
                })
              }
            >
              {isLocked ? 'Unlock topic' : 'Lock topic'}
            </button>
            <button
              type="button"
              disabled={!moderationReason.trim()}
              onClick={() =>
                void mutate('/api/community/threads', 'PATCH', {
                  discussionId,
                  commentsPolicy: commentsPolicy === 'closed' ? 'open' : 'closed',
                  reason: moderationReason,
                })
              }
            >
              {commentsPolicy === 'closed' ? 'Open replies' : 'Close replies'}
            </button>
          </div>
        </section>
      ) : null}
      {statusMessage ? (
        <p role="status" className="text-sm font-medium text-stone-600 dark:text-stone-300">
          {statusMessage}
        </p>
      ) : null}

      <div className="space-y-4">
        {discussionRows(posts).map(({ post, depth }, idx) => {
          const author =
            post.authorProfile?.displayName ||
            post.authorProfile?.handle ||
            (typeof post.authorMember === 'object' && post.authorMember
              ? post.authorMember.displayName || post.authorMember.handle || 'Member'
              : post.authorGuest?.name ||
                (typeof post.authorMember === 'string'
                  ? `Member ${post.authorMember.slice(0, 8)}`
                  : 'Author'))

          const rx = reactions[post.id] ?? { count: 0, active: false }

          return (
            <article
              key={post.id}
              id={`post-${post.displayOrder || idx + 1}`}
              data-post-id={post.id}
              data-depth={depth}
              style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}
              className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm"
            >
              <header className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 text-xs text-stone-500">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-800 dark:text-stone-200">{author}</span>
                  <span>&middot;</span>
                  <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-stone-400">#{post.displayOrder || idx + 1}</span>
                  <button
                    type="button"
                    className="hover:underline text-stone-500"
                    onClick={() => setReportingPostId(reportingPostId === post.id ? null : post.id)}
                  >
                    Report
                  </button>
                </div>
              </header>

              <div className="mt-4 prose dark:prose-invert max-w-none text-sm text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
                {post.parent ? (
                  <p>
                    <a
                      href={`#post-${posts.find((item) => item.id === post.parent)?.displayOrder ?? ''}`}
                    >
                      Reply to earlier post
                    </a>
                  </p>
                ) : null}
                {editing === post.id ? (
                  <div>
                    <label>
                      Edit post
                      <textarea
                        className="form-input block w-full"
                        value={editedBody}
                        onChange={(event) => setEditedBody(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        void mutate('/api/community/comments', 'PATCH', {
                          commentId: post.id,
                          body: editedBody,
                        })
                      }
                    >
                      Save edit
                    </button>
                    <button type="button" onClick={() => setEditing(null)}>
                      Cancel edit
                    </button>
                  </div>
                ) : (
                  post.body
                )}
              </div>

              <footer className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {!closed && actorMemberId && !post.isTombstone ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setReplyParent(post.id)}
                    >
                      Reply
                    </button>
                  ) : null}
                  {(post.authorMember === actorMemberId || canModerate) && !post.isTombstone ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(post.id)
                          setEditedBody(post.body)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Delete this post?'))
                            void mutate('/api/community/comments', 'DELETE', { commentId: post.id })
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  {canModerate ? (
                    <label>
                      Post moderation
                      <select
                        aria-label={`Moderation for post ${post.displayOrder}`}
                        value={post.moderationState ?? 'clear'}
                        disabled={!moderationReason.trim()}
                        onChange={(event) =>
                          void mutate('/api/community/posts', 'PATCH', {
                            postId: post.id,
                            moderationState: event.target.value,
                            reason: moderationReason,
                          })
                        }
                      >
                        <option value="clear">Published</option>
                        <option value="review">Pending review</option>
                        <option value="restricted">Restricted</option>
                        <option value="removed">Removed</option>
                      </select>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className={`btn btn-sm flex items-center gap-1 ${rx.active ? 'border-primary text-primary' : ''}`}
                    onClick={() => void toggleReaction(post.id, 'thumbs_up')}
                  >
                    <span>&hearts;</span>
                    <span>{rx.count > 0 ? rx.count : 'Like'}</span>
                  </button>
                </div>
              </footer>

              {reportingPostId === post.id ? (
                <form
                  onSubmit={submitReport}
                  className="mt-4 p-4 rounded-lg border bg-stone-50 dark:bg-stone-800/50 space-y-3"
                >
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                    Report Post #{post.displayOrder || idx + 1}
                  </h4>
                  <label className="block text-xs font-medium">
                    Reason
                    <select
                      className="form-input block w-full mt-1 text-sm"
                      required
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    >
                      <option value="">Select reason…</option>
                      <option value="spam">Spam or promotional</option>
                      <option value="harassment">Harassment or hate speech</option>
                      <option value="inappropriate">Inappropriate content</option>
                      <option value="misinformation">Misinformation</option>
                      <option value="other">Other policy violation</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium">
                    Details
                    <textarea
                      className="form-input block w-full mt-1 text-sm"
                      rows={2}
                      placeholder="Add brief details for moderators…"
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button className="btn btn-danger btn-sm" type="submit">
                      Submit Report
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setReportingPostId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          )
        })}
      </div>

      {hasNextPage ? (
        <button
          type="button"
          onClick={() =>
            void refreshPosts(page + 1).catch((error) => setStatusMessage(error.message))
          }
        >
          Load more posts
        </button>
      ) : null}
      {closed ? (
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-center text-sm text-stone-600 dark:text-stone-400">
          Replies are closed or locked by moderators.
        </div>
      ) : !actorMemberId ? (
        <p>
          <Link href="/member-auth">Sign in</Link> to reply.
        </p>
      ) : (
        <form
          onSubmit={handleReply}
          className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 shadow-sm space-y-4"
        >
          <h3 className="text-base font-semibold">Post a reply</h3>
          {replyParent ? (
            <p>
              Replying to post #{posts.find((post) => post.id === replyParent)?.displayOrder}{' '}
              <button type="button" onClick={() => setReplyParent(null)}>
                Cancel
              </button>
            </p>
          ) : null}
          <textarea
            className="form-input block w-full"
            rows={4}
            placeholder="Write your response…"
            required
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={replying}>
            {replying ? 'Posting reply…' : 'Submit Reply'}
          </button>
        </form>
      )}
    </fieldset>
  )
}
