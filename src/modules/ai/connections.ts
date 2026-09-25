import type { Payload } from 'payload'
import {
  EncryptedCredentialBoundary,
  type CredentialEnvelope,
} from '../extensions/connection-runtime'
import { AI_TASKS, type AiTaskKey } from './contracts'
import {
  AI_PROVIDER_LABELS,
  discoverAiModels,
  ollamaAdapter,
  openAiCompatibleAdapter,
  validateAiEndpoint,
} from './gateway'

export type AiProviderKey = keyof typeof AI_PROVIDER_LABELS

type Doc = Record<string, unknown> & { id: string }
export const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as { id?: string } | null)?.id ?? '')

export function credentialCipher(): EncryptedCredentialBoundary {
  const key = process.env.AI_CREDENTIAL_KEY_BASE64URL
  if (!key || Buffer.from(key, 'base64url').length !== 32)
    throw new Error(
      'AI credential encryption is not configured. Set AI_CREDENTIAL_KEY_BASE64URL to a 32-byte base64url key.',
    )
  return new EncryptedCredentialBoundary({ activeKeyId: 'v1', keys: { v1: key } })
}

export function publicAiConnection(doc: Doc) {
  return {
    id: doc.id,
    siteId: relationId(doc.site),
    publicationId: relationId(doc.publication) || null,
    label: doc.label,
    providerKey: doc.providerKey,
    providerLabel: AI_PROVIDER_LABELS[doc.providerKey as AiProviderKey] ?? 'Unsupported provider',
    endpoint: doc.endpoint,
    model: doc.model,
    models: doc.models,
    capabilities: doc.capabilities,
    allowedTasks: doc.allowedTasks,
    status: doc.status,
    lastError: doc.lastError,
    lastTestedAt: doc.lastTestedAt,
    perTaskUsd: doc.perTaskUsd,
    monthlyUsd: doc.monthlyUsd,
    maxInputTokens: doc.maxInputTokens,
    maxOutputTokens: doc.maxOutputTokens,
    inputUsdPer1k: doc.inputUsdPer1k,
    outputUsdPer1k: doc.outputUsdPer1k,
    budgetMonth: doc.budgetMonth,
    spentMonthUsd: doc.spentMonthUsd,
  }
}

export async function connectionCredential(
  payload: Payload,
  connectionId: string,
): Promise<string> {
  const record = await payload.find({
    collection: 'ai-credentials' as never,
    where: { connection: { equals: connectionId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const envelope = (record.docs[0] as Doc | undefined)?.envelope as CredentialEnvelope | undefined
  if (!envelope) throw new Error('AI connection credential is unavailable. Reconnect the provider.')
  const value = credentialCipher().decrypt(envelope)
  return String(value.apiKey ?? '')
}

export function validateConnectionInput(value: Record<string, unknown>) {
  const providerKey = value.providerKey
  if (providerKey !== 'ai.openai-compatible' && providerKey !== 'ai.ollama')
    throw new Error('Choose a tested provider adapter.')
  const selectedProvider: AiProviderKey = providerKey
  const endpoint = validateAiEndpoint(selectedProvider, String(value.endpoint ?? ''))
  const model = String(value.model ?? '').trim()
  const label = String(value.label ?? '').trim()
  const siteId = String(value.siteId ?? '').trim()
  if (!siteId || !model || !label || label.length > 100 || model.length > 150)
    throw new Error('Site, label, and model are required.')
  const apiKey = String(value.apiKey ?? '')
  if (providerKey === 'ai.openai-compatible' && !apiKey)
    throw new Error('An API key is required for OpenAI-compatible connections.')
  const number = (name: string, min: number, max: number) => {
    const n = Number(value[name])
    if (!Number.isFinite(n) || n < min || n > max)
      throw new Error(`${name} must be between ${min} and ${max}.`)
    return n
  }
  const allowedTasks = Array.isArray(value.allowedTasks)
    ? value.allowedTasks.filter(
        (task): task is AiTaskKey => typeof task === 'string' && task in AI_TASKS,
      )
    : []
  if (!allowedTasks.length) throw new Error('Allow at least one registered AI task.')
  if (allowedTasks.some((task) => AI_TASKS[task].capability === 'ai.image.assist'))
    throw new Error('Image generation is not supported by these tested adapters.')
  const inputUsdPer1k = number('inputUsdPer1k', 0, 100)
  const outputUsdPer1k = number('outputUsdPer1k', 0, 100)
  if (providerKey === 'ai.openai-compatible' && (inputUsdPer1k <= 0 || outputUsdPer1k <= 0))
    throw new Error('Set positive input and output prices for remote provider budget enforcement.')
  return {
    siteId,
    publicationId: value.publicationId ? String(value.publicationId) : null,
    label,
    providerKey: selectedProvider,
    endpoint,
    model,
    apiKey,
    allowedTasks,
    perTaskUsd: number('perTaskUsd', 0.0001, 100),
    monthlyUsd: number('monthlyUsd', 0.0001, 10000),
    maxInputTokens: number('maxInputTokens', 1, 200000),
    maxOutputTokens: number('maxOutputTokens', 1, 32000),
    inputUsdPer1k,
    outputUsdPer1k,
  }
}

export async function testAiProvider(input: {
  providerKey: AiProviderKey
  endpoint: string
  apiKey: string
  model: string
}) {
  const models = await discoverAiModels(input.providerKey, input.endpoint, input.apiKey)
  if (!models.includes(input.model))
    throw new Error(
      'The selected model was not advertised by this provider. Refresh models or choose another.',
    )
  const adapter =
    input.providerKey === 'ai.ollama'
      ? ollamaAdapter(input.endpoint)
      : openAiCompatibleAdapter(input.providerKey, input.endpoint, input.apiKey)
  const probe = await adapter.complete({
    model: input.model,
    prompt: 'Return one short, harmless proposal.',
    signal: AbortSignal.timeout(10_000),
    maxOutputTokens: 32,
    structured: false,
  })
  if (typeof probe.output !== 'string' || !probe.output.trim())
    throw new Error('The provider returned no text. Check the model and chat/generate contract.')
  const capabilities: Array<'ai.text.rewrite' | 'ai.text.structured'> = ['ai.text.rewrite']
  try {
    const structured = await adapter.complete({
      model: input.model,
      prompt: 'Return exactly a JSON object with a single ok property set to true.',
      signal: AbortSignal.timeout(10_000),
      maxOutputTokens: 48,
      structured: true,
    })
    const parsed =
      typeof structured.output === 'string'
        ? (JSON.parse(structured.output) as unknown)
        : structured.output
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      capabilities.push('ai.text.structured')
  } catch {
    // Text remains usable. Structured workflows are disabled until a later test succeeds.
  }
  return { models, capabilities }
}
