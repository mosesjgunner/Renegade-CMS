import config from '@payload-config'
import { getPayload } from 'payload'
import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { communitySiteForHost } from '@/modules/community/site-scope'
import {
  creatorWorkspace,
  createCreatorSpace,
  readCreatorDraft,
  saveCreatorDraft,
  saveCreatorSpace,
} from '@/modules/creator-studio/workspace'

async function context(request: Request) {
  const payload = await getPayload({ config })
  const memberId = await currentMember(payload as never, readMemberSession(request.headers))
  if (!memberId) return null
  const siteId = await communitySiteForHost(payload, request.headers.get('host'))
  return { payload, memberId, siteId }
}

const noStore = { 'cache-control': 'private, no-store' }
export async function GET(request: Request) {
  try {
    const actor = await context(request)
    if (!actor)
      return Response.json({ error: 'Sign in required.' }, { status: 401, headers: noStore })
    const draftId = new URL(request.url).searchParams.get('draft')
    const data = draftId
      ? await readCreatorDraft(actor.payload, { ...actor, draftId })
      : await creatorWorkspace(actor.payload, actor.siteId, actor.memberId)
    return Response.json(data, { headers: noStore })
  } catch {
    return Response.json({ error: 'Studio unavailable.' }, { status: 403, headers: noStore })
  }
}

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token.' }, { status: 403, headers: noStore })
  try {
    const actor = await context(request)
    if (!actor)
      return Response.json({ error: 'Sign in required.' }, { status: 401, headers: noStore })
    const data = await request.json()
    if (data.action === 'create-space') {
      const id = await createCreatorSpace(actor.payload, actor.siteId, actor.memberId)
      return Response.json({ id }, { headers: noStore })
    }
    if (
      data.action === 'save-space' &&
      typeof data.spaceId === 'string' &&
      typeof data.description === 'string'
    ) {
      await saveCreatorSpace(actor.payload, {
        ...actor,
        spaceId: data.spaceId,
        description: data.description,
      })
      return Response.json({ saved: true }, { headers: noStore })
    }
    if (
      data.action !== 'save-draft' ||
      typeof data.spaceId !== 'string' ||
      typeof data.title !== 'string' ||
      typeof data.text !== 'string' ||
      (data.draftId !== undefined && typeof data.draftId !== 'string')
    )
      return Response.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
    const draft = await saveCreatorDraft(actor.payload, {
      ...actor,
      spaceId: data.spaceId,
      draftId: data.draftId,
      title: data.title,
      text: data.text,
    })
    return Response.json({ id: draft.id }, { headers: noStore })
  } catch {
    return Response.json(
      { error: 'Could not save. Check your access and try again.' },
      { status: 403, headers: noStore },
    )
  }
}
