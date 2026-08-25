import type { ConnectionRecord } from '../extensions/contracts'

export type AiTaskKey =
  | 'editor.improve-selection'
  | 'editor.tighten'
  | 'editor.expand'
  | 'editor.simplify'
  | 'editor.clarify'
  | 'editor.alternatives'
  | 'editor.headlines'
  | 'editor.subtitle'
  | 'editor.opening-ideas'
  | 'editor.conclusion-ideas'
  | 'editor.excerpt'
  | 'editor.summary'
  | 'editor.outline'
  | 'editor.faq'
  | 'editor.tone-brand'
  | 'editor.grammar-explain'
  | 'content.repurpose'
  | 'brand.about-mission'
  | 'intelligence.taxonomy'
  | 'intelligence.related-links'
  | 'intelligence.overlap'
  | 'intelligence.metadata-seo'
  | 'intelligence.social-newsletter'
  | 'intelligence.quotes'
  | 'intelligence.transcript-cleanup'
  | 'intelligence.chapters'
  | 'intelligence.event'
  | 'intelligence.timeline'
  | 'intelligence.product'
  | 'discussion.intelligence'
  | 'image.assist'
export type AiTaskDefinition = {
  key: AiTaskKey
  capability: 'ai.text.rewrite' | 'ai.text.structured' | 'ai.image.assist'
  allowedInputs: readonly string[]
  outputSchema: 'text-proposal' | 'structured-proposal'
  quality: 'fast' | 'standard' | 'high'
  maxCostClass: 'low' | 'medium' | 'high'
  timeoutMs: number
  maxContextChars: number
  sensitiveData: 'exclude-private-notes'
  permission: string
  audit: 'required'
  fallback: 'unavailable-state' | 'manual-copyable-prompt'
}
const textKeys = [
  'editor.improve-selection',
  'editor.tighten',
  'editor.expand',
  'editor.simplify',
  'editor.clarify',
  'editor.alternatives',
  'editor.headlines',
  'editor.subtitle',
  'editor.opening-ideas',
  'editor.conclusion-ideas',
  'editor.excerpt',
  'editor.summary',
  'editor.outline',
  'editor.faq',
  'editor.tone-brand',
  'editor.grammar-explain',
  'content.repurpose',
  'brand.about-mission',
] as const
const structuredKeys = [
  'intelligence.taxonomy',
  'intelligence.related-links',
  'intelligence.overlap',
  'intelligence.metadata-seo',
  'intelligence.social-newsletter',
  'intelligence.quotes',
  'intelligence.transcript-cleanup',
  'intelligence.chapters',
  'intelligence.event',
  'intelligence.timeline',
  'intelligence.product',
  'discussion.intelligence',
] as const
const task = (
  key: AiTaskKey,
  capability: AiTaskDefinition['capability'],
  inputs: readonly string[] = ['article'],
): AiTaskDefinition => ({
  key,
  capability,
  allowedInputs: inputs,
  outputSchema: capability === 'ai.text.rewrite' ? 'text-proposal' : 'structured-proposal',
  quality: 'standard',
  maxCostClass: 'medium',
  timeoutMs: 20_000,
  maxContextChars: 24_000,
  sensitiveData: 'exclude-private-notes',
  permission: capability === 'ai.text.rewrite' ? 'ai.use' : 'ai.intelligence.use',
  audit: 'required',
  fallback: capability === 'ai.image.assist' ? 'manual-copyable-prompt' : 'unavailable-state',
})
export const AI_TASKS: Readonly<Record<AiTaskKey, AiTaskDefinition>> = Object.fromEntries([
  ...textKeys.map((key) => [
    key,
    task(
      key,
      'ai.text.rewrite',
      key.includes('brand') || key.includes('tone')
        ? ['article', 'brand']
        : ['selection', 'article'],
    ),
  ]),
  ...structuredKeys.map((key) => [
    key,
    task(
      key,
      'ai.text.structured',
      key === 'discussion.intelligence'
        ? ['discussion-visible-posts', 'sources']
        : ['article', 'sources'],
    ),
  ]),
  ['image.assist', task('image.assist', 'ai.image.assist', ['article', 'brand'])],
]) as Record<AiTaskKey, AiTaskDefinition>
export type AiContextControls = {
  includeArticle: boolean
  includeBrandVoice: boolean
  includeSources: boolean
  includePrivateNotes?: boolean
}
export type AiContext = {
  article?: string
  selection?: string
  brandVoice?: string
  sources?: readonly { id: string; text: string }[]
  privateNotes?: string
  visiblePosts?: readonly {
    id: string
    text: string
    visibility: 'public' | 'private'
    status: 'published' | 'held' | 'deleted'
  }[]
}
export type AiProposal = {
  status: 'ready' | 'no-provider' | 'no-budget' | 'cancelled' | 'failed'
  task: AiTaskKey
  original: string | null
  output: unknown
  contextPreview: Record<string, unknown>
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null }
  audit: { id: string; redacted: true; providerKey?: string; model?: string }
}
export type AiBudget = { perTaskUsd: number; monthlyUsd: number; spentThisMonthUsd: number }
export type AiAdapter = {
  providerKey: string
  supports: readonly AiTaskDefinition['capability'][]
  complete(input: {
    model: string
    prompt: string
    signal: AbortSignal
  }): Promise<{ output: unknown; inputTokens: number; outputTokens: number }>
}
export type AiExecution = {
  connection: ConnectionRecord
  model: string
  task: AiTaskKey
  context: AiContext
  controls: AiContextControls
  permissions: readonly string[]
  budget: AiBudget
  cancel?: AbortSignal
  pricePer1kTokensUsd?: { input: number; output: number }
}
