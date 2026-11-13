// RC2-G-02 setup: stated test boundaries.
// 1) Analytics is enabled by writing the site-settings global in-process.
//    Through the product this is currently impossible in a multi-site install
//    (RC2-DEBT-16: the global's REST access requires a global-owner flag no
//    code path can set) — the flag flip is therefore done here, and DEBT-16
//    remains the filed P1 for the product surface.
// 2) The canonical public experiment is persisted (experiment + variants +
//    its conversion form with a published schema) with the exact identity
//    the public component uses, so exposures and conversions can be recorded
//    through the real public routes.
import { readFileSync, writeFileSync } from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'
import { describe, expect, it } from 'vitest'

type Doc = Record<string, unknown> & { id: string }

describe('RC2-G-02 setup', () => {
  it('enables analytics and persists the configured canonical experiment', async () => {
    const payload = await getPayload({ config })
    const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8')) as {
      siteA: { siteId: string }
      suffix: string
    }
    const siteA = world.siteA.siteId
    const suffix = world.suffix

    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
    const privacy = (settings.privacy ?? {}) as Record<string, unknown>
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        privacy: {
          ...privacy,
          analyticsEnabled: true,
          consentVersion: String(privacy.consentVersion ?? '2026-08-31'),
          rawEventRetentionDays: Number(privacy.rawEventRetentionDays ?? 90),
        },
      } as never,
      overrideAccess: true,
    })
    const after = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })) as unknown as { privacy?: { analyticsEnabled?: boolean } }
    expect(after.privacy?.analyticsEnabled).toBe(true)

    // Conversion form (public, published schema) — required for the
    // experiment to reach configurationStatus 'configured'.
    const existingForms = await payload.find({
      collection: 'form-definitions' as never,
      where: {
        and: [{ site: { equals: siteA } }, { name: { equals: `G-02 Lead Form ${suffix}` } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let formId = (existingForms.docs[0] as unknown as Doc | undefined)?.id
    if (!formId) {
      const formDef = (await payload.create({
        collection: 'form-definitions' as never,
        data: {
          site: siteA,
          name: `G-02 Lead Form ${suffix}`,
          title: 'Contact the newsroom',
          template: 'contact',
          publicPath: `/forms/g02-lead-${suffix}`,
          visibility: 'public',
          settings: { allowedEmbedOrigins: ['https://a.rc2-a04.test'] },
          actions: [{ type: 'create-contact', emailField: 'email', nameField: 'full_name' }],
        } as never,
        overrideAccess: true,
      })) as unknown as Doc
      formId = formDef.id
      const schemaSnapshot = {
        version: 1,
        locale: 'en',
        consentText: 'I consent to be contacted about this inquiry.',
        consentRevision: '2026.1',
        fields: [
          {
            key: 'email',
            type: 'email',
            label: 'Email Address',
            required: true,
            validation: { pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
          },
          { key: 'full_name', type: 'text', label: 'Full Name', required: false },
          { key: 'consent', type: 'checkbox', label: 'Consent', required: true },
        ],
      }
      const formSchema = (await payload.create({
        collection: 'form-schemas' as never,
        data: {
          site: siteA,
          form: formId,
          version: 1,
          state: 'published',
          locale: 'en',
          consentText: schemaSnapshot.consentText,
          consentRevision: schemaSnapshot.consentRevision,
          schema: schemaSnapshot,
        } as never,
        overrideAccess: true,
      })) as unknown as Doc
      await payload.update({
        collection: 'form-definitions' as never,
        id: formId,
        data: { activeSchema: formSchema.id } as never,
        overrideAccess: true,
      })
    }

    {
      const formDoc = (await payload.findByID({
        collection: 'form-definitions' as never,
        id: formId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Doc
      if (formDoc.activeSchema) {
        const schemaDoc = (await payload.findByID({
          collection: 'form-schemas' as never,
          id: String(formDoc.activeSchema),
          depth: 0,
          overrideAccess: true,
        } as never)) as unknown as Doc
        if (!schemaDoc.consentRevision) {
          // Published schemas are immutable (collection hook): supersede
          // with a new published version carrying the consent revision.
          const v2 = (await payload.create({
            collection: 'form-schemas' as never,
            data: {
              site: siteA,
              form: formId,
              version: Number(schemaDoc.version ?? 1) + 1,
              state: 'published',
              locale: String(schemaDoc.locale ?? 'en'),
              consentText: String(schemaDoc.consentText ?? ''),
              consentRevision: '2026.1',
              schema: schemaDoc.schema,
            } as never,
            overrideAccess: true,
          })) as unknown as Doc
          await payload.update({
            collection: 'form-definitions' as never,
            id: formId,
            data: { activeSchema: v2.id } as never,
            overrideAccess: true,
          })
        }
      }
    }

    const existing = await payload.find({
      collection: 'experiments' as never,
      where: {
        and: [
          { site: { equals: siteA } },
          { name: { equals: 'Homepage Hero CTA & Reader Onboarding Optimization' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    let experimentId = (existing.docs[0] as unknown as Doc | undefined)?.id
    if (!experimentId) {
      const created = (await payload.create({
        collection: 'experiments' as never,
        data: {
          site: siteA,
          name: 'Homepage Hero CTA & Reader Onboarding Optimization',
          description:
            'Testing Sovereign Dispatch CTA (Control) vs. Free Reader Network CTA (Treatment) for reader conversion.',
          state: 'running',
          assignmentSalt: 'renegade-hero-experiment-salt-2026',
          collectionEnabled: true,
          goalKey: 'lead-contact-volunteer',
          conversionForm: formId,
        } as never,
        overrideAccess: true,
      })) as unknown as Doc
      experimentId = created.id
      const variantRows = [
        {
          key: 'variant-control',
          name: 'Sovereign Dispatch (Control)',
          isControl: true,
          allocation: 50,
          registeredComponent: 'publisher.newsletter-cta',
        },
        {
          key: 'variant-treatment',
          name: 'Free Reader Network (Treatment)',
          isControl: false,
          allocation: 50,
          registeredComponent: 'publisher.cta',
        },
      ]
      for (const v of variantRows) {
        await payload.create({
          collection: 'experiment-variants' as never,
          data: {
            site: siteA,
            experiment: experimentId,
            variantId: v.key,
            name: v.name,
            isControl: v.isControl,
            allocation: v.allocation,
            registeredComponent: v.registeredComponent,
          } as never,
          overrideAccess: true,
        })
      }
    } else {
      await payload.update({
        collection: 'experiments' as never,
        id: experimentId,
        data: { conversionForm: formId } as never,
        overrideAccess: true,
      })
    }
    const variants = await payload.find({
      collection: 'experiment-variants' as never,
      where: {
        and: [{ site: { equals: siteA } }, { experiment: { equals: experimentId } }],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    const byControl = (want: boolean) =>
      (variants.docs as unknown as Doc[]).find((v) => Boolean(v.isControl) === want)?.id
    writeFileSync(
      '/tmp/g02-setup.json',
      JSON.stringify({
        experimentDbId: experimentId,
        siteA,
        formId,
        controlVariantId: byControl(true),
        treatmentVariantId: byControl(false),
      }),
    )
    console.log('g02 setup: experiment', experimentId, 'form', formId)
  })
})
