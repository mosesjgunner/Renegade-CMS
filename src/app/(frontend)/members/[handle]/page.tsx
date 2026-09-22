import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import config from '@payload-config'
import { getPayload } from 'payload'

import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { loadProfileProjection, ProfileAccessError } from '@/modules/community/profile-projection'
import { ProfileRelationshipActions } from '@/modules/community/ProfileRelationshipActions'
import { communitySiteForHost } from '@/modules/community/site-scope'

export const dynamic = 'force-dynamic'

async function profileForRequest(handle: string) {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const siteId = await communitySiteForHost(payload, requestHeaders.get('host')).catch(() =>
    notFound(),
  )
  const viewerId = await currentMember(payload as never, readMemberSession(requestHeaders))
  try {
    return {
      ...(await loadProfileProjection(payload, handle, siteId, viewerId ?? undefined)),
      siteId,
      viewerId,
    }
  } catch (error) {
    if (error instanceof ProfileAccessError) notFound()
    throw error
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const { profile } = await profileForRequest(handle)
  return {
    title: `${profile.displayName} · Community`,
    description: profile.bio?.slice(0, 160),
    robots: { index: profile.discoverable, follow: profile.discoverable },
  }
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const { profile, redirected, siteId, viewerId } = await profileForRequest(handle)
  if (redirected) permanentRedirect(`/members/${profile.handle}`)
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      {profile.coverUrl ? (
        <img
          src={profile.coverUrl}
          alt={profile.coverAlt || ''}
          className="mb-6 aspect-[3/1] w-full rounded-lg object-cover"
        />
      ) : null}
      <h1 className="text-3xl font-bold">{profile.displayName}</h1>
      {profile.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt={profile.avatarAlt || `${profile.displayName}'s avatar`}
          className="mt-5 h-24 w-24 rounded-full object-cover"
        />
      ) : null}
      {profile.bio ? <p className="mt-4 whitespace-pre-wrap">{profile.bio}</p> : null}
      {profile.links?.length ? (
        <ul className="mt-6 grid gap-2">
          {profile.links.map(
            (link, index) =>
              link && (
                <li key={index}>
                  <a href={link.url} rel="noopener noreferrer me" target="_blank">
                    {link.label}
                  </a>
                </li>
              ),
          )}
        </ul>
      ) : null}
      {viewerId && viewerId !== profile.memberId ? (
        <ProfileRelationshipActions siteId={siteId} targetMemberId={profile.memberId} />
      ) : null}
    </main>
  )
}
