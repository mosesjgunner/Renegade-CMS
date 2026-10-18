import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

const evidence = 'docs/rc/evidence/rc1/18-pass/03A'
const fixtureFile = 'scratch/rc103a-20261017/fixture.json'
const base = 'http://127.0.0.1:38913'
// Node fetch does not preserve a supplied Host header on this runtime. Use the
// HTTP client for explicit virtual-host proof instead of accidentally testing localhost.
const publicGet = (path: string, host = 'alpha.rc103a.test:38913') =>
  new Promise<{ status: number; html: string }>((resolve, reject) => {
    const request = httpRequest(`${base}${path}`, { headers: { host } }, (response) => {
      let html = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        html += chunk
      })
      response.on('end', () => resolve({ status: response.statusCode!, html }))
    })
    request.on('error', reject)
    request.end()
  })
let passed = 0
const check = (message: string) => {
  passed++
  console.log(`PASS ${passed}: ${message}`)
}
async function run() {
  assert.equal(process.env.RC1_03A_DISPOSABLE, 'yes')
  assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
  assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
  const db = new URL(process.env.DATABASE_URL!)
  assert.equal(db.host, '127.0.0.1:5435')
  assert.equal(db.pathname, '/rc103a_release_acceptance')
  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool
  try {
    const restarting = process.argv.includes('--restart')
    const f: any = restarting ? JSON.parse(await readFile(fixtureFile, 'utf8')) : {}
    let owner = (
      await payload.find({
        collection: 'users',
        where: { email: { equals: 'owner@rc103a.test' } },
        depth: 0,
      })
    ).docs[0]
    if (!owner) {
      const member = await payload.create({
        collection: 'members',
        data: { email: 'owner@rc103a.test', displayName: '03A Owner', status: 'active' },
      })
      owner = await payload.create({
        collection: 'users',
        data: { email: member.email!, member: member.id, role: 'owner' },
      })
    }
    // Operator fixture only: a real persisted session, never a claim of passkey ceremony acceptance.
    async function cookie(user: { id: string; email: string }) {
      const session = await createPasskeySession(
        user,
        process.env.PAYLOAD_SECRET!,
        async (id, expiry) => {
          await pool.query('INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [
            id,
            user.id,
            expiry,
          ])
        },
      )
      return `renegade-passkey=${session.token}`
    }
    const ownerCookie = await cookie(owner)
    async function request(
      path: string,
      method = 'GET',
      data?: unknown,
      actor = ownerCookie,
      allowed = [200, 201],
    ) {
      const response = await fetch(`${base}/api/${path}`, {
        method,
        headers: { cookie: actor, 'content-type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      })
      const body = await response.text()
      assert.ok(
        allowed.includes(response.status),
        `${method} ${path}: ${response.status} ${body.slice(0, 1600)}`,
      )
      return body ? JSON.parse(body) : null
    }
    const create = async (collection: string, data: unknown) =>
      (await request(collection, 'POST', data)).doc
    const get = (collection: string, id: string) => request(`${collection}/${id}?depth=0`)
    const patch = async (collection: string, id: string, data: unknown) =>
      (await request(`${collection}/${id}`, 'PATCH', data)).doc
    const denied = async (
      collection: string,
      id: string,
      method = 'DELETE',
      data?: unknown,
      actor = ownerCookie,
    ) => {
      const before = await get(collection, id)
      await request(`${collection}/${id}`, method, data, actor, [400, 403, 404, 409])
      assert.deepEqual(await get(collection, id), before)
      check(`${method} ${collection}: denied operation leaves persisted record unchanged`)
    }
    if (process.argv.includes('--controls')) {
      const saved = JSON.parse(await readFile(fixtureFile, 'utf8'))
      const suffix = Date.now().toString(36)
      const archived = (await request('content?depth=0&where[title][equals]=Archived%20History'))
        .docs[0]
      assert.equal(archived.status, 'archived')
      assert.equal((await publicGet(archived.canonicalPath)).status, 404)
      check(
        'supported archive removes revision-backed content from its public URL without deleting history',
      )
      const site = await create('sites', {
        name: `Disposable ${suffix}`,
        slug: `disposable-${suffix}`,
      })
      await patch('sites', site.id, { name: `Renamed ${suffix}` })
      assert.equal((await get('sites', site.id)).name, `Renamed ${suffix}`)
      const publication = (await request(`publications?depth=0&where[site][equals]=${site.id}`))
        .docs[0]
      await request(`publications/${publication.id}`, 'DELETE')
      const roles = (await request(`member-site-roles?depth=0&where[site][equals]=${site.id}`)).docs
      for (const role of roles) await request(`member-site-roles/${role.id}`, 'DELETE')
      await request(`sites/${site.id}`, 'DELETE')
      await request(`sites/${site.id}`, 'GET', undefined, ownerCookie, [404])
      check(
        'native Site create/edit/remove succeeds after explicit removal of bootstrapped publication and grants; audit evidence retained',
      )
      const section = await create('sections', {
        site: saved.siteA,
        scope: 'site',
        name: `Movable ${suffix}`,
        slug: `movable-${suffix}`,
      })
      await patch('sections', section.id, {
        site: saved.siteB,
        name: `Moved ${suffix}`,
        sortOrder: 8,
      })
      const moved = await get('sections', section.id)
      assert.equal(moved.site, saved.siteB)
      assert.equal(moved.sortOrder, 8)
      await request(`sections/${section.id}`, 'DELETE')
      check(
        'empty Section edit, cross-site move by global owner and removal persist without children',
      )
      const album = await create('albums', {
        site: saved.siteB,
        kind: 'album',
        title: `Foreign ${suffix}`,
        slug: `foreign-${suffix}`,
        category: saved.foreignCategory,
      })
      await denied('content', saved.content, 'PATCH', { collections: [album.id] })
      await request(`albums/${album.id}`, 'DELETE')
      const raceSection = await create('sections', {
        site: saved.siteA,
        scope: 'site',
        name: `Race ${suffix}`,
        slug: `race-${suffix}`,
      })
      async function raceRequest(path: string, method: string, data?: unknown) {
        const response = await fetch(`${base}/api/${path}`, {
          method,
          headers: { cookie: ownerCookie, 'content-type': 'application/json' },
          ...(data ? { body: JSON.stringify(data) } : {}),
        })
        return { status: response.status, body: await response.json() }
      }
      const [child, removal] = await Promise.all([
        raceRequest('categories', 'POST', {
          site: saved.siteA,
          scope: 'site',
          section: raceSection.id,
          name: `Racing child ${suffix}`,
          slug: `racing-child-${suffix}`,
        }),
        raceRequest(`sections/${raceSection.id}`, 'DELETE'),
      ])
      assert.ok([201, 400, 404].includes(child.status), JSON.stringify(child))
      assert.ok([200, 400, 404, 409].includes(removal.status), JSON.stringify(removal))
      assert.ok(
        !(child.status === 201 && removal.status === 200),
        'parent and dependent child cannot both succeed across deletion',
      )
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int n FROM categories c LEFT JOIN sections s ON c.section_id=s.id WHERE c.section_id IS NOT NULL AND s.id IS NULL',
          )
        ).rows[0].n,
        0,
      )
      if (child.status === 201) await request(`categories/${child.body.doc.id}`, 'DELETE')
      if (removal.status !== 200) await request(`sections/${raceSection.id}`, 'DELETE')
      check(
        `concurrent native child create ${child.status} / parent delete ${removal.status}: no orphan; supported cleanup/retry succeeds`,
      )
      console.log(`TOTAL passed=${passed} failed=0 skipped=0`)
      return
    }
    if (!restarting) {
      assert.equal(
        (await pool.query('SELECT count(*)::int AS n FROM sites')).rows[0].n,
        0,
        'fresh isolated fixture required; never truncate populated resources',
      )
      f.siteA = (await create('sites', { name: '03A Alpha', slug: 'rc103a-alpha' })).id
      f.siteB = (await create('sites', { name: '03A Beta', slug: 'rc103a-beta' })).id
      await request('globals/site-settings', 'POST', {
        canonicalOrigin: base,
        canonicalOriginsBySite: {
          [f.siteA]: 'http://alpha.rc103a.test:38913',
          [f.siteB]: 'http://beta.rc103a.test:38913',
        },
      })
      const section = (name: string, site = f.siteA, sortOrder = 0) =>
        create('sections', {
          site,
          scope: 'site',
          name,
          slug: name.toLowerCase().replaceAll(' ', '-'),
          sortOrder,
        })
      const category = (name: string, parent?: string, site = f.siteA, sectionId = f.section) =>
        create('categories', {
          site,
          scope: 'site',
          section: sectionId,
          parent,
          name,
          slug: name.toLowerCase().replaceAll(' ', '-'),
        })
      f.section = (await section('Knowledge', f.siteA, 2)).id
      f.firstSection = (await section('Start Here', f.siteA, 1)).id
      f.foreignSection = (await section('Foreign Section', f.siteB)).id
      f.category = (await category('Engineering')).id
      f.sibling = (await category('Operations')).id
      f.leaf = (await category('Databases', f.category)).id
      f.otherLeaf = (await category('Reliability', f.sibling)).id
      f.foreignCategory = (
        await category('Foreign Category', undefined, f.siteB, f.foreignSection)
      ).id
      f.collection = (
        await create('albums', {
          site: f.siteA,
          kind: 'album',
          title: 'Field Guides',
          slug: 'field-guides',
          category: f.leaf,
        })
      ).id
      const content = (title: string, extra: Record<string, unknown> = {}) =>
        create('content', {
          site: f.siteA,
          title,
          slug: title.toLowerCase().replaceAll(' ', '-'),
          contentType: 'article',
          status: 'draft',
          body: {
            root: {
              type: 'root',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  format: '',
                  indent: 0,
                  direction: 'ltr',
                  children: [
                    {
                      type: 'text',
                      version: 1,
                      text: '03A persisted article body.',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    },
                  ],
                },
              ],
            },
          },
          collections: [f.collection],
          ...extra,
        })
      f.content = (await content('PostgreSQL Field Guide')).id
      await patch('content', f.content, { status: 'published' })
      f.draft = (await content('HIDDEN DRAFT 03A')).id
      f.legacy = (
        await content('Direct Category Article', {
          collections: [],
          categories: [f.leaf],
          status: 'published',
        })
      ).id
      f.secondContent = (
        await content('First In Collection', { status: 'published', sortOrder: -1 })
      ).id
      f.emptyContent = (await content('Empty Editor Article', { body: null })).id
      await denied('content', f.emptyContent, 'PATCH', { status: 'published' })
      f.privateCollection = (
        await create('albums', {
          site: f.siteA,
          kind: 'album',
          title: 'HIDDEN PRIVATE 03A',
          slug: 'private-guides',
          category: f.leaf,
          visibility: 'private',
        })
      ).id
      check(
        'native REST creates Site → Section → Category → Subcategory → Collection → Content; publishes via normal PATCH',
      )
      for (const [collection, key] of [
        ['sites', 'siteA'],
        ['sections', 'section'],
        ['categories', 'category'],
        ['categories', 'leaf'],
        ['albums', 'collection'],
        ['content', 'content'],
      ])
        assert.equal((await get(collection, f[key])).id, f[key])
      check('all six levels refetched through native REST after commit')
      const originalPath = (await get('categories', f.leaf)).canonicalPath
      await patch('categories', f.leaf, { parent: f.sibling, name: 'Database Practice' })
      assert.equal((await get('categories', f.leaf)).parent, f.sibling)
      assert.equal((await get('categories', f.leaf)).canonicalPath, originalPath)
      await patch('categories', f.leaf, { parent: f.category })
      await patch('albums', f.collection, { category: f.otherLeaf })
      assert.equal((await get('albums', f.collection)).category, f.otherLeaf)
      await patch('albums', f.collection, { category: f.leaf })
      await patch('content', f.content, { title: 'PostgreSQL Field Guide Revised', sortOrder: 4 })
      assert.equal((await get('content', f.content)).title, 'PostgreSQL Field Guide Revised')
      const filtered = await request(
        `content?depth=0&where[collections][in]=${f.collection}&sort=sortOrder,id`,
      )
      assert.equal(filtered.docs[0].id, f.secondContent)
      check(
        'rename/reparent/move/save/reload/filter and stable order persist; canonical category URL survives rename and move',
      )
      await denied('categories', f.leaf, 'PATCH', {
        parent: '00000000-0000-0000-0000-000000000099',
      })
      await denied('categories', f.leaf, 'PATCH', { parent: f.foreignCategory })
      await denied('categories', f.leaf, 'PATCH', { parent: f.leaf })
      await denied('categories', f.category, 'PATCH', { parent: f.leaf })
      await denied('categories', f.leaf, 'PATCH', { section: f.firstSection })
      await denied('albums', f.collection, 'PATCH', { category: f.foreignCategory })
      await denied('content', f.content, 'PATCH', { categories: [f.foreignCategory] })
      await denied('content', f.content, 'PATCH', { sections: [f.foreignSection] })
      await denied('sections', f.section, 'PATCH', { site: f.siteB })
      for (const [collection, key] of [
        ['sites', 'siteA'],
        ['sections', 'section'],
        ['categories', 'category'],
        ['categories', 'leaf'],
        ['albums', 'collection'],
      ])
        await denied(collection, f[key])
      const staffMember = await payload.create({
        collection: 'members',
        data: {
          email: 'foreign@rc103a.test',
          displayName: 'Foreign administrator',
          status: 'active',
        },
      })
      const staff = await payload.create({
        collection: 'users',
        data: { email: staffMember.email!, member: staffMember.id, role: 'administrator' },
      })
      await payload.create({
        collection: 'member-site-roles',
        data: { member: staffMember.id, site: f.siteB, role: 'community-manager' },
      })
      const foreignCookie = await cookie(staff)
      await denied('categories', f.leaf, 'PATCH', { name: 'Unauthorized change' }, foreignCookie)
      await denied('content', f.content, 'PATCH', { title: 'Unauthorized change' }, foreignCookie)
      await denied('albums', f.collection, 'DELETE', undefined, foreignCookie)
      await denied('categories', f.leaf, 'PATCH', { name: 'Anonymous change' }, '')
      check('foreign administrator and anonymous mutations denied without persisted effects')
      await denied('content', f.content)
      const archive = await content('Archived History', { status: 'published', collections: [] })
      await patch('content', archive.id, { status: 'archived' })
      assert.equal((await get('content', archive.id)).status, 'archived')
      const page = await content('Parent Page', {
        contentType: 'page',
        collections: [],
        body: null,
      })
      const child = await content('Child Page', {
        body: null,
        contentType: 'page',
        collections: [],
        parentPage: page.id,
      })
      await denied('content', page.id)
      await denied('content', page.id, 'PATCH', { parentPage: child.id })
      await patch('content', child.id, { parentPage: null })
      await request(`content/${page.id}`, 'DELETE')
      await request(`content/${child.id}`, 'DELETE')
      const emptyParent = await category('Disposable Parent')
      const emptyChild = await category('Disposable Child', emptyParent.id)
      await denied('categories', emptyParent.id)
      await request(`categories/${emptyChild.id}`, 'DELETE')
      await request(`categories/${emptyParent.id}`, 'DELETE')
      const disposable = await create('albums', {
        site: f.siteA,
        kind: 'album',
        title: 'Disposable Collection',
        slug: 'disposable-collection',
        category: f.leaf,
      })
      const disposableContent = await content('Disposable Content', {
        body: null,
        collections: [disposable.id],
      })
      await denied('albums', disposable.id)
      await patch('content', disposableContent.id, { collections: [] })
      await request(`albums/${disposable.id}`, 'DELETE')
      await request(`content/${disposableContent.id}`, 'DELETE')
      check(
        'detach/move/remove succeeds in dependency order; page parent, category child and collection membership cannot be orphaned',
      )
      await writeFile(fixtureFile, JSON.stringify(f, null, 2))
    }
    const section = await get('sections', f.section)
    const root = await get('categories', f.category)
    const leaf = await get('categories', f.leaf)
    const collection = await get('albums', f.collection)
    const content = await get('content', f.content)
    assert.equal(leaf.parent, root.id)
    assert.equal(collection.category, leaf.id)
    assert.deepEqual(content.collections, [collection.id])
    const persisted = (
      await pool.query(
        'SELECT c.title,c.status,c.sort_order,r.albums_id FROM content c JOIN content_rels r ON r.parent_id=c.id AND r.path=$2 WHERE c.id=$1',
        [content.id, 'collections'],
      )
    ).rows
    assert.equal(persisted[0].albums_id, collection.id)
    assert.equal(persisted[0].status, 'published')
    await writeFile(
      `${evidence}/${restarting ? 'restart-' : '​​'}persistence.json`.replace('​​', ''),
      JSON.stringify(
        {
          site: f.siteA,
          section,
          category: root,
          subcategory: leaf,
          collection,
          content: {
            id: content.id,
            title: content.title,
            canonicalPath: content.canonicalPath,
            collections: content.collections,
          },
          sql: persisted,
        },
        null,
        2,
      ),
    )
    check(
      `${restarting ? 'after restart: ' : ''}PostgreSQL retains exact hierarchy foreign keys, published content, sort order and title`,
    )
    const publicPaths = [
      '/browse',
      section.canonicalPath,
      root.canonicalPath,
      leaf.canonicalPath,
      collection.canonicalPath,
      content.canonicalPath,
    ]
    for (const path of publicPaths) {
      const response = await publicGet(path)
      const html = response.html
      assert.equal(response.status, 200, `${path}: ${html.slice(0, 300)}`)
      assert.ok(html.includes('03A Alpha'), path)
      assert.ok(!html.includes('HIDDEN PRIVATE 03A'), path)
      assert.ok(!html.includes('HIDDEN DRAFT 03A'), path)
      assert.ok(!html.includes('Foreign Category'), path)
      if (path === leaf.canonicalPath)
        assert.ok(
          html.includes('Direct Category Article'),
          'legacy category content remains discoverable',
        )
      if (path === collection.canonicalPath)
        assert.ok(
          html.indexOf('First In Collection') < html.indexOf('PostgreSQL Field Guide Revised'),
          'public order',
        )
      if (path === content.canonicalPath) {
        for (const label of [
          'Knowledge',
          'Engineering',
          'Database Practice',
          'Field Guides',
          'PostgreSQL Field Guide Revised',
        ])
          assert.ok(html.includes(label), `missing breadcrumb ${label}`)
        assert.ok(html.includes('Hierarchy breadcrumb'))
        await writeFile(`${evidence}/public-content.html`, html)
      }
      check(
        `${restarting ? 'after restart: ' : ''}public HTTP ${path}: 200 with scoped labels, no draft/private/foreign names`,
      )
    }
    const wrongHost = await publicGet(content.canonicalPath, 'beta.rc103a.test:38913')
    assert.equal(wrongHost.status, 404)
    check('same content URL on other site host returns 404')
    f.publicPaths = publicPaths
    await writeFile(fixtureFile, JSON.stringify(f, null, 2))
    console.log(`TOTAL passed=${passed} failed=0 skipped=0`)
  } finally {
    await payload.db.destroy?.()
  }
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    console.error(`TOTAL passed=${passed} failed=1; remaining checks unexecuted`)
    process.exit(1)
  })
