import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export default async function VideoArchive() {
  const payload = await getPayload({ config })
  const videos = await payload.find({
    collection: 'videos' as never,
    where: { and: [{ status: { equals: 'published' } }, { visibility: { equals: 'public' } }] },
    sort: '-publishedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl font-bold">Videos</h1>
      <ul className="mt-8 space-y-4">
        {videos.docs.map((item) => (
          <li key={item.id}>
            <Link href={`/videos/${String((item as unknown as { slug: string }).slug)}`}>
              {String((item as unknown as { title: string }).title)}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
