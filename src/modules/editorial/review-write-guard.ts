import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeOperationHook,
} from 'payload'
import { sql } from '@payloadcms/db-postgres'

/** Native forms and workflow commands share the canonical row and revision index. */
export const guardEditorialReviewWrite: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  if (!req.user) return data
  const transactionID = await req.transactionID
  if (operation === 'update' && transactionID) {
    const db = req.payload.db as unknown as {
      sessions: Record<
        string,
        { db: { execute: (query: unknown) => Promise<{ rows: Array<{ updated_at: string }> }> } }
      >
    }
    const result = await db.sessions[transactionID].db.execute(
      sql`SELECT updated_at FROM content WHERE id = ${originalDoc.id}::uuid FOR UPDATE`,
    )
    const current = result.rows[0]
    if (
      current &&
      new Date(current.updated_at).getTime() !== new Date(originalDoc.updatedAt).getTime()
    ) {
      throw new APIError(
        'Another editor saved this content. Reload before saving your changes.',
        409,
      )
    }
  }
  if (req.context?.editorialWorkflowAction) return data
  if (
    data.auditMetadata !== undefined &&
    JSON.stringify(data.auditMetadata?.cmosWorkflow) !==
      JSON.stringify(originalDoc?.auditMetadata?.cmosWorkflow)
  ) {
    throw new APIError('Workflow history is managed by editorial actions.', 403)
  }
  if (
    data.status !== originalDoc?.status &&
    ['review', 'approved', 'rejected'].includes(String(data.status))
  ) {
    throw new APIError('Use the editorial review queue to submit or decide a review.', 403)
  }
  if (
    req.user.role === 'staff' &&
    data.status !== originalDoc?.status &&
    ['published', 'scheduled'].includes(String(data.status))
  ) {
    throw new APIError('Publisher permission is required.', 403)
  }
  if (
    originalDoc &&
    data.body &&
    JSON.stringify(data.body) !== JSON.stringify(originalDoc.body) &&
    ['approved', 'review', 'rejected'].includes(String(originalDoc.status))
  ) {
    data.status = 'draft'
  }
  return data
}

/** Serialize native saves with lock acquisition and workflow actions before lock checks. */
export const lockEditorialOperation: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (req.user && operation === 'update') {
    args.overrideLock = false
    const transactionID = await req.transactionID
    if ('id' in args && args.id && transactionID) {
      const db = req.payload.db as unknown as {
        sessions: Record<string, { db: { execute: (query: unknown) => Promise<unknown> } }>
      }
      await db.sessions[transactionID].db.execute(
        sql`SELECT id FROM content WHERE id = ${args.id}::uuid FOR UPDATE`,
      )
    }
  }
  return args
}
