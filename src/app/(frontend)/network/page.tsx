import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'

/** Optional, read-only network surface. Remote material stays attributed and is never local content. */
export default async function NetworkPage() {
  const app = loadConfig()
  if (!app.networking.enabled)
    return (
      <main className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold">Network connections are off</h1>
        <p className="mt-3 text-stone-600">
          This site works normally without connecting to other servers. An owner can enable this
          optional feature from the admin settings.
        </p>
      </main>
    )
  const payload = await getPayload({ config })
  const objects = await payload.find({
    collection: 'remote-objects',
    where: { visibility: { equals: 'visible' } },
    limit: 30,
    sort: '-updatedAt',
    depth: 1,
    overrideAccess: true,
  } as never)
  return (
    <main className="max-w-5xl mx-auto px-4 py-12 space-y-8">
      <header className="border-b pb-6">
        <h1 className="text-3xl font-bold">Network connections</h1>
        <p className="mt-2 text-stone-600">
          Optional references from other sites. They remain on their original server and are not
          editable in Renegade.
        </p>
      </header>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Remote references</h2>
        {objects.docs.length ? (
          (
            objects.docs as Array<{
              id: string
              reference?: { origin?: string; name?: string; summary?: string } | null
              actor?: { handle?: string } | string | null
              objectType?: string
              canonicalId?: string
            }>
          ).map((item) => {
            const ref = item.reference ?? {}
            const actor = typeof item.actor === 'object' ? item.actor : null
            return (
              <article key={item.id} className="surface-card p-5">
                <p className="text-xs text-stone-500">
                  From {actor?.handle ?? ref.origin ?? 'remote source'}
                </p>
                <h3 className="font-semibold mt-1">{ref.name || item.objectType}</h3>
                {ref.summary ? <p className="mt-2 text-sm text-stone-600">{ref.summary}</p> : null}
                <a
                  className="text-sm text-red-700 underline mt-3 inline-block"
                  href={item.canonicalId}
                  rel="nofollow noopener noreferrer"
                >
                  Open original source
                </a>
              </article>
            )
          })
        ) : (
          <p className="text-stone-600">No remote references have been saved.</p>
        )}
      </section>
      <aside className="text-sm text-stone-600 border-t pt-5">
        Follow, unfollow, inbox, delivery history, blocks, moderation notes, and audit history are
        available to authorized operators in{' '}
        <Link className="underline" href="/admin/collections/network-relationships">
          Network administration
        </Link>
        .
      </aside>
    </main>
  )
}
