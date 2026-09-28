import type { TaskConfig } from 'payload'
import {
  runContentIntelligenceAnalysis,
  type AnalysisRunResult,
  type RunAnalysisOptions,
} from './analysis-service'

type IntelligenceContentAnalysisTask = {
  input: RunAnalysisOptions
  output: AnalysisRunResult
}

export const intelligenceContentAnalysisTask: TaskConfig<IntelligenceContentAnalysisTask> = {
  slug: 'intelligence-content-analysis',
  label: 'Analyze content discovery and intelligence',
  inputSchema: [
    { name: 'contentId', type: 'text', required: true },
    { name: 'siteId', type: 'text', required: true },
    { name: 'force', type: 'checkbox' },
    { name: 'runAi', type: 'checkbox' },
  ],
  outputSchema: [
    { name: 'analysisId', type: 'text', required: true },
    { name: 'targetId', type: 'text', required: true },
    { name: 'siteId', type: 'text', required: true },
    { name: 'revision', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
    { name: 'isIdempotentReuse', type: 'checkbox', required: true },
    { name: 'deterministicFindingsCount', type: 'number', required: true },
    { name: 'aiFindingsCount', type: 'number', required: true },
    { name: 'recommendationsCount', type: 'number', required: true },
  ],
  retries: { attempts: 2, backoff: { delay: 250, type: 'exponential' } },
  concurrency: ({ input }) =>
    `intelligence-content-analysis:${String(input.siteId)}:${String(input.contentId)}`,
  handler: async ({ input, req }) => ({
    output: await runContentIntelligenceAnalysis(req.payload, input),
  }),
}

export const intelligenceTasks = [intelligenceContentAnalysisTask]
