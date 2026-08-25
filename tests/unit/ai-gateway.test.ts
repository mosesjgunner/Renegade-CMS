import { describe, expect, it } from 'vitest'
import { AI_TASKS, type AiAdapter, type AiExecution } from '../../src/modules/ai/contracts'
import {
  AiGateway,
  buildInspectableContext,
  validateProposalOutput,
} from '../../src/modules/ai/gateway'
import { invokeScopedAgentTool } from '../../src/modules/ai/agents'

const connection: AiExecution['connection'] = {
  id: 'c1',
  siteId: 'site-1',
  publicationId: 'pub-1',
  providerKey: 'ai.openai-compatible',
  externalAccountId: 'acct',
  label: 'BYO',
  status: 'active',
  encryptedSecretRef: 'vault://c1',
  scopes: [],
  expiresAt: null,
  refreshMetadata: null,
  capabilities: [],
  lastHealthCheckAt: null,
  lastError: null,
  auditEventIds: [],
}
const adapter: AiAdapter = {
  providerKey: 'ai.openai-compatible',
  supports: ['ai.text.rewrite', 'ai.text.structured'],
  complete: async () => ({
    output: 'A proposal, not a mutation.',
    inputTokens: 100,
    outputTokens: 20,
  }),
}
const input = (): AiExecution => ({
  connection,
  model: 'test-model',
  task: 'editor.tighten',
  context: {
    selection: 'Original draft',
    privateNotes: 'never send',
    visiblePosts: [
      { id: 'public', text: 'Visible', visibility: 'public', status: 'published' },
      { id: 'held', text: 'Hidden', visibility: 'public', status: 'held' },
    ],
  },
  controls: { includeArticle: false, includeBrandVoice: false, includeSources: false },
  permissions: ['ai.use'],
  budget: { perTaskUsd: 1, monthlyUsd: 10, spentThisMonthUsd: 0 },
  pricePer1kTokensUsd: { input: 0.01, output: 0.02 },
})
describe('AI gateway acceptance fixtures', () => {
  it('keeps the original draft, excludes private/held material, and records usage', async () => {
    const result = await new AiGateway([adapter]).execute(input())
    expect(result.status).toBe('ready')
    expect(result.original).toBe('Original draft')
    expect(result.contextPreview).toMatchObject({
      privateNotesExcluded: true,
      visiblePostIds: ['public'],
    })
    expect(result.usage?.estimatedCostUsd).toBeGreaterThan(0)
  })
  it('has reviewable registry coverage for editor, intelligence, discussion, and image hooks', () => {
    expect(AI_TASKS['intelligence.taxonomy'].outputSchema).toBe('structured-proposal')
    expect(AI_TASKS['discussion.intelligence'].allowedInputs).toContain('discussion-visible-posts')
    expect(AI_TASKS['image.assist'].fallback).toBe('manual-copyable-prompt')
  })
  it('refuses private notes, providers, budget overruns, and permissions without mutation', async () => {
    expect(() =>
      buildInspectableContext(
        AI_TASKS['editor.tighten'],
        { privateNotes: 'secret' },
        {
          includeArticle: false,
          includeBrandVoice: false,
          includeSources: false,
          includePrivateNotes: true,
        },
      ),
    ).toThrow('Private editorial notes')
    expect((await new AiGateway([]).execute(input())).status).toBe('no-provider')
    expect(
      (
        await new AiGateway([adapter]).execute({
          ...input(),
          budget: { perTaskUsd: 0, monthlyUsd: 10, spentThisMonthUsd: 0 },
        })
      ).status,
    ).toBe('no-budget')
    await expect(new AiGateway([adapter]).execute({ ...input(), permissions: [] })).rejects.toThrow(
      'permission denied',
    )
  })
  it('validates structured output and locks agent tools to their granted scope', () => {
    expect(() => validateProposalOutput(AI_TASKS['intelligence.taxonomy'], 'not json')).toThrow(
      'structured proposal',
    )
    const run = {
      id: 'run',
      siteId: 'site-1',
      publicationId: 'pub-1',
      spaceId: null,
      status: 'completed' as const,
      audit: [],
    }
    const result = invokeScopedAgentTool({
      run,
      tool: 'content.draft.read',
      manifest: {
        name: 'content.draft.read',
        version: 1,
        input: {},
        output: {},
        permission: 'content.read.draft',
        dataSensitivity: 'staff',
        rateLimit: '1/min',
        idempotency: 'none',
        approval: 'never',
        timeoutMs: 1,
        audit: 'required',
        rollback: 'none',
      },
      target: { siteId: 'site-1', publicationId: 'other' },
      grants: ['content.read.draft'],
    })
    expect(result.status).toBe('denied')
  })
  it('redacts provider failure and returns a recoverable state', async () => {
    const broken: AiAdapter = {
      ...adapter,
      complete: async () => {
        throw new Error('token=super-secret unavailable')
      },
    }
    const result = await new AiGateway([broken]).execute(input())
    expect(result.status).toBe('failed')
    expect(JSON.stringify(result.output)).toContain('[REDACTED]')
  })
})
