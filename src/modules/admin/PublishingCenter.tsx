import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import styles from './PublishingCenter.module.css'
import ScheduleContentAction from './ScheduleContentAction'

type Row = {
  id: string
  title?: string | null
  status?: string | null
  canonicalPath?: string | null
  updatedAt?: string | null
}

export default async function PublishingCenter({ initPageResult, params }: AdminViewServerProps) {
  const kind = params?.segments?.[0] === 'pages' ? 'page' : 'article'
  const label = kind === 'page' ? 'Pages' : 'Posts'
  const noun = kind === 'page' ? 'Page' : 'Post'
  const basePath = kind === 'page' ? '/admin/pages' : '/admin/posts'
  const searchParams = new URL(initPageResult.req.url ?? basePath, 'http://localhost').searchParams
  const query = (searchParams.get('q') ?? '').trim().slice(0, 120)
  const allowedStatuses = [
    'draft',
    'review',
    'approved',
    'scheduled',
    'published',
    'updated',
    'archived',
    'rejected',
  ]
  const requestedStatus = searchParams.get('status') ?? ''
  const status = allowedStatuses.includes(requestedStatus) ? requestedStatus : ''
  const requestedPage = Number(searchParams.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const listUrl = (targetPage: number) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (status) params.set('status', status)
    if (targetPage > 1) params.set('page', String(targetPage))
    const suffix = params.toString()
    return suffix ? `${basePath}?${suffix}` : basePath
  }
  const result = await initPageResult.req.payload.find({
    collection: 'content',
    where: {
      and: [
        { contentType: { equals: kind } },
        ...(query ? [{ title: { contains: query } }] : []),
        ...(status ? [{ status: { equals: status } }] : []),
      ],
    },
    depth: 0,
    limit: 20,
    page,
    sort: '-updatedAt',
    req: initPageResult.req,
  } as never)
  const canSchedule = ['owner', 'administrator'].includes(String(initPageResult.req.user?.role))
  const approvedIds = canSchedule
    ? (result.docs as Row[]).filter((doc) => doc.status === 'approved').map((doc) => doc.id)
    : []
  const companions = approvedIds.length
    ? await initPageResult.req.payload.find({
        collection: 'article-family-content',
        where: { content: { in: approvedIds } },
        depth: 0,
        limit: 20,
        req: initPageResult.req,
      } as never)
    : { docs: [] }
  const companionByContent = new Map(
    (
      companions.docs as Array<{
        id: string
        content: string | { id: string }
        currentRevisionSequence?: number | null
      }>
    ).map((article) => [
      typeof article.content === 'string' ? article.content : article.content.id,
      article,
    ]),
  )

  return (
    <main className={`gutter--left gutter--right ${styles.main}`}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/admin">Dashboard</Link> <span aria-hidden="true">/</span> {label}
      </nav>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Publishing</p>
          <h1>{label}</h1>
          <p className={styles.description}>
            {kind === 'page'
              ? 'Create durable site pages with a hierarchy and template intent.'
              : 'Write and prepare publication posts with authors, taxonomy, media, and a release date.'}
          </p>
        </div>
        <Link
          className={styles.primaryAction}
          href={`/admin/collections/content/create?contentType=${kind}`}
        >
          Create {noun}
        </Link>
      </header>
      <section aria-label="Publishing steps" className={styles.guide}>
        <strong>From draft to public</strong>
        <p>
          Save your draft, then open its saved preview in the editor&apos;s SEO tab. Set the status
          to published and save when it is ready for visitors.
        </p>
      </section>
      <section aria-label={`${label} list`}>
        <div className={styles.listHeading}>
          <h2>All {label.toLowerCase()}</h2>
          <span>{result.totalDocs} found</span>
        </div>
        <form action={basePath} className={styles.filters} method="get" role="search">
          <label>
            Search {label.toLowerCase()}
            <input defaultValue={query} maxLength={120} name="q" type="search" />
          </label>
          <label>
            Status
            <select defaultValue={status} name="status">
              <option value="">All statuses</option>
              {allowedStatuses.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Apply filters</button>
          {(query || status) && <Link href={basePath}>Clear</Link>}
        </form>
        {result.docs.length ? (
          <ul className={styles.list}>
            {(result.docs as Row[]).map((doc) => (
              <li className={styles.row} key={doc.id}>
                <div>
                  <Link className={styles.title} href={`/admin/collections/content/${doc.id}`}>
                    {doc.title || `Untitled ${noun}`}
                  </Link>
                  <p className={styles.meta}>
                    <span className={styles.status}>{doc.status || 'draft'}</span>
                    {doc.updatedAt
                      ? ` · Updated ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(doc.updatedAt))}`
                      : null}
                  </p>
                </div>
                <div className={styles.rowActions}>
                  {doc.canonicalPath && ['published', 'updated'].includes(doc.status ?? '') ? (
                    <Link href={doc.canonicalPath} target="_blank" rel="noreferrer">
                      View public {noun.toLowerCase()}
                    </Link>
                  ) : null}
                  <Link href={`/admin/history?contentId=${encodeURIComponent(doc.id)}`}>
                    History
                  </Link>
                  {companionByContent.has(doc.id) && (
                    <ScheduleContentAction
                      articleId={companionByContent.get(doc.id)!.id}
                      sequence={companionByContent.get(doc.id)!.currentRevisionSequence ?? 1}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <strong>
              {query || status ? 'No matching content' : `No ${label.toLowerCase()} yet`}
            </strong>
            <p>
              {query || status
                ? 'Try another title or status, or clear the filters.'
                : `Create your first ${noun.toLowerCase()} to begin a draft.`}
            </p>
          </div>
        )}
        <nav aria-label={`${label} pages`} className={styles.pagination}>
          {result.hasPrevPage && <Link href={listUrl(page - 1)}>Previous</Link>}
          <span>
            Page {result.page} of {Math.max(result.totalPages, 1)}
          </span>
          {result.hasNextPage && <Link href={listUrl(page + 1)}>Next</Link>}
        </nav>
      </section>
    </main>
  )
}
