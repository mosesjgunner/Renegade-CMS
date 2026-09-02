import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

export default async function PublishingCenter({ initPageResult, params }: AdminViewServerProps) {
  const kind = params?.segments?.[0] === 'pages' ? 'page' : 'article'
  const label = kind === 'page' ? 'Pages' : 'Posts'
  const noun = kind === 'page' ? 'Page' : 'Post'
  const result = await initPageResult.req.payload.find({
    collection: 'content',
    where: { contentType: { equals: kind } },
    depth: 0,
    limit: 50,
    req: initPageResult.req,
  } as never)
  return (
    <main className="gutter--left gutter--right">
      <h1>{label}</h1>
      <p>
        {kind === 'page'
          ? 'Create durable site pages with a hierarchy and template intent.'
          : 'Write and prepare publication posts with authors, taxonomy, media, and a release date.'}
      </p>
      <p>
        <Link href={`/admin/collections/content/create?contentType=${kind}`}>Create {noun}</Link>
      </p>
      {result.docs.length ? (
        <ul>
          {result.docs.map((doc: { id: string; title?: string }) => (
            <li key={doc.id}>
              <Link href={`/admin/collections/content/${doc.id}`}>
                {doc.title || `Untitled ${noun}`}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No {label.toLowerCase()} yet. Create your first {noun.toLowerCase()} to begin a draft.
        </p>
      )}
    </main>
  )
}
