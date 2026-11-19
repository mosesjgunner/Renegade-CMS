/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 unit evidence:
 * - bundle secret redaction (defence in depth behind the field whitelists);
 * - the POD-00 bundle manifest contract accepting an export-shaped
 *   manifest and rejecting a corrupt checksum;
 * - the members-only transcript gate (POD-19 fix: public transcript
 *   serialisations must treat a members-only episode as missing);
 * - DirectoryChunkStorage path traversal (POD-19 fix: dot segments must
 *   never escape the storage root);
 * - POD-02 enclosure content-type RE-CHECK (POD-19 gap fill): a server
 *   that answers audio/mpeg but ships HTML bytes — with the declared
 *   length matching — must fail verification on the byte sniff, never
 *   re-point the episode.
 */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { parseProjectBundleManifest } from '../../src/modules/podcast-studio/contracts/bundle'
import { loadEpisodeTranscript } from '../../src/modules/podcast-studio/episode-transcript'
import { migrateEpisodeEnclosure } from '../../src/modules/podcast-studio/import-media'
import { redactSecrets } from '../../src/modules/podcast-studio/portability'
import { DirectoryChunkStorage } from '../../src/modules/podcast-studio/recording/finalize'

describe('POD-19 bundle redaction', () => {
  it('drops credential-shaped keys recursively and keeps content', () => {
    const redacted = redactSecrets({
      title: 'Show',
      streamCredentialEncrypted: 'envelope',
      nested: { tokenHash: 'abc', feedUrl: 'https://example.test/feed', apiKey: 'k' },
      list: [{ signallingCredential: 'x', name: 'guest' }],
    }) as any
    expect(redacted.title).toBe('Show')
    expect(redacted.streamCredentialEncrypted).toBeUndefined()
    expect(redacted.nested).toEqual({ feedUrl: 'https://example.test/feed' })
    expect(redacted.list).toEqual([{ name: 'guest' }])
    expect(JSON.stringify(redacted)).not.toContain('envelope')
  })
})

describe('POD-19 bundle manifest contract', () => {
  const manifest = {
    version: 1,
    bundleId: 'bundle-1',
    createdAt: new Date().toISOString(),
    show: { id: 'show-1', title: 'Show' },
    contents: [
      {
        kind: 'feed',
        id: 'show-1',
        path: 'feed.xml',
        checksumSha256: 'a'.repeat(64),
      },
    ],
    permissionsManifest: [{ role: 'owner', capabilities: ['export', 'import'] }],
  }
  it('accepts an export-shaped manifest', () => {
    expect(parseProjectBundleManifest(manifest).bundleId).toBe('bundle-1')
  })
  it('rejects a corrupt checksum', () => {
    expect(() =>
      parseProjectBundleManifest({
        ...manifest,
        contents: [{ ...manifest.contents[0], checksumSha256: 'not-a-checksum' }],
      }),
    ).toThrow()
  })
})

describe('POD-19 members-only transcript gate', () => {
  const fakePayload = (episode: any) => ({
    find: async ({ collection }: any) => {
      if (collection === 'podcast-episodes') return { docs: episode ? [episode] : [] }
      return { docs: [] }
    },
  })
  const segments = [{ startSeconds: 0, endSeconds: 2, text: 'secret words' }]
  it('treats a flagged members-only episode as missing', async () => {
    const episode = {
      slug: 'ep',
      status: 'published',
      membersOnly: true,
      show: { feedVisibility: 'public' },
      transcript: { segments },
    }
    const loaded = await loadEpisodeTranscript(
      fakePayload(episode),
      'ep',
      '/podcasts/episodes/ep/transcript.json',
    )
    expect(loaded.kind).toBe('missing')
  })
  it('treats an episode on a members-visibility show as missing', async () => {
    const episode = {
      slug: 'ep',
      status: 'published',
      membersOnly: false,
      show: { feedVisibility: 'members' },
      transcript: { segments },
    }
    const loaded = await loadEpisodeTranscript(
      fakePayload(episode),
      'ep',
      '/podcasts/episodes/ep/transcript.json',
    )
    expect(loaded.kind).toBe('missing')
  })
  it('still serves a public episode', async () => {
    const episode = {
      slug: 'ep',
      status: 'published',
      membersOnly: false,
      show: { feedVisibility: 'public' },
      transcript: { segments },
    }
    const loaded = await loadEpisodeTranscript(
      fakePayload(episode),
      'ep',
      '/podcasts/episodes/ep/transcript.json',
    )
    expect(loaded.kind).toBe('found')
    if (loaded.kind === 'found') expect(loaded.segments[0].text).toBe('secret words')
  })
})

describe('POD-19 DirectoryChunkStorage traversal', () => {
  let base: string
  let root: string
  beforeAll(async () => {
    base = await mkdtemp(path.join(os.tmpdir(), 'pod19-chunks-'))
    root = path.join(base, 'chunks')
    await writeFile(path.join(base, 'sentinel.txt'), 'do not delete')
  })
  afterAll(async () => {
    await rm(base, { recursive: true, force: true }).catch(() => undefined)
  })

  it('keeps dot-segment recording ids inside the root', async () => {
    const storage = new DirectoryChunkStorage(root)
    await storage.putChunk('..', 0, new Uint8Array([1, 2, 3]))
    const escaped = await stat(path.join(base, 'chunk-0000.pcm')).catch(() => null)
    expect(escaped).toBeNull()
    const inside = await readFile(path.join(root, '_', 'chunk-0000.pcm'))
    expect([...inside]).toEqual([1, 2, 3])
    await storage.putChunk('.', 0, new Uint8Array([9]))
    await storage.putChunk('a/b/../../c', 1, new Uint8Array([7]))
    const listed = await storage.listRecordings()
    // Every listed name is a single path segment inside the root: no
    // separators, and never a bare dot segment.
    expect(listed.every((name) => !name.includes('/') && name !== '.' && name !== '..')).toBe(true)
    expect(listed).toContain('a_b_.._.._c')
  })

  it('deleteRecording with a dot segment cannot remove the parent', async () => {
    const storage = new DirectoryChunkStorage(root)
    await storage.deleteRecording('..')
    const sentinel = await readFile(path.join(base, 'sentinel.txt'), 'utf8')
    expect(sentinel).toBe('do not delete')
    const rootStat = await stat(root)
    expect(rootStat.isDirectory()).toBe(true)
  })
})

describe('POD-19 enclosure content-type re-check (POD-02 gap fill)', () => {
  let mediaDir: string
  beforeAll(async () => {
    mediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod19-unit-media-'))
  })
  afterAll(async () => {
    await rm(mediaDir, { recursive: true, force: true }).catch(() => undefined)
  })

  const testConfig = () => loadConfig({ ...process.env, MEDIA_DIR: mediaDir } as any)

  function createFakeStore() {
    const collections: Record<string, any[]> = {
      'podcast-shows': [],
      'podcast-episodes': [],
      'media-blobs': [],
      'media-assets': [],
      'payload-jobs': [],
    }
    let sequence = 0
    const store: any = {
      collections,
      async find(args: any) {
        return { docs: collections[args.collection] }
      },
      async findByID(args: any) {
        const doc = collections[args.collection].find((value) => value.id === args.id)
        if (!doc) throw new Error('Not found')
        return doc
      },
      async create(args: any) {
        const doc = { id: `${args.collection}-${++sequence}`, ...args.data }
        collections[args.collection].push(doc)
        return doc
      },
      async update(args: any) {
        const doc = collections[args.collection].find((value) => value.id === args.id)
        Object.assign(doc, args.data)
        return doc
      },
    }
    return store
  }

  it('refuses HTML bytes served as audio/mpeg even when the length matches', async () => {
    const store = createFakeStore()
    const html = new TextEncoder().encode(
      '<!doctype html><html><body>definitely not audio, just a landing page</body></html>',
    )
    const episode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Spoofed',
        externalUrl: 'https://cdn.test/spoof.mp3',
        enclosureBytes: html.byteLength,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const fetcher = async () =>
      new Response(Buffer.from(html), { headers: { 'content-type': 'audio/mpeg' } })
    const resolve = async () => [{ address: '93.184.216.34' }]
    const result = await migrateEpisodeEnclosure(store, episode.id, {
      config: testConfig(),
      fetcher: fetcher as any,
      resolve: resolve as any,
    })
    expect(result.completed).toBe(false)
    expect(result.state).toBe('failed')
    const stored = store.collections['podcast-episodes'][0]
    expect(stored.audio).toBeUndefined()
    expect(store.collections['media-assets']).toHaveLength(0)
  })

  it('refuses a non-audio content-type header outright', async () => {
    const store = createFakeStore()
    const bytes = new Uint8Array(64).fill(7)
    bytes.set([0x49, 0x44, 0x33], 0)
    const episode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Wrong type',
        externalUrl: 'https://cdn.test/wrong.mp3',
        enclosureBytes: bytes.byteLength,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const fetcher = async () =>
      new Response(Buffer.from(bytes), { headers: { 'content-type': 'text/html' } })
    const resolve = async () => [{ address: '93.184.216.34' }]
    const result = await migrateEpisodeEnclosure(store, episode.id, {
      config: testConfig(),
      fetcher: fetcher as any,
      resolve: resolve as any,
    }).catch((error: Error) => ({ completed: false, state: 'failed', error: error.message }))
    expect(result.completed).toBe(false)
    expect(store.collections['podcast-episodes'][0].audio).toBeUndefined()
    expect(store.collections['media-assets']).toHaveLength(0)
  })
})
