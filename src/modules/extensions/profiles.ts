import type { ResourceProfile } from './contracts'
export const PROFILE_GUIDANCE: Record<
  ResourceProfile,
  { memory: string; allowedHeavyWork: boolean; explanation: string }
> = {
  Lean: {
    memory: '1 GB-class VPS',
    allowedHeavyWork: false,
    explanation:
      'Queue or externally delegate AI, graph, transcoding, rendering, imports and realtime; preserve reads, forms, authentication, payments and core jobs.',
  },
  Standard: {
    memory: '2 GB+',
    allowedHeavyWork: true,
    explanation: 'Use workers for imports and media work.',
  },
  Media: {
    memory: '4 GB+ with worker',
    allowedHeavyWork: true,
    explanation: 'Run media work in a separate constrained worker.',
  },
  Scale: {
    memory: 'Measured capacity required',
    allowedHeavyWork: true,
    explanation: 'Increase concurrency only after queue and public-read measurements.',
  },
}
export function recommendProfile(memoryMb: number): ResourceProfile {
  return memoryMb <= 1280 ? 'Lean' : memoryMb <= 2560 ? 'Standard' : 'Media'
}
