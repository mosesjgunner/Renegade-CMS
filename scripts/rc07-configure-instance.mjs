import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { loadConfig } from '../src/modules/core/config.ts'
import { provisionOnboardingSite } from '../src/modules/operations/onboarding.ts'
import { uploadMedia } from '../src/modules/media/workflow.ts'

const target = process.env.INSTANCE_TARGET || 'renegadeparty'

async function run() {
  console.log(`Starting configuration for target instance: ${target}`)
  const payload = await getPayload({ config })
  const appConfig = loadConfig()
  const pool = payload.db.pool

  if (target === 'renegadeparty') {
    const ownerEmail = 'owner@renegadeparty.test'
    const input = {
      name: 'Renegade Party',
      slug: 'renegadeparty',
      description: 'Autonomous publishing and grassroots governance for the Renegade movement.',
      primaryUrl: 'https://party.renegadeparty.test:3181',
      locale: 'en-US',
      timezone: 'America/Chicago',
      themeId: 'renegade-party',
      starterType: 'creator-publication',
      featureProfile: 'Lean',
      optionalConnections: [],
      starterContent: false,
      publishingDefaults: {
        indexingMode: 'index',
        commentsPolicy: 'open',
        visibility: 'public',
      },
    }

    const provisioned = await provisionOnboardingSite(payload, ownerEmail, input)
    console.log('Site provisioned:', provisioned.site.id)

    const userRes = await pool.query(
      `INSERT INTO users (email, role, member_id)
       VALUES ($1, 'owner', $2)
       ON CONFLICT (email) DO UPDATE SET member_id = EXCLUDED.member_id
       RETURNING id`,
      [ownerEmail, provisioned.member.id],
    )
    const ownerId = userRes.rows[0].id

    await pool.query(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
       VALUES ($1, $2, $3, 0, 'singleDevice', false, 'Initial passkey', '["internal"]')
       ON CONFLICT DO NOTHING`,
      [ownerId, 'party-passkey-cred-id', 'party-public-key'],
    )

    await pool.query(
      `UPDATE installation_state
       SET state = 'complete', bootstrap_token_hash = NULL, bootstrap_expires_at = NULL,
           registration_challenge = NULL, registration_email = NULL, registration_session_hash = NULL,
           owner_user_id = $1, completed_at = now(), updated_at = now()
       WHERE singleton = true`,
      [ownerId],
    )

    // Upload instance A media
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const mediaAsset = await uploadMedia(payload, appConfig, {
      user: { id: ownerId, email: ownerEmail, role: 'owner' },
      scope: {
        kind: 'site',
        siteId: provisioned.site.id,
        publicationId: provisioned.publication.id,
        spaceId: provisioned.space.id,
      },
      title: 'Renegade Party Emblem',
      altText: 'Official emblem of the Renegade Party',
      originalFilename: 'renegadeparty-emblem.png',
      bytes: new Uint8Array(pngBuffer),
    })
    console.log('Media asset uploaded:', mediaAsset.id)

    // Create published article
    const article = await payload.create({
      collection: 'content',
      data: {
        site: provisioned.site.id,
        publication: provisioned.publication.id,
        contentType: 'article',
        title: 'The Renegade Party Manifesto',
        slug: 'renegade-manifesto',
        canonicalPath: '/renegade-manifesto',
        summary: 'Our declaration of civic autonomy and digital self-governance.',
        status: 'published',
        publishedAt: new Date().toISOString(),
        primaryMedia: mediaAsset.id,
        body: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'We stand for decentralized civic infrastructure, sovereign local communities, and digital self-governance.',
                  },
                ],
              },
            ],
          },
        },
      },
      overrideAccess: true,
    })
    console.log('Article published:', article.id)

    // Create published page
    const page = await payload.create({
      collection: 'content',
      data: {
        site: provisioned.site.id,
        publication: provisioned.publication.id,
        contentType: 'page',
        title: 'Platform & Principles',
        slug: 'platform',
        canonicalPath: '/platform',
        summary: 'Our core policy platform for decentralized community coordination.',
        status: 'published',
        publishedAt: new Date().toISOString(),
        body: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'Tenet 1: Open protocols over closed platforms.',
                  },
                ],
              },
            ],
          },
        },
      },
      overrideAccess: true,
    })
    console.log('Page published:', page.id)

    // Update navigation
    await payload.update({
      collection: 'publications',
      id: provisioned.publication.id,
      data: {
        themePreset: 'renegade-party',
        navigation: [
          { label: 'Home', href: '/' },
          { label: 'Manifesto', href: '/renegade-manifesto' },
          { label: 'Platform', href: '/platform' },
        ],
      },
      overrideAccess: true,
    })

    // Update site settings
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: 'Renegade Party',
        defaultTitle: 'Renegade Party Movement',
        defaultDescription: 'Autonomous publishing and grassroots governance.',
        themeId: 'renegade-party',
        logo: mediaAsset.id,
      },
      overrideAccess: true,
    })

    console.log('Instance A (renegadeparty) successfully configured.')
  } else if (target === 'myhigherpower') {
    const ownerEmail = 'owner@myhigherpower.test'
    const input = {
      name: 'My Higher Power',
      slug: 'myhigherpower',
      description: 'Spiritual fellowship and daily recovery reflections.',
      primaryUrl: 'https://power.myhigherpower.test:3182',
      locale: 'en-US',
      timezone: 'America/New_York',
      themeId: 'neutral-starter',
      starterType: 'publication-community',
      featureProfile: 'Standard',
      optionalConnections: ['email', 'commerce'],
      starterContent: false,
      publishingDefaults: {
        indexingMode: 'index',
        commentsPolicy: 'members',
        visibility: 'public',
      },
    }

    const provisioned = await provisionOnboardingSite(payload, ownerEmail, input)
    console.log('Site provisioned:', provisioned.site.id)

    const userRes = await pool.query(
      `INSERT INTO users (email, role, member_id)
       VALUES ($1, 'owner', $2)
       ON CONFLICT (email) DO UPDATE SET member_id = EXCLUDED.member_id
       RETURNING id`,
      [ownerEmail, provisioned.member.id],
    )
    const ownerId = userRes.rows[0].id

    await pool.query(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
       VALUES ($1, $2, $3, 0, 'singleDevice', false, 'Initial passkey', '["internal"]')
       ON CONFLICT DO NOTHING`,
      [ownerId, 'power-passkey-cred-id', 'power-public-key'],
    )

    await pool.query(
      `UPDATE installation_state
       SET state = 'complete', bootstrap_token_hash = NULL, bootstrap_expires_at = NULL,
           registration_challenge = NULL, registration_email = NULL, registration_session_hash = NULL,
           owner_user_id = $1, completed_at = now(), updated_at = now()
       WHERE singleton = true`,
      [ownerId],
    )

    // Upload instance B media (different distinct bytes)
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const mediaAsset = await uploadMedia(payload, appConfig, {
      user: { id: ownerId, email: ownerEmail, role: 'owner' },
      scope: {
        kind: 'site',
        siteId: provisioned.site.id,
        publicationId: provisioned.publication.id,
        spaceId: provisioned.space.id,
      },
      title: 'Serenity Lotus Emblem',
      altText: 'Serenity emblem for recovery fellowship',
      originalFilename: 'lotus-serenity.png',
      bytes: new Uint8Array(pngBuffer),
    })
    console.log('Media asset uploaded:', mediaAsset.id)

    // Create published article
    const article = await payload.create({
      collection: 'content',
      data: {
        site: provisioned.site.id,
        publication: provisioned.publication.id,
        contentType: 'article',
        title: 'Reflections on the Twelve Steps',
        slug: 'step-reflections',
        canonicalPath: '/step-reflections',
        summary: 'Daily contemplative meditations on spiritual renewal and service.',
        status: 'published',
        publishedAt: new Date().toISOString(),
        primaryMedia: mediaAsset.id,
        body: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'A daily guide to spiritual renewal, serenity, and surrender in fellowship.',
                  },
                ],
              },
            ],
          },
        },
      },
      overrideAccess: true,
    })
    console.log('Article published:', article.id)

    // Create published page
    const page = await payload.create({
      collection: 'content',
      data: {
        site: provisioned.site.id,
        publication: provisioned.publication.id,
        contentType: 'page',
        title: 'Daily Meditations',
        slug: 'meditations',
        canonicalPath: '/meditations',
        summary: 'A quiet sanctuary for contemplative spiritual growth.',
        status: 'published',
        publishedAt: new Date().toISOString(),
        body: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'text',
                    text: 'Serenity prayer and morning contemplative readings.',
                  },
                ],
              },
            ],
          },
        },
      },
      overrideAccess: true,
    })
    console.log('Page published:', page.id)

    // Update navigation
    await payload.update({
      collection: 'publications',
      id: provisioned.publication.id,
      data: {
        themePreset: 'neutral-starter',
        navigation: [
          { label: 'Home', href: '/' },
          { label: 'Reflections', href: '/step-reflections' },
          { label: 'Meditations', href: '/meditations' },
          { label: 'Fellowship', href: '/fellowship' },
        ],
      },
      overrideAccess: true,
    })

    // Update site settings
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        siteName: 'My Higher Power',
        defaultTitle: 'My Higher Power Fellowship',
        defaultDescription: 'Spiritual fellowship and daily recovery reflections.',
        themeId: 'neutral-starter',
        logo: mediaAsset.id,
      },
      overrideAccess: true,
    })

    console.log('Instance B (myhigherpower) successfully configured.')
  }

  process.exit(0)
}

run().catch((err) => {
  console.error('Configuration failed:', err)
  process.exit(1)
})
