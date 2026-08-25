import type { AgentRun, ApprovalRequest, ToolManifest } from './contracts'
export type ToolExecutor = (input: Record<string, unknown>) => Promise<Record<string, unknown>>
export class AgentToolRuntime {
  constructor(
    private readonly tools: Record<string, { manifest: ToolManifest; execute: ToolExecutor }>,
  ) {}
  async invoke(
    run: AgentRun,
    toolName: string,
    input: Record<string, unknown>,
    permissions: readonly string[],
  ): Promise<{ run: AgentRun; approval?: ApprovalRequest }> {
    const tool = this.tools[toolName]
    const auditId = `audit:${run.id}:${toolName}`
    if (!tool || !permissions.includes(tool.manifest.permission))
      return {
        run: {
          ...run,
          status: 'denied',
          toolCalls: [
            ...run.toolCalls,
            { id: crypto.randomUUID(), tool: toolName, input, status: 'denied', auditId },
          ],
        },
      }
    const call = {
      id: crypto.randomUUID(),
      tool: toolName,
      input,
      status: 'proposed' as const,
      auditId,
    }
    if (tool.manifest.approval === 'always')
      return {
        run: { ...run, status: 'awaiting-approval', toolCalls: [...run.toolCalls, call] },
        approval: {
          id: crypto.randomUUID(),
          toolCallId: call.id,
          reason: 'Tool requires human approval',
          status: 'pending',
        },
      }
    const output = await tool.execute(input)
    return {
      run: {
        ...run,
        status: 'completed',
        toolCalls: [...run.toolCalls, { ...call, status: 'completed', output }],
      },
    }
  }
}
export const RENEGRADE_TOOL_MANIFESTS: readonly ToolManifest[] = [
  {
    name: 'content.draft.read',
    version: 1,
    input: { id: 'uuid' },
    output: { draft: 'object' },
    permission: 'content.read.draft',
    dataSensitivity: 'staff',
    rateLimit: '60/min',
    idempotency: 'none',
    approval: 'never',
    timeoutMs: 5000,
    audit: 'required',
    rollback: 'none',
  },
  {
    name: 'content.draft.propose_change',
    version: 1,
    input: { id: 'uuid', patch: 'object' },
    output: { proposal: 'object' },
    permission: 'content.draft.propose',
    dataSensitivity: 'staff',
    rateLimit: '30/min',
    idempotency: 'required',
    approval: 'never',
    timeoutMs: 5000,
    audit: 'required',
    rollback: 'none',
  },
  {
    name: 'payments.refund',
    version: 1,
    input: { orderId: 'uuid' },
    output: { request: 'object' },
    permission: 'payments.refund',
    dataSensitivity: 'restricted',
    rateLimit: '10/min',
    idempotency: 'required',
    approval: 'always',
    timeoutMs: 10000,
    audit: 'required',
    rollback: 'compensating-action',
    capability: 'payments.refund',
  },
]
