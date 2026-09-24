'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import type { TopicSort } from './forum-browsing'

export type ForumTopicSummary = {
  id: string
  title: string
  replyCount: number
  viewCount: number
  unread: boolean
  lastPostTimestamp?: string | null
}

/** Accessible browse control for a server-rendered topic list. Native controls retain keyboard support. */
export function ForumTopicBrowser({
  topics,
  topicHref = (topic) => `/forums/topics/${topic.id}`,
}: {
  topics: ForumTopicSummary[]
  topicHref?: (topic: ForumTopicSummary) => string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const sort = (params.get('sort') ?? 'latest_activity') as TopicSort
  const changeSort = (next: string) => {
    const query = new URLSearchParams(params.toString())
    query.set('sort', next)
    router.push(`?${query.toString()}`)
  }
  return (
    <section aria-labelledby="forum-topics-heading">
      <div>
        <h1 id="forum-topics-heading">Topics</h1>
        <label htmlFor="forum-topic-sort">Sort topics</label>
        <select
          id="forum-topic-sort"
          value={sort}
          onChange={(event) => changeSort(event.target.value)}
        >
          <option value="latest_activity">Latest activity</option>
          <option value="creation_date">Creation date</option>
          <option value="most_replies">Most replies</option>
          <option value="unanswered">Unanswered</option>
        </select>
      </div>
      <p aria-live="polite">{topics.length} topics</p>
      <ul aria-label="Forum topics">
        {topics.map((topic) => (
          <li key={topic.id}>
            <a href={topicHref(topic)}>
              {topic.unread ? <span aria-label="Unread topic">New: </span> : null}
              {topic.title}
            </a>
            <span>
              {topic.replyCount} replies · {topic.viewCount} views
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
