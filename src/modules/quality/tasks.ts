import type { TaskConfig } from 'payload'

import { executeQualityScan } from './service'

type QualityScanTask = {
  input: { scanId: string }
  output: { created: number; updated: number; reopened: number; resolved: number; findings: number }
}

export const qualityScanTask: TaskConfig<QualityScanTask> = {
  slug: 'quality-scan',
  label: 'Scan local content quality',
  inputSchema: [{ name: 'scanId', type: 'text', required: true }],
  outputSchema: [
    { name: 'created', type: 'number', required: true },
    { name: 'updated', type: 'number', required: true },
    { name: 'reopened', type: 'number', required: true },
    { name: 'resolved', type: 'number', required: true },
    { name: 'findings', type: 'number', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: ({ input }) => `quality-scan:${String(input.scanId)}`,
  handler: async ({ input, req }) => ({ output: await executeQualityScan(req.payload, input) }),
}

export const qualityTasks = [qualityScanTask]
