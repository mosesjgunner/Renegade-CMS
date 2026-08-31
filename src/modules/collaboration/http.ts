import type { Payload } from 'payload'

import type { TeamScope } from './service'

type Doc = Record<string, unknown>
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: string } | null)?.id ?? '')

export function memberFromUser(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const member = (user as Doc).member
  return member ? id(member) : null
}

export async function articleScope(payload: Payload, articleId: string): Promise<TeamScope> {
  const article = (await payload.findByID({
    collection: 'article-family-content',
    id: articleId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  const content = (await payload.findByID({
    collection: 'content',
    id: id(article.content),
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Doc
  const siteId = id(content.site)
  const publicationId = content.publication ? id(content.publication) : null
  const spaceId = content.space ? id(content.space) : null
  if (!siteId) throw new Error('Editorial content has no team scope.')
  if (spaceId) return { kind: 'space', siteId, publicationId, spaceId }
  if (publicationId) return { kind: 'publication', siteId, publicationId, spaceId: null }
  return { kind: 'site', siteId, publicationId: null, spaceId: null }
}

export function editorialActor(user: Record<string, unknown>) {
  const role = String(user.role)
  return {
    id: String(user.id),
    role: role === 'owner' || role === 'administrator' ? 'publisher' : 'editor',
  } as const
}

export function eventForSse(event: Doc) {
  return {
    sequence: Number(event.sequence),
    kind: String(event.kind),
    payload: event.payload ?? {},
    occurredAt: String(event.occurredAt),
  }
}
