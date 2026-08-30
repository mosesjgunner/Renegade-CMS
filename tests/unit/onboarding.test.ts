import { describe, expect, it } from 'vitest'

import {
  provisionOnboardingSite,
  validateOnboardingInput,
  type OnboardingInput,
} from '../../src/modules/operations/onboarding'

const input = (overrides: Partial<OnboardingInput> = {}): OnboardingInput => ({
  name: 'Example Journal',
  slug: 'example-journal',
  description: 'A useful starter site.',
  primaryUrl: 'https://example.test',
  locale: 'en-US',
  timezone: 'America/Chicago',
  themeId: 'neutral-starter',
  starterType: 'creator-publication',
  featureProfile: 'Standard',
  optionalConnections: [],
  starterContent: true,
  ...overrides,
})

type MockRecord = { id: string; collection: string; [key: string]: unknown }

function matches(record: MockRecord, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const expected = (condition as { equals?: unknown }).equals
    return expected === undefined || record[field] === expected
  })
}

function payloadDouble() {
  const records: MockRecord[] = []
  let id = 0
  return {
    records,
    find: async ({
      collection,
      where,
    }: {
      collection: string
      where: Record<string, unknown>
    }) => ({
      docs: records.filter((record) => record.collection === collection && matches(record, where)),
    }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const record = { id: `${collection}-${++id}`, collection, ...data }
      records.push(record)
      return record
    },
    update: async ({
      collection,
      id: recordId,
      data,
    }: {
      collection: string
      id: string
      data: Record<string, unknown>
    }) => {
      const record = records.find((item) => item.collection === collection && item.id === recordId)
      if (!record) throw new Error('record not found')
      Object.assign(record, data)
      return record
    },
    updateGlobal: async () => ({}),
  }
}

describe('first-run onboarding', () => {
  it('keeps Lean and Standard profiles explicit while allowing all integrations to be skipped', () => {
    expect(validateOnboardingInput(input({ featureProfile: 'Lean' }))).toMatchObject({
      featureProfile: 'Lean',
      optionalConnections: [],
    })
    expect(
      validateOnboardingInput(
        input({ featureProfile: 'Standard', optionalConnections: ['email', 'email'] }),
      ),
    ).toMatchObject({
      featureProfile: 'Standard',
      optionalConnections: ['email'],
    })
  })

  it('creates one canonical starter pack and is idempotent after an interrupted enrollment', async () => {
    const payload = payloadDouble()
    await provisionOnboardingSite(payload as never, 'owner@example.test', input())
    await provisionOnboardingSite(payload as never, 'owner@example.test', input())

    expect(payload.records.filter((record) => record.collection === 'sites')).toHaveLength(1)
    expect(payload.records.filter((record) => record.collection === 'publications')).toHaveLength(1)
    expect(payload.records.filter((record) => record.collection === 'spaces')).toHaveLength(1)
    expect(payload.records.filter((record) => record.collection === 'content')).toHaveLength(5)
    expect(payload.records.filter((record) => record.collection === 'page-layouts')).toHaveLength(1)
    expect(
      payload.records.filter((record) => record.collection === 'analytics-events'),
    ).toHaveLength(0)
  })
})
