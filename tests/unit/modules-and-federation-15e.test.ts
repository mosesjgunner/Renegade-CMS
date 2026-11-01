import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { loadConfig } from '../../src/modules/core/config'
import { registeredPayloadDomains } from '../../src/modules/payload-domains'
import {
  OPTIONAL_MODULES,
  POSTGRES_FUNCTION_ARG_LIMIT,
  floorCollectionSlugs,
  gatePayloadRegistrations,
  getModuleBoundaryRecords,
  parseEnabledModules,
  type ModuleId,
} from '../../src/modules/module-registry'
import { isRegisteredCollection } from '../../src/modules/public/registered-collections'
import {
  actorDocument,
  boundedActivity,
  digestForBody,
  parseHttpSignature,
  replayKey,
  signingStringForRequest,
  verifyHttpSignature,
  webfinger,
} from '../../src/modules/social/activitypub'

const testEnv = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/renegade',
  PAYLOAD_SECRET: '0123456789012345678901234567890123456789012345678',
  APP_URL: 'http://localhost:3000',
}

const getFullRegistrations = () => registeredPayloadDomains(loadConfig(testEnv))

const EXPECTED_17_MODULES: readonly ModuleId[] = [
  'collaboration',
  'community',
  'events',
  'sources',
  'media-studio',
  'social',
  'network',
  'integrations',
  'releases',
  'forms',
  'crm',
  'newsletter',
  'notifications',
  'analytics',
  'experiences',
  'quality',
  'commerce',
]

describe('15E: Module Registration, Provider Boundaries and Federation', () => {
  describe('Reconciliation of the 17 Optional Modules', () => {
    it('contains exactly the 17 specified optional modules', () => {
      const moduleIds = OPTIONAL_MODULES.map((m) => m.id)
      expect(moduleIds.sort()).toEqual([...EXPECTED_17_MODULES].sort())
    })

    it('Profile 1: Lean / default registers only the floor (~66 collections)', () => {
      const full = getFullRegistrations()
      const lean = gatePayloadRegistrations(full, { enabled: new Set() })

      expect(lean.collections.length).toBeLessThan(100)
      expect(lean.collections.length).toBeGreaterThan(50)

      const slugs = new Set(lean.collections.map((c) => c.slug))
      expect(slugs.has('users')).toBe(true)
      expect(slugs.has('sites')).toBe(true)
      expect(slugs.has('publications')).toBe(true)
      expect(slugs.has('content')).toBe(true)
      expect(slugs.has('media-assets')).toBe(true)
      expect(slugs.has('public-redirects')).toBe(true)

      // None of the 17 optional modules have collections registered in floor
      for (const mod of OPTIONAL_MODULES) {
        for (const col of mod.collections) {
          expect(slugs.has(col)).toBe(false)
        }
      }
    })

    it('Profile 2: Standard / default is off by default and allows selective activation', () => {
      const full = getFullRegistrations()
      const standardDefault = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules(''),
      })
      const floorSlugs = floorCollectionSlugs(full)
      expect(standardDefault.collections.map((c) => c.slug)).toEqual(floorSlugs)

      // Single module activation (e.g. network only)
      const networkOnly = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('network'),
      })
      const networkSlugs = new Set(networkOnly.collections.map((c) => c.slug))
      expect(networkSlugs.has('remote-instances')).toBe(true)
      expect(networkSlugs.has('remote-actors')).toBe(true)
      expect(networkSlugs.has('network-relationships')).toBe(true)
      expect(networkSlugs.has('outbound-network-deliveries')).toBe(true)
      // Other modules remain off
      expect(networkSlugs.has('carts')).toBe(false)
      expect(networkSlugs.has('forums')).toBe(false)
    })

    it('Profile 3: All-enabled registers all collections while keeping lockDocuments < 100', () => {
      const full = getFullRegistrations()
      const allEnabled = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('all'),
        warn: () => {},
      })

      expect(allEnabled.collections.length).toBe(full.collections.length)
      expect(allEnabled.collections.length).toBeGreaterThan(200)

      // Critical PostgreSQL json_build_array argument limit protection
      const lockable = allEnabled.collections.filter((c) => c.lockDocuments !== false)
      expect(lockable.length).toBeLessThan(POSTGRES_FUNCTION_ARG_LIMIT)

      // Core content retains locking; optional collections have lockDocuments: false
      expect(allEnabled.collections.find((c) => c.slug === 'content')?.lockDocuments).not.toBe(
        false,
      )
      expect(allEnabled.collections.find((c) => c.slug === 'remote-actors')?.lockDocuments).toBe(
        false,
      )
      expect(allEnabled.collections.find((c) => c.slug === 'products')?.lockDocuments).toBe(false)
    })
  })

  describe('Per-Module Provider Boundary Records', () => {
    it('produces boundary records for all 17 modules with truthful local claims', () => {
      const records = getModuleBoundaryRecords()
      const keys = Object.keys(records) as ModuleId[]
      expect(keys.sort()).toEqual([...EXPECTED_17_MODULES].sort())

      for (const modId of keys) {
        const record = records[modId]
        expect(record.enabledByDefault).toBe(false)
        expect(record.providerBoundary).toBeDefined()
        expect(record.providerBoundary.type).toMatch(
          /^(local-only|local-harness|local-peer|local-sink|local-adapter)$/,
        )
        expect(record.providerBoundary.claim).toBeTruthy()
        // No unsupported remote production claims
        expect(record.providerBoundary.claim.toLowerCase()).not.toContain('live remote production')
      }

      // Explicit verification of network module boundary
      const network = records.network
      expect(network.providerBoundary.type).toBe('local-peer')
      expect(network.providerBoundary.claim).toContain('independent local peer')
      expect(network.providerBoundary.claim).toContain('Remote production federation is deferred')

      // Social module boundary
      const social = records.social
      expect(social.providerBoundary.type).toBe('local-harness')

      // Newsletter module boundary
      const newsletter = records.newsletter
      expect(newsletter.providerBoundary.type).toBe('local-sink')

      // Commerce module boundary
      const commerce = records.commerce
      expect(commerce.providerBoundary.type).toBe('local-adapter')
    })
  })

  describe('Broken Pages Graceful Degradation', () => {
    it('isRegisteredCollection accurately reflects active collections vs gated collections', () => {
      const full = getFullRegistrations()
      const lean = gatePayloadRegistrations(full, { enabled: new Set() })
      const mockPayloadLean = {
        collections: Object.fromEntries(lean.collections.map((c) => [c.slug, c])),
      } as never

      // In lean: core is registered, auxiliary collections are not
      expect(isRegisteredCollection(mockPayloadLean, 'content')).toBe(true)
      expect(isRegisteredCollection(mockPayloadLean, 'sites')).toBe(true)
      expect(isRegisteredCollection(mockPayloadLean, 'forum-sections')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'forums')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'discussions')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'products')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'podcast-shows')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'videos')).toBe(false)
      expect(isRegisteredCollection(mockPayloadLean, 'remote-objects')).toBe(false)

      // When all are enabled
      const all = gatePayloadRegistrations(full, {
        enabled: parseEnabledModules('all'),
        warn: () => {},
      })
      const mockPayloadAll = {
        collections: Object.fromEntries(all.collections.map((c) => [c.slug, c])),
      } as never
      expect(isRegisteredCollection(mockPayloadAll, 'forum-sections')).toBe(true)
      expect(isRegisteredCollection(mockPayloadAll, 'forums')).toBe(true)
      expect(isRegisteredCollection(mockPayloadAll, 'products')).toBe(true)
      expect(isRegisteredCollection(mockPayloadAll, 'podcast-shows')).toBe(true)
      expect(isRegisteredCollection(mockPayloadAll, 'videos')).toBe(true)
      expect(isRegisteredCollection(mockPayloadAll, 'remote-objects')).toBe(true)
    })
  })

  describe('ActivityPub Federation Protocol Contracts', () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = keys.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const publicKeyPem = keys.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    const actorId = 'https://peer.local:3134/actor'
    const keyId = `${actorId}#main-key`

    it('generates public WebFinger and Actor documents without leaking private keys', () => {
      const doc = actorDocument({
        id: actorId,
        handle: 'peer',
        name: 'Peer Node',
        summary: 'Local test peer',
        inbox: `${actorId}/inbox`,
        outbox: `${actorId}/outbox`,
        followers: `${actorId}/followers`,
        following: `${actorId}/following`,
        publicKeyPem,
      })
      expect(doc.id).toBe(actorId)
      expect(doc.publicKey.publicKeyPem).toBe(publicKeyPem)
      expect(JSON.stringify(doc)).not.toContain(privateKeyPem)

      const wf = webfinger('@peer@peer.local', actorId)
      expect(wf.links[0].href).toBe(actorId)
    })

    it('verifies valid HTTP Signatures and digests', () => {
      const body = JSON.stringify({
        id: 'https://peer.local:3134/activities/1',
        type: 'Follow',
        actor: actorId,
        object: 'https://renegade.test/ap/actors/main',
      })
      const digest = digestForBody(body)
      const date = new Date().toUTCString()
      const reqTarget = 'post /ap/actors/main/inbox'
      const host = 'renegade.test'

      const signingString = `(request-target): ${reqTarget}\nhost: ${host}\ndate: ${date}\ndigest: ${digest}`
      const signature = sign('RSA-SHA256', Buffer.from(signingString), keys.privateKey).toString(
        'base64',
      )

      const verified = verifyHttpSignature({
        signingString,
        signature,
        publicKeyPem,
        algorithm: 'rsa-sha256',
      })
      expect(verified).toBe(true)

      // Signature header parser
      const parsedHeader = parseHttpSignature(
        `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
      )
      expect(parsedHeader.keyId).toBe(keyId)
      expect(parsedHeader.algorithm).toBe('rsa-sha256')
      expect(parsedHeader.headers).toEqual(['(request-target)', 'host', 'date', 'digest'])
      expect(parsedHeader.signature).toBe(signature)
    })

    it('rejects tampered body or forged signatures', () => {
      const originalBody = '{"type":"Follow"}'
      const tamperedBody = '{"type":"Follow","tampered":true}'
      expect(digestForBody(originalBody)).not.toBe(digestForBody(tamperedBody))

      const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 })
      const forgedSig = sign(
        'RSA-SHA256',
        Buffer.from('test-string'),
        otherKeys.privateKey,
      ).toString('base64')

      const result = verifyHttpSignature({
        signingString: 'test-string',
        signature: forgedSig,
        publicKeyPem,
        algorithm: 'rsa-sha256',
      })
      expect(result).toBe(false)
    })

    it('generates deterministic replay deduplication keys', () => {
      const raw = JSON.stringify({
        id: 'https://peer.local:3134/activities/1',
        type: 'Follow',
        actor: actorId,
      })
      const activity1 = boundedActivity(raw)
      const activity2 = boundedActivity(raw)
      expect(replayKey(activity1)).toBe(replayKey(activity2))
    })
  })
})
