/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import {
  createUploadSession,
  finalizeUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0,
  0, 0, 1,
])
describe('MED-01 durable upload sessions', () => {
  it('resumes idempotent chunks and finalizes only once into a canonical asset', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med01-'))
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
    })
    const records: any = {}
    let n = 0
    const payload = {
      find: async ({ collection }: any) =>
        collection === 'team-memberships' ? { docs: [{ id: 'team' }] } : { docs: [] },
      create: async ({ collection, data }: any) => {
        const record = {
          id:
            collection === 'media-upload-sessions'
              ? '00000000-0000-4000-8000-000000000001'
              : `${collection}-${++n}`,
          ...data,
        }
        records[record.id] = record
        return record
      },
      findByID: async ({ id }: any) => records[id],
      update: async ({ id, data }: any) => Object.assign(records[id], data),
    }
    const session = await createUploadSession(payload as never, config, {
      user: { role: 'owner', member: 'member' },
      scope: { kind: 'site', siteId: 'site-a' },
      filename: '../spoof.png',
      size: png.length,
    })
    await writeUploadChunk(
      payload as never,
      config,
      { role: 'owner', member: 'member' },
      session.id,
      0,
      0,
      png.length,
      png,
    )
    await writeUploadChunk(
      payload as never,
      config,
      { role: 'owner', member: 'member' },
      session.id,
      0,
      0,
      png.length,
      png,
    )
    const asset = await finalizeUploadSession(
      payload as never,
      config,
      { role: 'owner', member: 'member' },
      session.id,
    )
    expect(asset.originalFilename).toBe('.._spoof.png')
    await expect(
      finalizeUploadSession(
        payload as never,
        config,
        { role: 'owner', member: 'member' },
        session.id,
      ),
    ).resolves.toMatchObject({ id: asset.id })
  })

  it('recovers a session left finalizing by an interrupted process', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med01-retry-'))
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
    })
    const records: any = {}
    let n = 0
    const payload = {
      find: async ({ collection }: any) =>
        collection === 'team-memberships' ? { docs: [{ id: 'team' }] } : { docs: [] },
      create: async ({ collection, data }: any) => {
        const record = {
          id:
            collection === 'media-upload-sessions'
              ? '00000000-0000-4000-8000-000000000002'
              : `${collection}-${++n}`,
          ...data,
        }
        records[record.id] = record
        return record
      },
      findByID: async ({ id }: any) => records[id],
      update: async ({ id, data }: any) => Object.assign(records[id], data),
    }
    const user = { role: 'owner', member: 'member' }
    const session = await createUploadSession(payload as never, config, {
      user,
      scope: { kind: 'site', siteId: 'site-a' },
      filename: 'retry.png',
      size: png.length,
    })
    await writeUploadChunk(payload as never, config, user, session.id, 0, 0, png.length, png)
    // This is the persisted state after a process dies immediately after claiming finalization.
    records[session.id].state = 'finalizing'
    const asset = await finalizeUploadSession(payload as never, config, user, session.id)
    expect(records[session.id]).toMatchObject({ state: 'completed', asset: asset.id })
    await expect(
      finalizeUploadSession(payload as never, config, user, session.id),
    ).resolves.toMatchObject({
      id: asset.id,
    })
  })

  it('does not let another privileged publisher inspect an owner-bound upload', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: await mkdtemp(path.join(os.tmpdir(), 'renegade-med01-owner-')),
    })
    const records: any = {}
    const payload = {
      find: async ({ collection }: any) =>
        collection === 'team-memberships' ? { docs: [{ id: 'team' }] } : { docs: [] },
      create: async ({ data }: any) =>
        (records.session = { id: '00000000-0000-4000-8000-000000000003', ...data }),
      findByID: async () => records.session,
    }
    const session = await createUploadSession(payload as never, config, {
      user: { role: 'owner', member: 'owner-a' },
      scope: { kind: 'site', siteId: 'site-a' },
      filename: 'private.png',
      size: png.length,
    })
    await expect(
      readUploadSession(payload as never, { role: 'owner', member: 'owner-b' }, session.id),
    ).rejects.toMatchObject({ status: 403 })
  })
})
