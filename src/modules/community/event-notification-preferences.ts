import type { Payload } from 'payload'

export function relationshipNotificationKey(
  kind: string,
  reason?: string,
): 'follows' | 'mentions' | 'messages' | null {
  if (reason === 'mention' || /mention/i.test(kind)) return 'mentions'
  if (/follow/i.test(kind)) return 'follows'
  if (/^(message\.|conversation\.|direct_message\.)/.test(kind)) return 'messages'
  return null
}

/** Profiles belong to the global member identity; event site authorization is enforced by the caller. */
export async function eventNotificationEnabled(
  payload: Payload,
  memberId: string,
  kind: string,
  reason?: string,
) {
  const key = relationshipNotificationKey(kind, reason)
  if (!key) return true
  const result = await payload.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const profile = result.docs[0] as unknown as
    | { preferences?: { relationshipNotifications?: Record<string, unknown> } }
    | undefined
  return profile?.preferences?.relationshipNotifications?.[key] !== false
}
