'use client'

import { useState, type FormEvent } from 'react'

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
  moderationState?: string
}

export function ForumThreadView({
  siteId,
  discussionId,
  isLocked,
  initialPosts,
}: {
  siteId: string
  discussionId: string
  isLocked: boolean
  initialPosts: ForumPostData[]
}) {
  const [posts, setPosts] = useState<ForumPostData[]>(initialPosts)
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [reportingPostId, setReportingPostId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reactions, setReactions] = useState<Record<string, { count: number; active: boolean }>>({})

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
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatusMessage(data.error ?? 'Could not post reply.')
        setReplying(false)
        return
      }

      setReplyBody('')
      setStatusMessage('Reply posted.')
      setReplying(false)

      // Refresh posts list
      const fetchPosts = await fetch(
        `/api/community/posts?discussionId=${encodeURIComponent(discussionId)}`,
      )
      if (fetchPosts.ok) {
        const result = await fetchPosts.json()
        setPosts(result.posts ?? [])
      }
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
          targetType: 'forum_post',
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
    <div className="space-y-6">
      {statusMessage ? (
        <p role="status" className="text-sm font-medium text-stone-600 dark:text-stone-300">
          {statusMessage}
        </p>
      ) : null}

      <div className="space-y-4">
        {posts.map((post, idx) => {
          const author =
            typeof post.authorMember === 'object' && post.authorMember
              ? post.authorMember.displayName || post.authorMember.handle || 'Member'
              : post.authorGuest?.name ||
                (typeof post.authorMember === 'string'
                  ? `Member ${post.authorMember.slice(0, 8)}`
                  : 'Author')

          const rx = reactions[post.id] ?? { count: 0, active: false }

          return (
            <article
              key={post.id}
              id={`post-${post.displayOrder || idx + 1}`}
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
                {post.body}
              </div>

              <footer className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
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

      {isLocked ? (
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-center text-sm text-stone-600 dark:text-stone-400">
          This thread has been locked by moderators. Replies are disabled.
        </div>
      ) : (
        <form
          onSubmit={handleReply}
          className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 shadow-sm space-y-4"
        >
          <h3 className="text-base font-semibold">Post a reply</h3>
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
    </div>
  )
}
