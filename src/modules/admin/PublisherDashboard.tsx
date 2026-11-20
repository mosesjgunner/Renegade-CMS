import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import {
  ActionLink,
  EmptyState,
  ErrorState,
  SectionHeader,
  StatusPill,
  WorkspaceHeader,
} from './primitives'

type ContentRow = {
  id: string
  title?: string
  status?: string
  canonicalPath?: string
  updatedAt?: string
  publishedAt?: string
}

const label = (row: ContentRow) => row.title?.trim() || 'Untitled draft'
const date = (value?: string) =>
  value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) : 'No date'

/** A deliberately small work queue: publishing tasks, not a database console. */
export default async function PublisherDashboard({ initPageResult }: AdminViewServerProps) {
  const payload = initPageResult.req.payload
  const [drafts, reviews, scheduled, published, redirects] = await Promise.all([
    payload.find({
      collection: 'content',
      where: { status: { in: ['draft', 'review', 'approved'] } },
      sort: '-updatedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never),
    payload.find({
      collection: 'content',
      where: { status: { equals: 'review' } },
      sort: '-updatedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never),
    payload.find({
      collection: 'content',
      where: { status: { equals: 'scheduled' } },
      sort: 'publishedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never),
    payload.find({
      collection: 'content',
      where: { status: { in: ['published', 'updated'] } },
      sort: '-publishedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never),
    payload.find({
      collection: 'public-redirects',
      where: { enabled: { equals: true } },
      limit: 1,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never),
  ])
  // The Studio door: only the shows this user may operate (the
  // collection's site-scoped access decides, via overrideAccess:false).
  // A failed shows query must never break the dashboard — no section.
  let podcastShows: { id: string; title?: string }[] = []
  try {
    const showsResult = await payload.find({
      collection: 'podcast-shows',
      sort: 'title',
      limit: 50,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never)
    podcastShows = (showsResult as { docs: { id: string; title?: string }[] }).docs
  } catch {
    podcastShows = []
  }
  // Designed next steps (UXI-06): link to the actual homepage layout
  // and the actual first draft when they exist — never placeholders.
  let homeLayoutId: string | null = null
  let firstDraftId: string | null = null
  try {
    const homeLayouts = await payload.find({
      collection: 'page-layouts',
      where: { path: { equals: '/' } },
      sort: '-updatedAt',
      limit: 1,
      depth: 0,
      req: initPageResult.req,
      overrideAccess: false,
    } as never)
    homeLayoutId = homeLayouts.docs[0] ? String(homeLayouts.docs[0].id) : null
    const firstDraft = drafts.docs.find((row) => (row as ContentRow).status === 'draft') as
      | ContentRow
      | undefined
    firstDraftId = firstDraft?.id ?? null
  } catch {
    homeLayoutId = null
    firstDraftId = null
  }
  const groups = [
    {
      title: `Waiting for review${reviews.totalDocs ? ` (${reviews.totalDocs})` : ''}`,
      rows: reviews.docs as ContentRow[],
      empty: 'Nothing is waiting for review.',
    },
    {
      title: `Recent drafts${drafts.totalDocs ? ` (${drafts.totalDocs})` : ''}`,
      rows: drafts.docs as ContentRow[],
      empty: 'Start a post or page when you are ready.',
    },
    {
      title: `Scheduled${scheduled.totalDocs ? ` (${scheduled.totalDocs})` : ''}`,
      rows: scheduled.docs as ContentRow[],
      empty: 'Nothing is scheduled. Choose a publish date to plan ahead.',
    },
    {
      title: `Recently published${published.totalDocs ? ` (${published.totalDocs})` : ''}`,
      rows: published.docs as ContentRow[],
      empty: 'Published work will appear here with a direct public link.',
    },
  ]

  return (
    <main className="gutter--left gutter--right" style={{ maxWidth: 1120, margin: '0 auto' }}>
      <WorkspaceHeader
        title="Dashboard"
        purpose="Your publishing work, in one calm place."
        actions={
          <>
            <ActionLink
              href="/admin/collections/content/create?contentType=article"
              intent="primary"
            >
              Write Article
            </ActionLink>{' '}
            <ActionLink href="/admin/collections/content/create?contentType=page">
              New Page
            </ActionLink>{' '}
            <ActionLink href="/admin/collections/media-assets/create">Upload Media</ActionLink>
          </>
        }
      />
      {published.docs.length ? (
        <details style={{ marginTop: 28 }}>
          <summary>Site setup and details</summary>
          <p>
            Your site has published content.{' '}
            <Link href="/admin/globals/site-settings">Review Site Settings</Link> and{' '}
            <Link href="/admin/navigation">edit menus</Link> when you need them.
          </p>
        </details>
      ) : (
        <section aria-label="Setup progress" style={{ marginTop: 28 }}>
          <SectionHeader>Setup progress</SectionHeader>
          <p>
            Publish your first item to make the site feel lived in.{' '}
            <Link href="/admin/globals/site-settings">Review Site Settings</Link> and{' '}
            <Link href="/admin/navigation">add a menu</Link> before sharing the site.
          </p>
        </section>
      )}
      {homeLayoutId || firstDraftId ? (
        <section aria-label="Next steps" style={{ marginTop: 28 }}>
          <SectionHeader>Next steps</SectionHeader>
          <p>
            {homeLayoutId ? (
              <>
                <ActionLink href={`/builder/${homeLayoutId}`} intent="primary">
                  Edit your homepage
                </ActionLink>{' '}
              </>
            ) : null}
            {firstDraftId ? (
              <ActionLink href={`/admin/collections/content/${firstDraftId}`}>
                Write your first post
              </ActionLink>
            ) : (
              <ActionLink href="/admin/collections/content/create?contentType=article">
                Write your first post
              </ActionLink>
            )}
          </p>
        </section>
      ) : null}
      {podcastShows.length ? (
        <section aria-label="Podcast studio" style={{ marginTop: 28 }}>
          <SectionHeader>Podcast studio</SectionHeader>
          <ul>
            {podcastShows.map((show) => (
              <li key={show.id}>
                {show.title?.trim() || 'Untitled show'}{' '}
                <ActionLink href={`/studio/${show.id}`}>Open Studio</ActionLink>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/admin/collections/podcast-shows">Manage podcast shows</Link>
          </p>
        </section>
      ) : null}
      {groups.map((group) => (
        <section key={group.title} style={{ marginTop: 28 }}>
          <SectionHeader>{group.title}</SectionHeader>
          {group.rows.length ? (
            <ul>
              {group.rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/collections/content/${row.id}`}>{label(row)}</Link>{' '}
                  <StatusPill
                    tone={
                      ['published', 'updated'].includes(row.status ?? '')
                        ? 'success'
                        : (row.status ?? 'draft') === 'scheduled'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {row.status ?? 'draft'}
                  </StatusPill>{' '}
                  · {date(row.publishedAt ?? row.updatedAt)}
                  {row.canonicalPath && ['published', 'updated'].includes(row.status ?? '') ? (
                    <>
                      {' '}
                      ·{' '}
                      <Link href={row.canonicalPath} target="_blank" rel="noreferrer">
                        View
                      </Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{group.empty}</EmptyState>
          )}
        </section>
      ))}
      <section style={{ marginTop: 28 }}>
        <SectionHeader>Needs attention</SectionHeader>
        <p>
          {redirects.docs.length
            ? 'Redirects are active. Review them after moving or renaming content.'
            : 'No active redirects. Renaming a published URL creates a safe redirect automatically.'}
        </p>
        <p>
          Operational and optional capability failures are available to authorized owners in the{' '}
          <Link href="/admin/capabilities">Capability Center</Link>.
        </p>
      </section>
    </main>
  )
}
