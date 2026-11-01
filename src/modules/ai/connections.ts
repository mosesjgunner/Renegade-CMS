import type { Payload } from 'payload'
import {
  EncryptedCredentialBoundary,
  type CredentialEnvelope,
  type CredentialKeyring,
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

const AI_CREDENTIAL_NOT_CONFIGURED =
  'AI credential encryption is not configured. Set AI_CREDENTIAL_KEY_BASE64URL to a 32-byte base64url key.'

/**
 * Builds the AI credential keyring from the environment.
 *
 * - `AI_CREDENTIAL_KEY_BASE64URL` remains the original `v1` key (back-compatible).
 * - `AI_CREDENTIAL_KEYRING_JSON` may add further keys as a JSON object mapping
 *   key ids to 32-byte base64url keys, e.g. `{"v2": "..."}`.
 * - `AI_CREDENTIAL_ACTIVE_KEY_ID` selects the key used for new envelopes
 *   (default `v1`). Envelopes encrypted under any key still present in the
 *   keyring remain decryptable, which is what makes rotation safe: add the new
 *   key, flip the active id, then re-encrypt stored envelopes onto it.
 */
export function credentialKeyring(
  env: Record<string, string | undefined> = process.env,
): CredentialKeyring {
  const keys: Record<string, string> = {}
  const primary = env.AI_CREDENTIAL_KEY_BASE64URL
  if (primary) {
    if (Buffer.from(primary, 'base64url').length !== 32)
      throw new Error(AI_CREDENTIAL_NOT_CONFIGURED)
    keys.v1 = primary
  }
  if (env.AI_CREDENTIAL_KEYRING_JSON) {
    let parsed: unknown
    try {
      parsed = JSON.parse(env.AI_CREDENTIAL_KEYRING_JSON)
    } catch {
      throw new Error(
        'Credential encryption keyring is invalid. AI_CREDENTIAL_KEYRING_JSON must be a JSON object mapping key ids to 32-byte base64url keys.',
      )
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(
        'Credential encryption keyring is invalid. AI_CREDENTIAL_KEYRING_JSON must be a JSON object mapping key ids to 32-byte base64url keys.',
      )
    for (const [keyId, encoded] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof encoded !== 'string' || Buffer.from(encoded, 'base64url').length !== 32)
        throw new Error(
          `Credential encryption key "${keyId}" in AI_CREDENTIAL_KEYRING_JSON must be a 32-byte base64url key.`,
        )
      keys[keyId] = encoded
    }
  }
  const activeKeyId = env.AI_CREDENTIAL_ACTIVE_KEY_ID || 'v1'
  if (!keys[activeKeyId]) throw new Error(AI_CREDENTIAL_NOT_CONFIGURED)
  return { activeKeyId, keys }
}

export function credentialCipher(): EncryptedCredentialBoundary {
  return new EncryptedCredentialBoundary(credentialKeyring())
}

/**
 * Re-encrypts one stored envelope onto the keyring's active key. Envelopes
 * already on the active key are returned unchanged; envelopes whose key is no
 * longer in the keyring fail closed (decrypt throws) rather than being dropped.
 */
export function rotateCredentialEnvelope(
  envelope: CredentialEnvelope,
  keyring: CredentialKeyring = credentialKeyring(),
): { envelope: CredentialEnvelope; rotated: boolean } {
  if (envelope.keyId === keyring.activeKeyId) return { envelope, rotated: false }
  const cipher = new EncryptedCredentialBoundary(keyring)
  const value = cipher.decrypt(envelope)
  return { envelope: cipher.encrypt(value), rotated: true }
}

export type AiCredentialRotationSummary = {
  activeKeyId: string
  scanned: number
  rotated: number
  alreadyCurrent: number
  failed: number
}

/**
 * Rotates every stored AI credential envelope onto the active keyring key.
 * The plaintext value never leaves the encrypted boundary; rows that cannot be
 * decrypted with the configured keyring are counted as failed and left untouched.
 */
export async function rotateAiCredentialEnvelopes(
  payload: Payload,
): Promise<AiCredentialRotationSummary> {
  const keyring = credentialKeyring()
  const found = await payload.find({
    collection: 'ai-credentials' as never,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const summary: AiCredentialRotationSummary = {
    activeKeyId: keyring.activeKeyId,
    scanned: found.docs.length,
    rotated: 0,
    alreadyCurrent: 0,
    failed: 0,
  }
  for (const doc of found.docs as Doc[]) {
    const envelope = doc.envelope as CredentialEnvelope | undefined
    if (!envelope) {
      summary.failed += 1
      continue
    }
    try {
      const result = rotateCredentialEnvelope(envelope, keyring)
      if (!result.rotated) {
        summary.alreadyCurrent += 1
        continue
      }
      await payload.update({
        collection: 'ai-credentials' as never,
        id: doc.id,
        data: { envelope: result.envelope } as never,
        overrideAccess: true,
      })
      summary.rotated += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
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

export function validateDiscoveryInput(value: Record<string, unknown>) {
  const providerKey = value.providerKey
  if (providerKey !== 'ai.openai-compatible' && providerKey !== 'ai.ollama')
    throw new Error('Choose a tested provider adapter.')
  const selectedProvider: AiProviderKey = providerKey
  const endpoint = validateAiEndpoint(selectedProvider, String(value.endpoint ?? ''))
  const siteId = String(value.siteId ?? '').trim()
  if (!siteId) throw new Error('Site is required.')
  const apiKey = String(value.apiKey ?? '')
  if (providerKey === 'ai.openai-compatible' && !apiKey)
    throw new Error('An API key is required for OpenAI-compatible connections.')
  return { siteId, providerKey: selectedProvider, endpoint, apiKey }
}

export function validateConnectionInput(value: Record<string, unknown>) {
  const { siteId, providerKey, endpoint, apiKey } = validateDiscoveryInput(value)
  const model = String(value.model ?? '').trim()
  const label = String(value.label ?? '').trim()
  if (!model || !label || label.length > 100 || model.length > 150)
    throw new Error('Site, label, and model are required.')
  const number = (name: string, min: number, max: number) => {
    const n = Number(value[name])
    if (!Number.isFinite(n) || n < min || n > max)
      throw new Error(`${name} must be between ${min} and ${max}.`)
    return n
  }
  const allowedTasks = Array.isArray(value.allowedTasks)
    ? value.allowedTasks.filter(
        (task): task is AiTaskKey => typeof task === 'string' && Object.hasOwn(AI_TASKS, task),
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
    providerKey,
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
      ? ollamaAdapter(input.endpoint, input.apiKey)
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
