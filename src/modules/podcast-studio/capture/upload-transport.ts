/**
 * POD-06 / POD-23 — Production upload transport wiring (SERVER ONLY).
 *
 * Builds an `UploadTransport` over the real media upload sessions
 * (`src/modules/media/upload-sessions.ts`). This module value-imports
 * Payload/media server modules (which transitively reach `sharp` and
 * node builtins), so it must NEVER be imported from browser-reachable
 * code. Until POD-23 it lived inside `upload-bridge.ts`; Turbopack
 * traced the guest page's client bundle through the bridge into that
 * server graph and the production build failed with
 * "Module not found: Can't resolve 'fs'". The bridge itself
 * (`upload-bridge.ts`) is transport-injected and browser-safe.
 *
 * The session functions are owner-bound (the calling user owns the
 * session); scope/user are captured here exactly as the media routes
 * supply them. This wiring is typechecked but NOT exercised against a
 * live Payload in POD-06 — the bridge's behaviour is proven against a
 * fake transport.
 */

import type { Payload } from 'payload'

import type { AppConfig } from '../../core/config'
import {
  createUploadSession,
  finalizeUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '../../media/upload-sessions'
import type { UploadTransport } from './upload-bridge'

export const createMediaUploadTransport = (deps: {
  payload: Payload
  config: AppConfig
  user: Record<string, unknown> | null
  scope: { kind: 'site' | 'publication' | 'space'; siteId: string }
}): UploadTransport => ({
  create: async (input) => {
    const session = await createUploadSession(deps.payload, deps.config, {
      user: deps.user,
      scope: deps.scope,
      filename: input.filename,
      size: input.size,
      checksum: input.checksum,
    })
    return { id: String(session.id), chunkSize: Number(session.chunkSize) }
  },
  write: (sessionId, index, start, total, bytes) =>
    writeUploadChunk(deps.payload, deps.config, deps.user, sessionId, index, start, total, bytes),
  read: async (sessionId) => {
    const state = await readUploadSession(deps.payload, deps.user, sessionId)
    return {
      id: state.id,
      state: state.state,
      chunkSize: state.chunkSize,
      expectedSize: state.expectedSize,
      receivedChunks: state.receivedChunks,
    }
  },
  finalize: async (sessionId) => {
    const asset = await finalizeUploadSession(deps.payload, deps.config, deps.user, sessionId)
    return { id: String(asset.id) }
  },
})
