import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'
import { communitySiteForHost } from '@/modules/community/site-scope'
import { ForumThreadView, type ForumPostData } from '@/modules/community/ForumThreadView'
import { resolveCommunityActor, listDiscussionComments } from '@/modules/community/service'
import { evaluateCommunityPolicy } from '@/modules/community/policy'

export const dynamic = 'force-dynamic'

async function resolveThread(forumSlug: string, topicSlug: string) {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(
    () => 'default',
  )

  const forumRes = await payload.find({
    collection: 'forums',
    where: { and: [{ site: { equals: siteId } }, { slug: { equals: forumSlug } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const forum = forumRes.docs[0]

  const canonical = `/forums/${forumSlug}/${topicSlug}`
  const discussion = (
    await payload.find({
      collection: 'discussions',
      where: {
        and: [
          { site: { equals: siteId } },
          { forum: { equals: forum?.id ?? '' } },
          { canonicalPath: { equals: canonical } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]

  if (!discussion) return null
  const actor = await resolveCommunityActor(payload, requestHeaders, siteId)
  if (
    !evaluateCommunityPolicy(
      { siteId, actor },
      {
        siteId,
        ownerId: String(discussion.owner ?? ''),
        visibility: String(discussion.visibility),
        moderationState: String(discussion.moderationState),
        status: String(discussion.status),
      },
      'read',
    ).allowed
  )
    return null
  const posts = await listDiscussionComments(payload, discussion.id, { siteId, actor })

  return {
    siteId,
    forum,
    discussion,
    posts: posts as unknown as ForumPostData[],
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ forumSlug: string; topicSlug: string }>
}): Promise<Metadata> {
  const { forumSlug, topicSlug } = await params
  const data = await resolveThread(forumSlug, topicSlug)
  if (!data) return { title: 'Thread Not Found' }
  return {
    title: `${data.discussion.title} · Community Forums`,
  }
}

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ forumSlug: string; topicSlug: string }>
}) {
  const { forumSlug, topicSlug } = await params
  const data = await resolveThread(forumSlug, topicSlug)
  if (!data) notFound()

  const { siteId, forum, discussion, posts } = data
  const isLocked = discussion.status === 'locked'

  return (
    <main className="container mx-auto max-w-4xl px-6 py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-stone-500">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/forums" className="hover:underline">
              Forums
            </Link>
          </li>
          <li aria-hidden="true">&rsaquo;</li>
          {forum ? (
            <>
              <li>
                <Link href={`/forums/${forum.slug}`} className="hover:underline">
                  {forum.name}
                </Link>
              </li>
              <li aria-hidden="true">&rsaquo;</li>
            </>
          ) : null}
          <li className="text-stone-800 dark:text-stone-200 font-medium truncate max-w-xs">
            {discussion.title}
          </li>
        </ol>
      </nav>

      <header className="mb-8 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{discussion.title}</h1>
          {isLocked ? (
            <span className="text-xs px-2.5 py-1 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium">
              Locked
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-xs text-stone-500 flex items-center gap-3">
          <span>Started {new Date(discussion.createdAt).toLocaleDateString()}</span>
          <span>&middot;</span>
          <span>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </span>
        </div>
      </header>

      <ForumThreadView
        siteId={siteId}
        discussionId={String(discussion.id)}
        isLocked={isLocked}
        initialPosts={posts}
      />
    </main>
  )
}
