import { randomUUID } from 'node:crypto'
import type { ToolManifest } from '../extensions/contracts'

export type ScopedAgentRun = {
  id: string
  siteId: string
  publicationId: string | null
  spaceId: string | null
  status: 'completed' | 'awaiting-approval' | 'denied'
  audit: readonly { tool: string; status: string; id: string }[]
}
export function invokeScopedAgentTool(input: {
  run: ScopedAgentRun
  manifest: ToolManifest | undefined
  tool: string
  target: { siteId: string; publicationId?: string | null; spaceId?: string | null }
  grants: readonly string[]
}): ScopedAgentRun {
  const audit = { tool: input.tool, id: `audit:${randomUUID()}`, status: 'denied' }
  if (
    !input.manifest ||
    !input.grants.includes(input.manifest.permission) ||
    input.target.siteId !== input.run.siteId ||
    (input.run.publicationId && input.target.publicationId !== input.run.publicationId) ||
    (input.run.spaceId && input.target.spaceId !== input.run.spaceId)
  )
    return { ...input.run, status: 'denied', audit: [...input.run.audit, audit] }
  if (input.manifest.approval === 'always')
    return {
      ...input.run,
      status: 'awaiting-approval',
      audit: [...input.run.audit, { ...audit, status: 'approval-requested' }],
    }
  return {
    ...input.run,
    status: 'completed',
    audit: [...input.run.audit, { ...audit, status: 'completed' }],
  }
}
