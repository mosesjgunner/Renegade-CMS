import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { saveEditorialDraft } from '@/modules/editorial/persistence'
import { inspectMedia } from '@/modules/media/storage'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

export type DemoEnvironment = {
  siteId: string
  publicationId: string
  userId: string
  cookieHeader: string
  sessionToken: string
  assets: {
    logo: { id: string; storageLocation: string }
    social: { id: string; storageLocation: string }
    hero: { id: string; storageLocation: string }
    inline: { id: string; storageLocation: string }
  }
  pages: {
    platform: { id: string }
    principles: { id: string }
  }
  posts: {
    declaration: { id: string }
    truth: { id: string }
    assembly: { id: string }
    memo: { id: string }
    archived: { id: string }
  }
}

export async function ensureRenegadePartyDemo(payload: Payload): Promise<DemoEnvironment> {
  const appConfig = loadConfig()
  const siteSlug = 'renegadeparty'
  const ownerEmail = 'founder@renegadeparty.org'

  // 1. Ensure User / Owner exists
  let user = (
    await payload.find({
      collection: 'users',
      where: { email: { equals: ownerEmail } },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string; email: string }

  if (!user) {
    user = (await payload.create({
      collection: 'users',
      data: {
        email: ownerEmail,
        role: 'owner',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string; email: string }
  }

  // 2. Ensure Passkey session
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    appConfig.payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  const cookieHeader = `renegade-passkey=${session.token}`

  // 3. Ensure Site exists
  let site = (
    await payload.find({
      collection: 'sites',
      where: { slug: { equals: siteSlug } },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string; slug: string }

  if (!site) {
    site = (await payload.create({
      collection: 'sites',
      data: {
        name: 'Renegade Party',
        slug: siteSlug,
        lifecycle: 'active',
        description: 'Autonomous publishing and grassroots governance for the Renegade movement.',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string; slug: string }
  }
  const siteId = String(site.id)

  // 4. Ensure Publication exists
  let publication = (
    await payload.find({
      collection: 'publications',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }

  if (!publication) {
    publication = (await payload.create({
      collection: 'publications',
      data: {
        site: siteId,
        name: 'Renegade Party',
        slug: siteSlug,
        canonicalBasePath: '/',
        status: 'active',
        visibility: 'public',
        navigation: {
          primary: [
            { label: 'Platform', href: '/platform', children: [] },
            { label: 'Principles', href: '/principles', children: [] },
            { label: 'Articles', href: '/articles', children: [] },
          ],
          secondary: [],
          footer: [
            { label: 'Platform', href: '/platform', children: [] },
            { label: 'Principles', href: '/principles', children: [] },
            { label: 'Articles', href: '/articles', children: [] },
          ],
        },
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  } else {
    // Make sure it is active and public
    await payload.update({
      collection: 'publications',
      id: publication.id,
      data: {
        status: 'active',
        visibility: 'public',
      },
      overrideAccess: true,
    } as never)
  }
  const publicationId = String(publication.id)

  // Set any other publications to draft so renegadeparty is the canonical active publication
  await payload.db.pool.query("UPDATE publications SET status = 'draft' WHERE site_id != $1", [
    siteId,
  ])
  await payload.db.pool.query(
    "UPDATE publications SET status = 'active', visibility = 'public', created_at = NOW() WHERE id = $1",
    [publicationId],
  )

  // 5. Store Real Media Assets
  const ensureMediaAsset = async (filename: string, title: string, altText: string) => {
    const assetPath = path.resolve('fixtures/renegadeparty-demo/assets', filename)
    const buffer = readFileSync(assetPath)
    const inspection = inspectMedia(buffer)
    const storageLocation = `${siteId}/${filename}`

    // Ensure written to both media and .next/standalone/media
    const dest1 = path.resolve('media', storageLocation)
    const dest2 = path.resolve('.next/standalone/media', storageLocation)
    await mkdir(path.dirname(dest1), { recursive: true })
    await writeFile(dest1, buffer)
    if (existsSync('.next/standalone')) {
      await mkdir(path.dirname(dest2), { recursive: true })
      await writeFile(dest2, buffer)
    }

    const existing = await payload.find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: siteId } }, { storageLocation: { equals: storageLocation } }],
      },
      limit: 1,
      overrideAccess: true,
    } as never)

    if (existing.docs[0]) {
      return { id: String(existing.docs[0].id), storageLocation }
    }

    const doc = (await payload.create({
      collection: 'media-assets',
      data: {
        site: siteId,
        publication: publicationId,
        title,
        kind: 'image',
        storageLocation,
        storageProvider: 'local',
        mimeType: inspection.mimeType,
        sizeBytes: buffer.length,
        checksum: inspection.sha256,
        width: inspection.width ?? 800,
        height: inspection.height ?? 600,
        altText,
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }

    return { id: String(doc.id), storageLocation }
  }

  const logoAsset = await ensureMediaAsset(
    'logo.png',
    'Renegade Party Logo',
    'Renegade Party official seal and crest',
  )
  const socialAsset = await ensureMediaAsset(
    'social-default.png',
    'Renegade Party Social Card',
    'Renegade Party autonomous publishing card',
  )
  const heroAsset = await ensureMediaAsset(
    'hero-liberty.png',
    'Liberty Bell Banner',
    'Historic Liberty Bell with Renegade banner',
  )
  const inlineAsset = await ensureMediaAsset(
    'inline-assembly.png',
    'National Assembly Structure',
    'Organizational diagram of the Renegade National Assembly',
  )

  // 6. Update Site Settings
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      siteName: 'Renegade Party',
      siteDescription: 'Autonomous publishing and grassroots governance for the Renegade movement.',
      canonicalOrigin: 'http://localhost:3110',
      locale: 'en',
      timezone: 'America/Chicago',
      footerText: '© 2026 Renegade Party. Published autonomously with Renegade CMS.',
      logo: logoAsset.id,
      defaultSocialImage: socialAsset.id,
      indexingMode: 'index',
    },
    overrideAccess: true,
  } as never)

  // 7. Setup Taxonomy & Author
  let categoryDoc = (
    await payload.find({
      collection: 'categories',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'manifestos' } }] },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }

  if (!categoryDoc) {
    categoryDoc = (await payload.create({
      collection: 'categories',
      data: {
        site: siteId,
        scope: 'site',
        name: 'Manifestos',
        slug: 'manifestos',
        canonicalPath: '/categories/manifestos',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }

  let tagDoc = (
    await payload.find({
      collection: 'tags',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'independence' } }] },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }

  if (!tagDoc) {
    tagDoc = (await payload.create({
      collection: 'tags',
      data: { site: siteId, scope: 'site', name: 'Independence', slug: 'independence' },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }

  let topicDoc = (
    await payload.find({
      collection: 'topics',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: 'governance' } }] },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }

  if (!topicDoc) {
    topicDoc = (await payload.create({
      collection: 'topics',
      data: { site: siteId, scope: 'site', name: 'Governance', slug: 'governance' },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }

  let authorDoc = (
    await payload.find({
      collection: 'authors',
      where: { slug: { equals: 'renegade-founder' } },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }

  if (!authorDoc) {
    authorDoc = (await payload.create({
      collection: 'authors',
      data: {
        displayName: 'Renegade Founder',
        slug: 'renegade-founder',
        bio: 'Champion of decentralized civic journalism and self-governance.',
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
  }

  // 8. Pages: /platform and /principles
  const ensureContent = async (data: Record<string, unknown>) => {
    const existing = await payload.find({
      collection: 'content',
      where: {
        and: [{ site: { equals: siteId } }, { slug: { equals: data.slug } }],
      },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (existing.docs[0]) {
      return { id: String(existing.docs[0].id) }
    }
    const doc = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        authors: [{ author: authorDoc.id, displayOrder: 0, role: 'Author' }],
        ...data,
      },
      overrideAccess: true,
    } as never)) as unknown as { id: string }
    return { id: String(doc.id) }
  }

  const platformPage = await ensureContent({
    contentType: 'page',
    title: 'The Renegade Platform',
    slug: 'platform',
    canonicalPath: '/platform',
    summary:
      'Our comprehensive policy platform for individual liberty and decentralized public administration.',
    status: 'published',
    publishedAt: new Date().toISOString(),
    body: {
      root: {
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: '1. Decentralized Infrastructure' }],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Public platforms must be governed by transparent protocols, cryptographic auditability, and local custody rather than opaque monopolies.',
              },
            ],
          },
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: '2. Citizen Sovereignty' }],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Every individual maintains absolute sovereign ownership of their speech, personal data, and civic participation credentials.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  const principlesPage = await ensureContent({
    contentType: 'page',
    title: 'Core Principles of Autonomous Governance',
    slug: 'principles',
    canonicalPath: '/principles',
    summary: 'The immutable values and architectural commitments guiding our civic movement.',
    status: 'published',
    publishedAt: new Date().toISOString(),
    body: {
      root: {
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Principle I: Transparency Over Authority' }],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Verifiable consensus and cryptographic proofs replace unquestioned institutional edicts.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  // 9. Posts: 5 posts
  // Post 1: The Renegade Declaration (with redirect from initial-declaration)
  const post1 = await ensureContent({
    contentType: 'article',
    title: 'The Renegade Declaration',
    slug: 'renegade-declaration',
    canonicalPath: '/articles/renegade-declaration',
    summary:
      'The founding charter of the Renegade Party, establishing our commitment to decentralized governance.',
    excerpt:
      'The founding charter of the Renegade Party, establishing our commitment to decentralized governance.',
    status: 'published',
    publishedAt: new Date().toISOString(),
    heroMedia: heroAsset.id,
    categories: [categoryDoc.id],
    tags: [tagDoc.id],
    topics: [topicDoc.id],
    seoTitle: 'The Renegade Declaration | Renegade Party',
    seoDescription: 'Read the official declaration of the Renegade Party.',
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'We hold that digital self-determination is an inalienable prerogative of free people everywhere.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  // Ensure 308 redirect from initial-declaration
  const existingRedirect = await payload.find({
    collection: 'public-redirects',
    where: {
      and: [
        { site: { equals: siteId } },
        { fromPath: { equals: '/articles/initial-declaration' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  } as never)
  if (!existingRedirect.docs[0]) {
    await payload.create({
      collection: 'public-redirects',
      data: {
        site: siteId,
        fromPath: '/articles/initial-declaration',
        toPath: '/articles/renegade-declaration',
        statusCode: '308',
      },
      overrideAccess: true,
    } as never)
  }

  // Post 2: Decentralized Truth in Governance (with unpublished draft revision and unique phrase)
  const uniqueBodyPhrase = 'Decentralized truth cannot be silenced by centralized gatekeepers'
  const post2 = await ensureContent({
    contentType: 'article',
    title: 'Decentralized Truth in Governance',
    slug: 'decentralized-truth',
    canonicalPath: '/articles/decentralized-truth',
    subtitle: 'The imperative of immutable public records in modern democracies',
    summary:
      'Why verifiable records and decentralized architecture are essential for public integrity.',
    excerpt:
      'Why verifiable records and decentralized architecture are essential for public integrity.',
    status: 'published',
    publishedAt: new Date().toISOString(),
    heroMedia: heroAsset.id,
    categories: [categoryDoc.id],
    tags: [tagDoc.id],
    topics: [topicDoc.id],
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: `${uniqueBodyPhrase}. When public archives are distributed across autonomous nodes, corruption has no dark corner to hide in.`,
              },
            ],
          },
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Architectural Transparency' }],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Self-custody and local data persistence empower communities with immutable historical records.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  // Ensure unpublished draft revision for post 2
  const post2Companions = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: post2.id } },
    overrideAccess: true,
  } as never)
  if (post2Companions.docs[0]) {
    const post2CompId = String(post2Companions.docs[0].id)
    const baseRevision = (
      await payload.find({
        collection: 'revision-records',
        where: { article: { equals: post2CompId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs[0] as unknown as { id: string } | undefined

    if (baseRevision) {
      await saveEditorialDraft(payload, {
        articleId: post2CompId,
        actor: { id: user.id, role: 'publisher' },
        actorUserId: user.id,
        baseRevisionId: String(baseRevision.id),
        mutationId: randomUUID(),
        document: {
          format: 'payload-lexical',
          schemaVersion: 1,
          unknownNodePolicy: 'preserve',
          canonicalHash: 'draft-revision-hash-v2',
          plainTextProjection:
            'Updated draft revision content awaiting executive committee approval.',
          document: {
            root: {
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'text',
                      text: 'Updated draft revision content awaiting executive committee approval.',
                    },
                  ],
                },
              ],
              type: 'root',
            },
          },
        },
      }).catch(() => {})
    }
  }

  // Post 3: Scheduled Post
  const post3 = await ensureContent({
    contentType: 'article',
    title: '2027 National Assembly Agenda',
    slug: '2027-national-assembly',
    canonicalPath: '/articles/2027-national-assembly',
    summary: 'Delegates convene to establish operational standards and legislative priorities.',
    status: 'scheduled',
    publishedAt: '2027-07-04T12:00:00.000Z',
    categories: [categoryDoc.id],
    tags: [tagDoc.id],
    topics: [topicDoc.id],
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Embargoed draft agenda for the upcoming 2027 convention.' },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  // Post 4: Draft Post
  const post4 = await ensureContent({
    contentType: 'article',
    title: 'Grassroots Organizing Strategy Memo',
    slug: 'grassroots-strategy-memo',
    canonicalPath: '/articles/grassroots-strategy-memo',
    summary: 'Internal guidance for chapter coordinators on local assembly mobilization.',
    status: 'draft',
    categories: [categoryDoc.id],
    tags: [tagDoc.id],
    topics: [topicDoc.id],
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Confidential strategy playbook for precinct-level organizing.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  // Post 5: Archived Post
  const post5 = await ensureContent({
    contentType: 'article',
    title: 'Archived Resolution on Legacy Systems',
    slug: 'archived-legacy-resolution',
    canonicalPath: '/articles/archived-legacy-resolution',
    summary: 'Superseded consensus document archived for historical provenance.',
    status: 'archived',
    categories: [categoryDoc.id],
    tags: [tagDoc.id],
    topics: [topicDoc.id],
    body: {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'This resolution has been retired from active party policy.',
              },
            ],
          },
        ],
        type: 'root',
      },
    },
  })

  return {
    siteId,
    publicationId,
    userId: String(user.id),
    cookieHeader,
    sessionToken: session.token,
    assets: {
      logo: logoAsset,
      social: socialAsset,
      hero: heroAsset,
      inline: inlineAsset,
    },
    pages: {
      platform: platformPage,
      principles: principlesPage,
    },
    posts: {
      declaration: post1,
      truth: post2,
      assembly: post3,
      memo: post4,
      archived: post5,
    },
  }
}
