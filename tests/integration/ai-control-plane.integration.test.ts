import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import { Client } from 'pg'

import config from '../../src/payload.config'
import {
  credentialCipher,
  connectionCredential,
  publicAiConnection,
} from '../../src/modules/ai/connections'
import { encodeProposalValue } from '../../src/modules/ai/persistence'
import { reserveAiBudget, settleAiBudget } from '../../src/modules/ai/budget-reservation'

let payload: Payload
let siteId: string
let userId: string
let connectionId: string | null = null
let proposalId: string | null = null
let credentialId: string | null = null
const previousKey = process.env.AI_CREDENTIAL_KEY_BASE64URL

beforeAll(async () => {
  process.env.AI_CREDENTIAL_KEY_BASE64URL = Buffer.alloc(32, 9).toString('base64url')
  payload = await getPayload({ config })
  const sites = await payload.find({
    collection: 'sites',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const users = await payload.find({
    collection: 'users',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  siteId = String(sites.docs[0]?.id)
  userId = String(users.docs[0]?.id)
  expect(siteId).not.toBe('undefined')
  expect(userId).not.toBe('undefined')
})

afterAll(async () => {
  if (proposalId)
    await payload.delete({
      collection: 'ai-proposals' as never,
      id: proposalId,
      overrideAccess: true,
    })
  if (credentialId)
    await payload.delete({
      collection: 'ai-credentials' as never,
      id: credentialId,
      overrideAccess: true,
    })
  if (connectionId)
    await payload.delete({
      collection: 'ai-connections' as never,
      id: connectionId,
      overrideAccess: true,
    })
  await payload?.db.destroy?.()
  if (previousKey === undefined) delete process.env.AI_CREDENTIAL_KEY_BASE64URL
  else process.env.AI_CREDENTIAL_KEY_BASE64URL = previousKey
})

describe('AI control plane persistence', () => {
  it('stores an encrypted credential and review decision across database reads', async () => {
    const connection = (await payload.create({
      collection: 'ai-connections' as never,
      data: {
        site: siteId,
        label: `Test ${randomUUID()}`,
        providerKey: 'ai.ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'fixture',
        models: ['fixture'],
        capabilities: ['ai.text.rewrite'],
        allowedTasks: ['editor.improve-selection'],
        status: 'disabled',
        perTaskUsd: 1,
        monthlyUsd: 10,
        maxInputTokens: 1000,
        maxOutputTokens: 100,
        inputUsdPer1k: 0,
        outputUsdPer1k: 0,
        createdBy: userId,
      } as never,
      overrideAccess: true,
    })) as { id: string }
    connectionId = connection.id
    const secret = `fixture-${randomUUID()}`
    const credential = (await payload.create({
      collection: 'ai-credentials' as never,
      data: {
        connection: connection.id,
        envelope: credentialCipher().encrypt({ apiKey: secret }),
      } as never,
      overrideAccess: true,
    })) as { id: string }
    credentialId = credential.id
    expect(await connectionCredential(payload, connection.id)).toBe(secret)
    const firstLease = await reserveAiBudget(payload, {
      connectionId: connection.id,
      reserveUsd: 0.5,
      perTaskUsd: 1,
    })
    expect(firstLease.status).toBe('reserved')
    expect(
      (
        await reserveAiBudget(payload, {
          connectionId: connection.id,
          reserveUsd: 0.5,
          perTaskUsd: 1,
        })
      ).status,
    ).toBe('busy')
    if (firstLease.status === 'reserved')
      await settleAiBudget(payload, connection.id, firstLease.lease, 0.1)
    await payload.update({
      collection: 'ai-connections' as never,
      id: connection.id,
      data: { monthlyUsd: 0.15 } as never,
      overrideAccess: true,
    })
    expect(
      (
        await reserveAiBudget(payload, {
          connectionId: connection.id,
          reserveUsd: 0.1,
          perTaskUsd: 1,
        })
      ).status,
    ).toBe('no-budget')
    const read = (await payload.findByID({
      collection: 'ai-connections' as never,
      id: connection.id,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, unknown> & { id: string }
    expect(JSON.stringify(publicAiConnection(read))).not.toContain(secret)
    const proposal = (await payload.create({
      collection: 'ai-proposals' as never,
      data: {
        site: siteId,
        connection: connection.id,
        task: 'editor.improve-selection',
        targetCollection: 'content',
        targetId: randomUUID(),
        targetUpdatedAt: new Date().toISOString(),
        status: 'ready',
        original: encodeProposalValue('before'),
        output: encodeProposalValue('after'),
        contextPreview: { included: ['SELECTION'] },
        usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0 },
        auditId: `ai:${randomUUID()}`,
        requestedBy: userId,
      } as never,
      overrideAccess: true,
    })) as { id: string }
    proposalId = proposal.id
    await payload.update({
      collection: 'ai-proposals' as never,
      id: proposal.id,
      data: { status: 'declined', decidedBy: userId, decidedAt: new Date().toISOString() } as never,
      overrideAccess: true,
    })
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      const result = await client.query('select status, output from ai_proposals where id=$1', [
        proposal.id,
      ])
      expect(result.rows[0]).toMatchObject({
        status: 'declined',
        output: { type: 'text', value: 'after' },
      })
      const encrypted = await client.query('select envelope from ai_credentials where id=$1', [
        credential.id,
      ])
      expect(JSON.stringify(encrypted.rows[0].envelope)).not.toContain(secret)
    } finally {
      await client.end()
    }
    const { stdout: output } = await promisify(execFile)(
      process.execPath,
      [
        path.resolve('node_modules/tsx/dist/cli.mjs'),
        path.resolve('tests/integration/helpers/ai-restart-reader.ts'),
        proposal.id,
      ],
      { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30_000 },
    )
    expect(output).toContain(`"status":"declined"`)
    expect(output).toContain(`"auditId":`)
  }, 45_000)
})
