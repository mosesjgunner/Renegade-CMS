import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { authorizeCreator } from './policy'

const relationId = (value: unknown) =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : String(value ?? '')

export async function creatorWorkspace(payload: Payload, siteId: string, memberId: string) {
  await authorizeCreator(payload, { siteId, memberId, capability: 'content.draft-own' })
  const profiles = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const profile = profiles.docs[0]
  if (!profile) throw new Error('Your member profile is unavailable.')
  const spaces = await payload.find({
    collection: 'spaces',
    where: { and: [{ site: { equals: siteId } }, { profile: { equals: profile.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const space = spaces.docs[0]
  if (!space) return { handle: profile.handle, space: null, drafts: [] }
  await authorizeCreator(payload, {
    siteId,
    memberId,
    capability: 'content.draft-own',
    spaceId: String(space.id),
  })
  const drafts = await payload.find({
    collection: 'content',
    where: {
      and: [
        { site: { equals: siteId } },
        { space: { equals: space.id } },
        { owner: { equals: memberId } },
        { status: { equals: 'draft' } },
      ],
    },
    sort: '-updatedAt',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return {
    handle: profile.handle,
    space: { id: space.id, description: space.creatorDescription ?? '' },
    drafts: drafts.docs
      .filter((doc) => doc.slug.startsWith('creator-'))
      .map((doc) => ({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt })),
  }
}

export async function saveCreatorSpace(
  payload: Payload,
  input: { siteId: string; memberId: string; spaceId: string; description: string },
) {
  await authorizeCreator(payload, { ...input, capability: 'space.manage-own' })
  const site = await payload.findByID({
    collection: 'sites',
    id: input.siteId,
    depth: 0,
    overrideAccess: true,
  })
  const policy = site.creatorPolicy as Record<string, unknown> | null
  if (policy?.selfServiceSpaces !== true || input.description.length > 2000)
    throw new Error('Space editing unavailable.')
  await payload.update({
    collection: 'spaces',
    id: input.spaceId,
    data: { creatorDescription: input.description },
    overrideAccess: true,
  })
}

export async function createCreatorSpace(payload: Payload, siteId: string, memberId: string) {
  await authorizeCreator(payload, { siteId, memberId, capability: 'space.manage-own' })
  const site = await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })
  const policy = site.creatorPolicy as Record<string, unknown> | null
  if (!policy || policy.selfServiceSpaces !== true)
    throw new Error('Space creation is not enabled for this site.')
  const profiles = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const profile = profiles.docs[0]
  if (!profile) throw new Error('Your member profile is unavailable.')
  const existing = await payload.find({
    collection: 'spaces',
    where: { and: [{ site: { equals: siteId } }, { profile: { equals: profile.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await authorizeCreator(payload, {
      siteId,
      memberId,
      capability: 'space.manage-own',
      spaceId: String(existing.docs[0].id),
    })
    return String(existing.docs[0].id)
  }
  try {
    const space = await payload.create({
      collection: 'spaces',
      data: {
        site: siteId,
        profile: profile.id,
        canonicalPath: `/members/${profile.handle}`,
        moderationState: 'clear',
      },
      overrideAccess: true,
    })
    return String(space.id)
  } catch (error) {
    const raced = await payload.find({
      collection: 'spaces',
      where: { and: [{ site: { equals: siteId } }, { profile: { equals: profile.id } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (!raced.docs[0]) throw error
    await authorizeCreator(payload, {
      siteId,
      memberId,
      capability: 'space.manage-own',
      spaceId: String(raced.docs[0].id),
    })
    return String(raced.docs[0].id)
  }
}

const lexical = (text: string) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

function simpleDraftText(doc: { slug?: string | null; body?: unknown }): string {
  if (!doc.slug?.startsWith('creator-')) throw new Error('Open this draft in the editorial editor.')
  const body = doc.body as {
    root?: {
      children?: Array<{
        type?: string
        children?: Array<{
          type?: string
          text?: string
          format?: number
          mode?: string
          style?: string
        }>
      }>
    }
  } | null
  const paragraphs = body?.root?.children
  if (
    !Array.isArray(paragraphs) ||
    paragraphs.some(
      (paragraph) =>
        paragraph.type !== 'paragraph' ||
        !Array.isArray(paragraph.children) ||
        paragraph.children.some(
          (node) =>
            node.type !== 'text' ||
            typeof node.text !== 'string' ||
            Boolean(node.format) ||
            (node.mode && node.mode !== 'normal') ||
            Boolean(node.style),
        ),
    )
  ) {
    throw new Error('Open this draft in the editorial editor.')
  }
  return paragraphs
    .map((paragraph) => paragraph.children!.map((node) => node.text).join(''))
    .join('\n')
}

export async function readCreatorDraft(
  payload: Payload,
  input: { siteId: string; memberId: string; draftId: string },
) {
  const doc = await payload.findByID({
    collection: 'content',
    id: input.draftId,
    depth: 0,
    overrideAccess: true,
  })
  const spaceId = relationId(doc.space)
  if (
    !spaceId ||
    relationId(doc.site) !== input.siteId ||
    relationId(doc.owner) !== input.memberId ||
    doc.status !== 'draft'
  )
    throw new Error('Draft unavailable.')
  await authorizeCreator(payload, { ...input, spaceId, capability: 'content.draft-own' })
  const text = simpleDraftText(doc)
  return { id: doc.id, spaceId, title: doc.title, text }
}

export async function saveCreatorDraft(
  payload: Payload,
  input: {
    siteId: string
    memberId: string
    spaceId: string
    draftId?: string
    title: string
    text: string
  },
) {
  const { siteId, memberId, spaceId } = input
  await authorizeCreator(payload, { siteId, memberId, capability: 'content.draft-own', spaceId })
  const title = input.title.trim()
  if (!title || title.length > 200 || input.text.length > 100000)
    throw new Error('Enter a title and a draft within the size limit.')
  if (input.draftId) {
    const doc = await payload.findByID({
      collection: 'content',
      id: input.draftId,
      depth: 0,
      overrideAccess: true,
    })
    if (
      relationId(doc.site) !== siteId ||
      relationId(doc.space) !== spaceId ||
      relationId(doc.owner) !== memberId ||
      doc.status !== 'draft'
    )
      throw new Error('Draft unavailable.')
    simpleDraftText(doc)
    return (await payload.update({
      collection: 'content',
      id: doc.id,
      data: { title, body: lexical(input.text) },
      context: { creatorDraftGuard: { siteId, memberId, spaceId, updatedAt: doc.updatedAt } },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }
  return (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      space: spaceId,
      owner: memberId,
      contentType: 'article',
      status: 'draft',
      visibility: 'private',
      title,
      slug: `creator-${randomUUID()}`,
      body: lexical(input.text),
    },
    overrideAccess: true,
  } as never)) as unknown as { id: string }
}
