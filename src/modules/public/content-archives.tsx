import type { Payload } from 'payload'
import Link from 'next/link'
import { canDiscoverPublic } from './contracts'

/** Global author identities are exposed only through this site's discoverable content. */
export async function loadContentArchive(payload: Payload, site: string, path: string) {
  const match = /^\/(authors|tags)\/([^/]+)$/.exec(path)
  if (!match) return null
  const collection = match[1] as 'authors' | 'tags'
  const result = await payload.find({
    collection,
    where: {
      and: [
        { slug: { equals: match[2] } },
        ...(collection === 'tags' ? [{ site: { equals: site } }] : []),
      ],
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const record = result.docs[0]
  if (!record) return null
  const content = await payload.find({
    collection: 'content',
    where: {
      and: [
        { site: { equals: site } },
        { [collection === 'authors' ? 'authors.author' : 'tags']: { equals: record.id } },
        { status: { in: ['published', 'updated'] } },
      ],
    },
    sort: '-publishedAt',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const articles = content.docs.filter((record) =>
    canDiscoverPublic({ ...record, removeFromDiscovery: record.removeFromDiscovery === true }),
  )
  if (!articles.length) return null
  return { title: 'displayName' in record ? record.displayName : record.name, articles }
}

export async function ContentArchiveLinks({
  payload,
  contentId,
}: {
  payload: Payload
  contentId: string
}) {
  const content = await payload.findByID({
    collection: 'content',
    id: contentId,
    depth: 1,
    overrideAccess: true,
  })
  const links: Array<{ path: string; name: string }> = []
  for (const entry of content.authors ?? []) {
    const author = entry.author
    if (author && typeof author === 'object')
      links.push({ path: `/authors/${author.slug}`, name: author.displayName })
  }
  for (const entry of content.tags ?? []) {
    if (entry && typeof entry === 'object')
      links.push({ path: `/tags/${entry.slug}`, name: entry.name })
  }
  for (const entry of content.categories ?? []) {
    if (entry && typeof entry === 'object' && entry.canonicalPath)
      links.push({ path: entry.canonicalPath, name: entry.name })
  }
  if (!links.length) return null
  return (
    <nav aria-label="Content archives" className="mx-auto max-w-4xl px-6 py-4 flex flex-wrap gap-4">
      {links.map((link) => (
        <Link key={link.path} href={link.path}>
          {link.name}
        </Link>
      ))}
    </nav>
  )
}
