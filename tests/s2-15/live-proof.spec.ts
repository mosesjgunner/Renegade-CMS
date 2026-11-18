/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * S2-15 live proof: System 2 v1.2 exercised end-to-end against a served
 * production build on real PostgreSQL. Not part of the unit/integration
 * sweeps — run explicitly against the S2-15 acceptance rig:
 *
 *   python3 ~/workspace/with-env.py ~/workspace/gui01b-logs/s2-15-env.local \
 *     npx vitest run tests/s2-15/live-proof.spec.ts --no-file-parallelism
 *
 * The world is the shared RC2 two-site fixture (two tenants, an
 * installation owner, a site-B outsider). HTTP checks go through
 * node:http so Host routing is exercised exactly as deployed.
 */
import { request as httpRequest } from 'node:http'
import { writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { buildRc2World, operatorSession, type Rc2World } from '../fixtures/rc2-world'
import { applyWordpressConversion } from '../../src/modules/portability/legacy-migration/conversion-apply'
import { startProgressiveOnboarding } from '../../src/modules/operations/onboarding'
import { createPattern } from '../../src/modules/presentation/composition'

const BASE = new URL(process.env.APP_URL ?? 'http://127.0.0.1:39099')
const LONG = 600_000

type HttpResult = { status: number; body: string; json: any }

function http(
  method: string,
  path: string,
  options: { host?: string; cookie?: string; body?: unknown } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const data = options.body === undefined ? undefined : JSON.stringify(options.body)
    const req = httpRequest(
      {
        hostname: BASE.hostname,
        port: BASE.port,
        path,
        method,
        headers: {
          ...(options.host ? { host: options.host } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...(data
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
            : {}),
          /* Same-origin checks compare Origin against the request's own
             Host-derived origin, exactly as a browser on that host sends. */
          origin: options.host ? `http://${options.host}` : BASE.origin,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          let json: any = null
          try {
            json = JSON.parse(body)
          } catch {
            /* HTML or empty */
          }
          resolve({ status: res.statusCode ?? 0, body, json })
        })
      },
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const cookieOf = async (payload: Payload, principal: Rc2World['siteA']['owner']) =>
  (await operatorSession(payload, principal)).get('cookie') ?? ''

let payload: Payload
let world: Rc2World
let ownerCookie = ''
let outsiderCookie = ''

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
  writeFileSync(
    '/home/hatch/workspace/gui01b-logs/s2-15-world.json',
    JSON.stringify(
      {
        siteA: world.siteA.siteId,
        siteB: world.siteB.siteId,
        hostA: world.siteA.host,
        hostB: world.siteB.host,
        suffix: world.suffix,
      },
      null,
      2,
    ),
  )
  ownerCookie = await cookieOf(payload, world.installationOwner as never)
  outsiderCookie = await cookieOf(payload, world.outsider as never)
}, LONG)

describe('S2-15 live proof', () => {
  it('serves both tenant homepages publicly with their own content', async () => {
    const a = await http('GET', '/', { host: world.siteA.host })
    const b = await http('GET', '/', { host: world.siteB.host })
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.body).not.toBe(b.body)
  })

  it('denies a foreign operator import and imports a draft for the owner (S2-01)', async () => {
    const pkg = {
      schema: 'renegade-presentation-package',
      version: 1,
      exportedAt: new Date().toISOString(),
      siteId: world.siteA.siteId,
      theme: { id: 'neutral-starter' },
      pages: [
        {
          version: 1,
          id: 's2-15-imported',
          siteId: world.siteA.siteId,
          path: '/imported-live',
          name: 'Imported Live',
          status: 'draft',
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          blocks: [
            {
              id: 'imp-1',
              component: 'publisher.rich-content',
              componentVersion: 1,
              props: {
                title: 'Imported heading',
                body: 'Imported body stays a draft.',
                alignment: 'left',
                spacing: 'normal',
                width: 'standard',
                background: 'canvas',
                emphasis: 'normal',
                variant: 'contained',
              },
            },
          ],
          unknownBlocks: [],
          revision: 1,
        },
      ],
      templates: [],
      patterns: [],
      globals: [],
    }
    const denied = await http('POST', '/api/presentation/import', {
      cookie: outsiderCookie,
      body: { siteId: world.siteA.siteId, targetThemeId: 'neutral-starter', packageData: pkg },
    })
    expect(denied.status).toBe(403)
    const allowed = await http('POST', '/api/presentation/import', {
      cookie: ownerCookie,
      body: { siteId: world.siteA.siteId, targetThemeId: 'neutral-starter', packageData: pkg },
    })
    expect(allowed.status).toBe(200)
    const found = await payload.find({
      collection: 'page-layouts',
      where: {
        and: [{ site: { equals: world.siteA.siteId } }, { path: { equals: '/imported-live' } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(found.docs).toHaveLength(1)
    expect((found.docs[0] as any).status).toBe('draft')
    /* Draft isolation: the imported draft is not public. */
    const pub = await http('GET', '/imported-live', { host: world.siteA.host })
    expect(pub.body).not.toContain('Imported body stays a draft.')
  })

  it('switches themes A → B → A over HTTP and restores the original rendering (S2-09)', async () => {
    const site = world.siteA.siteId
    /* Activation is designed to happen from Theme Studio on the site's
       own public host: the route requires the request host to resolve
       to the site (its render probe fetches the canonical origin), and
       the proxy requires Origin == APP_URL. In this rig both are the
       loopback address, so point site A's canonical origin at it for
       the duration of the test and restore it afterwards. */
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })) as any
    const originalOrigins = { ...(settings.canonicalOriginsBySite ?? {}) }
    await payload.updateGlobal({
      slug: 'site-settings',
      overrideAccess: true,
      data: {
        canonicalOriginsBySite: { ...originalOrigins, [site]: BASE.origin },
      },
    } as never)
    try {
      const stateOf = async () =>
        (await http('GET', `/api/admin/themes?site=${site}`, { cookie: ownerCookie })).json
      let before = await stateOf()
      if (!before.state.active) {
        /* A fixture site has no theme state row until an operator acts;
           establish theme A through the same draft + activate flow. */
        const starter = (before.installed as any[]).find((p) => p.package?.id === 'neutral-starter')
        const draftedA = await http('POST', '/api/admin/themes', {
          cookie: ownerCookie,
          body: {
            action: 'draft',
            site,
            revision: before.state.revision,
            id: 'neutral-starter',
            version: starter.package.version,
          },
        })
        expect(draftedA.status).toBe(200)
        const midA = await stateOf()
        const activatedA = await http('POST', '/api/admin/themes', {
          cookie: ownerCookie,
          body: { action: 'activate', site, revision: midA.state.revision },
        })
        expect(
          activatedA.status,
          `activate A: ${JSON.stringify(activatedA.json ?? activatedA.body.slice(0, 200))}`,
        ).toBe(200)
        before = await stateOf()
      }
      expect(before.state.active.id).toBe('neutral-starter')
      const homeBefore = await http('GET', '/')

      const drafted = await http('POST', '/api/admin/themes', {
        cookie: ownerCookie,
        body: {
          action: 'draft',
          site,
          revision: before.state.revision,
          id: 'renegade-party',
          version: '1.0.0',
        },
      })
      expect(
        drafted.status,
        `draft B: ${JSON.stringify(drafted.json ?? drafted.body.slice(0, 200))}`,
      ).toBe(200)
      const mid = await stateOf()
      expect(mid.state.draft.id).toBe('renegade-party')

      const activated = await http('POST', '/api/admin/themes', {
        cookie: ownerCookie,
        body: { action: 'activate', site, revision: mid.state.revision },
      })
      expect(
        activated.status,
        `activate B: ${JSON.stringify(activated.json ?? activated.body.slice(0, 200))}`,
      ).toBe(200)
      const activeB = await stateOf()
      expect(activeB.state.active.id).toBe('renegade-party')
      expect(activeB.state.previous.id).toBe('neutral-starter')
      const homeB = await http('GET', '/')
      expect(homeB.status).toBe(200)
      expect(homeB.body).not.toBe(homeBefore.body)

      const rolled = await http('POST', '/api/admin/themes', {
        cookie: ownerCookie,
        body: { action: 'rollback', site, revision: activeB.state.revision },
      })
      expect(
        rolled.status,
        `rollback: ${JSON.stringify(rolled.json ?? rolled.body.slice(0, 200))}`,
      ).toBe(200)
      const restored = await stateOf()
      expect(restored.state.active).toEqual(before.state.active)
      const homeAfter = await http('GET', '/')
      expect(homeAfter.body).toBe(homeBefore.body)
    } finally {
      await payload.updateGlobal({
        slug: 'site-settings',
        overrideAccess: true,
        data: { canonicalOriginsBySite: originalOrigins },
      } as never)
    }
  })

  it('preserves operator edits across an onboarding rerun on the real database (S2-02/S2-11)', async () => {
    const started = await startProgressiveOnboarding(payload, 'third@example.test', {
      name: 'S2-15 Third Site',
      primaryUrl: 'https://third.s2-15.test',
      starterType: 'publication-community',
      themeId: 'neutral-starter',
    })
    const siteId = String(started.site.id)
    /* The starter-generated /about page is a managed content record;
       editing its title is exactly the local edit a rerun must keep. */
    const content = await payload.find({
      collection: 'content',
      where: {
        and: [{ site: { equals: siteId } }, { canonicalPath: { equals: '/about' } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    const home = content.docs[0] as any
    expect(home).toBeTruthy()
    await payload.update({
      collection: 'content',
      id: home.id,
      overrideAccess: true,
      data: { title: 'Operator headline — do not overwrite' },
    })
    const rerun = await startProgressiveOnboarding(payload, 'third@example.test', {
      name: 'S2-15 Third Site',
      primaryUrl: 'https://third.s2-15.test',
      starterType: 'publication-community',
      themeId: 'neutral-starter',
    })
    expect(String(rerun.site.id)).toBe(siteId)
    const after = await payload.findByID({
      collection: 'content',
      id: home.id,
      depth: 0,
      overrideAccess: true,
    })
    expect((after as any).title).toBe('Operator headline — do not overwrite')
    const sites = await payload.find({
      collection: 'sites',
      where: { slug: { equals: 's2-15-third-site' } },
      depth: 0,
      overrideAccess: true,
    })
    expect(sites.docs).toHaveLength(1)
  })

  it('gates a converted draft at publish until review resolves, then publishes (S2-12/13/14)', async () => {
    const ownerUser = (world.installationOwner as any).user
    const applied = await applyWordpressConversion(payload, {
      siteId: world.siteA.siteId,
      user: ownerUser,
      sourceId: 's2-15-wxr-1',
      path: '/converted-live',
      name: 'Converted Live',
      themeId: 'neutral-starter',
      source:
        '<!-- wp:paragraph --><p>Clean intro paragraph.</p><!-- /wp:paragraph -->' +
        '<!-- wp:quote --><blockquote><p>Quoted wisdom.</p></blockquote><!-- /wp:quote -->' +
        '<!-- wp:acme/pricing-table --><div>pricing</div><!-- /wp:acme/pricing-table -->',
    })
    expect(applied.applied).toBe(true)
    const layoutId = applied.layoutId!
    const review = await http('GET', `/api/layouts/${layoutId}/conversion-review`, {
      cookie: ownerCookie,
    })
    expect(review.status).toBe(200)
    expect(review.json.review.publishable).toBe(false)
    expect(review.json.review.blockers).toHaveLength(2)

    const record = (await payload.findByID({
      collection: 'page-layouts',
      id: layoutId,
      depth: 0,
      overrideAccess: true,
    })) as any
    const layoutBody = {
      id: layoutId,
      siteId: world.siteA.siteId,
      version: 1,
      themeId: 'neutral-starter',
      name: record.name,
      path: record.path,
      surface: 'page',
      slot: 'main',
      status: 'draft',
      blocks: record.blocks,
      unknownBlocks: [],
      revision: record.revision,
    }
    const blocked = await http('PATCH', `/api/layouts/${layoutId}`, {
      cookie: ownerCookie,
      body: { layout: layoutBody, publish: true, expectedRevision: record.revision },
    })
    expect(blocked.status).toBe(422)
    expect(blocked.json.conversionBlockers).toHaveLength(2)

    const quoteLocation = review.json.review.items.find(
      (item: any) => item.blockName === 'core/quote',
    ).location
    const pluginLocation = review.json.review.items.find(
      (item: any) => item.blockName === 'acme/pricing-table',
    ).location
    const accepted = await http('POST', `/api/layouts/${layoutId}/conversion-review`, {
      cookie: ownerCookie,
      body: { location: quoteLocation, decision: 'accepted' },
    })
    expect(accepted.status).toBe(200)

    /* Add a normal replacement block through the normal save path. */
    const withReplacement = {
      ...layoutBody,
      blocks: [
        ...record.blocks,
        {
          id: 'operator-pricing',
          component: 'publisher.rich-content',
          componentVersion: 1,
          props: {
            title: 'Pricing',
            body: 'Plans from $10.',
            alignment: 'left',
            spacing: 'normal',
            width: 'standard',
            background: 'canvas',
            emphasis: 'normal',
            variant: 'contained',
          },
        },
      ],
    }
    const saved = await http('PATCH', `/api/layouts/${layoutId}`, {
      cookie: ownerCookie,
      body: { layout: withReplacement, publish: false, expectedRevision: record.revision },
    })
    expect(saved.status).toBe(200)
    const replaced = await http('POST', `/api/layouts/${layoutId}/conversion-review`, {
      cookie: ownerCookie,
      body: {
        location: pluginLocation,
        decision: 'replaced',
        replacementBlockId: 'operator-pricing',
      },
    })
    expect(replaced.status).toBe(200)
    expect(replaced.json.review.publishable).toBe(true)

    const fresh = (await payload.findByID({
      collection: 'page-layouts',
      id: layoutId,
      depth: 0,
      overrideAccess: true,
    })) as any
    const published = await http('PATCH', `/api/layouts/${layoutId}`, {
      cookie: ownerCookie,
      body: {
        layout: { ...withReplacement, revision: fresh.revision },
        publish: true,
        expectedRevision: fresh.revision,
      },
    })
    expect(published.status).toBe(200)
    const pub = await http('GET', '/converted-live', { host: world.siteA.host })
    expect(pub.status).toBe(200)
    expect(pub.body).toContain('Clean intro paragraph.')
    expect(pub.body).toContain('Plans from $10.')
    expect(pub.body).not.toContain('acme/pricing-table')
  })

  it('renders linked patterns, columns and responsive visibility publicly (S2-04/05/07)', async () => {
    const pattern = await createPattern(payload, {
      siteId: world.siteA.siteId,
      name: 'Live Pattern',
      themeId: 'neutral-starter',
      category: 'content',
      blocks: [
        {
          id: 'pat-1',
          component: 'publisher.rich-content',
          componentVersion: 1,
          props: {
            title: 'Pattern heading',
            body: 'Pattern body rendered from the latest published revision.',
            alignment: 'left',
            spacing: 'normal',
            width: 'standard',
            background: 'canvas',
            emphasis: 'normal',
            variant: 'contained',
          },
        },
      ],
    } as never)
    const rich = (id: string, body: string, visible?: unknown) => ({
      id,
      component: 'publisher.rich-content',
      componentVersion: 1,
      props: {
        title: '',
        body,
        alignment: 'left',
        spacing: 'normal',
        width: 'standard',
        background: 'canvas',
        emphasis: 'normal',
        variant: 'contained',
      },
      ...(visible ? { visible } : {}),
    })
    const created = await payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: world.siteA.siteId,
        name: 'Composition Live',
        path: '/composition-live',
        themeId: 'neutral-starter',
        surface: 'page',
        slot: 'main',
        status: 'draft',
        layoutVersion: 1,
        revision: 1,
        unknownBlocks: [],
        revisionHistory: [],
        blocks: [
          {
            id: 'cols-1',
            component: 'publisher.columns',
            componentVersion: 1,
            props: {
              title: '',
              alignment: 'left',
              spacing: 'normal',
              width: 'standard',
              background: 'canvas',
              emphasis: 'normal',
              balance: 'equal',
              column0: [rich('c0-1', 'Left cell live.')],
              column1: [rich('c1-1', 'Right cell live.')],
            },
          },
          {
            id: 'pat-block',
            component: 'publisher.pattern',
            componentVersion: 1,
            props: {
              patternId: String(pattern.id),
              patternName: 'Live Pattern',
              patternVersion: 1,
              mode: 'linked',
            },
          },
          rich('mob-1', 'Desktop only note.', { mobile: false, tablet: true, desktop: true }),
        ],
      } as never,
    })
    const record = created as any
    const layoutBody = {
      id: String(record.id),
      siteId: world.siteA.siteId,
      version: 1,
      themeId: 'neutral-starter',
      name: record.name,
      path: record.path,
      surface: 'page',
      slot: 'main',
      status: 'draft',
      blocks: record.blocks,
      unknownBlocks: [],
      revision: 1,
    }
    const published = await http('PATCH', `/api/layouts/${record.id}`, {
      cookie: ownerCookie,
      body: { layout: layoutBody, publish: true, expectedRevision: 1 },
    })
    expect(published.status).toBe(200)
    const pub = await http('GET', '/composition-live', { host: world.siteA.host })
    expect(pub.status).toBe(200)
    expect(pub.body).toContain('Left cell live.')
    expect(pub.body).toContain('Right cell live.')
    expect(pub.body).toContain('rg-columns')
    expect(pub.body).toContain('Pattern body rendered from the latest published revision.')
    expect(pub.body).toContain('data-pattern-policy="latest-published"')
    expect(pub.body).toContain('rg-hide-mobile')
    expect(pub.body).toContain('Desktop only note.')
  })

  it('refuses the losing writer in a concurrent save race (expected revision)', async () => {
    const found = await payload.find({
      collection: 'page-layouts',
      where: {
        and: [{ site: { equals: world.siteA.siteId } }, { path: { equals: '/imported-live' } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    const record = found.docs[0] as any
    const layoutBody = {
      id: String(record.id),
      siteId: world.siteA.siteId,
      version: 1,
      themeId: 'neutral-starter',
      name: record.name,
      path: record.path,
      surface: 'page',
      slot: 'main',
      status: 'draft',
      blocks: record.blocks,
      unknownBlocks: [],
      revision: record.revision,
    }
    const [one, two] = await Promise.all([
      http('PATCH', `/api/layouts/${record.id}`, {
        cookie: ownerCookie,
        body: { layout: layoutBody, publish: false, expectedRevision: record.revision },
      }),
      http('PATCH', `/api/layouts/${record.id}`, {
        cookie: ownerCookie,
        body: { layout: layoutBody, publish: false, expectedRevision: record.revision },
      }),
    ])
    expect([one.status, two.status].sort()).toEqual([200, 409])
  })

  it('writes the browser-journey manifest', async () => {
    const found = await payload.find({
      collection: 'page-layouts',
      where: {
        and: [{ site: { equals: world.siteA.siteId } }, { path: { equals: '/converted-live' } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    writeFileSync(
      '/home/hatch/workspace/gui01b-logs/s2-15-journey.json',
      JSON.stringify(
        {
          base: BASE.origin,
          hostA: world.siteA.host,
          hostB: world.siteB.host,
          ownerToken: ownerCookie.replace('renegade-passkey=', ''),
          convertedLayoutId: String((found.docs[0] as any).id),
        },
        null,
        2,
      ),
    )
    expect(found.docs).toHaveLength(1)
  })
})
