import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { inspectMedia, mediaStorage, presignS3Put } from '../media/storage'
import { ConversationError } from './conversation-composer'

export const messageAttachmentMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const messageAttachmentMaxBytes = 10 * 1024 * 1024
export type MessageAttachmentStatus = 'pending_scan' | 'clean' | 'quarantined' | 'rejected'
type Query = <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>
type PoolPayload = Payload & { db?: { pool?: { query?: Query; connect?: () => Promise<{ query: Query; release?: () => void }> } } }
const safeFilename = (name: string) => name.replace(/[\u0000-\u001f\\/]/g, '_').trim().slice(0, 255)

export async function createMessageAttachmentPresign(payload: Payload, config: AppConfig, input: { siteId: string; memberId: string; filename: string; mimeType: string; size: number }) {
  if (!messageAttachmentMimeTypes.includes(input.mimeType as never)) throw new ConversationError('Attachment MIME type is not allowed.', 422, 'ATTACHMENT_MIME_NOT_ALLOWED')
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > messageAttachmentMaxBytes) throw new ConversationError('Attachments must be at most 10MB.', 413, 'ATTACHMENT_TOO_LARGE')
  const filename = safeFilename(input.filename)
  if (!filename) throw new ConversationError('Attachment filename is required.', 422, 'ATTACHMENT_FILENAME_REQUIRED')
  if (config.storage.driver !== 's3' || !config.storage.s3) throw new ConversationError('Direct attachment uploads require S3-compatible object storage.', 503, 'ATTACHMENT_STORAGE_UNAVAILABLE')
  const attachmentId = randomUUID(), key = `community/${input.siteId}/attachments/${attachmentId}`
  const signed = presignS3Put(config.storage.s3, key, input.mimeType)
  const query = (payload as PoolPayload).db?.pool?.query
  if (!query) throw new Error('Database query execution not available')
  await query('INSERT INTO message_attachments (id,site_id,owner_id,storage_key,original_filename,claimed_mime_type,byte_size,status,upload_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,\'pending_scan\',$8)', [attachmentId, input.siteId, input.memberId, key, filename, input.mimeType, input.size, signed.expiresAt])
  return { attachmentId, uploadUrl: signed.url, uploadHeaders: signed.headers, expiresAt: signed.expiresAt, status: 'pending_scan' as const }
}

export async function scanMessageAttachment(payload: Payload, config: AppConfig, attachmentId: string) {
  const query = (payload as PoolPayload).db?.pool?.query
  if (!query) throw new Error('Database query execution not available')
  const row = (await query<Record<string, unknown>>('SELECT * FROM message_attachments WHERE id=$1 FOR UPDATE', [attachmentId])).rows[0]
  if (!row || row.status !== 'pending_scan') return row?.status ?? 'missing'
  const bytes = await mediaStorage(config).get(String(row.storage_key))
  let status: MessageAttachmentStatus = 'clean'
  try {
    if (new Date(String(row.upload_expires_at)).getTime() < Date.now() || !bytes || bytes.byteLength !== Number(row.byte_size)) throw new Error('Missing, expired, or mismatched object')
    const inspection = inspectMedia(bytes)
    if (inspection.mimeType !== row.claimed_mime_type || !messageAttachmentMimeTypes.includes(inspection.mimeType as never)) throw new Error('MIME mismatch')
  } catch {
    status = 'rejected'
  }
  await query('UPDATE message_attachments SET status=$2, scanned_at=now() WHERE id=$1', [attachmentId, status])
  if (status === 'rejected') await mediaStorage(config).remove(String(row.storage_key)).catch(() => undefined)
  return status
}

export async function scanPendingMessageAttachments(payload: Payload, config: AppConfig) {
  const query = (payload as PoolPayload).db?.pool?.query
  if (!query) throw new Error('Database query execution not available')
  const rows = (await query<{ id: string }>('SELECT id FROM message_attachments WHERE status=\'pending_scan\' ORDER BY created_at ASC LIMIT 100')).rows
  await Promise.all(rows.map(row => scanMessageAttachment(payload, config, row.id)))
  return rows.length
}

/** Links only same-site, owner-bound clean or pending-scan uploads. */
export async function linkMessageAttachments(query: Query, input: { siteId: string; memberId: string; messageId: string; attachmentIds?: string[] }) {
  const ids = [...new Set(input.attachmentIds ?? [])]
  if (!ids.length) return []
  const found = (await query<{ id: string; status: MessageAttachmentStatus }>('SELECT id,status FROM message_attachments WHERE id = ANY($1::uuid[]) AND site_id=$2 AND owner_id=$3 AND message_id IS NULL FOR UPDATE', [ids, input.siteId, input.memberId])).rows
  if (found.length !== ids.length) throw new ConversationError('Attachment is unavailable for this site or sender.', 403, 'ATTACHMENT_SCOPE_DENIED')
  if (found.some(row => !['clean', 'pending_scan'].includes(row.status))) throw new ConversationError('Attachment has not passed quarantine.', 422, 'ATTACHMENT_NOT_SENDABLE')
  await query('UPDATE message_attachments SET message_id=$2, linked_at=now() WHERE id = ANY($1::uuid[])', [ids, input.messageId])
  return found
}

export async function cleanupOrphanedMessageAttachments(payload: Payload, config: AppConfig) {
  const query = (payload as PoolPayload).db?.pool?.query
  if (!query) throw new Error('Database query execution not available')
  // Retain metadata when object deletion fails so the next worker run retries it;
  // deleting metadata first would permanently strand private storage bytes.
  const rows = (await query<{ id: string; storage_key: string }>('SELECT id,storage_key FROM message_attachments WHERE message_id IS NULL AND created_at < now() - interval \'24 hours\' FOR UPDATE SKIP LOCKED LIMIT 500')).rows
  const removed: string[] = []
  for (const row of rows) {
    try { await mediaStorage(config).remove(row.storage_key); removed.push(row.id) } catch { /* retry next run */ }
  }
  if (removed.length) await query('DELETE FROM message_attachments WHERE id = ANY($1::uuid[]) AND message_id IS NULL', [removed])
  return removed.length
}

export function attachmentPresentation(status: MessageAttachmentStatus) {
  return status === 'clean' ? 'attachment' : 'attachment_pending'
}
