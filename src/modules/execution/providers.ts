import { ExecutionError, safeExecutionError } from './contracts'

export type ProviderHealth = { status: 'healthy' | 'degraded' | 'disabled'; detail?: string }
export type ProviderFailure = { code: string; retryable: boolean; message: string }
export type ProviderAdapter<Config, Capability extends string> = {
  readonly id: string
  readonly mode?: 'live' | 'sandbox' | 'test'
  validate(config: Config): { ok: true } | { ok: false; error: ProviderFailure }
  capabilities(config: Config): readonly Capability[]
  health(config: Config): Promise<ProviderHealth>
}

/** Normalizes adapter failures before they cross a worker, audit, or support boundary. */
export function providerFailure(
  error: unknown,
  code = 'provider_error',
  retryable = true,
): ProviderFailure {
  return { code, retryable, message: safeExecutionError(error) }
}

export async function providerHealth<Config, Capability extends string>(
  adapter: ProviderAdapter<Config, Capability> | undefined,
  config: Config | undefined,
): Promise<ProviderHealth> {
  if (!adapter || config === undefined)
    return { status: 'disabled', detail: 'Provider is not configured.' }
  try {
    const validation = adapter.validate(config)
    if (!validation.ok)
      return { status: 'disabled', detail: safeExecutionError(validation.error.message) }
    const health = await adapter.health(config)
    return { ...health, detail: health.detail ? safeExecutionError(health.detail) : undefined }
  } catch (error) {
    return { status: 'degraded', detail: safeExecutionError(error) }
  }
}

/** Shared preflight for adapters; test/sandbox adapters must use isolated transports. */
export async function executeProvider<Config, Capability extends string, Result>(
  adapter: ProviderAdapter<Config, Capability> | undefined,
  config: Config | undefined,
  capability: Capability,
  mode: 'live' | 'sandbox' | 'test',
  operation: (adapter: ProviderAdapter<Config, Capability>, config: Config) => Promise<Result>,
): Promise<Result> {
  if (!adapter || config === undefined)
    throw new ExecutionError('Provider is not configured.', 'provider_disabled', false)
  try {
    if ((adapter.mode ?? 'live') !== mode)
      throw new ExecutionError(
        'Provider mode does not match the requested mode.',
        'provider_mode',
        false,
      )
    const validation = adapter.validate(config)
    if (!validation.ok)
      throw new ExecutionError(
        safeExecutionError(validation.error.message),
        validation.error.code,
        false,
      )
    if (!adapter.capabilities(config).includes(capability))
      throw new ExecutionError('Provider capability is unavailable.', 'provider_capability', false)
    return await operation(adapter, config)
  } catch (error) {
    throw new ExecutionError(
      safeExecutionError(error),
      error instanceof ExecutionError ? error.code : 'provider_error',
      error instanceof ExecutionError ? error.retryable : true,
    )
  }
}
