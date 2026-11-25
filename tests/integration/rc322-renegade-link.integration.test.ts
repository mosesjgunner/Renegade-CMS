/* eslint-disable @typescript-eslint/no-explicit-any */
// RC3-22 — #70 Renegade-to-Renegade syndication proof.
//
// Two real Payload instances on two real databases in one process.
// Install B is the default-config instance (DATABASE_URL). Install A is
// a second instance whose database adapter points at its own database,
// created and migrated by this fixture. Each install holds a peer-link
// record created out of band (origin + public key, bound to one site),
// exactly as two operators would after exchanging keys by hand.
//
// The only stub is transport: A's signed HTTP request is handed to B's
// real route handler in-process instead of crossing a network — the
// RC3-01 standard. Everything else is real: A's signing key, B's stored
// peer key, signature verification, link state, site binding, and every
// Payload write on both sides, asserted from persisted state.

import { generateKeyPairSync, randomUUID } from 'node:crypto'
import path from 'node:path'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { Client } from 'pg'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { migrations } from '../../src/migrations'
import {
  listSyndicatedItems,
  revokePeerLink,
  sendSyndication,
  signSyndicationRequest,
} from '../../src/modules/network/renegade-link'
import { POST as syndicateRoute } from '../../src/app/(frontend)/api/network/renegade/syndicate/route'

const suffix = randomUUID().slice(0, 8)
const ORIGIN_A = `https://install-a-${suffix}.rc322.test`
const ORIGIN_B = `https://install-b-${suffix}.rc322.test`
const ORIGIN_C = `https://install-c-${suffix}.rc322.test`

const keyPairA = generateKeyPairSync('rsa', { modulusLength: 2048 })
const keyPairB = generateKeyPairSync('rsa', { modulusLength: 2048 })
const keyPairC = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = (key: any, kind: 'private' | 'public') =>
  key.export({ type: kind === 'private' ? 'pkcs8' : 'spki', format: 'pem' }).toString()

const baseDbUrl = process.env.DATABASE_URL ?? ''
const peerDbUrl = (() => {
  const url = new URL(baseDbUrl)
  url.pathname = '/rc322_peer_acceptance'
  return url.toString()
})()

let payloadA: Payload
let payloadB: Payload
let siteA: any
let siteB1: any
let siteB2: any
let linkOnA: any
let linkOnB: any
let transportCalls = 0

const transport = async (url: string, init: RequestInit) => {
  transportCalls += 1
  return syndicateRoute(new Request(url, init))
}

const item = { id: 'post-1', kind: 'post' as const, title: 'Hello from A', body: 'First item.' }

async function makeSite(payload: Payload, label: string) {
  return payload.create({
    collection: 'sites',
    data: {
      name: `RC322 ${label}`,
      slug: `rc322-${label}-${suffix}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
      commentReactionCodes: ['thumbs_up', 'heart', 'insightful', 'applause'],
    },
    overrideAccess: true,
  } as never)
}

async function itemsOnB() {
  return (
    await payloadB.find({
      collection: 'syndicated-items',
      where: { dedupeKey: { equals: `${ORIGIN_A}|post-1` } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]
}

describe('renegade-to-renegade syndication (RC3-22)', () => {
  beforeAll(async () => {
    // Install A's private database: created and migrated by this fixture.
    const admin = new Client({
      connectionString: (() => {
        const url = new URL(baseDbUrl)
        url.pathname = '/postgres'
        return url.toString()
      })(),
    })
    await admin.connect()
    await admin.query('DROP DATABASE IF EXISTS rc322_peer_acceptance WITH (FORCE)')
    await admin.query('CREATE DATABASE rc322_peer_acceptance')
    await admin.end()

    // The config module's default export is a Promise (buildConfig is
    // async); spreading it unawaited would copy nothing but the override.
    const baseConfig = await config
    const configA = {
      ...(baseConfig as any),
      db: postgresAdapter({
        idType: 'uuid',
        migrationDir: path.resolve(process.cwd(), 'src/migrations'),
        pool: { connectionString: peerDbUrl },
        push: false,
      }),
    }
    payloadA = await getPayload({ config: configA, key: 'rc322-install-a' })
    await (payloadA.db as any).migrate({ migrations })

    payloadB = await getPayload({ config })

    siteA = await makeSite(payloadA, 'a')
    siteB1 = await makeSite(payloadB, 'b1')
    siteB2 = await makeSite(payloadB, 'b2')

    // Out-of-band pairing: each operator stores the other's origin and
    // public key, bound to one of their own sites.
    linkOnA = await payloadA.create({
      collection: 'renegade-peer-links',
      data: {
        name: 'Install B',
        peerOrigin: ORIGIN_B,
        site: siteA.id,
        peerPublicKey: pem(keyPairB.publicKey, 'public'),
        state: 'active',
        establishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
    linkOnB = await payloadB.create({
      collection: 'renegade-peer-links',
      data: {
        name: 'Install A',
        peerOrigin: ORIGIN_A,
        site: siteB1.id,
        peerPublicKey: pem(keyPairA.publicKey, 'public'),
        state: 'active',
        establishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)

    await payloadA.updateGlobal({
      slug: 'network-settings',
      data: { canonicalOrigin: ORIGIN_A },
      overrideAccess: true,
    } as never)

    process.env.RENEGADE_LINK_PRIVATE_KEY_PEM = pem(keyPairA.privateKey, 'private')
  })

  afterAll(async () => {
    delete process.env.RENEGADE_LINK_PRIVATE_KEY_PEM
    await (payloadA?.db as any)?.destroy?.()
  })

  it('syndicates one item from A onto the site B bound to the link — and nowhere else', async () => {
    const result = await sendSyndication(payloadA, {
      linkId: String(linkOnA.id),
      kind: 'item',
      item,
      transport,
    })
    expect(result.accepted).toBe(true)
    expect(result.outcome).toBe('received')

    const docs = await itemsOnB()
    expect(docs).toHaveLength(1)
    expect(String(docs[0].site)).toBe(String(siteB1.id))
    expect(docs[0].title).toBe('Hello from A')
    expect(docs[0].state).toBe('received')

    // The read path serves the bound site only (#71: the link cannot
    // leak content onto B's other site).
    expect(await listSyndicatedItems(payloadB, String(siteB1.id))).toHaveLength(1)
    expect(await listSyndicatedItems(payloadB, String(siteB2.id))).toHaveLength(0)
  })

  it('re-syndicating the same item updates it instead of duplicating it', async () => {
    const result = await sendSyndication(payloadA, {
      linkId: String(linkOnA.id),
      kind: 'item',
      item: { ...item, title: 'Hello from A (revised)' },
      transport,
    })
    expect(result.outcome).toBe('updated')
    const docs = await itemsOnB()
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('Hello from A (revised)')
  })

  it('rejects a delivery signed with the wrong key, and one from an untrusted origin', async () => {
    const forgedBody = JSON.stringify({
      protocol: 'renegade-link/1',
      kind: 'item',
      sourceOrigin: ORIGIN_A,
      item: { id: 'post-forged', kind: 'post', title: 'Forged', body: 'Not from A.' },
    })
    const forged = signSyndicationRequest(pem(keyPairB.privateKey, 'private'), forgedBody)
    const forgedResponse = await syndicateRoute(
      new Request(`${ORIGIN_B}/api/network/renegade/syndicate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-renegade-origin': ORIGIN_A,
          'x-renegade-date': forged.date,
          'x-renegade-signature': forged.signature,
        },
        body: forgedBody,
      }),
    )
    expect(forgedResponse.status).toBe(401)

    const strangerBody = JSON.stringify({
      protocol: 'renegade-link/1',
      kind: 'item',
      sourceOrigin: ORIGIN_C,
      item: { id: 'post-c', kind: 'post', title: 'From C', body: 'Untrusted install.' },
    })
    const stranger = signSyndicationRequest(pem(keyPairC.privateKey, 'private'), strangerBody)
    const strangerResponse = await syndicateRoute(
      new Request(`${ORIGIN_B}/api/network/renegade/syndicate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-renegade-origin': ORIGIN_C,
          'x-renegade-date': stranger.date,
          'x-renegade-signature': stranger.signature,
        },
        body: strangerBody,
      }),
    )
    expect(strangerResponse.status).toBe(401)

    const all = await payloadB.find({
      collection: 'syndicated-items',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    expect(all.docs.filter((doc: any) => doc.sourceItemId !== 'post-1')).toHaveLength(0)
  })

  it('a sender withdraw removes the item from the read path', async () => {
    const result = await sendSyndication(payloadA, {
      linkId: String(linkOnA.id),
      kind: 'withdraw',
      item,
      transport,
    })
    expect(result.outcome).toBe('withdrawn')
    const docs = await itemsOnB()
    expect(docs).toHaveLength(1)
    expect(docs[0].state).toBe('withdrawn')
    expect(await listSyndicatedItems(payloadB, String(siteB1.id))).toHaveLength(0)
  })

  it('revoking the link on B withdraws prior items and refuses further deliveries', async () => {
    // Bring the item back first so the revocation has something to withdraw.
    await sendSyndication(payloadA, {
      linkId: String(linkOnA.id),
      kind: 'item',
      item,
      transport,
    })
    expect(await listSyndicatedItems(payloadB, String(siteB1.id))).toHaveLength(1)

    const { withdrawnCount } = await revokePeerLink(payloadB, String(linkOnB.id))
    expect(withdrawnCount).toBe(1)
    const docs = await itemsOnB()
    expect(docs[0].state).toBe('withdrawn')
    expect(await listSyndicatedItems(payloadB, String(siteB1.id))).toHaveLength(0)

    // A's next delivery is refused by B (the send surfaces the refusal).
    await expect(
      sendSyndication(payloadA, {
        linkId: String(linkOnA.id),
        kind: 'item',
        item: { ...item, id: 'post-2' },
        transport,
      }),
    ).rejects.toThrow(/401/)
    const post2 = await payloadB.find({
      collection: 'syndicated-items',
      where: { sourceItemId: { equals: 'post-2' } },
      depth: 0,
      overrideAccess: true,
    })
    expect(post2.docs).toHaveLength(0)
  })

  it('a revoked link on the sender side refuses to send at all', async () => {
    await revokePeerLink(payloadA, String(linkOnA.id))
    const before = transportCalls
    await expect(
      sendSyndication(payloadA, {
        linkId: String(linkOnA.id),
        kind: 'item',
        item: { ...item, id: 'post-3' },
        transport,
      }),
    ).rejects.toThrow(/not active/)
    expect(transportCalls).toBe(before)
  })
})
