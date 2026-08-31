import type { RichTextDocument } from '../editorial/contracts'
import { EditorialConflictError, type EditorialActor } from '../editorial/workflow'
import { saveEditorialDraft } from '../editorial/persistence'
import { assertTeamPermission, type CollaborationStore, type TeamScope } from './service'

type RecordDoc = Record<string, unknown>

export type RealtimeEvent = {
  sequence: number
  kind: 'notification.created' | 'draft.checkpointed' | 'presence.changed'
  scope: TeamScope
  recipientMemberId?: string | null
  articleId?: string | null
  payload: Record<string, unknown>
  occurredAt: string
}

export type RealtimeTransport = {
  readonly name: string
  enabled(): boolean
  publish(event: RealtimeEvent): Promise<void>
}

/** Realtime is a replaceable hint transport. Business services only emit durable events. */
export class DisabledRealtimeTransport implements RealtimeTransport {
  readonly name = 'disabled'
  enabled() {
    return false
  }
  async publish(event: RealtimeEvent) {
    void event
  }
}

const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: string } | null)?.id ?? '')
const scopeKey = (scope: TeamScope) =>
  `${scope.kind}:${scope.kind === 'site' ? scope.siteId : scope.kind === 'publication' ? scope.publicationId : scope.spaceId}`
const scopeData = (scope: TeamScope) => ({
  scopeKind: scope.kind,
  site: scope.siteId,
  publication: scope.publicationId ?? null,
  space: scope.spaceId ?? null,
  scopeKey: scopeKey(scope),
})

export type RealtimeStore = CollaborationStore & {
  delete?(args: Record<string, unknown>): Promise<unknown>
}

export async function emitRealtimeEvent(
  store: RealtimeStore,
  event: Omit<RealtimeEvent, 'sequence'>,
) {
  return store.create({
    collection: 'realtime-events',
    overrideAccess: true,
    data: {
      ...scopeData(event.scope),
      kind: event.kind,
      recipientMember: event.recipientMemberId ?? null,
      article: event.articleId ?? null,
      payload: event.payload,
      occurredAt: event.occurredAt,
    },
  })
}

export function visibleRealtimeEvents(
  records: readonly RecordDoc[],
  memberId: string,
  afterSequence = 0,
): RecordDoc[] {
  return records
    .filter(
      (event) =>
        Number(event.sequence) > afterSequence &&
        (!event.recipientMember || id(event.recipientMember) === memberId),
    )
    .sort((left, right) => Number(left.sequence) - Number(right.sequence))
}

export async function heartbeatPresence(
  store: RealtimeStore,
  input: {
    memberId: string
    scope: TeamScope
    articleId: string
    clientId: string
    mode: 'viewing' | 'editing'
    ttlSeconds: number
    now?: Date
  },
) {
  await assertTeamPermission(store, input.memberId, input.scope, 'content.read')
  if (!/^[a-zA-Z0-9_-]{12,128}$/.test(input.clientId))
    throw new Error('Invalid presence client ID.')
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000).toISOString()
  const found = await store.find({
    collection: 'realtime-presence',
    overrideAccess: true,
    limit: 1,
    where: {
      and: [
        { member: { equals: input.memberId } },
        { article: { equals: input.articleId } },
        { clientId: { equals: input.clientId } },
      ],
    },
  })
  const data = {
    ...scopeData(input.scope),
    article: input.articleId,
    member: input.memberId,
    clientId: input.clientId,
    mode: input.mode,
    expiresAt,
    lastHeartbeatAt: now.toISOString(),
  }
  const record = found.docs[0]
  const result = record
    ? await store.update({
        collection: 'realtime-presence',
        id: id(record),
        overrideAccess: true,
        data,
      })
    : await store.create({ collection: 'realtime-presence', overrideAccess: true, data })
  await emitRealtimeEvent(store, {
    kind: 'presence.changed',
    scope: input.scope,
    articleId: input.articleId,
    payload: { memberId: input.memberId, mode: input.mode, expiresAt },
    occurredAt: now.toISOString(),
  })
  return result
}

export async function leavePresence(
  store: RealtimeStore,
  input: { memberId: string; scope: TeamScope; articleId: string; clientId: string; now?: Date },
) {
  const found = await store.find({
    collection: 'realtime-presence',
    overrideAccess: true,
    limit: 1,
    where: {
      and: [
        { member: { equals: input.memberId } },
        { article: { equals: input.articleId } },
        { clientId: { equals: input.clientId } },
      ],
    },
  })
  if (found.docs[0] && store.delete)
    await store.delete({
      collection: 'realtime-presence',
      id: id(found.docs[0]),
      overrideAccess: true,
    })
  await emitRealtimeEvent(store, {
    kind: 'presence.changed',
    scope: input.scope,
    articleId: input.articleId,
    payload: { memberId: input.memberId, left: true },
    occurredAt: (input.now ?? new Date()).toISOString(),
  })
}

export function activePresence(records: readonly RecordDoc[], now = new Date()): RecordDoc[] {
  return records.filter((entry) => new Date(String(entry.expiresAt)).getTime() > now.getTime())
}

export async function checkpointCollaborativeDraft(
  payload: Parameters<typeof saveEditorialDraft>[0],
  store: RealtimeStore,
  input: {
    memberId: string
    scope: TeamScope
    articleId: string
    actor: EditorialActor
    actorUserId: string
    document: RichTextDocument
    baseRevisionId: string
    mutationId: string
  },
) {
  await assertTeamPermission(store, input.memberId, input.scope, 'content.edit')
  try {
    const saved = await saveEditorialDraft(payload, input)
    const revisionId = id(
      (saved as RecordDoc).article && ((saved as RecordDoc).article as RecordDoc).currentRevision,
    )
    await emitRealtimeEvent(store, {
      kind: 'draft.checkpointed',
      scope: input.scope,
      articleId: input.articleId,
      payload: { revisionId, mutationId: input.mutationId },
      occurredAt: new Date().toISOString(),
    })
    return saved
  } catch (error) {
    if (error instanceof EditorialConflictError) throw error
    throw error
  }
}
