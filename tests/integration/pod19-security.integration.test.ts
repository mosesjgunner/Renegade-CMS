/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 security pass (POD-REQ-43/44) against real Payload + Postgres.
 *
 * (b) AUTHORIZATION MATRIX — table-driven over the podcast-studio API
 *     route families × roles (anonymous / member of another site /
 *     member / staff without a site grant / staff with a grant),
 *     asserting allow/deny per cell. Principals are the RC2 fixture
 *     world's real sessions (passkey operator sessions + magic-link
 *     member sessions), not mocks.
 *
 * (a) CANARY SCAN — plant canary secrets in every credential the
 *     studio touches (Icecast stream credential, guest invite token,
 *     guest signalling credential, member-feed token, TURN credential),
 *     run the studio's flows, then scan captured console logs + staff /
 *     member API responses + the public feed + the exported bundle:
 *     zero canaries may appear. (By-design surfaces — the one-time
 *     token issue responses and the joining guest's own ICE config —
 *     are the return values of the issuing calls themselves and are
 *     never part of the scanned surfaces.)
 */
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { issueGuestInvite, joinGuest } from '../../src/modules/podcast-studio/guests/service'
import { setShowStreamProfile } from '../../src/modules/podcast-studio/live/live-service'
import { issueToken } from '../../src/modules/podcast-studio/member-feeds'
import { exportShowBundle } from '../../src/modules/podcast-studio/portability'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import { createStudioSessionRecord } from '../../src/modules/podcast-studio/sessions'
import { GET as assistsGet } from '../../src/app/(frontend)/api/podcast-studio/episodes/[episodeId]/assists/route'
import { GET as editProjectsGet } from '../../src/app/(frontend)/api/podcast-studio/edit-projects/route'
import { GET as chunksGet } from '../../src/app/(frontend)/api/podcast-studio/guests/chunks/route'
import { GET as invitesGet } from '../../src/app/(frontend)/api/podcast-studio/guests/invites/route'
import { GET as signallingGet } from '../../src/app/(frontend)/api/podcast-studio/guests/signalling/route'
import { GET as liveGet } from '../../src/app/(frontend)/api/podcast-studio/live/route'
import { GET as memberFeedsGet } from '../../src/app/(frontend)/api/podcast-studio/member-feeds/route'
import {
  GET as productionGet,
  POST as productionPost,
} from '../../src/app/(frontend)/api/podcast-studio/production/route'
import {
  GET as sessionsGet,
  POST as sessionsPost,
} from '../../src/app/(frontend)/api/podcast-studio/sessions/route'
import { GET as feedHealthGet } from '../../src/app/(frontend)/api/podcasts/[slug]/feed-health/route'
import { GET as publicFeedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import {
  buildRc2World,
  loginAsMember,
  operatorSession,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

const runId = randomUUID().slice(0, 8)
const STREAM_CANARY = `POD19CANARY-stream-${runId}`
const TURN_CANARY = `POD19CANARY-turn-${runId}`

type Role = 'anon' | 'memberOther' | 'member' | 'staffNoGrant' | 'staffGranted'
const ROLES: Role[] = ['anon', 'memberOther', 'member', 'staffNoGrant', 'staffGranted']

let payload: Payload
let world: Rc2World
let show: any
let episode: any
let sessionRecord: any
const headersByRole = new Map<Role, Record<string, string>>()

const req = (role: Role, url: string, init: RequestInit = {}) =>
  new Request(url, {
    ...init,
    headers: { ...(headersByRole.get(role) ?? {}), ...(init.headers ?? {}) },
  })

const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// Console capture for the canary scan (the studio's lifecycle logs are
// structured console lines; a canary in ANY log line fails the scan).
const logLines: string[] = []
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

beforeAll(async () => {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => {
      logLines.push(args.map((arg) => String(arg)).join(' '))
    }
  }
  payload = await getPayload({ config })
  world = await buildRc2World(payload)

  const granted = await operatorSession(payload, world.siteA.admin)
  const noGrant = await operatorSession(payload, world.outsider)
  const member = await loginAsMember(payload, world.siteA.member)
  const memberOther = await loginAsMember(payload, world.siteB.member)
  const withCsrf = (headers: Headers) => {
    const cookie = headers.get('cookie') ?? ''
    return {
      cookie: `${cookie}; renegade-member-csrf=pod19-csrf-${runId}`,
      'x-member-csrf': `pod19-csrf-${runId}`,
    }
  }
  headersByRole.set('anon', {})
  headersByRole.set('staffGranted', { cookie: granted.get('cookie') ?? '' })
  headersByRole.set('staffNoGrant', { cookie: noGrant.get('cookie') ?? '' })
  headersByRole.set('member', withCsrf(member.headers))
  headersByRole.set('memberOther', withCsrf(memberOther.headers))

  const storage = mediaStorage(loadConfig())
  const { createHash } = await import('node:crypto')
  const wav = new Uint8Array(128).fill(3)
  wav.set([0x52, 0x49, 0x46, 0x46], 0)
  const key = `${world.siteA.siteId}/${randomUUID()}.wav`
  await storage.put(key, wav, 'audio/wav')
  const checksum = `sha256:${createHash('sha256').update(wav).digest('hex')}:${runId}`
  const blob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: world.siteA.siteId,
      storageKey: key,
      storageProvider: 'local',
      mimeType: 'audio/wav',
      sizeBytes: wav.byteLength,
      checksum,
      state: 'ready',
    },
    overrideAccess: true,
  } as never)
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      site: world.siteA.siteId,
      title: `POD-19 security audio ${runId}`,
      kind: 'audio',
      storageProvider: 'local',
      originalBlob: blob.id,
      storageLocation: key,
      mimeType: 'audio/wav',
      sizeBytes: wav.byteLength,
      checksum,
      durationSeconds: 1,
    } as any,
    overrideAccess: true,
  } as never)

  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: world.siteA.siteId,
      title: `POD-19 Security Show ${runId}`,
      slug: `pod19-sec-${runId}`,
      description: 'POD-19 security fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      lockedOwnerEmail: 'host@example.test',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)
  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: world.siteA.siteId,
      show: show.id,
      title: 'POD-19 Security Episode',
      slug: `pod19-sec-ep-${runId}`,
      audio: asset.id,
      productionState: 'idea',
      status: 'published',
      publishedAt: new Date(Date.now() - 1_800_000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)
  const session = createSession({ showId: String(show.id), showTitle: String(show.title) })
  sessionRecord = await createStudioSessionRecord(payload as never, {
    siteId: world.siteA.siteId,
    showId: String(show.id),
    title: `POD-19 security session ${runId}`,
    session,
  })
}, 300_000)

afterAll(async () => {
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
  if (world) await teardownRc2World(payload, world).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('POD-19 authorization matrix', () => {
  const base = 'http://localhost:3000'
  const rows: Array<{
    name: string
    call: (role: Role) => Promise<Response>
    expected: Record<Role, number>
  }> = [
    {
      name: 'production board GET',
      call: (role) =>
        productionGet(req(role, `${base}/api/podcast-studio/production?showId=${show.id}`)),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'production transition POST (illegal jump)',
      call: (role) =>
        productionPost(
          req(
            role,
            `${base}/api/podcast-studio/production`,
            jsonInit({ episodeId: episode.id, to: 'published' }),
          ),
        ),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 409 },
    },
    {
      name: 'sessions GET',
      call: (role) =>
        sessionsGet(req(role, `${base}/api/podcast-studio/sessions?showId=${show.id}`)),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'sessions POST (create)',
      call: (role) =>
        sessionsPost(
          req(role, `${base}/api/podcast-studio/sessions`, jsonInit({ showId: show.id })),
        ),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 201 },
    },
    {
      name: 'live profile GET',
      call: (role) => liveGet(req(role, `${base}/api/podcast-studio/live?showId=${show.id}`)),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'edit projects GET',
      call: (role) =>
        editProjectsGet(req(role, `${base}/api/podcast-studio/edit-projects?showId=${show.id}`)),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'episode assists GET',
      call: (role) =>
        assistsGet(req(role, `${base}/api/podcast-studio/episodes/${episode.id}/assists`), {
          params: Promise.resolve({ episodeId: String(episode.id) }),
        }),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'guest invites GET',
      call: (role) =>
        invitesGet(
          req(
            role,
            `${base}/api/podcast-studio/guests/invites?sessionRecordId=${sessionRecord.id}`,
          ),
        ),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'feed health GET',
      call: (role) =>
        feedHealthGet(req(role, `${base}/api/podcasts/${show.slug}/feed-health`), {
          params: Promise.resolve({ slug: String(show.slug) }),
        }),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: "member-feeds GET (target = site A member's tokens)",
      call: (role) =>
        memberFeedsGet(
          req(
            role,
            `${base}/api/podcast-studio/member-feeds?showId=${show.id}&memberId=${world.siteA.member.memberId}`,
          ),
        ),
      // A member may only ever see their OWN tokens: for member actors
      // the route IGNORES the memberId parameter and self-scopes to the
      // caller — so the other site's member gets a 200 with their own
      // (empty) list, never the target's. The isolation is asserted on
      // the response body in the dedicated test below.
      expected: { anon: 401, memberOther: 200, member: 200, staffNoGrant: 403, staffGranted: 200 },
    },
    {
      name: 'guest chunks GET without a guest credential',
      call: (role) => chunksGet(req(role, `${base}/api/podcast-studio/guests/chunks?inviteId=x`)),
      expected: { anon: 401, memberOther: 401, member: 401, staffNoGrant: 401, staffGranted: 401 },
    },
    {
      // A present-but-bogus credential resolves to no invite: the route
      // answers 404 (invite-not-found) — denied, and nothing is served.
      name: 'guest chunks GET with a bogus guest credential',
      call: (role) =>
        chunksGet(
          req(role, `${base}/api/podcast-studio/guests/chunks?inviteId=x`, {
            headers: { authorization: 'Bearer bogus-canary-credential' },
          }),
        ),
      expected: { anon: 404, memberOther: 404, member: 404, staffNoGrant: 404, staffGranted: 404 },
    },
  ]

  for (const row of rows) {
    it(row.name, async () => {
      for (const role of ROLES) {
        const res = await row.call(role)
        expect(res.status, `${row.name} as ${role}`).toBe(row.expected[role])
        await res.text().catch(() => '')
      }
    })
  }

  it("member-feeds GET: a member's list never contains another member's tokens", async () => {
    // The site A member holds a token for this show (issued in the
    // canary flow's sibling state — issue one here to be independent).
    await issueToken(payload as never, {
      showId: String(show.id),
      memberId: world.siteA.member.memberId,
    })
    const other = await memberFeedsGet(
      req(
        'memberOther',
        `http://localhost:3000/api/podcast-studio/member-feeds?showId=${show.id}&memberId=${world.siteA.member.memberId}`,
      ),
    )
    expect(other.status).toBe(200)
    const body = await other.text()
    expect(body).not.toContain(world.siteA.member.memberId)
    const own = await memberFeedsGet(
      req('member', `http://localhost:3000/api/podcast-studio/member-feeds?showId=${show.id}`),
    )
    expect(own.status).toBe(200)
    expect(await own.text()).toContain(world.siteA.member.memberId)
  })
})

describe('POD-19 canary scan', () => {
  it('no planted secret appears in logs, API responses, the public feed, or the exported bundle', async () => {
    // Plant: stream credential (encrypted storage path).
    await setShowStreamProfile(payload as never, {
      showId: String(show.id),
      profile: {
        sourceUrl: 'http://icecast.example.test:8000/live',
        title: 'POD-19 Canary Stream',
      } as any,
      credential: STREAM_CANARY,
    })
    // Plant: guest invite token + signalling credential + TURN credential.
    process.env.PODCAST_STUDIO_TURN_URLS = 'turn:turn.example.test:3478'
    process.env.PODCAST_STUDIO_TURN_USERNAME = 'pod19-turn-user'
    process.env.PODCAST_STUDIO_TURN_CREDENTIAL = TURN_CANARY
    let guestToken = ''
    let signallingCredential = ''
    try {
      const issued = await issueGuestInvite(payload as never, {
        sessionRecordId: String(sessionRecord.id),
      })
      guestToken = issued.token
      const joined = await joinGuest(payload as never, {
        token: guestToken,
        displayName: 'Canary Guest',
        headphones: 'headphones',
      })
      signallingCredential = joined.signallingCredential
      // By-design proof: the joining guest's OWN ice config carries the
      // TURN credential — that return value is not a scanned surface.
      expect(JSON.stringify(joined.ice)).toContain(TURN_CANARY)
    } finally {
      delete process.env.PODCAST_STUDIO_TURN_URLS
      delete process.env.PODCAST_STUDIO_TURN_USERNAME
      delete process.env.PODCAST_STUDIO_TURN_CREDENTIAL
    }
    // Plant: member-feed token (raw value returned once at issue).
    const memberIssue = await issueToken(payload as never, {
      showId: String(show.id),
      memberId: world.siteA.member.memberId,
    })
    const memberToken = String((memberIssue as any).token ?? (memberIssue as any).rawToken ?? '')
    expect(memberToken.length).toBeGreaterThan(10)

    // Run the flows and collect every scanned surface.
    const surfaces = new Map<string, string>()
    const collect = async (name: string, res: Response) => {
      surfaces.set(name, await res.text())
    }
    await collect(
      'live GET (staff)',
      await liveGet(
        req('staffGranted', `http://localhost:3000/api/podcast-studio/live?showId=${show.id}`),
      ),
    )
    await collect(
      'production board GET (staff)',
      await productionGet(
        req(
          'staffGranted',
          `http://localhost:3000/api/podcast-studio/production?showId=${show.id}`,
        ),
      ),
    )
    await collect(
      'member-feeds GET (staff, metadata)',
      await memberFeedsGet(
        req(
          'staffGranted',
          `http://localhost:3000/api/podcast-studio/member-feeds?showId=${show.id}&memberId=${world.siteA.member.memberId}`,
        ),
      ),
    )
    await collect(
      'member-feeds GET (member, own metadata)',
      await memberFeedsGet(
        req(
          'member',
          `http://localhost:3000/api/podcast-studio/member-feeds?showId=${show.id}&memberId=${world.siteA.member.memberId}`,
        ),
      ),
    )
    await collect(
      'guest invites GET (staff)',
      await invitesGet(
        req(
          'staffGranted',
          `http://localhost:3000/api/podcast-studio/guests/invites?sessionRecordId=${sessionRecord.id}`,
        ),
      ),
    )
    await collect(
      'signalling GET (staff)',
      (await signallingGet(
        req(
          'staffGranted',
          `http://localhost:3000/api/podcast-studio/guests/signalling?inviteId=${(await payload.find({ collection: 'podcast-guest-invites', where: { session: { equals: sessionRecord.id } }, limit: 1, overrideAccess: true } as never)).docs[0].id}`,
        ),
      )) as Response,
    )
    await collect(
      'public feed',
      await publicFeedGet(new Request(`http://localhost:3000/podcasts/${show.slug}/feed.xml`), {
        params: Promise.resolve({ slug: String(show.slug) }),
      }),
    )
    surfaces.set('captured console logs', logLines.join('\n'))

    // The exported bundle of the very show carrying the stream credential.
    const bundleDir = path.resolve(`scratch/pod19/canary-bundle-${runId}`)
    await exportShowBundle(payload as never, String(show.id), bundleDir, { config: loadConfig() })
    const bundleFiles: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else bundleFiles.push(full)
      }
    }
    await walk(bundleDir)
    surfaces.set(
      'exported bundle',
      (await Promise.all(bundleFiles.map((file) => readFile(file, 'utf8').catch(() => '')))).join(
        '\n',
      ),
    )

    const canaries: Record<string, string> = {
      'stream credential': STREAM_CANARY,
      'guest invite token': guestToken,
      'guest signalling credential': signallingCredential,
      'member-feed token': memberToken,
      'TURN credential': TURN_CANARY,
    }
    for (const [canaryName, canary] of Object.entries(canaries)) {
      expect(canary.length, `${canaryName} planted`).toBeGreaterThan(8)
      for (const [surfaceName, surface] of surfaces) {
        expect(surface, `${canaryName} leaked into ${surfaceName}`).not.toContain(canary)
      }
    }
    // The stream profile surface reports only that a credential exists.
    expect(surfaces.get('live GET (staff)')).toContain('hasCredential')
  }, 120_000)
})
