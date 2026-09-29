import config from '@payload-config'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { canAccessAdminRole } from '@/modules/admin/access-policy'
import { canManageAdminSite, getAdminSiteIDs } from '@/modules/admin/site-access'
import { editorialSlug } from '@/modules/editorial/publishing-pass'
import {
  createEditorialArticle,
  createEditorialPreviewToken,
  decideEditorialReview,
  publishScheduledArticle,
  requestEditorialReview,
  saveEditorialDraft,
  scheduleEditorialPublication,
} from '@/modules/editorial/persistence'
import { importMarkdownToRichText } from '@/modules/editorial/markdown'
import type { EditorialActor } from '@/modules/editorial/workflow'
import { attachMediaToContent } from '@/modules/media/workflow'

export const runtime = 'nodejs'

type EditorialKind = 'article' | 'page'

const isKind = (value: unknown): value is EditorialKind => value === 'article' || value === 'page'

const textDocument = (body: string) => ({
  root: {
    type: 'root',
    children: body
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((text) => ({
        type: 'paragraph',
        children: [{ type: 'text', text, version: 1 }],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      })),
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

const bodyText = (body: unknown): string => {
  const walk = (node: unknown): string[] => {
    if (!node || typeof node !== 'object') return []
    const value = node as { text?: unknown; children?: unknown }
    return [
      typeof value.text === 'string' ? value.text : '',
      ...(Array.isArray(value.children) ? value.children : []).flatMap(walk),
    ]
  }
  return walk(body).join('').replace(/\s+/g, ' ').trim()
}

const idOf = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

const serialize = (doc: Record<string, unknown>) => ({
  id: String(doc.id),
  title: String(doc.title ?? ''),
  slug: String(doc.slug ?? ''),
  body: bodyText(doc.body),
  summary: String(doc.summary ?? ''),
  status: String(doc.status ?? 'draft'),
  canonicalPath: String(doc.canonicalPath ?? ''),
  updatedAt: String(doc.updatedAt ?? ''),
  heroMediaId: idOf(doc.heroMedia) || null,
})

// Staff administration and editorial authority are deliberately different.
// An administrator can review, but cannot schedule or publish; only an owner
// receives the publisher capability, and all transitions still pass workflow.
const editorialActorFor = (user: { id: unknown; role?: string | null }): EditorialActor => ({
  id: String(user.id),
  role: user.role === 'owner' ? 'publisher' : user.role === 'administrator' ? 'editor' : 'author',
})

async function authenticate(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !canAccessAdminRole(auth.user.role)) throw new Error('Unauthorized')
  return { payload, user: auth.user }
}

async function siteFor(
  payload: Awaited<ReturnType<typeof getPayload>>,
  user: { role?: string | null; adminSites?: unknown },
  requested: string | null,
) {
  if (requested) {
    if (!canManageAdminSite(user, requested)) throw new Error('Site access denied.')
    return requested
  }
  const allowed = user.role === 'staff' ? getAdminSiteIDs(user) : []
  const sites = await payload.find({
    collection: 'sites',
    where:
      user.role === 'staff'
        ? { and: [{ id: { in: allowed } }, { lifecycle: { equals: 'active' } }] }
        : { lifecycle: { equals: 'active' } },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const site = sites.docs[0]
  if (!site) throw new Error('Choose an assigned active site before authoring.')
  return String(site.id)
}

async function publicationFor(payload: Awaited<ReturnType<typeof getPayload>>, siteId: string) {
  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
    sort: '-createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return publications.docs[0] ? String(publications.docs[0].id) : undefined
}

export async function GET(request: Request) {
  try {
    const { payload, user } = await authenticate(request)
    const query = new URL(request.url).searchParams
    const kind = query.get('kind')
    if (!isKind(kind))
      return NextResponse.json({ error: 'A valid content kind is required.' }, { status: 400 })
    const siteId = await siteFor(payload, user, query.get('siteId'))
    const id = query.get('id')
    if (id) {
      const doc = (await payload
        .findByID({ collection: 'content', id, depth: 0, overrideAccess: true } as never)
        .catch(() => null)) as unknown as Record<string, unknown> | null
      if (!doc || doc.contentType !== kind || idOf(doc.site) !== siteId)
        return NextResponse.json({ error: 'Content not found.' }, { status: 404 })
      const companion = await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      const current = companion.docs[0] as unknown as Record<string, unknown> | undefined
      return NextResponse.json({
        content: {
          ...serialize(doc),
          body:
            typeof current?.plainTextProjection === 'string'
              ? current.plainTextProjection
              : bodyText(doc.body),
        },
        siteId,
      })
    }
    const result = await payload.find({
      collection: 'content',
      where: { and: [{ site: { equals: siteId } }, { contentType: { equals: kind } }] },
      sort: '-updatedAt',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
    return NextResponse.json({
      siteId,
      content: result.docs.map((doc) => serialize(doc as unknown as Record<string, unknown>)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Editorial content is unavailable.'
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 })
  }
}

export async function POST(request: Request) {
  try {
    const { payload, user } = await authenticate(request)
    const input = (await request.json()) as Record<string, unknown>
    const kind = input.kind
    if (!isKind(kind)) throw new Error('A valid content kind is required.')
    const siteId = await siteFor(
      payload,
      user,
      typeof input.siteId === 'string' ? input.siteId : null,
    )
    const action = String(input.action ?? 'save')
    const id = typeof input.id === 'string' ? input.id : ''

    if (!['save', 'request-review', 'approve', 'schedule', 'publish', 'preview'].includes(action))
      throw new Error('Invalid editorial action.')

    if (action === 'preview') {
      if (!id) throw new Error('Save this content before previewing it.')
      const content = (await payload
        .findByID({ collection: 'content', id, depth: 0, overrideAccess: true } as never)
        .catch(() => null)) as unknown as Record<string, unknown> | null
      if (!content || content.contentType !== kind || idOf(content.site) !== siteId)
        throw new Error('Content not found.')
      const companion = await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      if (!companion.docs[0]) throw new Error('Save body content before previewing it.')
      const token = await createEditorialPreviewToken(payload, {
        articleId: String(companion.docs[0].id),
        createdBy: String(user.id),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      return NextResponse.json({ previewUrl: `/preview/article/${token.token}` })
    }

    const title = typeof input.title === 'string' ? input.title.trim() : ''
    const body = typeof input.body === 'string' ? input.body.trim() : ''
    const requestedSlug = typeof input.slug === 'string' ? input.slug : title
    const slug = editorialSlug(requestedSlug)
    if (!title) throw new Error('Title is required.')
    if (!body) throw new Error('Body is required.')
    if (!slug) throw new Error('A valid URL slug is required.')
    if (title.length > 300) throw new Error('Title must be 300 characters or fewer.')
    if (body.length > 100_000) throw new Error('Body must be 100,000 characters or fewer.')
    const summary =
      typeof input.summary === 'string' && input.summary.trim()
        ? input.summary.trim()
        : body.slice(0, 160)
    const actor = editorialActorFor(user)
    const heroMediaId = typeof input.heroMediaId === 'string' ? input.heroMediaId : ''
    let content: Record<string, unknown>
    let scheduledKey: string | null = null
    if (id) {
      const current = (await payload
        .findByID({ collection: 'content', id, depth: 0, overrideAccess: true } as never)
        .catch(() => null)) as unknown as Record<string, unknown> | null
      if (!current || current.contentType !== kind || idOf(current.site) !== siteId)
        throw new Error('Content not found.')
      const companion = await payload.find({
        collection: 'article-family-content',
        where: { content: { equals: id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      const articleId = companion.docs[0] ? String(companion.docs[0].id) : ''
      if (!articleId) throw new Error('Editorial workflow record was not found.')
      // Attach before a transition so the publishing gate validates the same
      // media graph that will be exposed publicly.
      if (heroMediaId) {
        await attachMediaToContent(payload, user as never, {
          mediaId: heroMediaId,
          contentId: id,
          scope: { kind: 'site', siteId },
        })
      }
      const baseRevisionId = idOf(
        (companion.docs[0] as unknown as Record<string, unknown>).currentRevision,
      )
      if (action === 'save') {
        await saveEditorialDraft(payload, {
          articleId,
          actor,
          actorUserId: String(user.id),
          document: importMarkdownToRichText(body).document,
          baseRevisionId,
          mutationId: `admin:${user.id}:${id}:${Date.now()}`,
        })
      } else if (action === 'request-review') {
        await requestEditorialReview(payload, { articleId, actor, actorUserId: String(user.id) })
      } else if (action === 'approve') {
        await decideEditorialReview(payload, {
          articleId,
          actor,
          actorUserId: String(user.id),
          approved: 'approved',
        })
      } else if (action === 'schedule') {
        const scheduledFor = typeof input.scheduledFor === 'string' ? input.scheduledFor : ''
        if (!scheduledFor || Number.isNaN(Date.parse(scheduledFor)))
          throw new Error('A valid scheduled publication time is required.')
        scheduledKey =
          typeof input.idempotencyKey === 'string'
            ? input.idempotencyKey
            : `schedule:${id}:${scheduledFor}`
        await scheduleEditorialPublication(payload, {
          articleId,
          actor,
          actorUserId: String(user.id),
          scheduledFor,
          timeZone: typeof input.timeZone === 'string' ? input.timeZone : 'UTC',
          idempotencyKey: scheduledKey,
        })
      } else if (action === 'publish') {
        // A published record can be edited and re-published to commit its
        // metadata (including a new canonical slug). Its workflow transition
        // is already complete, so do not attempt to schedule it again.
        if (current.status === 'published') {
          // The content update below commits the edited fields and lets the
          // Content hook retain the former canonical path as a 308 redirect.
        } else {
          // "Publish now" still follows the same durable schedule contract as a
          // timed release. This prevents a UI-only shortcut from bypassing the
          // approval gate, while avoiding a dead Publish button for an approved
          // item that has not previously been put on the calendar.
          const key =
            typeof input.idempotencyKey === 'string' && input.idempotencyKey
              ? input.idempotencyKey
              : `publish-now:${id}:${Date.now()}`
          if (!input.idempotencyKey) {
            await scheduleEditorialPublication(payload, {
              articleId,
              actor,
              actorUserId: String(user.id),
              scheduledFor: new Date().toISOString(),
              timeZone: typeof input.timeZone === 'string' ? input.timeZone : 'UTC',
              idempotencyKey: key,
            })
          }
          await publishScheduledArticle(payload, {
            articleId,
            actor,
            actorUserId: String(user.id),
            idempotencyKey: key,
          })
        }
      }
      content = (await payload.update({
        collection: 'content',
        id,
        data: { title, slug, summary },
        overrideAccess: true,
      } as never)) as unknown as Record<string, unknown>
    } else {
      if (action !== 'save')
        throw new Error('Create a draft before requesting a workflow transition.')
      const publication = await publicationFor(payload, siteId)
      if (!publication) throw new Error('An active publication is required before authoring.')
      const bundle = await createEditorialArticle(payload, {
        contentType: kind,
        siteId,
        publicationId: publication,
        title,
        slug,
        summary,
        actor,
        actorUserId: String(user.id),
        document: importMarkdownToRichText(body).document,
      })
      content = bundle.content
      if (heroMediaId) {
        content = (await attachMediaToContent(payload, user as never, {
          mediaId: heroMediaId,
          contentId: String(content.id),
          scope: { kind: 'site', siteId },
        })) as unknown as Record<string, unknown>
      }
    }
    return NextResponse.json(
      { content: serialize(content), ...(scheduledKey ? { scheduledKey } : {}) },
      { status: id ? 200 : 201 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save content.' },
      { status: 400 },
    )
  }
}
