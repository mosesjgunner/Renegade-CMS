import { describe, expect, it } from 'vitest'
import {
  CANONICAL_PUBLIC_EXPERIMENT,
  getActivePublicExperiment,
} from '../../src/modules/experiences/public-experiment'

const experiment = {
  id: 'persisted-experiment',
  site: 'site-a',
  name: CANONICAL_PUBLIC_EXPERIMENT.name,
  assignmentSalt: 'persisted-salt',
  conversionForm: 'form-a',
  state: 'running',
  collectionEnabled: true,
}
const variants = [
  {
    id: 'persisted-control',
    name: 'Control',
    isControl: true,
    allocation: 50,
    registeredComponent: 'publisher.newsletter-cta',
  },
  {
    id: 'persisted-treatment',
    name: 'Treatment',
    isControl: false,
    allocation: 50,
    registeredComponent: 'publisher.cta',
  },
]
const store = (
  options: {
    exists?: boolean
    state?: string
    collect?: boolean
    allocation?: number
    decision?: boolean
    noForm?: boolean
    component?: string
    unavailable?: boolean
  } = {},
) => ({
  collections: { 'form-definitions': {} },
  findByID: async () => ({
    id: 'schema-a',
    form: 'form-a',
    state: 'published',
    locale: 'en',
    consentText: 'Contact permission',
    consentRevision: 'v1',
    schema: { fields: [{ key: 'email', type: 'email', label: 'Email', required: true }] },
  }),
  find: async ({ collection }: { collection: string }) => {
    if (options.unavailable) throw new Error('Disconnected fixture store')
    if (collection === 'form-definitions')
      return {
        docs: options.noForm ? [] : [{ id: 'form-a', activeSchema: 'schema-a', actions: [] }],
      }
    if (collection === 'experiments')
      return {
        docs: options.exists
          ? [
              {
                ...experiment,
                state: options.state ?? experiment.state,
                collectionEnabled: options.collect ?? true,
              },
            ]
          : [],
      }
    if (collection === 'experiment-variants')
      return {
        docs: variants.map((v, i) => ({
          ...v,
          registeredComponent: options.component ?? v.registeredComponent,
          allocation: i === 1 ? (options.allocation ?? v.allocation) : v.allocation,
        })),
      }
    return {
      docs: options.decision
        ? [
            {
              selectedVariant: 'persisted-treatment',
              reason: 'Human review',
              decidedAt: '2026-10-14T12:00:00Z',
              approvedBy: 'operator',
            },
          ]
        : [],
    }
  },
})

describe('persisted public experiment configuration', () => {
  it('does not promote the built-in blueprint to a running experiment', async () => {
    const result = await getActivePublicExperiment(store() as never, 'site-a')
    expect(result).toMatchObject({
      dbId: null,
      state: 'draft',
      collectionEnabled: false,
      configurationStatus: 'unconfigured',
      winnerDecision: null,
    })
  })
  it('binds the agreement, variants and winner to actual persisted identities', async () => {
    const result = await getActivePublicExperiment(
      store({ exists: true, decision: true, state: 'winner-selected' }) as never,
      'site-a',
    )
    expect(result).toMatchObject({
      id: experiment.id,
      dbId: experiment.id,
      assignmentSalt: experiment.assignmentSalt,
      state: 'winner-selected',
      configurationStatus: 'configured',
      winnerDecision: { selectedVariantId: 'persisted-treatment' },
    })
    expect(result.variants.map((variant) => variant.id)).toEqual([
      'persisted-control',
      'persisted-treatment',
    ])
  })
  it('rejects missing public outcomes and unregistered rendering components', async () => {
    for (const options of [{ noForm: true }, { component: 'arbitrary.script' }])
      expect(
        await getActivePublicExperiment(store({ exists: true, ...options }) as never, 'site-a'),
      ).toMatchObject({
        state: 'draft',
        collectionEnabled: false,
        configurationStatus: 'unconfigured',
      })
  })
  it('historical approval cannot override a human rollback', async () => {
    expect(
      await getActivePublicExperiment(
        store({ exists: true, decision: true, state: 'paused' }) as never,
        'site-a',
      ),
    ).toMatchObject({ state: 'paused', winnerDecision: null })
  })
  it('preserves configured pause and collection-off decisions', async () => {
    const result = await getActivePublicExperiment(
      store({ exists: true, state: 'paused', collect: false }) as never,
      'site-a',
    )
    expect(result).toMatchObject({
      state: 'paused',
      collectionEnabled: false,
      configurationStatus: 'configured',
    })
  })
  it('does not activate invalid traffic allocations or unavailable storage', async () => {
    expect(
      await getActivePublicExperiment(store({ exists: true, allocation: 20 }) as never, 'site-a'),
    ).toMatchObject({
      state: 'draft',
      collectionEnabled: false,
      configurationStatus: 'unconfigured',
    })
    expect(
      await getActivePublicExperiment(store({ unavailable: true }) as never, 'site-a'),
    ).toMatchObject({
      state: 'draft',
      collectionEnabled: false,
      configurationStatus: 'unavailable',
    })
  })
})
