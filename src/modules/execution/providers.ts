import { safeExecutionError } from './contracts'

export type ProviderHealth = { status: 'healthy' | 'degraded' | 'disabled'; detail?: string }
export type ProviderFailure = { code: string; retryable: boolean; message: string }
export type ProviderAdapter<Config, Capability extends string> = {
  readonly id: string
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
  const validation = adapter.validate(config)
  if (!validation.ok) return { status: 'disabled', detail: validation.error.message }
  return adapter.health(config)
}
