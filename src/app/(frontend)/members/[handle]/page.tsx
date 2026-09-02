import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MemberProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({ collection: 'profiles', where: { handle: { equals: handle.toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true } as never)
  const profile = result.docs[0] as unknown as Record<string, unknown> | undefined
  if (!profile || profile.visibility !== 'public') notFound()
  const links = Array.isArray(profile.links) ? profile.links : []
  return <main className="max-w-2xl mx-auto px-6 py-16"><h1 className="text-3xl font-bold">{String(profile.displayName)}</h1>{profile.bio ? <p className="mt-4 whitespace-pre-wrap">{String(profile.bio)}</p> : null}<ul className="mt-6">{links.map((link: unknown, index) => <li key={index}>{String(link)}</li>)}</ul></main>
}
