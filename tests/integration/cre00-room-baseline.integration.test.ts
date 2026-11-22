import { getPayload, type Payload } from 'payload'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { sendConversationMessage } from '../../src/modules/community/conversation-composer'
import { createRoom, listRoomMessages } from '../../src/modules/community/rooms'
import { loadConfig } from '../../src/modules/core/config'
import {
  cancelUploadSession,
  createUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'
import {
  buildCreatorStudioWorld,
  teardownCreatorStudioWorld,
  type CreatorStudioWorld,
} from '../fixtures/creator-studio-world'

let payload: Payload
let fixture: CreatorStudioWorld

beforeAll(async () => {
  payload = await getPayload({ config })
  fixture = await buildCreatorStudioWorld(payload)
}, 240_000)

afterAll(async () => {
  if (fixture) await teardownCreatorStudioWorld(payload, fixture)
  await payload?.db.destroy?.()
})

describe('CRE-00 existing room boundary', () => {
  it('persists one retry-safe message and denies cross-site and suspended readers', async () => {
    const world = fixture.base
    const siteId = world.siteA.siteId
    const memberId = world.siteA.member.memberId
    const room = await createRoom(payload, {
      siteId,
      creatorMemberId: world.siteA.admin.memberId,
      title: `Creator baseline ${world.suffix}`,
    })
    const message = {
      siteId,
      conversationId: room.id,
      senderId: memberId,
      body: 'Creator baseline message',
      idempotencyKey: `cre00-${world.suffix}`,
    }
    const first = await sendConversationMessage(payload, message)
    const retry = await sendConversationMessage(payload, message)
    expect(String(retry.id)).toBe(String(first.id))

    const read = () =>
      listRoomMessages(payload, { siteId, conversationId: room.id, memberId, afterSequence: 0 })
    const before = await read()
    expect(before.messages.filter((entry) => entry.body_html === message.body)).toHaveLength(1)
    await expect(
      listRoomMessages(payload, {
        siteId,
        conversationId: room.id,
        memberId: world.outsider.memberId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    await expect(
      listRoomMessages(payload, {
        siteId,
        conversationId: room.id,
        memberId: fixture.suspendedMemberId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })

    await payload.update({
      collection: 'members',
      id: memberId,
      data: { status: 'suspended' },
      overrideAccess: true,
    })
    try {
      await expect(read()).rejects.toMatchObject({ code: 'NOT_ROOM_AUDIENCE' })
    } finally {
      await payload.update({
        collection: 'members',
        id: memberId,
        data: { status: 'active' },
        overrideAccess: true,
      })
    }
    const after = await read()
    expect(after.messages.filter((entry) => entry.body_html === message.body)).toHaveLength(1)
  })
})

describe('CRE-00 existing upload boundary', () => {
  it('persists a retry once and refuses another site owner access to the session', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'creator-cre00-'))
    const appConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
    })
    const owner = fixture.base.siteA.owner.user
    const outsider = fixture.base.siteB.owner.user
    const bytes = new Uint8Array([1, 2, 3, 4])
    let sessionId: string | undefined
    try {
      const session = await createUploadSession(payload, appConfig, {
        user: owner,
        scope: { kind: 'site', siteId: fixture.base.siteA.siteId },
        filename: 'baseline.png',
        size: bytes.length,
      })
      sessionId = session.id
      await writeUploadChunk(payload, appConfig, owner, session.id, 0, 0, bytes.length, bytes)
      const retry = await writeUploadChunk(
        payload,
        appConfig,
        owner,
        session.id,
        0,
        0,
        bytes.length,
        bytes,
      )
      expect(retry.received).toBe(0)
      await expect(readUploadSession(payload, outsider, session.id)).rejects.toMatchObject({
        status: 403,
      })
      const persisted = await readUploadSession(payload, owner, session.id)
      expect(persisted.receivedBytes).toBe(bytes.length)
      expect(persisted.receivedChunks).toEqual([0])
    } finally {
      if (sessionId) {
        await cancelUploadSession(payload, appConfig, owner, sessionId)
        await payload.delete({
          collection: 'media-upload-sessions',
          id: sessionId,
          overrideAccess: true,
        })
      }
      await rm(mediaDir, { recursive: true, force: true })
    }
  })
})
