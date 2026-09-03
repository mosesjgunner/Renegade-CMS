import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

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
  const [drafts, scheduled, published, redirects] = await Promise.all([
    payload.find({
      collection: 'content',
      where: { status: { in: ['draft', 'review', 'approved'] } },
      sort: '-updatedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never),
    payload.find({
      collection: 'content',
      where: { status: { equals: 'scheduled' } },
      sort: 'publishedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never),
    payload.find({
      collection: 'content',
      where: { status: { in: ['published', 'updated'] } },
      sort: '-publishedAt',
      limit: 5,
      depth: 0,
      req: initPageResult.req,
    } as never),
    payload.find({
      collection: 'public-redirects',
      where: { enabled: { equals: true } },
      limit: 1,
      depth: 0,
      req: initPageResult.req,
    } as never),
  ])
  const groups = [
    {
      title: 'Recent drafts',
      rows: drafts.docs as ContentRow[],
      empty: 'Start a post or page when you are ready.',
    },
    {
      title: 'Scheduled',
      rows: scheduled.docs as ContentRow[],
      empty: 'Nothing is scheduled. Choose a publish date to plan ahead.',
    },
    {
      title: 'Recently published',
      rows: published.docs as ContentRow[],
      empty: 'Published work will appear here with a direct public link.',
    },
  ]

  return (
    <main className="gutter--left gutter--right" style={{ maxWidth: 1120, margin: '0 auto' }}>
      <h1>Dashboard</h1>
      <p>Your publishing work, in one calm place.</p>
      <p>
        <Link href="/admin/collections/content/create?contentType=article">Write a post</Link> ·{' '}
        <Link href="/admin/collections/content/create?contentType=page">Create a page</Link> ·{' '}
        <Link href="/admin/collections/media-assets/create">Add media</Link> ·{' '}
        <Link href="/admin/navigation">Edit menus</Link>
      </p>
      <section aria-label="Setup progress" style={{ marginTop: 28 }}>
        <h2>Setup progress</h2>
        <p>
          {published.docs.length
            ? 'Your site has published content.'
            : 'Publish your first item to make the site feel lived in.'}{' '}
          <Link href="/admin/globals/site-settings">Review Site Settings</Link> and{' '}
          <Link href="/admin/navigation">add a menu</Link> before sharing the site.
        </p>
      </section>
      {groups.map((group) => (
        <section key={group.title} style={{ marginTop: 28 }}>
          <h2>{group.title}</h2>
          {group.rows.length ? (
            <ul>
              {group.rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/collections/content/${row.id}`}>{label(row)}</Link> —{' '}
                  {row.status ?? 'draft'} · {date(row.publishedAt ?? row.updatedAt)}
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
            <p>{group.empty}</p>
          )}
        </section>
      ))}
      <section style={{ marginTop: 28 }}>
        <h2>Needs attention</h2>
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
