import { isDiscoverable } from '../../collections/canonical-shared'

export type TimelineEventRow = {
  membershipId: string
  timelineId: string
  eventId: string
  eventTitle: string
  canonicalPath: string
  startsAt: string
  endsAt: string | null
  position: number
  eventCardVariant: string | null
  eventListVariant: string | null
  timelineEmbedVariant: string | null
  timelineBlockVariant: string | null
}

export type CapabilityState = { key: string; status: 'enabled' | 'disabled' }

export type RelationshipState = {
  subject: string
  object: string
  kind: string
  status: 'pending' | 'active' | 'blocked' | 'archived'
}

export function memberPublicationPath(slug: string): string {
  return `/blogs/${slug}`
}

export function categoryPath(parentPath: string | null, slug: string): string {
  const prefix = parentPath ? parentPath.replace(/\/$/, '') : '/categories'
  return `${prefix}/${slug}`
}

export function taxonomyRedirect(fromPath: string, toPath: string, reason: 'move' | 'rename') {
  if (fromPath === toPath) throw new Error('A taxonomy redirect must change the canonical path.')
  return { fromPath, toPath, reason }
}

export function assertAcyclicCategoryMove(
  categoryId: string,
  parentId: string | null,
  parentById: ReadonlyMap<string, string | null>,
): void {
  const visited = new Set<string>([categoryId])
  let currentId = parentId
  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('A category cannot be moved below one of its descendants.')
    }
    visited.add(currentId)
    currentId = parentById.get(currentId) ?? null
  }
}

export function isSpaceCapabilityEnabled(
  capabilities: readonly CapabilityState[],
  key: string,
): boolean {
  return capabilities.some(
    (capability) => capability.key === key && capability.status === 'enabled',
  )
}

export function canCreateInSpace(capabilities: readonly CapabilityState[], key: string): boolean {
  return isSpaceCapabilityEnabled(capabilities, key)
}

export function hasBlockPrecedence(
  relationships: readonly RelationshipState[],
  subject: string,
  object: string,
): boolean {
  return relationships.some(
    (relationship) =>
      relationship.kind === 'block' &&
      relationship.status === 'active' &&
      ((relationship.subject === subject && relationship.object === object) ||
        (relationship.subject === object && relationship.object === subject)),
  )
}

export function canCreateRelationship(
  relationships: readonly RelationshipState[],
  subject: string,
  object: string,
  kind: string,
): boolean {
  return kind !== 'block' && !hasBlockPrecedence(relationships, subject, object)
}

export function assertDiscussionShape(input: {
  kind: 'attached' | 'thread'
  attachedTo?: unknown
  forum?: unknown
}): void {
  if (input.kind === 'attached' && !input.attachedTo) {
    throw new Error('An attached discussion requires an article, media item, or album attachment.')
  }
  if (input.kind === 'thread' && !input.forum) {
    throw new Error('A standalone thread requires a forum.')
  }
}

export function assertCalendarRange(input: {
  startsAt: string | Date
  endsAt?: string | Date | null
  timeZone: string
}): void {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: input.timeZone })
  } catch {
    throw new Error('Calendar entries require a valid IANA timezone.')
  }
  if (input.endsAt && new Date(input.endsAt) < new Date(input.startsAt)) {
    throw new Error('A calendar entry cannot end before it starts.')
  }
}

export function discoverableRecords<T extends Record<string, unknown>>(
  records: readonly T[],
  now = new Date(),
): T[] {
  return records.filter((record) => isDiscoverable(record, now))
}
export type AuthorshipDisplay = { displayName: string; displayOrder: number; role?: string }

export function orderedAuthors(authors: readonly AuthorshipDisplay[]): AuthorshipDisplay[] {
  return [...authors].sort((a, b) => a.displayOrder - b.displayOrder)
}

export function publicSourceProjection<T extends Record<string, unknown>>(
  source: T,
): Omit<T, 'credibilityNotes' | 'editorialNotes'> {
  const publicSource = { ...source }
  delete publicSource.credibilityNotes
  delete publicSource.editorialNotes
  return publicSource
}

export async function queryTimelineEvents(
  queryable: { query: <T>(text: string, params: unknown[]) => Promise<{ rows: T[] }> },
  timelineId: string,
  now = new Date(),
): Promise<TimelineEventRow[]> {
  const result = await queryable.query<TimelineEventRow>(
    `SELECT
       tm.id AS "membershipId",
       tm.timeline_id AS "timelineId",
       e.id AS "eventId",
       COALESCE(tm.display_title, e.title) AS "eventTitle",
       e.canonical_path AS "canonicalPath",
       COALESCE(tm.display_starts_at, e.starts_at) AS "startsAt",
       COALESCE(tm.display_ends_at, e.ends_at) AS "endsAt",
       COALESCE(tm.position, 0) AS "position",
       e.event_card_variant AS "eventCardVariant",
       e.event_list_variant AS "eventListVariant",
       t.timeline_embed_variant AS "timelineEmbedVariant",
       t.timeline_block_variant AS "timelineBlockVariant"
     FROM timeline_memberships tm
     INNER JOIN timelines t ON t.id = tm.timeline_id
     INNER JOIN events e ON e.id = tm.event_id
     WHERE tm.timeline_id = $1
       AND (
         t.retention_hold <> 'none'
         OR t.retention_mode = 'permanent'
         OR (t.retention_mode = 'expire-at' AND t.retention_expires_at > $2)
         OR t.retention_mode = 'archive'
       )
       AND (
         e.retention_hold <> 'none'
         OR e.retention_mode = 'permanent'
         OR (e.retention_mode = 'expire-at' AND e.retention_expires_at > $2)
         OR e.retention_mode = 'archive'
       )
       AND t.retention_mode <> 'manual-burn'
       AND e.retention_mode <> 'manual-burn'
       AND t.retention_mode <> 'tombstone'
       AND e.retention_mode <> 'tombstone'
     ORDER BY COALESCE(tm.display_starts_at, e.starts_at), COALESCE(tm.position, 0), tm.created_at`,
    [timelineId, now.toISOString()],
  )

  return result.rows
}
