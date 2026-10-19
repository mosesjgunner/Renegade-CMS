import { APIError, type Payload, type CollectionBeforeChangeHook } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { checkOperatorRecordAccess } from '../operations/operator-grants'

const idOf = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String(value.id)
      : ''

/** Harden the existing Payload lock collection; retain its native editor heartbeat/release. */
export function configureEditorialLocks(payload: Payload) {
  const locks = payload.collections['payload-locked-documents']?.config
  if (!locks) return
  locks.access.create = async ({ req, data }) => {
    if (!req.user || idOf(data?.user?.value) !== String(req.user.id)) return false
    if (data?.document?.relationTo === 'content')
      return checkOperatorRecordAccess(payload, req.user, 'content', idOf(data.document.value))
    return ['owner', 'administrator', 'staff'].includes(String(req.user.role))
  }
  locks.access.update = locks.access.delete = ({ req }) =>
    req.user ? { 'user.value': { equals: req.user.id } } : false
  const guard: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
    if (!req.user) return data
    const document = data.document ?? originalDoc?.document
    if (document?.relationTo !== 'content') return data
    const id = idOf(document.value)
    if (!(await checkOperatorRecordAccess(payload, req.user, 'content', id)))
      throw new APIError('Staff site access required.', 403)
    const transactionID = await req.transactionID
    if (!transactionID) throw new APIError('Lock transaction unavailable.', 503)
    const db = payload.db as unknown as {
      sessions: Record<string, { db: { execute: (query: unknown) => Promise<unknown> } }>
    }
    await db.sessions[transactionID].db.execute(
      sql`SELECT id FROM content WHERE id = ${id}::uuid FOR UPDATE`,
    )
    const existing = await payload.find({
      collection: 'payload-locked-documents',
      where: {
        and: [
          { 'document.relationTo': { equals: 'content' } },
          { 'document.value': { equals: id } },
        ],
      },
      depth: 0,
      limit: 1,
      sort: '-updatedAt',
      overrideAccess: true,
      req,
    })
    const lock = existing.docs[0]
    if (
      lock &&
      idOf(lock.user?.value) !== String(req.user.id) &&
      Date.now() - new Date(lock.updatedAt).getTime() < 300000
    )
      throw new APIError('Another editor holds this document lock.', 409)
    if (data.user && idOf(data.user.value) !== String(req.user.id))
      throw new APIError('Cannot change the lock owner.', 403)
    return data
  }
  locks.hooks.beforeChange = [...(locks.hooks.beforeChange ?? []), guard]
}
