import Link from 'next/link'
import type { Payload } from 'payload'
import { catalogLinksForSource } from './creator-release'

export async function CreatorCatalogLinks({
  payload,
  siteId,
  kind,
  id,
}: {
  payload: Payload
  siteId: string
  kind: Parameters<typeof catalogLinksForSource>[2]
  id: string
}) {
  const links = await catalogLinksForSource(payload, siteId, kind, id)
  if (!links.length) return null
  return (
    <nav aria-label="Creator releases">
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.id}>
            <Link className="underline" href={'/creator-release/' + link.id}>
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
