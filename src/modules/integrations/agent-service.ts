import type { ToolManifest } from '../extensions/contracts'
import { invokeScopedAgentTool, type ScopedAgentRun } from '../ai/agents'

/** Integration-facing agent adapter: contracts are checked before canonical services run. */
export async function invokeIntegrationAgentTool(input: {
  run: ScopedAgentRun
  manifest: ToolManifest | undefined
  tool: string
  target: { siteId: string; publicationId?: string | null; spaceId?: string | null }
  grants: readonly string[]
  idempotencyKey?: string
  approved?: boolean
  execute: () => Promise<Record<string, unknown>>
  completed: Map<string, Record<string, unknown>>
}) {
  const preflight = invokeScopedAgentTool(input)
  if (preflight.status === 'denied') return { run: preflight, output: null, rollback: null }
  if (input.manifest?.approval === 'always' && !input.approved)
    return {
      run: { ...preflight, status: 'awaiting-approval' as const },
      output: null,
      rollback: input.manifest.rollback,
    }
  if (input.manifest?.idempotency === 'required' && !input.idempotencyKey)
    return {
      run: { ...preflight, status: 'denied' as const },
      output: null,
      rollback: input.manifest.rollback,
    }
  const key = `${input.tool}:${input.idempotencyKey ?? ''}`
  const output =
    input.idempotencyKey && input.completed.has(key)
      ? input.completed.get(key)!
      : await input.execute()
  if (input.idempotencyKey) input.completed.set(key, output)
  return {
    run: { ...preflight, status: 'completed' as const },
    output,
    rollback: input.manifest?.rollback ?? 'none',
  }
}
