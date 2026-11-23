import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { creatorCatalogView } from '@/modules/creator-catalog/creator-release'
import { submissionActor } from '@/modules/creator-studio/submission-http'

export const dynamic = 'force-dynamic'

export default async function CreatorReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayload({ config })
  const request = new Request('http://localhost/creator-release', { headers: await headers() })
  const entry = await submissionActor(payload, request, false)
    .then((actor) => creatorCatalogView(payload, actor, id))
    .catch(() => null)
  if (!entry) notFound()
  const base = '/creator-release/' + entry.id + '/media/'
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-3xl font-bold">{entry.title}</h1>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Free trailer</h2>
        <video
          className="w-full"
          aria-label="Free trailer"
          controls
          preload="metadata"
          src={base + 'trailer'}
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Full recording</h2>
        <p>
          {entry.recordingAccess === 'member'
            ? 'Sign in with an active site membership.'
            : 'Purchase access and sign in to watch.'}
        </p>
        <a className="underline" href={base + 'recording'}>
          Play full recording
        </a>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Downloads and related products</h2>
        <ul className="space-y-2">
          {entry.products.map((product) => (
            <li key={product.id}>
              <Link className="underline" href={product.href}>
                {product.name}
              </Link>
            </li>
          ))}
          {entry.downloads.map((download) => (
            <li key={download.id}>
              <a
                className="underline"
                href={'/creator-release/' + entry.id + '/download/' + download.id}
              >
                Download {download.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
